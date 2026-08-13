---
name: orchestrated-delivery
description: >-
  Run a project as an orchestrator driving implementation subagents against an
  issue backlog, GitHub's by default: break work into issues, brief agents that
  work in isolated worktrees, review what comes back, and merge through a path
  that mechanically refuses red checks. Use when asked to "orchestrate", "act
  as an orchestrator", "manage agents", "keep working while I'm away", "break this
  down into GitHub issues", or when taking over a repo that already has
  docs/process/orchestrating.md. Also use when setting this workflow up in a new
  repo, when a subagent's PR needs reviewing before merge, when several agents
  must run in parallel without colliding, or when deciding what to escalate to
  the human owner instead of guessing. Covers brief anatomy, verification that
  proves rather than accepts, merge discipline without branch protection, and
  how the loop revises itself.
---

# Orchestrated delivery

A loop for building a real project with agents, distilled from one that reached
40 ADRs, 72 issues and 47 merged pull requests in four days without losing
architectural control.

Most of what follows is a **default**: what worked once, with the reason
attached so you can tell when the reason stops applying. Five things are
**constraints**. Those are load-bearing, and each is here because breaking it
produced a specific failure rather than because it sounded disciplined.

## The five constraints

**1. Do not review your own work.** You brief, review and merge; you do not
write features. Narrow exceptions: discovery artifacts, process docs, and
preserving work an agent abandoned. When an agent stops mid-task, resume it or
discard it, but do not quietly finish it yourself.

**2. Agents do not land code.** Push, open the PR, report, stop. Landing is
yours, through a path that checks mechanically rather than asking politely.

**3. Verify the central claim yourself.** Not everything: the one thing that, if
false, makes the change worthless or dangerous. A report that is honest is still
not evidence.

**4. Whatever prevention you have, add detection.** A preventive layer that can
be bypassed is silent when it is bypassed. Detection runs on the result, which
is the one thing a bypass cannot avoid producing.

**5. Decisions live in the repo, not in the conversation.** Issues, ADRs, a
gotchas file. If you correct an instruction, correct it where the next person
will meet it, not just in chat. Never write an invariant ahead of the code that
holds it: one `AGENTS.md` claimed sensitive fields were masked before anything
implemented it, and an invariant that is not true is worse than an absent one
because the next person builds against it.

Everything else in this skill is calibration.

## Two questions before the loop

Two independent axes, settled at initialisation. They correlate; they are not
the same question, and all four combinations occur.

**Write boundary: owned or guest.** May the factory write outward? *Owned* may
create the repository, open issues, push, merge, configure CI, apply a ruleset.
*Guest* may write the working tree and its own local store, and nothing else.
Reading external systems is normal — pulling a ticket in is the usual case — and
every outward write waits for **one explicit publish step** the owner asks for.
Guest is a boundary rather than a temperament, which is the point: "no external
writes happened" is a claim something can check afterwards, and "the agent was
careful" never was. **Install the thing that checks it before you do anything
else** — `assets/guard-guest-writes.mjs --install` refuses a push, a non-read
`gh` verb, a `gh api` write and the beads commands that write tracked files,
and it installs into untracked local files so that saying it changed nothing is
true. `references/enforcement.md`, and `references/first-run.md` for the order.
Guest mode has no remote rollup either, so **its gate is the host repo's own
check command, run locally** — which somebody has to establish in a repo the
factory did not create. `assets/discover-checks.mjs` gathers the evidence,
proposes, and records nothing it has not executed.
`references/host-checks.md`, including the limit that a local gate runs a
subset of their pipeline and never their environment.

**Convention authority: ours or theirs.** Whose patterns govern? **Conform where
the host repo has a convention, fall back to ours where it does not.** Absence
is not refusal: a repo with no decision-record directory has not decided against
writing decisions down. Adopting their conventions changes **where the record
lives, never whether there is one** — the three lenses still apply to work the
factory does in a repo with no review discipline of its own.

What proves the axes separate is **an existing side project you fully control:
owned, and mostly theirs**, because it already has habits worth keeping. A
one-axis model gets that case wrong.

**Ask both questions out loud at initialisation, and confirm even when you think
you know.** The asymmetry is the reason: a wrong guess toward guest costs a
question, and a wrong guess toward owned opens issues on someone's real tracker.
**Never infer the write boundary from a git remote.** A work repo is on GitHub
too. A remote tells you the factory *can* write there, which was never the
question; whether it *may* is a fact about the developer's authority, and no
amount of repository inspection contains it. Escalate it; do not derive it.

