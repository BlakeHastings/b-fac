# Working an issue

How a change gets from an issue to `main` in this repo. Read `review.md` first:
it defines what "done" means. This file is only the mechanics.

## Before you start

Read, in this order:

1. `AGENTS.md` for the invariants and how to run things
2. `docs/process/review.md` for the three review lenses
3. Any ADR in `docs/architecture/decisions/` the issue names
4. The issue itself, including its parent epic

If the issue conflicts with something you find in the code, say so on the issue
rather than quietly picking one. **A stale issue is a normal thing to find**, and
checking the premise is part of the job.

## Branch and commits

```
<area>/<issue-number>-<short-slug>
```

for example `platform/14-ci-pipeline` or `skill/20-briefing-examples`.

Commit messages say **why**, not what. The diff already says what.

## Verify before you open the PR

Do not open a PR you have not run.

```bash
npm run check              # tests, mirror drift, vocabulary
npm run check:plugin       # claude plugin validate . --strict
npm run check:plugin-load  # the real loader finds the skills
```

Then exercise the change the way a real user would, which for this repo means
loading the skill and using it rather than reading it:

```bash
claude --plugin-dir .
```

**Invoke it as `b-fac:orchestrated-delivery`. The bare name is a different
file.** A bare skill name resolves against `~/.claude/skills/` first and
`.claude/skills/` second, and a plugin's skills are reachable *only* through the
`<plugin>:<skill>` namespace — so the bare form never reaches the copy
`--plugin-dir` just loaded, however the session looks. Proved by invoking both
forms against a marked payload: the bare name returned a stale personal copy
even with the plugin loaded and a project copy present; only the namespaced form
returned the marked one. ADR 0012 has the evidence.

That is a habit, so it is also backed by a check: `npm run check:plugin-load`
fails when a same-named skill in `~/.claude/skills/` disagrees with
`.agents/skills/`, which is the case where the bare name can quietly answer with
someone else's words. A personal copy that matches is fine.

If you changed skill content, activate the skill and check the part you changed
actually reads the way you intended in context. A green `plugin validate` says
the JSON parses; `check:plugin-load` says the harness found the skill, is
holding its body, and that nothing outranks it with different words; none of
them say the words are right. That last part is yours.

**If you touched `.agents/skills/`, run `npm run sync`** and commit the mirror
in the same change. CI fails otherwise, and the failure looks like an unrelated
drift error on someone else's branch.

**If you changed the payload, bump `version` in `.claude-plugin/plugin.json`**
in the same change too. `npm run check:version` fails otherwise, on your branch
and in CI. `docs/process/releasing.md` says which digit moves and what counts as
payload; docs, scripts and CI do not.

## The pull request

Title: what changed, in plain language. Reference the issue with `Closes #N`.

The body is the three lenses, filled in honestly. See
`.github/pull_request_template.md`. An empty section means the lens was skipped;
write "not applicable, docs only" rather than leaving it blank.

## You do not merge. Ever.

If you are an agent working an issue, these are prohibited, without exception:

- `gh pr merge` in any form
- merging through `gh api`

Push your branch, open the PR, report back, and stop. The orchestrator reviews
and merges. This holds even when your checks are green, even when the change is
trivial, and even when you are confident.

## Merge discipline

CI runs two checks: `Checks` and `Plugin`.

Three things stand between a change and `main`, and each is worth exactly what
it covers. See ADR 0001 for why this repo's set differs from the one the skill
ships to private repos.

1. **The ruleset on `main`**, which requires a pull request and both checks,
   blocks force pushes and deletion, and has **no bypass actors**. This is the
   real control. It applies to the owner too, which is the difference between a
   control and a habit.
   *Not covered:* merging. Anyone with write access can land a green PR, and
   agents run with the owner's credentials.
2. **`scripts/guard-merge.mjs`**, a PreToolUse hook, which denies the two
   commands above before they run. This is the layer that enforces "agents do
   not land code", which the ruleset does not.
   *Not covered:* sessions that did not load it, and humans at a terminal. A
   net, not a guarantee.
3. **`node scripts/merge-pr.mjs <n>`**, which refuses unless every required
   check is green and always squash merges. A convenience rather than a control
   here, kept because it says *which* check is red where a merge button does
   not.

Landing a PR:

```bash
node scripts/merge-pr.mjs 42
```

**Squash, always.** One issue becomes one commit, so the log stays a readable
list of changes and reverting means reverting one commit. The repo is
configured squash-only, so this is enforced rather than remembered.

If a commit ever reaches `main` outside this path, treat it as a **defect in the
controls** rather than a mistake by whoever did it: work out what was missed,
add the case, and say so.

## When the process is the problem

If the same manual check is done on every issue, that check belongs in CI, not
in a reviewer's head. If a rule keeps getting broken by accident, it probably
needs a check rather than another paragraph in `AGENTS.md`.

Open an issue and say what you observed. Improving the process is in scope.
