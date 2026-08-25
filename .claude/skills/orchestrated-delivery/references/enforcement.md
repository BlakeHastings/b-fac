# Enforcement without branch protection

Branch protection needs a paid plan on a private repository, and making the repo
public is not always an option. This is the substitute.

Its design principle is that **every layer states what it does not cover**,
because a layer whose limits are undocumented gets trusted for more than it
does.

## The words: a check reports, a gate refuses

These two nouns are not ours to invent, and the layers below are much easier to
tell apart with them.
[Zuul's concepts page](https://zuul-ci.org/docs/zuul/latest/concepts.html) draws
the line: a *check* pipeline "might describe the actions which should cause
newly proposed changes to projects to be tested", while a *gate* pipeline "might
implement Project Gating to automate merging changes". Its
[gating page](https://zuul-ci.org/docs/zuul/latest/gating.html) says what that
second word buys: "The process of gating attempts to prevent changes that
introduce regressions from being merged." GitHub agrees structurally, in that a
*check run* reports and it takes the modifier **required**, plus a ruleset, to
make it refuse. Gerrit splits the same two slots as a `Verified` label and a
submit requirement.

The surrounding vocabulary comes from the same place. An **event** fires a
**trigger**, which runs a **pipeline** of **jobs** and **steps** on a
**runner**, producing **checks**, enforced by a **gate**. The pluggable
implementation behind any of those is a **driver**: GitHub Actions is one
driver, not the concept. That is what makes the revisit trigger at the end of
this chapter arithmetic rather than a rewrite.

**Casual usage conflates the two, and this chapter will not.** People say "the
checks are blocking the merge". GitHub's own need for the word *required* is the
argument that the bare noun is ambiguous: a check nothing requires blocks
nothing. Expect the split to read as pedantic, and keep it, because the layers
below differ from each other mostly on which side of it they sit.

**Whether a layer refuses is a separate question from whether it is alive.**
Check versus gate is what a layer does when it sees a violation. Written, loaded
and firing, the three states in the next section, is whether it does anything at
all. The two axes are independent, and the pairing that hurts is a gate in the
first state being read as a gate in the third.

*Where this chapter says "workflow" it means a GitHub Actions workflow file,
which is that product's noun for one of its objects. The generic word is
pipeline; GitHub is close to alone in saying workflow.*

## The layers, weakest first

**0. The instruction in every brief and process doc.** Listed for completeness.
An instruction is not a control.

**1. The merge wrapper.** Reads the PR's check rollup, refuses unless every
required check is green, always squash merges.
*Does not cover:* anyone who does not type it. A tool, not a gate: it has a
gate's shape, and a refusal you can decline to ask for is advice.

**2. The PreToolUse guard.** The only gate in the list. Denies `gh pr merge`, a
merge through `gh api`, and a `git push` whose own arguments name the default
branch as the destination, before the command runs.
*Does not cover:* any process the harness did not load it into at startup, and
everything that process spawns for as long as it lives; any human at a terminal;
and CI. A net, not a guarantee, and one whose absence is silent. Nor a
destination the command line does not spell out: a bare `git push` inherits the
branch you are standing on, `git push --all` writes every branch, and a refspec
in a variable says nothing. **Layer 3 is what covers those**, which is the
clearest example this list has of why detection is not optional.

**3. The provenance audit.** A check, in the strict sense: it reports, and
nothing about it refuses. On every push to the default branch, asks the API
which pull requests each new commit belongs to and fails when none was merged. A
squash merge is associated with its PR; a direct push is associated with
nothing.
*Does not cover:* prevention. By the time it fails, the commit has landed. It
also cannot tell whether checks were green when the merge was taken.

**Detection is what makes the other two honest.** Prevention can be bypassed,
and a bypassed preventive layer is silent by construction. Detection runs on the
result, which is the one thing a bypass cannot avoid producing.

## Installed is not a state you can assume

Copying these assets into a repo is not installing them, and a directory listing
cannot tell the two apart. `assets/check-setup.mjs` reports the layers above by
number against the repo you are standing in, so its output is this section
rendered rather than recalled. Run it before you install anything and again
afterwards, and keep both. A layer whose script is present and whose wiring is
absent reports as absent rather than partial, on layer 0's reasoning: a control
nothing invokes is an instruction.

**It looks for the guard where the wiring says it is**, not only at
`scripts/guard-merge.mjs`. Install it elsewhere and the hook you write is where
the report reads the path from, so the verdict and the probe line below both
name your copy. A hook naming a file that is not there is still absent: wired at
nothing and copied but unwired are the same failure, and the report says which
of the two it found.

**It reports the layers that apply to the mode it is in**, which is the one
place a report is allowed to read the write boundary off disk. It reads
`factory/machine.md` inside the git common directory, which is where every
checkout of a repository reads the same answer and a working-tree path does not
(ADR 0037, and the guest gate's own section below). It prints one of three
answers there: owned, guest, or nobody having said. In guest mode the four
layers above report `n/a` with the mode as the reason and the gate below is the
only one judged; in owned mode the reverse. **An absent layer explained by the mode is not a failure and does not
move the exit code**, because a permanently red line and a guard that cries wolf
get switched off the same way.

The third state is a finding rather than an error. ADR 0021 has the boundary
asked out loud at initialisation, so a repo where nobody wrote the answer down
skipped the step. Worth printing, and not a reason to fail a setup that is
otherwise complete. Such a repo is reported against the owned checklist, and the
output says so, because **if the repo is not yours those four layers are the
wrong thing to install** and a silent default would be how that happens.

**And it reports a layer you decided against as `declined` rather than as
missing.** The revisit trigger at the end of this chapter tells you to delete
layers as their drivers arrive, and until #156 the report had no way to say that:
a deliberate absence landed in `MISSING` beside genuine neglect, and the `FIX:`
line under it closed with a recipe for doing the thing you decided not to do.

Record the decision, then declare it in `AGENTS.md`, one line per layer:

```
Enforcement layer 3: declined, recorded in docs/decisions/0004-no-audit.md
```

The layer then reports `declined`, is not counted, and does not move the exit
code. Its *does not cover* line is still printed, because a decision is not a
mitigation and the risk stays on the screen; only the argument about it stops.

Four things about that line are worth knowing before you write one.

- **A record, not a reason.** The path has to name a file in the repository and
  that file has to exist and be tracked. Free text cannot be checked, so "not
  needed here" would satisfy it, and the status would become a checkbox. The
  check never opens the record: whether a decision is *good* is not a thing a
  text scan can answer, and one that pretends to fails the moment somebody words
  it differently.
- **Committed, both files.** A declaration in one working tree and in nobody's
  clone is refused. The whole reason this lives in the tree rather than beside
  the machine record is that everyone who clones has declined the layer, because
  they clone the decision too. ADR 0054.
- **What is installed wins.** Install a layer you had declined and the report
  says so and calls the declaration stale, rather than reporting `declined` over
  a control that is there. So the record retires itself by being contradicted.
- **The gate is not declinable, and neither is anything in guest mode.**
  `AGENTS.md` in a repository you are a guest in is the host's file. The four
  owned layers are already `n/a` there, and the gate is the mode rather than a
  layer of it.

That the *report* may read the mode and the *gate* may not is ADR 0030, and the
difference is position in time rather than trust: a hook runs before its command
and cannot know where that command will land, while a report runs where you are
standing with nothing in front of it. Neither of them infers the mode from the
repo, and neither from a remote.

It reads files, so the principle this chapter applies to each layer applies to
the check itself. What it does not cover:

- **A hook written into settings, which is not a hook that runs.** There are
  three states and the check can only see the first. The hook is *written into
  `.claude/settings.json`*. The hook was *loaded by this process*, which was
  decided once at startup, before any of today's work. What was decided then is
  the entry and not the script it names, so today's edit to the guard's rules is
  live in that process while today's edit to the wiring is not. The hook *fires
  on the command in front of you*, which is the only one of the three that
  denies anything. **The middle state is invisible from inside**, so do not write a
  status update that treats it as observed: a live guard and an inert one read
  the same to you, to the agent, and to this check. Only a denial somebody
  watched happen distinguishes them, which is a denial you can ask for: see
  below. The startup snapshot below is what makes
  that middle state so easy to lose. It is not a coincidence that this bullet
  is about the guard: layer 2 is the only gate, and a gate is the only kind of
  layer whose silence is ambiguous. A check that never ran leaves a missing
  report; a gate that never fired leaves nothing at all.
- **Anything at GitHub's end.** Rulesets, required contexts, bypass actors, who
  can push at all: invisible to a check that reads the working tree. That cuts
  both ways. On a repo that already has protected branches, some of these layers
  should be deleted rather than reported absent, and which ones is the revisit
  trigger at the end of this chapter.
- **Whether the guard's rules are right.** It checks that the matcher names
  every shell tool and that `DEFAULT_BRANCH` matches this repo's actual default.
  It does not read the patterns. Whether the guard denies what it should and
  allows what it should is answered only by its own tests, in both directions,
  and the allow direction is the one nobody writes.

Green here means the layers are present and wired. It does not mean anything was
prevented.

### Ask the guard whether it is loaded

The middle state is invisible from inside, so stop inferring it and make the
guard produce a denial you asked for:

```bash
node scripts/guard-merge.mjs --probe
```

**Being refused is the answer you want.** The guard denies that line by name, so
the harness prints the guard's own message and the probe never runs. If the
probe's output appears instead, nothing intercepted it: either no hook runs this
file, or this process started before the one that does. The fix for the second
is a restart, not another install, and the probe says so.

Absence is the signal, and there is no artifact to misread. A heartbeat written
by a `SessionStart` hook has the same bootstrapping property (no hooks, no
heartbeat) but it leaves a file behind, and a file can be stale: read one from a
previous process and a session with no hooks at all reports healthy.

The probe and the rule are the same file, so no rename can leave a probe nothing
refuses, and nothing has to be copied beside the guard for the answer to exist.
`check-setup.mjs` prints this line under its report for the same reason it
prints the guest gate's, because a green layer 2 and a refusal are two different
claims and you want both. Ask after installing, after any change to hook
settings, and when you take over a session.

*Alone on the line.* A `PreToolUse` hook refuses the whole tool call, so
`git pull && node scripts/guard-merge.mjs --probe` pulls nothing and then prints
the answer you were hoping for. That the refusal is the result you asked for is
what makes this one hard to catch: there is no error, nothing looks wrong, and
the commands chained to the probe did not happen. It has caught two
orchestrators on the project this skill came from, the second of them after
reading a warning about the first. Treat the paragraph you are reading as the
weaker of the two available remedies. The stronger one is a denial that names
what it cost instead of ending "nothing is wrong", and this guard does not do
that yet.

*Not through `npm run`.* npm re-invokes the script through a shell of its own,
so the hook is shown `npm run <name>` and the file name it matches on is nowhere
in that line. The probe would then run in a session where the guard is loaded
and report it absent, which is the one wrong answer that looks like a right one.
The guard's probe refuses to report at all when it sees npm around it.

## Wiring

`.claude/settings.json`. A PreToolUse matcher selects on **tool name**, so it
has to name every shell-capable tool the harness offers, and nothing may narrow
it back to one of them:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs\"",
            "timeout": 15 }
        ]
      }
    ]
  }
}
```

This file used to show `"matcher": "Bash"` with `if` clauses, so the hook fired
only on `git` and `gh`. A session then ran `git push origin main` through a
PowerShell tool and was **not denied**, and a second session measured the same
hole without looking for it. `if` uses permission-rule syntax, which names a
single tool: `Bash(gh *)` cannot fire for a different shell tool, so the filter
reopens the hole the matcher just closed. The guard already reads the command
text and exits on anything it does not care about, so the filter was buying
microseconds at the cost of a bypass. Bad trade.

**That tool list has a shelf life.** Tool names are harness-specific and new
ones ship. Re-read which tools can run a shell whenever you change or upgrade
harness, and keep an assertion beside the guard's own tests so narrowing the
matcher goes red instead of going quiet.

**Hooks are snapshotted at process start, so installing one protects nothing
already running, including everything that process later spawns.** This is not a
brief window around installation. It lasts as long as the process does, and an
orchestration session is long by design.

One run measured the whole shape. The CLI process started at 10:21; the
`PreToolUse` block was first written to `.claude/settings.json` at 13:29 the same
day; the process then ran for two more days. Every subagent it dispatched
inherited the hook-free snapshot, the guard never fired once across the entire
project, and the script was fine the whole time: fed a payload by hand it
returned a correct deny. Nothing anywhere said the layer was absent, because a
guard that was never loaded produces exactly the same output as a guard with
nothing to deny.

**What is snapshotted is that block, not the file it names.** The distinction is
worth more than it looks, and conflating it has cost time in both directions.
The hook *entry* is read once, at startup, so adding a hook, deleting one, or
changing its matcher or its command line reaches nothing already running. The
*script* the entry invokes is read off disk every time the hook fires, so a
change to what the guard decides is live in every running session the moment it
lands, with no restart and no staging.

Both halves are measured. The run above is the wiring half, and only a restart
would have fixed it. The logic half was watched happening in a process that had
been running for hours: a probe line was allowed, a `git pull` brought a fix to
the guard's parser into the checkout, and the same line minutes later was
denied, with nothing else changed.

So **restart after a change to the wiring, and do not bother after a change to
the rules**, where a restart buys nothing and waiting for one wastes the window
in which the fix is already live. Two things follow that a guard's author needs
before they start:

- A guard change **can** be verified live, right after it merges, in a session
  that predates it. That is often the only way it can be verified at all, since
  a branch that edits the script does not change the guard for the agent writing
  it: the hook command resolves against the checkout the session started in.
- A **broken** guard reaches every running session and every dispatched agent
  the same way, at once. Land rule changes on deny and allow cases, not on a
  staged rollout, because there is no such thing here.

Never read a non-denial as evidence about the guard. It says nothing either way.
The one exception is the probe, whose whole line was written to be denied, which
is what makes its silence mean something.

**That run also priced layer 0, by accident.** With the only preventive layer
inert for two days and roughly fifteen agents dispatched, exactly one merged
anything, and that one was induced by a brief demanding a condition only a merge
could produce, not by the missing guard. The instruction held on its own nearly
everywhere. Read that as a reason to state what each layer is actually worth,
not as a reason to skip the guard: one unsanctioned merge is precisely what the
guard exists to make impossible, and the run offered no way to notice it was
gone.

A hook denies by writing JSON to stdout and exiting 0:

```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}))
```

The wrapper calls the REST merge endpoint rather than `gh pr merge`, precisely
because the guard blocks that by name, and its `gh api` call is a child process
rather than a Bash tool call so the guard does not see it. **Making the safe
path the only working path beats asking nicely.**

## Guards cost more when they are wrong than when they are absent

One guard produced **three false positives in a day**: a commit message that
merely mentioned the default branch, the fast-forward sync that catches local
`main` up after a merge, and a read-only `git merge-base` query. Each blocked
something done constantly.

A guard that obstructs routine work gets worked around, and then it protects
nothing. Two rules follow.

**Test both directions.** A gap lets something through; a false positive gets
the guard disabled. The second is the likelier failure and the one nobody writes
a test for.

**A PreToolUse hook cannot know where its command will run.** It executes
before the command, so a `cd` inside that command has not happened yet, and any
check reading the working directory is reading somewhere else. That is a
property of the mechanism, not a bug, so branch-dependent rules in a hook are
unsound and the durable guards read only command text.

*One thing a hook may read the filesystem for, and the line between them is
worth keeping.* The guest gate's `--scope` asks git for the common directory of
wherever the session is standing and stands aside unless it is the repository
the hook was installed for. That is not a verdict on a command; it decides
whether the gate is about this repository at all. Two things make it sound where
the branch lookup was not: the fact it reads is `--git-common-dir`, which answers
identically from every checkout of a repository where `--abbrev-ref HEAD` does
not, and being out of scope only ever means standing aside. The `cd` problem
still applies and is written into the gate's own not-covered list. ADR 0037.

**The shipped guard broke that rule itself, and it was caught.** For a bare
`git push` or `git merge` it shelled out to `git rev-parse --abbrev-ref HEAD`
and denied only when the answer was the default branch. Run from inside a
worktree, where HEAD is a feature branch, that copy answered `allow` on a
command the main checkout denied. Same script, opposite verdict, decided by
which copy ran. **The clause is gone**, and what replaced it reads the
destination out of the push's own arguments, so it answers the same everywhere.
The cost is stated in layer 2's *does not cover* above rather than papered over:
a rule that is right or wrong depending on something it cannot see is worse than
an absent one, because it is trusted.

**Ask what each command in the line invokes, never what the line's text
contains.** Scanning the text is the mistake that read a commit message
mentioning `main` as a push to `main`, and then read `gh issue comment 45 --body
"gh pr merge was denied"` as a merge. Matching the command's own arguments and
stopping at the next link in a chain is closer but still not it: a quoted
argument can contain an operator, a heredoc body is data, a reserved word or a
`VAR=value` prefix stands in front of the real command, and a global flag can
sit between a program and its subcommand. `gh --repo o/r pr merge 42` is a
working merge that every version of that shortcut allowed.

So the shipped guard tokenises the line into the commands it will actually run,
and every rule reads the head of one of them. That parser is the same in
`guard-merge.mjs` and `guard-guest-writes.mjs`, marked in both with
`// BEGIN command reader`. **If you edit it in one, edit it in both**; the two
copies have drifted twice, and both times the bug reached only the file nobody
was looking at.

