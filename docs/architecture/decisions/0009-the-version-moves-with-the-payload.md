# 0009. The plugin version moves in the pull request that changes the payload

Status: accepted

## Context

`.claude-plugin/plugin.json` carries `version`, and it is the only version
number outside this repository that anyone can act on. `claude plugin update`
compares it; if it has not moved, an installed copy stays where it is no matter
what changed underneath.

Nothing made it move. It sat at `0.1.0` while three pull requests rewrote the
skill's content in a single day. That is the ordinary outcome, not carelessness:
this repository's recurring finding is that instructions do not hold and checks
do.

Two claims were tested rather than taken from documentation.

**Claude Code reads `plugin.json` and ignores the marketplace entry.** Setting
`plugins[0].version` to `0.9.9` against a `plugin.json` of `0.1.0` made
`claude plugin validate . --strict` fail with "At install time, plugin.json wins
(calculatePluginVersion precedence) — the entry version is silently ignored".
Setting it to a matching `0.1.0` passed. Omitting it entirely also passed. So a
duplicate in `marketplace.json` is worth nothing and can only ever drift.

**`claude plugin tag` already exists and does part of this.** It creates
`{name}--v{version}` from `plugin.json` and validates that any enclosing
marketplace entry agrees. What it does not do, and cannot, is notice that the
payload changed and the number did not.

## Decision

**Every merged payload change is a release, and the version moves in the same
pull request.** `scripts/check-version-bump.mjs` fails when a branch changes
`.agents/skills/`, `.claude/skills/` or `plugin.json` without moving `version`
forward. `docs/process/releasing.md` is the human half: which digit, and how to
cut the tag afterwards with `claude plugin tag`.

*Half of that last sentence no longer holds. The bump rule above is unchanged
and has never once failed. The tag-per-merge rule it pointed at did fail, three
times in one hour, and **ADR 0017 replaced it**: a tag now marks a version
somebody may need to name, not every merge. Read 0017 before following the tag
half of `releasing.md` from here.*

**The comparison is against the default branch, not against `HEAD~1`.** Which
files the branch touched is `git diff --name-only <merge-base>...HEAD`; what
version is already published is `git show origin/main:plugin.json`. Those are
deliberately two different commits. A `HEAD~1` comparison would pass on every
squash-merged branch while catching nothing, and taking the *version* from the
merge base would let a branch inherit someone else's bump.

**Docs, scripts, CI and `marketplace.json` do not require a bump.** Only what an
installer receives counts. A check that fires on a CI tweak becomes noise, and
this repository has already lost one guard that way.

**A step in the existing `Checks` job, not a new job.** A job `name:` is a
required check context, duplicated across the workflow, `merge-pr.mjs`'s
`REQUIRED` array and the ruleset. Three copies of that string is the existing
cost; a fourth buys nothing here.

**`marketplace.json` still carries no version.** Adding it creates a drift
failure mode that does not exist today, for a field nothing reads.

## Consequences

The `Checks` job now checks out with `fetch-depth: 0`. A shallow clone has no
merge base, and the check fails loudly in that case rather than passing, so
lowering it back reds the build instead of silently disabling the gate.

Open branches that change the skill will go red the first time they rebase onto
this. That is the check working; the fix is one line in `plugin.json`.

The version will move often, in small steps, and its history will read as a list
of content edits rather than curated releases. That is the honest description of
how this repository ships, and a number that moves too often is recoverable in a
way that a number that never moves is not.

**Rejected: bumping at release time instead of per pull request.** It needs a
release event this repository does not have, and it puts `main` in a state where
the declared version is knowingly wrong between bumps.

**Rejected: deriving the version from the tag or the commit count.** It removes
the judgment about which digit moves, which is the only part of this a human is
actually needed for.
