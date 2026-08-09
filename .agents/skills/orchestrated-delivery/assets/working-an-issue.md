# Working an issue

How a change gets from an issue to the default branch. Read `review.md` first:
it defines what "done" means. This file is only the mechanics.

> Template. Replace the bracketed parts with this repo's real commands and check
> names, then delete this note.

## Before you start

Read, in this order:

1. `AGENTS.md` for the invariants and how to run the environment
2. `[the domain doc, if there is one]`
3. `docs/process/review.md` for the three review lenses
4. The issue itself, including its parent epic

If the issue conflicts with something you find in the code, say so on the issue
rather than quietly picking one. **A stale issue is a normal thing to find**, and
checking the premise is part of the job.

## Branch and commits

```
<area>/<issue-number>-<short-slug>
```

for example `platform/14-ci-pipeline` or `intake/20-eligibility-gating`.

Commit messages say **why**, not what. The diff already says what.

## Verify before you open the PR

Do not open a PR you have not run.

```bash
[the command that brings up the environment, isolated per worktree]
[the command that tells you this run's URLs]
```

Then exercise the change the way the real user would, and confirm the mechanical
gates pass locally (typecheck, lint, tests, build).

Tear down by explicit path when you are done, before your worktree is removed.
An unscoped teardown stops every environment on the machine, including the ones
other agents are working in.

## The pull request

Title: what changed, in plain language. Reference the issue with `Closes #N`.

The body is the three lenses, filled in honestly. See
`.github/pull_request_template.md`. An empty section means the lens was skipped;
write "not applicable, docs only" rather than leaving it blank.

## You do not merge. Ever.

If you are an agent working an issue, these are prohibited, without exception:

- `gh pr merge` in any form
- `git push` to the default branch, including `git push origin HEAD:main`
- `git merge` while standing on the default branch
- merging through `gh api`

Push your branch, open the PR, report back, and stop. The orchestrator reviews
and merges. This holds even when your checks are green, even when the change is
trivial, and even when you are confident.

## Merge discipline

CI runs [N] checks: `[names]`.

**GitHub itself does not enforce them.** Branch protection needs a paid plan on a
private repo. Three things stand in for it, and each is worth exactly what it
covers:

1. **`node scripts/merge-pr.mjs <n>`**, the only sanctioned way to land a PR. It
   refuses unless all required checks are green, and always squash merges.
   *Not covered:* anyone who does not use the command. It is a tool, not a gate.
2. **`scripts/guard-merge.mjs`**, a PreToolUse hook wired up in
   `.claude/settings.json`. It denies the commands above before they run.
   *Not covered:* sessions that did not load it. A net, not a guarantee.
3. **`scripts/check-main-provenance.mjs`**, run on every push to the default
   branch. It asks the API whether each new commit belongs to a merged pull
   request and fails loudly when one does not.
   *Not covered:* prevention. It notices afterwards, which is why it cannot be
   bypassed.

Landing a PR:

```bash
node scripts/merge-pr.mjs 42
```

**Squash, always.** One issue becomes one commit, so the log stays a readable
list of changes and reverting means reverting one commit.

If a commit ever reaches the default branch outside this path, treat it as a
**defect in the guard** rather than a mistake by whoever did it: work out what
the guard missed, add the case, and say so.

## When the process is the problem

If the same manual check is done on every issue, that check belongs in CI, not
in a reviewer's head. If a rule keeps getting broken by accident, it probably
needs a linter rule rather than another paragraph in `AGENTS.md`.

Open an issue and say what you observed. Improving the process is in scope.
