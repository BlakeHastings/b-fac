# Running several agents at once

## Mechanics

Implementation agents: `subagent_type: "general-purpose"` with
`isolation: "worktree"`, launched as several tool calls in one message so they
run concurrently. Each gets its own worktree and branch, so agents never see
each other's uncommitted work and a rebase is contained.

**Isolation follows what an agent runs, not what it writes.** An auditor reading
the record, or a hunting pass reading only code, needs no worktree: it changes
nothing and the overhead is real. An agent that **boots the app** needs one even
though it commits nothing, because everything under "Shared machine state" below
is keyed on the worktree path. Without one it binds the same ports and mounts the
same volumes as everybody else, and reports another agent's database as a
finding. One session gave all four of its hunting passes worktrees, against the
rule as then written, and was right to; that is one session, so take it as the
reason rather than the proof. Each worktree handed out is also one more that can
be orphaned, which is what the sweep under "Resuming and recovering" is for.

Announce a wave with a one-line reason per issue. It makes the sequencing
decision reviewable later, including by you.

## Batch by collision surface, not by theme

Issues that touch the same registry go together, briefed as a group, because
separately they are three rebases. Unrelated surfaces go apart even when they
sound like one feature.

Three agents in three directories was the comfortable working size on one
project. The number is not the point: the collision surface is. When work
genuinely splits inside one module, pay the rebase deliberately and **say so in
both briefs** so neither agent is surprised. One such pair collided exactly as
expected, and the round trip also removed the last hand-rolled plural on that
surface, which neither had set out to do.

The one time this was misjudged, the second agent spent its rebase splitting a
file rather than building.

## Size a dispatch against the window, not just the surface

An agent that fills its context gets compacted, and what the summariser drops
first is the brief: the evidence bar, the out-of-scope list, the artefact it was
told to check. It carries on and reports confidently, and you are not told.
`references/continuity.md` has what reaches the agent and how to see afterwards
that it happened; this is the half that stops it happening.

**There is no number here and inventing one would be worse than nothing.** What
is known is the shape: agents that read a lot of large files compact, and it is
the reading rather than the thinking that does it. So prefer a brief that names
the files to a brief that says "read the module", say which parts of a large
file matter, and split an issue that needs the whole of two subsystems in one
head rather than paying for it in a summary you never see.

## Assign ADR numbers explicitly

Three agents once claimed 0005 and 0006 between them, each taking "the next free
number" from a default branch that had moved. Check the branch **and** every
open PR, then hand out exact numbers in the brief.

A CI collision check catches it on the merge commit, but a caught collision
still costs a rebase. Assigned-but-unused numbers leave gaps, and a gap is not a
bug. Neither the branch nor the open-PR check sees a number claimed in an
uncommitted file on a running agent's branch; the worktree sweep under "Resuming
and recovering" does.

## Relay findings between running agents

When one agent lands something another needs mid-flight, send it. Do not let two
agents discover the same constraint separately.

Carry the **substance**, not a SHA: what landed, which files, what it was trying
to achieve, and which of its properties must survive. A relay that changes the
evidence bar is worth sending immediately:

> The dispatched run of the same suite on the same commit passed. All green. So
> this is intermittent, not deterministic. A green run is not evidence. Neither
> before your change nor after it.

## Rebases are theirs, not yours

When the default branch moves under an agent, send it back to rebase and
re-verify. Do not fix up their branch: you will be reviewing your own work.

The line is **resolving conflicts**, not moving a branch forward. A clean
fast-forward is bookkeeping. A hand-resolved conflict is authoring code on a
change you are about to review, and one orchestrator crossed that line twice,
both times after its enforcement layer was in place. Its resolution "typechecked
and passed CI's shape, and silently dropped every tag route". Twelve tests
failed. The regex fix that followed ate the opening block of a core function.

> my merge gate protects against master moving under a PR. It can't protect
> against me resolving a conflict badly.

**Nothing mechanical catches this**, because a gate reads the merged result and
the conflict is where the meaning went. When the agent that owns the branch is
gone, spawn a **fresh agent to rebase**, briefed that the job is rebase and
re-verify rather than build. One session did exactly that, deliberately, so that
nobody reviewed their own resolution.