**The backlog is where the write boundary bites first.** What the loop needs
from a task store is eight verbs, GitHub supplies them in owned mode, and a
local store supplies them in guest mode where a company tracker is read-only.
The merge path, the checks and the ruleset stay GitHub either way, so a portable
backlog is one quarter of this and not all of it. `references/backlog-port.md`.
The local store is **beads**, driven by `bd`; `references/beads-backlog.md` maps
the eight verbs onto it and names the two commands that will write to a host
repo if you let them. **Which tool it is has to be written down**, in one line,
where the loop will meet it: `AGENTS.md` in owned mode, and out of the tree with
the machine facts below in guest mode, because a host repo's tracked files are
not yours to edit.

Record both answers so neither is re-asked nor silently assumed, split by who
they are about. **Repo facts** — where the backlog lives, which conventions won,
the command that runs the checks — are committable in owned mode. **Machine
facts** — whether *this* operator, on *this* checkout, may publish outward — are
never committed, and stay out of the tree through `.git/info/exclude` rather
than `.gitignore`: editing a tracked ignore file to hide your own scratch state
is itself a change to a repo you are a guest in.

## The loop

1. Pick work that unblocks the most. Prefer finishing a journey to starting a
   second one.
2. Batch what would collide; split what would not.
3. Write the brief, evidence bar included. `references/briefing.md`.
4. Dispatch. Implementation agents are `general-purpose` with
   `isolation: "worktree"`, launched as several tool calls in one message. A
   read-only agent gets one too if it boots the app.
5. While they run, touch nothing they touch. Reviewing, filing, answering the
   owner and mining the record are safe. Editing is not.
6. Review. `references/reviewing.md`.
7. Post what you independently verified, then merge or send it back.
8. File what surfaced and could not be fixed there, and top up the handoff with
   whatever this pass changed about where the work stands.
9. Go to 1. The loop has no step that ends it, and reporting is not one. See
   "Before you stop".

## Improving the loop

The loop is supposed to change. An orchestrator who runs it exactly as written a
month from now has stopped observing.

**Change it when you have seen the same thing twice.** Once is an incident.
Twice is a property of the system, and only then do you know whether you are
fixing the cause or decorating a symptom.

Route the fix to the cheapest layer that actually holds:

| What you observed | Where the fix belongs |
| --- | --- |
| Reviewers checking the same thing by hand every time | CI |
| A rule broken by accident, repeatedly | A linter, a hook, or a type |
| An agent rebuilding a decision already made | The reading order in the brief |
| Two agents discovering the same constraint separately | A relay, then a doc |
| A gate that has never caught anything | Delete it |

**Delete as readily as you add.** A gotchas entry goes in when something has
bitten twice and comes out when the cause is fixed, deleted rather than
annotated as historical, because a trap that is no longer real sends the next
reader looking for something that is not there. The same applies to guards: when
the thing they substitute for becomes available, remove them. A control that no
longer prevents anything is a maintenance cost pretending to be safety.

**Say what changed and why.** A process edit with no observation attached is
indistinguishable from a preference, and the next orchestrator cannot tell
whether to keep it.

## Defaults worth starting from

Calibrations, not rules. Each has its reason, so you can tell when to deviate.

- **Three agents per wave.** Three directories is comfortable; two agents in one
  module is a rebase you chose. The real variable is collision surface, not
  count.
- **Batch by what would collide, not by theme.** Issues touching one registry go
  together. Unrelated surfaces go apart even when they sound like one feature.
- **Hand out ADR numbers explicitly**, checked against the default branch *and*
  every open PR. Agents taking "the next free number" collide, and a caught
  collision still costs a rebase.
- **Three lenses for done**: functionality proven by driving the app, code
  proven by comprehension, architecture proven by entropy accounting. Mechanical
  checks are the price of admission, not a lens. Install the full text as a
  process doc from `assets/review.md`; it is the version agents read.
- **Issues carry a "watch out for" section.** The part most issues lack and the
  part that pays.

## Escalation

**Decide yourself:** sequencing, batching, which of two reasonable
implementations, whether a follow-up is worth an issue.

**Ask the owner:** anything about what the business promises or wants. Retention
on a deletion request, whether a field is genuinely retired, the format a
downstream system accepts. You cannot derive these, and guessing produces
confident, wrong software.