## The other gate: guest mode's write boundary

Everything above is owned mode, where the thing being protected is a trunk other
work depends on. Guest mode protects something else — a repository that is not
yours — and it gets its own gate, on its own numbering, because it is a
different stack rather than a fifth layer of this one.

`assets/guard-guest-writes.mjs` denies, before the command runs: a push to a
remote, every `gh` verb that is not a read, a `gh api` call carrying a write
method or a payload, a `git config --global` or `--system`, and the two beads
commands that write tracked files into a host repo. Reads are unrestricted,
because pulling the host's ticket in is the normal case.

```bash
node <this skill>/assets/guard-guest-writes.mjs --install
```

*Does not cover:* any process the harness did not load it into, a human at a
terminal, and any outward write that does not arrive through `git`, `gh` or
`bd` — `curl`, `glab`, `npm publish`, an editor's own forge integration.
**The publish-time audit below is what covers the first two**, for the one
vector it can see, and this is the guest stack's version of the sentence layer 2
already makes about layer 3.

**The gap and the design are the same sentence here.** The one thing this gate
refuses is the one step guest mode reserves for the owner, and no hook of ours
runs at the owner's terminal. Publish is deliberate, human, and outside the
agent session, so there is nothing for the gate to add to it.

### Where it lives, which is the harder half

