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

**A hook matches on tool NAME, so a second shell tool walks straight past it.**
The skill's `enforcement.md` ships `"matcher": "Bash"`, and a real session ran
`git push origin main` through a PowerShell tool and was not denied. This
machine has both tools. The matcher here is `Bash|PowerShell` with no `if`
clause, because `if` uses permission-rule syntax that names a single tool —
`Bash(gh *)` does not fire for PowerShell — and a filter that buys latency at
the cost of a hole is a bad trade. `npm test` asserts this and goes red if the
matcher is narrowed.

**A hook does not protect the session that installs it.** `.claude/settings.json`
is read at startup, so the session that adds the guard runs unguarded to the
end. Verified: `gh pr merge --help` was not denied in the session that wired it.
After changing hook config, restart before relying on it, and do not treat a
non-denial in that session as evidence the guard is broken.

That window is not brief. It lasts as long as the process, including every
agent it dispatches, and here it lasted the whole project: the CLI started
three hours before the hook existed and the guard never fired once in two days
(#45). Nothing said so, because a gate that was never loaded is silent in
exactly the way a gate with nothing to deny is silent. **Ask, once, at the top
of a session:**

```bash
node scripts/check-guard-live.mjs
```

Being refused is the answer you want. If it prints instead, the guard is not
protecting this process, and the fix is to restart the CLI. ADR 0027 says why
the answer arrives as a refusal rather than as output.

**A guard that reads the whole command line denies people quoting it.** Within
seconds of the guard first firing it refused a `gh issue comment` whose body
described the guard working, in a markdown table (#58). The rules now read what
each command in the line *invokes*. When adding a rule, match the head of a
command, not text anywhere in it, and add the allow case before the deny one.

**A subagent's hook runs the main checkout's copy of the script, not the
worktree's.** `$CLAUDE_PROJECT_DIR` resolves to the repository the session
started in, so a branch that changes `scripts/guard-merge.mjs` does not change
the guard for the agent writing it. Measured by instrumenting the worktree copy
and watching it never run. Consequences: a guard change cannot be verified live
on its own branch, only through its tests and a fresh process, and no agent can
weaken the guard for itself by editing its branch.

**Every merge invalidates every other open PR.** The ruleset requires branches
to be up to date with `main`, so the moment one PR lands, every other open one
is `BEHIND` and its green belongs to a base that no longer exists. With three
PRs open that is a rebase chain, and it is not obvious in advance: nothing warns
you when you dispatch the third agent. `merge-pr.mjs` now refuses a `BEHIND`
branch and says to send it back, rather than approving it and letting GitHub
answer with a raw `HTTP 405`. Plan for it by merging in an order you chose, and
expect to spend a rebase per PR after the first. This is the price of strict
required status checks, and it is the mechanical form of "verify the merge
result, not the branch". Do not relax the ruleset to avoid it.

**The version line does not conflict when both branches guess the same
number.** Two parallel payload branches both read `0.16.0`, both wrote `0.17.0`,
and the rebase resolved silently because nothing disagreed. The second branch
then claimed a version `main` had already released, and `npm run check:version`
is what caught it — git had nothing to report. So the standing advice to "expect
a one-line conflict in `plugin.json`" is wrong in exactly the case parallel work
makes likely: the more disciplined the agents, the more identical the edit. Tell
them the check is the net, not the merge. An agent that took `0.17.0` while
`main` was still at `0.15.0`, because that number survives either merge order,
had the better idea and it did not come from these docs.

**The probe kills the command it rides in on.** `guard-merge.mjs` refuses
`check-guard-live.mjs` by name, and `PreToolUse` refuses the whole line, so
`git pull && node scripts/check-guard-live.mjs` pulls nothing. The refusal is
also the answer you wanted, so it reads as success and there is no error to
notice. Run the probe alone. #82 warned about this and the warning did not stop
me doing it.

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