Give a recommendation and say what it costs. When the answer differs from your
steer, record that the tradeoff was seen and accepted so nobody relitigates it,
then implement it properly without hedging.

**Refuse to start work whose inputs are missing.** Starting produces work built
on a guess, and the guess is invisible afterwards.

### How to ask, which is not with a tool that blocks

Asking is fine; asking synchronously is the defect. A multiple-choice question
tool suspends the entire loop until a human types, which is the one thing an
orchestrator exists not to do. One mined session made 18 such calls: 7 were
decisions the table above already assigns to you, one bought 100 minutes of
wall-clock idle asking permission for a rehearsal it had just proven touches
nothing live, and in 4 the owner ignored the options and answered in prose
anyway. Use both of these instead, and neither of them waits:

- **An issue labelled for the owner**, carrying the recommendation and the
  cost. Durable, survives the session, and it is where the answer gets recorded
  against the thing it decides. In guest mode it is filed in the local store,
  because escalating is still a backlog write. `references/backlog-port.md`.
- **Plain prose at the end of a turn**, phrased as a question rather than a
  menu. Cheaper than an issue for something you need soon, and the owner can
  answer in their own words.

Then **carry on with everything that does not depend on the answer**, and where
something does depend on it, say which assumption you took, in the brief or the
PR body, so the guess is visible rather than baked in. That is a different
thing from starting work whose *inputs* are missing, which you still refuse.

Both channels only help if you continue afterwards. **A prose question that
ends the turn is the same stop wearing different clothes**, so this rule and
"Before you stop" are one rule in two places.

## Working without the owner

The owner is out of the loop for most decisions, and the loop has to keep
moving. Two instructions recur and both mean more than they say:

- **"Keep working until you are out of options that do not need me."** Not a
  sentiment to agree with. It is the obligation below, and it is failed by
  reporting well rather than by disagreeing.
- **"Where are we at, and what do you need from me?"** An audit. Read the real
  issue and PR state rather than your memory of it, and answer in those parts.

Raw feedback, often dictated, becomes issues without losing the owner's phrasing.
Quote rather than paraphrase: the wording carries what actually annoys.

## Refinement, which fills the queue that section drains

**Refinement converts owner-time into a queue of agent-time work.** A spec is
the handoff between a synchronous activity that needs the owner and an
asynchronous one that must not, so this section and the one above it are two
halves of one rhythm. `references/refinement.md`.

One rule decides everything that goes in a spec:

> **Can an agent derive this from the repository and its history? If yes, leave
> it out. If no, it has to be in the spec or it is lost.**

Collision surface, module boundaries and test commands are derivable, so they
are the agent's job. Why this is being built, what was rejected and why, whether
it is a good idea at all, which existing tool to use given constraints the agent
cannot see, and what would count as done are not. **This is the escalation rule
above, applied in bulk and in advance**, which is why it fits a day of specs
followed by a night of work.

**The threshold is not a size.** A ninety-file mechanical rename is derivable in
full and needs no spec; a one-line change turning on an unwritten municipal
ordinance needs one, and that spec is four sentences. What decides it is the
count of things an agent cannot derive, never a diff statistic.

**The gate is a label, and the artefact is an epic.** `needs-refinement` on an
item means it is not dispatchable, which the dispatch query already reads
negatively. A spec decomposes into units rather than being one, and an epic
already carries prose context and a real child edge, so it is the spec and
nothing new gets built. The label comes off in the same motion that files the
children.

**Do not write a template.** A form with headings invites completion instead of
thought. A spec is worth writing when something was rejected with the reason
recorded, and when the decomposition changed because of it. If the same children
would have been filed anyway, that was ceremony.

**Open a refinement session by dispatching a wave, then start the
conversation.** A session is the one stretch during which you are not watching
the queue, and a spec conversation is the most absorbing thing you do, so
absorption reads as the loop being busy. Measured here: one epic's premise sat
unsettled for 2h13m with nothing dispatched and two issues open and ready, while
the *later* refinement of that same epic overlapped twelve merged pull requests
because the queue was full when it started.

## Before you stop

**Every status update ends with both of these lines, in this form, as the last
thing in the message. Both every time, and never prose in their place:**

```
Next: dispatching #41 and #43 as one wave, briefs below.
Blocked on: warn-or-block on an expired licence. Owner. Asked in #52.
  Meanwhile: #42 does not touch that path, so it goes out in this wave.
```

