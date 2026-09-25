# 0063. The merge wrapper refuses what it cannot see, and its copies share a body

Status: accepted, and amended by ADR 0065, which reads the `REQUIRED` row's check
names from the ruleset and keeps the array as a fallback.

Issue #200. ADR 0001 made this repository's `merge-pr.mjs` a convenience
rather than a control; the shipped asset is still a control, because a private
repository without branch protection has nothing else.

## Context

Neither copy of `merge-pr.mjs` had a test. They differed by about 60 lines of
code and nothing said why. The "refuse when behind base" logic lived only in the
shipped copy, so it never ran here, where the ruleset refuses a stale branch
first. The only place it would run was someone else's repository.

There, it failed open. When the compare lookup returned nothing usable it read
as "cannot say", and the merge went ahead. Three things produced that:

- **Every pull request from a fork.** The compare asked by head branch *name*,
  and a fork's branch does not exist in the base repository. Measured on a
  public fork PR, cli/cli#14519: `compare/trunk...<branch>` is a 404,
  `compare/trunk...<head sha>` answers a count, and so does `<owner>:<branch>`.
- **Any `gh` error**: auth, network, rate limit.
- **An empty answer.** `Number('')` is `0`, so it read as "not behind" and
  slipped past the `NaN` test that was meant to catch garbage.

Working #200 turned up one more fork defect. After a merge the wrapper
deletes `refs/heads/<headRefName>` in the base repository. For a fork PR, that
name belongs to the fork. So a fork PR opened from the fork's own `main` would
delete the base repository's `main`, wherever nothing protects that branch. That
is the setup the asset is written for.

## Decision

**When the wrapper is set to refuse a branch that is behind, it also refuses
one it cannot see.** A lookup that fails is refused like a lookup that says
"behind". The refusal prints the `gh` error and the exact `gh api` call it made,
so the operator can rerun it by hand. A check that passes whenever its lookup
fails is a check that passes, and a stale green is the one thing this line
exists to stop.

**The compare asks by the head SHA**, not the branch name. This takes forks
off the list of things that blind the wrapper. The SHA is also exactly what the
rollup's checks ran on, which a branch that has moved since is not.

**A fork's head branch is never deleted** by the base repository's wrapper.

**The two copies share one body, and one suite tests both.** The body has an
entry-point check and an injected `gh`, which is `post-body.mjs`'s shape.
`scripts/merge-pr.test.mjs` runs the same cases against each copy, so a
behaviour change made to one copy and not the other fails `npm test`.

This repository's copy now carries `REFUSE_WHEN_BEHIND = true` as well. Here
that is redundant with the ruleset, and it is also the only way the logic gets
exercised before a stranger trusts it.

### What still differs, and which kind each difference is

| Difference | Kind | Why |
| --- | --- | --- |
| `REQUIRED` holds `'Checks', 'Plugin'` here and two `REPLACE_WITH_…` placeholders in the asset | Configuration | Check names are the host's. The placeholders fail safe: every merge refuses with "never ran" until they are set, and a test holds that |
| `REFUSE_WHEN_BEHIND` | Configuration, same value in both | A host whose ruleset already enforces up-to-date branches may turn it off. Off turns off both refusals it owns, behind and blind; GitHub's own `BEHIND` still refuses |
| WHAT JUST SHIPPED: read `plugin.json` on the base before and after, and print `Released:` when the version moved | Behaviour, this repository only | ADR 0017. The version in `plugin.json` is this repository's publishing mechanism, and a host repository has no `plugin.json` |
| Header comments | Prose | Here the wrapper is a convenience behind a ruleset. In a host it is the control |

Anything else that differs is drift, and should be fixed rather than recorded.

## Consequences

**What this costs a maintainer merging a fork PR.** In the normal case, nothing.
Asking by SHA is what makes that true: before this change every fork PR 404'd.
Had the old name-based lookup been kept with the new refusal, every fork PR
would have been unmergeable through the wrapper. The cost that remains falls on
the maintainer, not the contributor:

- **A compare that errors blocks the merge until it answers.** A dead token, no
  network or a rate limit is a hard stop, where it used to be a warning.
- **A fork contributor pays no new cost,** apart from one they already paid.
  The fork's branch is theirs to delete, and this wrapper no longer tries.

Only a public fork has been measured. A private repository's forks are reached
through the same endpoint, but no such fork was available to try.

With the switch on, the `UNKNOWN` path's warning that the head is behind is
unreachable, because that case is refused first. The warning stays for hosts
that turn the switch off.

The test drives a stubbed `gh`. That proves the decisions, not GitHub's
answers. The fork measurement above and a read-only dry run against a real
pull request are the evidence for the answers.