Two questions, and conflating them is what produced #122. **Where the gate and
its facts live** is one. **Which sessions the gate is registered for** is the
other, and it is the one that was wrong.

#### The files: the git common directory, because a repository is not one directory

The gate copies itself to **`factory/` inside the git common directory**, beside
the machine record and the discovered check command. `git rev-parse
--git-common-dir` answers the same thing from a main checkout and from every
linked worktree of it, which `--show-toplevel` and `--git-dir` do not, so that
is the only place a per-repository fact can go and be read from every checkout.

It is also outside the working tree, so **nothing has to be excluded to keep it
invisible**: git does not look inside `.git/`. The exclude append survives for
`.claude/settings.local.json` alone, which is the one file that has to be in the
working tree because that is where the harness reads settings from. Afterwards
`git status --porcelain -uall` is exactly what it was before. Run that yourself
rather than believing it.

This used to be `.factory/` at the working-tree root, kept out of sight with
`.git/info/exclude`. That was the right instinct one directory short of its own
reasoning, and ADR 0037 has the correction.

#### The registration: measure which sessions it reaches, and say so

**Claude Code reads project settings from the directory the session started in
and from nowhere else.** Not the parent, not the repository, not `.git/`.
Measured on 2.1.228 with a `SessionStart` hook as a marker: a session in the
main checkout fired it, and sessions in a sibling worktree and in one nested at
`.claude/worktrees/x` inside the main checkout fired nothing. `$CLAUDE_PROJECT_DIR`
is that same directory, so in a worktree session it is the worktree.