`Next:` is work you then start, in this turn, below the report. Dispatching ends
a turn here; summarising does not. `Blocked on:` is one line per blocker, each
naming the question, who can answer it, and where you asked it, plus what you
are doing meanwhile, because one blocked branch is not a blocked loop. With no
blocker, write `Blocked on: nothing` and keep going. Both lines, verbatim,
because a turn missing one is countable afterwards and a disposition is not.

**`Next: nothing` is the expensive one.** It is a claim rather than a state, and
you pay for it by listing every open issue and every open PR and saying what
each is waiting on. Done honestly, a real stop looks like a list where every
line is waiting on somebody who is not you. **If one line is waiting on you,
that line is your `Next:`.**

The reason it is a format and not advice: two mined sessions turned up roughly
21 turns that ended with a status update while unblocked work sat there, the
longest gap 4h28m of wall clock between that report and the owner's next
message. The instruction above was present for every one of them and the
owner restated it sixteen times, which is this skill's own principle turning on
the skill. An instruction is not a control. **The mechanism is that finishing a
good report reads as finishing the turn.** The summary is itself a completion
signal and it wins even when you have correctly worked out that nothing is
blocked, because both facts live in the same turn and only one of them is a
habit. Emphasis cannot reach that, since you already agree.

**A review record is not an exception.** Posting the three headings and a
verdict, as `references/reviewing.md` says to, is a thing you do *during* a
turn, to the PR. It is the most convincing completion signal the loop produces
and it still ends with these two lines.

**Delete the clause that invents a decision.** "I'll start #122 unless you'd
rather I wait", "shall I", "want me to". Three of nine stops in one session
were this, and not one of them contained a question: the decision was already
yours under Escalation. The clause manufactures a decision point, and a
manufactured one stops the loop exactly as hard as a real one. Strike it and
dispatch.

## Surviving your own compaction

When the context window fills, the harness replaces the conversation with a
summary. Nothing errors and the loop carries on, which is what makes this the
one failure the loop cannot notice. What is gone is the specifics: which agent
is on which issue, what the owner said an hour ago and in what words, which
assumption a brief was written under.

**Keep a handoff file, and top it up as part of the loop rather than at the
boundary.** A handoff written when the context is nearly full is written by the
most degraded version of you, about work you can barely still see; the worked
example this skill came from was written at a *calm* moment and was wrong about
its largest claim within the hour. The boundary cannot be gated anyway.
**Automatic compaction must never be refused** — a refused one cannot be
satisfied, because the session then fails every request and the hook goes on
refusing, and the same rule fires for a subagent's context and kills the agent.

It is a snapshot with a decay note, not a source of truth, and where it
disagrees with the repository the repository is right. **Do not invent a
document type for it.** The backlog, the decision records, `orchestrating.md`
and the review record on each PR already carry everything durable; the handoff
is only where the work stopped and what a successor would otherwise have to
reconstruct.

`assets/handoff-hooks.mjs` is the mechanical half: it refuses a manual
`/compact` when the handoff has aged out, never refuses an automatic one, and
prints the file into the resumed context afterwards. **After any compaction,
look for that injected block** — it is either in this context or it is not, so
unlike every other layer here, asking whether it is loaded costs nothing.
`references/continuity.md`, including what a subagent that compacts mid-run
loses and why nothing can currently carry it.

## Three shapes of agent

**The builder.** One issue, one branch, one PR. The default.

**The hunting pass.** Told explicitly to change nothing and report findings.
Point it at a whole user journey and tell it to behave like a real user rather
than someone testing. It works because a lot lands in quick succession, each
piece verified alone, and integration defects live exactly between them. Say
that finding nothing serious is a legitimate outcome, or you get a list of taste
to triage. Safest thing to run alongside other agents, because it touches no
code, though one that boots the app still needs a worktree for the ports and
volumes.

**The auditor.** Pointed at the record rather than the code. Weaker in practice:
several died before reporting. Scope it narrowly and have it write to a file
incrementally.

## Setting this up in a new repo

Everything below is the owned-and-ours corner: a repo you may write to that has
no conventions to defer to. In any other corner, install what the host repo
lacks and adopt what it has, and put nothing outward until the publish step.

Discovery first, if anything is derived from something outside the repo: measure
it, commit the measurement, then derive from it. Never let an agent eyeball a
source. Doing this yourself is one of the few times you should touch the code.

