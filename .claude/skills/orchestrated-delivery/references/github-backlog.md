# GitHub as the work queue

**One implementation of the backlog port, and the one this repo uses.**
`references/backlog-port.md` says what the loop needs from any task store, and
why: in guest mode the host's tracker is not yours to write to, so the verbs
have to survive the tool changing underneath them. Read that first if your
backlog is not GitHub's. Read this if it is.

It also says what a portable backlog does *not* buy you, which is the part
easiest to overclaim: the merge wrapper, the checks and the ruleset stay GitHub.

Everything below is GitHub mechanics. The port's `create`, `read`, `list`,
`comment`, `close`, `link`, `block` and `label` are what each section is an
instance of.

## Shape

**Epics** carry prose context only: no scope bullets, no definition of done.
They exist to group and to explain why a body of work exists.

**Leaf issues** carry the full anatomy and are what agents get briefed from.
Prose context, scope, a "watch out for" section, what is deliberately out of
scope with its issue number, and the definition of done appended verbatim.

Appending the definition of done beats linking to it. An agent that has to
follow a link to learn what done means will sometimes not follow it. The text is
in `assets/seed-issues.py`.

**Labels** worth having: one per area of the system, plus `epic`, plus the two
reasons an issue cannot be started that no edge covers: waiting on the owner
and no spec written. Take `needs-owner` and `needs-refinement` if you have no
better ones. The third reason, behind another issue, is a dependency edge here
and not a label; `references/backlog-port.md` says why the three stay apart
instead of collapsing into one, and why only that one gets a mechanism.

**`epic` is a label and not an issue type**, even though `gh issue create
--type` exists from 2.94.0. Issue types are organisation-level configuration, so
a repository cannot carry its own, and on a user-owned one there are none at
all: `gh issue edit <n> --type Epic` fails with `available types:` and nothing
after it. Worse for a loop, `gh issue list --type Epic` then returns an empty
list and exit 0. `references/backlog-port.md` has the argument.

## Dispatchable is the list read negatively

`gh issue list --label` only includes. Excluding is `--search`, and the
exclusion is the query that matters, because it is the one that answers what an
agent could be briefed on right now:

```bash
gh issue list --limit 200 \
  --search "is:open -is:blocked -label:needs-owner -label:needs-refinement"
gh issue list --limit 200 --search "is:open is:blocked"
gh issue list --limit 200 --search "is:open label:needs-owner,needs-refinement"
```

The first query is what `Next:` gets chosen from. The other two are the
accounting `Next: nothing` has to pay for, split by what each item is waiting
on. Everything the first returns is dispatchable, so an issue that cannot start
and carries neither a label nor an edge is not a tidiness problem, it is a brief
waiting to be written against work whose own body says no. That is how this
requirement was found: two issues each ended with "do not build this yet" and
neither said so anywhere the list could show it.

## Behind another issue is an edge, and the edge is state-aware

This is the port's `block` verb. From **`gh` 2.94.0** the write is a flag:

```bash
gh issue edit 78 --add-blocked-by 61   # 78 is behind 61
gh issue view 78                       # prints a blocked-by: line naming #61
```

**Merging #61 and closing it is the whole of clearing it.** Verified against
`gh` 2.97.0 in August 2026: with an open blocker, `--search "is:open is:blocked"`
returned the issue and `-is:blocked` omitted it; with the blocker *closed* and
the edge left in place, the two swapped, with nothing done to either issue.
Nothing has to be removed, so nothing can be forgotten. `is:blocking` is the
same edge read backwards and is state-aware in the same way, which is why
"unblocks other work" is a query here rather than a label.

**If you cannot name the blocker as an issue number, the issue is not blocked,
it is unrefined.** That used to be a rule; with an edge it is structural,
because there is no way to write a nameless one.

**Three ways to read this wrong, all of them measured.**

- **`gh issue list` shows a blocked issue exactly like a ready one.** No column,
  no marker, nothing. Only `--search` knows, so the bare list is never the
  answer to what to dispatch.
- **`blockedBy` in `--json` and the `blocked-by:` line in `gh issue view`
  both include blockers that are already closed.** The view line prints no state
  at all; the JSON carries `state` on each node under `blockedBy.nodes` and you
  have to filter on it yourself. **The field is the edges; `is:blocked` is the
  answer.** Reaching for the field reproduces the stale-label bug in a new
  costume.
- **`--json blockedBy` needs 2.94.0 and `is:blocked` needs nothing.** The
  qualifier is server-side, so it runs on a client nine releases old; verified on
  2.88.1. Only *writing* the edge needs the new client, and the fallback there is
  `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by`, which also
  reads the edges on an old client.