So there are two registrations and they do not cover the same sessions:

| Where the block is | Covers |
| --- | --- |
| `.claude/settings.local.json` in one checkout | sessions started in that directory, and nothing else |
| `~/.claude/settings.json`, carrying `--scope` | every session inside the repository it names, worktrees included, and worktrees that do not exist yet |

`--install` writes the first and **prints** the second. That is not a
formality: until #122 only the first existed, and **the sessions it did not
reach were the ones doing the writing**. An orchestrator sits in the main
checkout, where the gate is installed and works. Subagents sit in worktrees, and
subagents are what push branches, open pull requests and comment on the host's
tracker. The probe did not catch it either: run in the main checkout it is
correctly refused, and the boundary is enforced for the one session that is not
writing anything outward.

**The home directory is still not ours to write to**, and printing a block is
not installing one. What changed is the other objection to a user-level hook —
that it follows the operator into every repository on the machine, where every
refusal is a false positive by construction. The printed block carries
`--scope <git common dir>`, and the gate stands aside outside the repository it
names. It is a literal in the wiring rather than a mode read off disk, so
installing the gate is still the declaration, and the git fact it compares is
the one that is identical from every checkout. ADR 0037.

Get the block again at any time:

```bash
node "$(git rev-parse --path-format=absolute --git-common-dir)/factory/guard-guest-writes.mjs" --user-hook
```