Then `AGENTS.md` for invariants and how to run things, the two process docs from
`assets/`, a seeded backlog, and the enforcement layer. Write `orchestrating.md`
last, from what you actually did.

**Setup ends with printed output, not with this table having been read.** Before
installing anything, run `node <this skill>/assets/check-setup.mjs` from the repo
root: it names every layer MISSING and exits non-zero. Install, run it again,
and put both outputs in your first status update. It needs Node and `git`, no
network and no `gh`, and if Node is absent that is its first finding, because
layers 1 to 3 are Node scripts. Its `LAYERS` table is the same checklist by eye.

**It reports the layers that apply to the write boundary**, which it reads from
the machine record. That is the one place a report may read it, since unlike a
hook it runs where you are standing (ADR 0030). In guest mode the four owned layers read
`n/a` with the mode as the reason and the gate is the only one judged, so a
guest repo with the gate installed exits 0. Where nobody recorded a boundary it
says so and reports the owned set, which is a finding rather than a failure and
a prompt to answer the question ADR 0021 asks at initialisation.

**Copying is not installing**, which is the half it exists to catch: a guard
script no `settings.json` invokes, a `REQUIRED` list still holding its
placeholder, a matcher naming one shell tool, a `DEFAULT_BRANCH` naming a branch
this repo does not have. Where only the instruction stood, one project skipped
setup outright and 20 merges went through raw `gh pr merge`.

**And wired is not loaded**, which no report can see. Hooks are read once at
process start, so ask the guard itself after the restart:
`node scripts/guard-merge.mjs --probe`. Being refused is the answer you want; if
it prints, nothing intercepted it and the guard is not in this process. A gate
that was never loaded is silent in exactly the way a gate with nothing to deny
is silent, and one repository spent two days that way.

| Asset | Goes to | Edit first |
| --- | --- | --- |
| `check-setup.mjs` | `scripts/`, and run it first | `LAYERS` paths, if they differ |
| `review.md` | `docs/process/` | The bracketed commands |
| `working-an-issue.md` | `docs/process/` | Commands and check names |
| `pull_request_template.md` | `.github/` | Nothing |
| `seed-issues.py` | `docs/process/` | `REPO`, `EPICS`, `ISSUES` |
| `merge-pr.mjs` | `scripts/` | `REQUIRED` check names |
| `guard-merge.mjs` | `scripts/`, then `--probe` it | `DEFAULT_BRANCH` if not `main` |
| `check-main-provenance.mjs` | `scripts/` | `BASELINE` commit SHA |
| `handoff-hooks.mjs` | `scripts/`, wired to `PreCompact` and `SessionStart` | `HANDOFF`, and `DEFAULT_BRANCH` if not `main` |
| `guard-guest-writes.mjs` | **Guest mode only.** `--install` puts it in `factory/` inside the git common directory, wires this checkout, and prints a machine-wide block that is the half reaching a worktree | Nothing |
| `discover-checks.mjs` | **A repo you did not create.** Run in place; `--run` records to `factory/` beside the machine record | Nothing |

`references/first-run.md` walks this whole sequence as one repo actually ran it,
in the order its commits show rather than the order listed here.

## References

| File | Read it when |
| --- | --- |
| `references/briefing.md` | Writing a brief or an issue |
| `references/refinement.md` | Work is too underdetermined to brief, or the owner wants a spec |
| `references/reviewing.md` | A PR is waiting |
| `references/parallelism.md` | Running more than one agent |
| `references/enforcement.md` | Installing the controls, or one misfired |
| `references/continuity.md` | Wiring the compaction hooks, or the context is filling |
| `references/host-checks.md` | Working out what a repo you did not create actually runs |
| `references/backlog-port.md` | The backlog is not GitHub's, or you are judging a tool that could be it |
| `references/github-backlog.md` | Seeding or maintaining the issue graph on GitHub |
| `references/beads-backlog.md` | The same eight verbs on beads, which is what guest mode uses |
| `references/first-run.md` | Setting up, in a repo with none of this or one with plenty |

## What the loop is worth

Agents on one project found: a document that would have told an inspecting
authority a contractor held an endorsement they waived, a form that put
applicant answers in the URL, a validator pair that had already silently
disagreed, and an identifier losing its leading zero at submit time.

**None of those were in an issue.** They were found because the briefs said
where to look and the reviews rewarded looking. That is the part to keep when
you change everything else.