**Tell them to read what git auto-merged.** A clean auto-merge is a claim about
text, not about meaning. One rebase touched six files, one conflicted, and the
five git resolved silently held two real defects: a comment that had been
accurate until the other PR made it false, and a paragraph re-indented under the
wrong heading so it read as part of another subject. None of that is caught by
CI, by a test, or by reading the diff of your own change.

**The version line does not conflict when both branches guess the same number.**
Two payload branches here started from the same commit at `0.38.0`, both wrote
`0.39.0`, and the rebase resolved silently because nothing disagreed. The second
then claimed a version the default branch had already released, and git had
nothing to say about it. A conflict does happen when the numbers differ, so
"expect a one-line conflict in the manifest" is not simply wrong, only wrong in
the case parallel work makes likely: the more disciplined the agents, the more
identical the edit.

**So brief the number rather than the conflict, and brief one that survives
either merge order** instead of the next free one. An agent did that on its own
initiative, taking `0.17.0` while another open branch still held `0.16.0`, and
its branch merged with nothing to change. The net is the check, not the merge:
`check-version-bump.mjs` reads the released version from **the tip of the
default branch** and not from the merge base, precisely so a branch cannot
inherit someone else's bump and call it its own. Do not hand version numbers out
the way you hand out ADR numbers, though. A version is compared against a branch
that moves, and that comparison is already the control.

## Orchestrator hygiene while agents run

Touch nothing they touch. Reviewing, filing issues, answering the owner and
mining the record are safe. Editing is not. One orchestrator committed two agent
worktrees as embedded git repositories, which would have broken every clone. It
has now happened on a second repo, which makes it a property of `git add -A` and
not an accident: **put the worktree directory in `.gitignore`** so the root-level
add cannot pick one up silently.

## Shared machine state is the parallelism hazard

Any command acting on "the environment" needs telling **which** environment. A
teardown that stops everything is fine alone and destructive with three agents
running. The failure is not an outage: it is an agent reading a different
worktree's database and reporting a table as empty, which is a false finding
produced by tooling and worse than an outage because it looks like a finding.
All three of the properties below are keyed on a path, which is what an agent
without a worktree does not have.

Three things have to be true, and each is worth verifying by actually running
two environments at once rather than assuming:

- dynamic port binding, with the app refusing to start without an injected port
- data volumes keyed on the worktree path, since isolation flags usually
  randomize ports but not named volumes
- every lifecycle command scoped by an explicit path argument, with the unscoped
  form denied by a hook

## When agents hit something the human never does

A dev server piped the browser console to the terminal only when it detected an
AI agent, from an environment variable naming the harness. Combined with a
plugin piping the terminal back to the browser, one warning became 172,000
messages, a dead server and a dead browser. It was on for every agent and off in
the owner's own terminal.

Three agents reported it as Docker wedging, cold-start flake and worker
contention, and the orchestrator told the owner to treat one report with
suspicion because a machine problem seemed likelier.

**When agents keep hitting something the human never sees, stop looking for a
flaky machine and ask what is different about running as an agent.** Environment
variables naming your harness are where to start. Then fix the asymmetry rather
than the symptom, so a person and an agent get the same environment. That is a
separate job from fixing the loop, and it is the one that stops it recurring.

## Resuming and recovering

`SendMessage` resumes an agent with its context intact. Much cheaper than
re-briefing, and the agent already knows why it made its choices. Used for
rebase instructions, relays, mid-flight steers, collision warnings, corrections,
and resuming from a preserved commit.

When an agent stops mid-work its worktree survives, usually with uncommitted
changes. **A dead agent does not report that it died**, so nothing tells you the
worktree is there. Sweep for it instead of waiting to be told:

```bash
git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' |
  while read -r w; do echo "== $w"; git -C "$w" status --short --branch; done
```

Run it when an agent goes quiet, and again before you write `Next: nothing`: an
orphan holding real work is a line waiting on you, which SKILL.md's "Before you
stop" makes your `Next:` rather than a blocker. A branch line with no
`...origin/` upstream has never pushed anything, and every line under it exists
nowhere else. Then, per worktree:

1. Check `git status` there before assuming anything landed.
2. If there is real work, commit it as clearly-labelled WIP on its branch. Do
   not push, do not merge, and say in the message that it is unreviewed.
3. Resume or discard, deliberately. Do not silently finish it yourself.

Tell a resumed agent to re-orient from the code:

> I preserved your uncommitted work as a WIP commit on that branch. Nothing was
> reviewed and nothing was pushed. Run `git log -1` and `git show --stat HEAD`
> and re-orient from the code rather than from memory.

## When the whole fan-out dies at once

A **fan-out** is many agents over one queue of like items: audit these ninety
files, extract these forty records. It is not the wave of three builders on
three issues that the rest of this file is about, and it fails differently. A
wave loses one agent at a time, and the sweep above finds the worktree. A
fan-out loses everything in the same instant, because whatever kills it sits
upstream of all of it: a usage limit, an API outage, a closed terminal.

One did. A usage limit ended an orchestrator and roughly eleven agents together,
several of them one tool call from writing their output. It cost almost nothing,
and neither reason has anything to do with the agents.

### State lives in files, not in your context

Before dispatching, write a **resume record**, and keep it current as the queue
moves rather than at the end: the target, the concurrency ceiling you actually
measured rather than the one you planned, the queue in order, and which
candidates are reserved or already absorbed into another item. The
orchestrator's death was survivable because none of that was only in its head.

It goes where the handoff and the machine record go: `factory/` inside the git
common directory, which is one path from the main checkout and from every linked
worktree alike.

```bash
git rev-parse --path-format=absolute --git-common-dir
```

ADR 0037 settled that, and `references/continuity.md` has the reasoning. Do not
invent a location for this one. The resumer is usually a fresh session standing
in a different directory from the one that dispatched, which is the case the
common directory exists for.

The measured ceiling earns its line separately, because it is the item a resumer
can recover from nowhere else. It was learned by running into it, and leaving it
out means paying that discovery again on a session with less budget than the one
that paid for it the first time.

### The artifacts are the progress record, and a list is not

**Name the output directory as authoritative, and mean it.** What is on disk is
what got done. A progress list the orchestrator maintains is a second copy of a
fact that already exists somewhere better, written by the process most likely to
die before updating it, and it dies holding a count that was true a few minutes
ago. Worse than absent: a resumer believes it.

That is also what keeps the record small enough to be worth keeping current. It
carries the queue and the parameters, which nothing else knows, and not the
progress, which the output directory answers better. Same rule ADR 0036 gives
for specs, pointed at a different reader: carry only what cannot be derived.

### Give partial output a shape that reads as partial

This is the load-bearing half, and it is the half that has to be decided before
the first agent runs, because it is a property of what the agents write.

Each item produced two files in a fixed order, `<item>.json` and then
`<item>.notes.md`. So a `.json` with no `.notes.md` beside it means *died after
writing the JSON: resume, do not re-run*. Eight of nine orphans needed only
their notes. The ninth was truncated mid-array and had to be redone. Without the
convention all nine would have been redone, and nothing in the directory would
have said which.

What generalises is not the two filenames. It is that **the last thing written
is a separate artifact whose presence means complete**, so "never started" and
"died halfway" are different on disk rather than different in somebody's memory.
A single file appended to as the agent works gives you neither: every item looks
like every other item, and the only way to sort them is to read all of them,
which is the cost the convention exists to avoid.

### A structural check against a field that does not exist agrees with you

The resumer's first pass over those orphans reported `edges=0` for every
artifact, uniformly and confidently, from a schema with no `edges` key at all.
Nothing errored. A missing field does not fail a structural check, it reads as
empty, and the check then says the same thing about every file it is handed.

**A uniform answer across a batch is the signature**, and it is
indistinguishable from a real finding that happens to be unanimous, which is
what makes it expensive: it argues for redoing everything. So **read one
artifact you know is good before trusting a check that says the batch is bad**,
and satisfy yourself that the check can still disagree with itself. That holds
for any after-the-fact sweep over a batch, not only this one.

### It is a separate record, and that is deliberate

`references/continuity.md` says not to invent a document type, and this is one,
so the boundary is stated here rather than left to be found later. **The resume
record is per-fan-out and disposable; the handoff is per-session and durable.**
A fan-out ends and its record is deleted, and deleting it is part of finishing.

Anything in it that outlives the fan-out was never the record's to hold: it
belongs in the handoff, the backlog or a decision record, like everything else
durable. If you find yourself topping one up in a session with no fan-out
running, you have grown a second handoff, and two of those disagree eventually.
ADR 0044.

## After an agent finishes

Stop its environment **by path**, remove the worktree, prune. Otherwise the
volume survives and the directory stays locked.