**Installing it and removing it are a deliberate pair.** A machine-wide gate
said out loud is a legitimate answer; a silently machine-wide one is not.

**Which sessions a hook reaches is what actually limits portability**, along
with which harnesses have an untracked place to put one. Checked in August 2026:
Claude Code, Copilot CLI, Codex CLI, Gemini CLI and opencode **all** have a
pre-execution surface that can refuse a command. Only Claude Code and Copilot
CLI document an untracked repository-level file to put one in, and Copilot
documents reading Claude Code's. On the other three, wiring the gate means
editing a tracked file, which is the boundary breaking itself to enforce
itself — so there the boundary stays a declaration, and the publish-time
statement below is what you have. **The user-level equivalents on those three
have not been measured**, so nothing here claims the two-registration shape
ports; treat that as open.

### Ask it whether it is loaded, from the session that is doing the work

Same problem as layer 2, and the same answer, in the gate for this mode. The
install prints the absolute path; this is how to derive it:

```bash
node "$(git rev-parse --path-format=absolute --git-common-dir)/factory/guard-guest-writes.mjs" --probe
```

Being refused is the answer you want. If it prints, the gate is not in this
process, and there are now three reasons rather than two: no hook, a process
that predates the hook, or **a session started somewhere the gate is not
registered for**. The third is the one #122 was about, and the remedy is not a
restart. Alone on the line, for layer 2's reason: the whole tool call is
refused, and this refusal reads as success too. This gate had the one-file probe
first; layer 2's guard has it now too, and until it did, a repository installing
this skill had no way to ask its only preventive layer anything at all.