**Migrating a repo that already ran the label.** Two things to undo and the
second is the one that gets missed: convert each labelled issue to an edge, then
delete the label, because a `blocked` label whose description still says the
blocker is named in a comment is a second convention living beside the first and
nobody can tell which one a given issue is following.

## Real sub-issue links, not just labels

A label convention does not give you a tree you can read. This is the port's
`link` verb, and it is the requirement that disqualifies candidate tools rather
than merely inconveniencing them: a task store with no parent concept cannot
carry this loop. GitHub's answer is sub-issues, and from **`gh` 2.94.0** the
whole verb is flags:

```bash
gh issue create --title "..." --body "..." --parent <parent>   # born linked
gh issue edit <parent> --add-sub-issue <child>                 # adopt an orphan
gh issue view <parent> --json subIssues,subIssuesSummary       # read the tree
```

Each of those takes an issue **number** or a URL, the identifier already on
screen. Worth saying, because the fallback does not.

**Run `gh --version` before assuming you have them.** Below 2.94.0 there are no
flags and no `parent` JSON field, and the only route is the REST endpoint, which
wants the numeric issue **id** rather than the number. That is the part that
trips people, and it is now the sole thing the endpoint buys:

```bash
child_id=$(gh api repos/{owner}/{repo}/issues/<child> --jq .id)
gh api --method POST repos/{owner}/{repo}/issues/<parent>/sub_issues \
  -F sub_issue_id="$child_id"
```

An out-of-date `gh` is the ordinary case, not the exotic one. The machine this
was written on ran 2.88.1, nine releases behind, which is exactly why the
fallback sat here for months looking like the way to do it.

The same release added `--blocked-by`, `--blocking` and `--type`. The first two
are adopted and are the section above. `--type` is not, for the reason under
Shape: a type is organisation configuration and a label is not.

Keep a plain `Parent: #N` line in the body as well. From 2.94.0 `gh issue view`
prints `parent:` and `sub-issues:` lines of its own, so the duplicate is
redundancy rather than the only readable form — one line, and still the only
form anyone on an older client sees.

## Seeding

Write a one-shot generator rather than creating issues by hand. Epics and issues
as data, referencing parents **by key** rather than by number, because numbers
do not exist at authoring time. Then two phases: create the epics, then create
their children with `--parent`, which links at birth and leaves no window in
which a child exists unattached. Below 2.94.0 it is three, with a linking pass
at the end.

Make it resumable. Record created numbers to a state file and short-circuit
anything already created, so a rerun after a failure does not duplicate half the
backlog. `assets/seed-issues.py` is a working starting point.

Dependencies between seeded issues need a third phase whatever your client
version, because `--blocked-by` takes numbers and half of them do not exist yet
when the first child is created. Sweep `gh issue edit <n> --add-blocked-by <m>`
over the state file at the end.

Keep the generator in the repo afterwards. It documents the original shape of
the work and is the fastest way to seed the next project.

Later issues will be filed ad hoc, by agents mid-task and by you reacting to
what CI found. That is the expected pattern, not a failure of the seeding.

## Open questions belong in an issue

Anything only the owner can answer becomes an issue labelled for it, with your
recommendation and what it costs. **This is the escalation channel**, not a
place to file questions you have already asked some other way: the point of
putting the question here is that filing it costs you nothing and you keep
working. A question that stopped the loop was not escalated, it was a halt.

When the owner answers, record the outcome **in the artifact it affects** (the
spec, the ADR) rather than leaving it in the issue thread. The decision is then
findable from the thing it decided, and nobody relitigates it.

The label is what makes this work at a glance. A question filed without it is a
question nobody knows is waiting, and the owner finds it a week later.

**In guest mode this issue is not filed on the host's tracker.** Escalating is a
backlog write, and the boundary does not make an exception for a question. It
goes in the local store with everything else and travels at the publish step, or
it is asked in prose at the end of a turn, which costs nothing and waits for
nobody. `references/backlog-port.md`.

## Housekeeping

Small, and it decays fast if skipped.

- Close epics when their children are done, so the list shows real state.
- Deduplicate, keeping the better framing and closing the other into it.
  `gh issue close <n> --duplicate-of <m>` is both halves in one command.
- Link orphan issues to their epic. A `gh issue create` without `--parent`
  leaves one, so anything filed mid-flight in a hurry is an orphan until you say
  otherwise.
- `gh issue list` and `gh pr list` default to 30. Any count taken without
  `--limit` is wrong the moment the project passes thirty of anything.
