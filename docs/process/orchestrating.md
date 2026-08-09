# Orchestrating this repo

Written last, from what setting the repo up actually took. If you are taking
over here, read this after `AGENTS.md` and before dispatching anything.

The loop itself is the skill this repo ships:
`.agents/skills/orchestrated-delivery/SKILL.md`. This file is only what is
different **here**, and where the defaults were deliberately overridden.

## What is different here

**This repo is public, so the skill's enforcement chapter does not apply to
it.** That chapter exists because branch protection needs a paid plan on a
private repo. Here a ruleset does the work, with no bypass actors, and it was
verified by pushing a probe commit to `main` and watching GitHub refuse the
owner. ADR 0001 records what was kept and what was deleted, and says what to
restore if this ever goes private.

**The guard hook only watches `gh`, not `git`.** The ruleset already refuses
direct pushes, so the guard's remaining job is the one thing a ruleset cannot
do: stop an agent merging its own pull request. It matches `gh pr merge` and
merges through `gh api`, and nothing else. There is no `Bash(git *)` clause in
`.claude/settings.json`, because a hook that fires on every git command and
never denies one is pure latency.

**Lens 1 is not "drive the running app".** There is no app. Driving the change
here means loading the skill in a harness and using it —
`claude --plugin-dir .` — and confirming the part you changed reads as intended
in context. A green `plugin validate` says the JSON parses. A `SKILL.md`
containing nothing but a file path validates perfectly.

**The work is prose, so review is comprehension all the way down.** The failure
mode is not a crash, it is a paragraph that is subtly wrong and that agents will
follow for months. Send a PR back for one inaccurate sentence.

## The traps this repo has already sprung

Each of these cost something during setup and is now guarded. They are here so
the next person does not rediscover them.

**A check that scans nothing passes.** `check-vocabulary.mjs` enumerated files
with `git ls-files`, which does not see untracked files, so it reported green
across 12 files while the entire skill payload sat outside its view. It now
passes `--others --exclude-standard`. When you add a check, prove it fails
before trusting that it passes.

**A guard that flags legitimate work gets switched off.** The same check banned
`check:collisions` as someone else's script name, then this repo added a
collision check under exactly that name and the guard started failing the build
on its own tooling. Patterns that only make sense inside the shipped payload are
now scoped to it.

**Windows turns a symlink into a silent lie.** Without Developer Mode git writes
a text file containing the link target and exits 0. `.claude/skills/` is
therefore a generated copy, gated by `npm run check:sync`. Do not "simplify" it
to a symlink.

**Renaming a CI job breaks merging invisibly.** `scripts/merge-pr.mjs` matches
job names as strings, and a name that never appears is treated as "never ran",
which refuses the merge. The job `name:`, the `REQUIRED` array, and the
ruleset's required contexts are three copies of the same fact. Change them
together.

## Escalate to the owner

Beyond the skill's usual list, these are specific to this repo:

- **Anything that publishes outward.** Listing in a third-party marketplace,
  submitting to `claude-plugins-community`, announcing it. The repo being public
  is not permission to promote it.
- **Anything that risks re-identifying the original engagement.** ADR 0002
  re-domained the examples to municipal permitting. If a new example would work
  best in a domain closer to the original, ask rather than judge it yourself.
  The vocabulary check catches known words, not new tells.
- **Loosening the ruleset.** It has no bypass actors on purpose. If something
  genuinely cannot be done through a PR, that is a conversation, not a config
  change.

## Decide yourself

Sequencing, batching, which harness to verify next, whether a finding deserves
an issue, and every wording call inside the skill. The owner's steer is that it
must be reliable on Claude Code first, and portable to as much else as possible
after that.

## Where the backlog came from

`docs/process/seed-issues.py` holds the original shape of the work. Later issues
get filed ad hoc, by agents mid-task and by whoever is orchestrating reacting to
what CI found. That is the expected pattern, not a failure of the seeding.