**Ask from a worktree, not only from the main checkout.** A probe run where the
orchestrator is standing says nothing about the sessions that push branches.
That is the exact shape of the miss: the boundary reported enforced, correctly,
for the one session that was not writing anything outward.

`check-setup.mjs` reports this gate as **G** rather than as a fifth layer, for
the same reason it has its own section here. It answers three questions a
listing cannot — is it wired, which checkouts of this repository the wiring
reaches, and did installing it change the host repo — and it cannot answer the
fourth, which is whether the process ever loaded it. So a green `G` and the
probe's refusal are two different claims and you want both. It names by path any
checkout with no wiring, so "wired" and "wired for the session in front of you"
stop reading as the same fact.

The install promises that `git status --porcelain -uall` is byte-for-byte what
it was before, and the report checks that promise: a gate that got committed, or
one wired by editing the host's tracked `.claude/settings.json`, works exactly
as well and has already broken the boundary it holds.

### The other half of guest mode: a check, not a gate

The gate above refuses outward writes. What stands in for layers 1 and 3 is the
host repository's own check command, run locally before work lands on your
integration branch — ADR 0021's table, the row where owned mode reads a remote
rollup and guest mode has none to read.

That is a **check** in this chapter's sense and nothing about it refuses.
Establishing what the command is in a repository the factory did not create is
`assets/discover-checks.mjs`, and its one rule is that nothing becomes the entry
point until it has been executed and seen to exit 0. A check the factory
invented and never ran is worse than none: it produces confident red or
confident green about the wrong thing, and the first gets it switched off the
same way a guard that cries wolf does.

*Does not cover:* their environment. A local run reproduces their steps by
construction and never the infrastructure, secrets and services their runners
have, so it buys fewer round trips rather than a pull request that will pass.
Their pipeline file is read for description and never adopted as a command, for
the same reason. `references/host-checks.md`.

### The detection half, which is what the gate's not-covered list is for

The gate makes the boundary refusable inside an agent session. It does not make
it *audited*, and the two are different claims. Everything in its not-covered
list is silent when it is bypassed, which is the fourth constraint's whole
subject, so the guest stack has a check as well as a gate for the same reason
the owned stack does.

```bash
node <this skill>/assets/check-outward-writes.mjs
```

**It is a check in this chapter's sense**: it reports, and nothing about it
refuses. It reads this repository's remote-tracking reflogs, and the reason that
is worth doing rather than merely possible is that the reflog **attributes**.
Measured on git 2.44.0 against a real remote:

| What happened | What the remote-tracking ref gains |
| --- | --- |
| we pushed, however we pushed | `update by push` |
| a colleague pushed and we fetched | `fetch origin: fast-forward` |
| we cloned | nothing |
| we pushed `--dry-run`, or pushed nothing new | nothing |

So a push made by `sudo`, by `env`, by a human at a terminal, or from a session
the gate was never loaded into leaves the same entry as one the gate would have
refused. **That is the half of the not-covered list this closes**, and it closes
it for `git push` only.

It also reads `factory/refusals.log`, which the gate appends to every time it
refuses something. Without that, "the boundary held" and "the boundary was never
tested" produce identical evidence, which is the probe's ambiguity one step
further along. The log records three tokens of the refused command and never the whole
line, so the boundary does not leak what it refused; the probe is refused and
deliberately not logged, since counting it would make "tested" true in a session
where the only thing tested was the gate.

