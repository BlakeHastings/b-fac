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

## After an agent finishes

Stop its environment **by path**, remove the worktree, prune. Otherwise the
volume survives and the directory stays locked.