**Three states and three exit codes**, because a check that scans nothing
passes: `CLEAR` and 0 is looked and saw nothing, `FOUND` and 1 is looked and saw
something, `UNCHECKED` and **2** is could not look. A repository with
`core.logAllRefUpdates=false` records no push at all, and calling that clear
would be the confident lie this whole chapter is written against.

*Does not cover:* anything that is not a `git push`. An issue opened, a comment
posted, a pull request created on a branch that was already pushed: `gh` keeps
no local record of what it wrote. Measured, by inspecting its state directories,
which hold config, a device id and an HTTP cache of GET responses.
Nor any route that is neither git nor gh, which is the gate's list again. Nor a
push whose destination was a URL rather than a named remote, or one that was
made and then deleted, or one older than the reflog's expiry. All three erase or
never leave the evidence, and all three are measured and named in the file.
Nor whether the gate was loaded, which is the probe's question: the report
prints the probe line and **refuses to run it for you**, because a hook sees
tool calls and not the child processes a script spawns, so an answer collected
from in there would always say inert.

`--remote` adds `git ls-remote`, which is the only source that sees a push made
by URL and the only one that can attribute nothing: a colleague pushing a branch
whose name matches ours looks identical. It reports and never fails the check,
on the standing rule that one false accusation ends a detection layer.

`--mark` bookmarks an authorised publish so the report is not red for ever
afterwards. It does not hide what is below it, because that is the baseline rule
from the provenance audit and the same hazard, so earlier pushes stay counted
and stay printed.

### And still say the part that is yours

One clause of the publish sentence is now checked and the rest are not, so say
the rest deliberately rather than as a habit:

| Clause | Who says it |
| --- | --- |
| no branch pushed | the check, from the reflog, attributably |
| no item opened on the host's tracker | you |
| no comment posted | you |
| nothing outside this machine touched | you, and nothing can help |

If you cannot say the remaining three, say precisely what you did instead. ADR
0021 promised the boundary would be assertable; this keeps the first row of that
promise and the other three are still somebody's word, which is worth stating
plainly rather than letting a green report imply otherwise.

## The provenance baseline

Pin a baseline commit: the one that first made the PR-only rule a control rather
than a sentence, normally the commit adding these scripts. History at or below
it is not judged, because commits pushed directly before the rule existed were
not violations at the time.

**Moving the baseline forward to silence a failure is forbidden, and the script
should say so.** That is how a real violation gets absorbed into "history we
agreed not to look at".

The API lags a merge by seconds, so retry rather than accept a rare false
positive. This check's only output is a red build asserting somebody bypassed
the process, and one false accusation a month is enough for it to stop being
read, at which point it is worse than nothing because it launders the problem as
solved.

Keep it in its own workflow, not as a required check, which is to say it stays a
check and is never promoted into a gate. A job that only runs on push reads as
"never ran" on every pull request and would refuse every merge.

## Two CI checks that pay for themselves under parallelism

**Collision checks.** Parallel branches routinely add a file whose name must be
unique repo-wide: ADR numbers, migration numbers, config files. Neither branch
is wrong alone, nothing conflicts, both merge, and merge order silently decides
which keeps its identity. Two migrations numbered `0003` apply in an order
nobody chose, so the same commit produces different schemas on different
machines.

This only means anything **against the merge result**. A branch adding ADR 0009
is fine in isolation and collides only once the default branch has one too.
Verify your CI checks out the merge commit, by actually producing a collision
rather than assuming. Require it, so that it is a gate: an advisory collision
check reports the clash on a pull request you are then free to merge, which is
the moment the information stops being worth anything.

**Boundary checks against build output.** Assert the property against what
actually ships, not against the source. Scanning a built client bundle for
server-only strings catches an import the type system was happy with.

## Revisit trigger

If the repo goes public, moves into an organization, or lands on a plan with
protected branches, protect the branch and **re-derive the layers one at a
time**. Rulesets are free on a public repo, so this trigger fires on day one
there rather than later, and the answer is not the same for all three.

What has changed is that a new driver has arrived. A ruleset is GitHub's driver
for a gate, and it covers part of what these layers cover and not the rest,
which is why the answer has to be taken layer by layer.

**Layer 3 is the one to think hardest about, and "it can only ever pass" is the
wrong reason to delete it.** This chapter used to say the audit goes, on that
argument: with no bypass actors a commit cannot reach the default branch outside
a pull request, so the check that detects one has nothing to find. Half of that
is true and stays true. A ruleset really does prevent the direct push, and while
it is enforcing, the commit the audit looks for cannot arrive.

The half it leaves out is that **a ruleset is not a property of the repository.**
It is mutable configuration at the forge's end, invisible from every checkout,
and a credential that can merge can also disable it, push, and set it back inside
a minute, leaving nothing in any tree. That is a bypass of exactly the shape the
fourth constraint is about, and the only difference from a hook that failed to
load is which side of the network it sits on. Which side is not what decides
whether detection is worth having. Whether the bypass leaves a trace is, and
neither one does.

So the arithmetic is not "a gate arrived, so the layers go". **A ruleset replaces
the layers that prevent. It does not replace the layer that detects, because
detection is the only layer that runs on the result**, and the result is the one
thing a bypass cannot avoid producing. That is the fourth constraint applied to
this trigger rather than only to the layers underneath it.

That is an argument for deciding rather than a decision. The audit is a check, so
what it buys is a failure that is loud, dated and attributable after the fact; it
cannot see a ruleset that was disabled and restored, only a commit that arrived
while it was; and it costs you a baseline commit to choose and, depending on that
choice, a standing finding about history nobody is going to revert. Weigh that
and pick. **What is not available is picking on the grounds that the audit can
only ever pass**, because that sentence is about a configuration rather than
about the repository, and it is most convincing to the reader who has just set a
ruleset up and feels well defended.

The repository this skill ships from wrote both answers, deleting the layer in
its ADR 0001 and putting it back in **ADR 0051** after the argument above. Read
0051 rather than this paragraph if you are about to delete the layer: the
reasoning is three paragraphs long, it names what the audit still does not cover,
and it took a reversal to arrive at. If you delete it anyway, declare it, which
is the last paragraph of this chapter.

**Layer 2 stays, narrowed** to the merge rules. A ruleset refuses a direct push,
so the guard's push-to-default-branch cases become redundant and come out. It
does not refuse an agent merging its own pull request: "nothing lands
unreviewed" and "agents do not land code" are two constraints that only looked
like one while a single layer happened to cover both.

*That narrowing rests on the same configuration, so price it the same way and
note that it prices lower.* While the ruleset is enforcing, the push cases are
redundant. While it is disabled they are not, and they are the thing that would
still have refused a push to the default branch inside an agent session. What you
are trading there is one preventive layer for another that does the same job
better, which is a smaller loss than trading away the only layer that runs on the
result, and that difference is the whole reason these two paragraphs reach
different answers. Take the narrowing on that basis rather than on redundancy,
and notice what happens if you take it in the same pass as deleting layer 3:
layer 2's own *does not cover* list names layer 3 as what covers the destinations
it cannot read out of a command line, so you would be removing the cover and the
thing it was covering for, in one edit, for one reason.

**Layer 1 stays, demoted.** A convenience rather than a control: squash-always
in one command, and a refusal that names *which* check is red where a merge
button does not. Keeping layer 2 also requires keeping it, since the guard
denies `gh pr merge` by name and the wrapper is the sanctioned path it leaves
open. Say in the ADR that it is a tool, so nothing later cites it as the thing
keeping red code out.

Delete rather than keep out of sentiment. The justification for a layer is the
absence of the thing that would otherwise do its job, and that absence goes away
layer by layer rather than all at once, which is why "the branch is protected
now" is the start of the arithmetic and not the end of it. Read that sentence in
both directions: **a layer whose job nothing else has taken over has not lost its
justification**, however well defended the layer above it now is, and "we have a
ruleset" is a statement about one job rather than about all four.

**Whatever you delete, declare.** A layer you took out on this reasoning is
otherwise indistinguishable from one nobody got round to, and `check-setup.mjs`
will tell every clone to install it on every run. The repository this skill ships
from decided exactly this about layer 3, wrote the instruction down in an ADR, a
process doc and the asset's own header, and had the layer installed anyway inside
a day by somebody who had run the tool that morning. **A report that cannot
represent a decision eventually overturns it**, not by being right but by being
louder than three paragraphs asking readers to ignore it. One line in `AGENTS.md`
naming your record is what stops that, and the form is under "Installed is not a
state you can assume" above.

**And that repository then decided the layer should have been there all along**,
which is the other half of the story and the more uncomfortable one. The
declaration mechanism would have stopped the report arguing with the decision; it
would not have made the decision right, and ADR 0051 reverses it on the merits as
well as on the noise. So declare what you decide, and hold the decision itself
open to being wrong: the record you point the line at is the thing somebody
revisits, which is why the check insists there be one rather than accepting a
sentence.
