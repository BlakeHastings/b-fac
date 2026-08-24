# Refinement, and what a spec is for

**Refinement converts owner-time into a queue of agent-time work.** The spec is
the handoff artefact between a synchronous activity that needs a human and an
asynchronous one that must not. In the owner's rhythm: work on specs during the
day, and rip through the work that has specs at night.

That makes refinement the other half of `SKILL.md`'s "Working without the
owner". One section keeps the loop moving when nobody is available; this one
fills the queue that section drains. Neither is much use alone.

## The rule that decides every line

> **Can an agent derive this from the repository and its history? If yes, leave
> it out. If no, it has to be in the spec or it is lost.**

| | Derivable | In the spec |
| --- | --- | --- |
| Collision surface, module boundaries, call graph | yes | no |
| Test and build commands, where a module lives | yes | no |
| **Why this is being built at all** | no | **yes** |
| **The reasoning behind an architectural choice** | no. Code shows what was chosen, never what was rejected and why | **yes** |
| **Whether it is a good idea** | no | **yes** |
| **Which existing tool to use, given constraints the agent cannot see** | partly | **yes** |
| **What would count as done** | no | **yes** |

The last row is `briefing.md`'s evidence bar, split by the same rule. **What
proof would convince the owner** is not derivable and belongs here. The commands
that produce it are derivable and do not, so a spec that names
`npm run check` is padding.

**This is `SKILL.md`'s escalation rule applied in bulk and in advance.** That
rule says to ask the owner anything about what the business promises or wants,
because you cannot derive it and guessing produces confident, wrong software.
Asking mid-work costs a blocked agent and a round trip through a human who may
be asleep. Refinement front-loads every question of that class into a session
where the human is present by design. **The spec is the answer to all the
questions the agent would otherwise have had to stop and ask.**

## A spec is a record of an argument, not a description of a feature

**There is no template here on purpose.** What made the sessions worth having
was specific pushback and specific research, and a form with headings invites
completion instead of thought. If you find yourself typing a heading with
nothing under it, that is the signal: delete the heading, not the blank.

So the shape of a spec is whatever the argument had. Two properties stand in for
a structure, and both are checkable against the artefact afterwards:

1. **Something was rejected, and the reason survives.** If nothing was rejected,
   no argument happened and you wrote a description. A rejected option is the
   single least derivable thing there is: the repository records what was built
   and is silent about every alternative that was weighed.
2. **The decomposition changed.** If the same child items would have been filed
   without the session, the session was ceremony. This skill deletes steps that
   never caught anything, and refinement is not exempt.

**Append, never edit.** When a later part of the session withdraws an earlier
part, add the correction as a new comment and say what it replaces. Editing the
original leaves the conclusion and destroys the argument, which is exactly the
half the rule above says an agent cannot derive. Both of this repository's own
worked examples are shaped that way, and the withdrawn paragraph is the most
useful thing in either.

## The question whose answer changes the design

If refinement has a core, it is finding **the one question whose answer inverts
the design**, and not proceeding until it is answered. Everything else in a
session is elaboration on it.

The worked example is this repository's epic #60, "Own the whole process, or run
as a guest in someone else's". It was opened carrying the owner's own framing:
a backlog tool "like using the gh cli for issue management except it is all
local instead". Prior-art research went into a comment a minute later, and it
was good research: two live candidates measured, one architecturally-right tool
disqualified on a reproduced Windows bug, four dead ends recorded so nobody
re-treads them.

None of that was the thing that mattered. Two hours later a second comment
opened:

> **This is not "replace GitHub with local equivalents."** That is what the epic
> assumed, and it was wrong.

The question was whether the second mode was for the owner's own side projects
or for a work machine where GitHub cannot be written to. Once it was answered,
guest mode stopped being "stand up local equivalents of the forge" and became
"run entirely on one machine and emit a pull request at the end". The company's
CI still runs, on the pull request, afterwards. The company's tracker still
holds the ticket. Neither is replaced.

**Test both properties against that.** A local ruleset, a local Actions runner
and a local issue forge were rejected, and the reason is recorded rather than
implied. And the decomposition inverted with it: the children that got filed
were a write boundary (#63), discovering a host repo's real checks (#68) and
stacked pull requests as a named hard part held back for later (#64). The
children the original framing would have produced do not appear anywhere,
because they were never the work.

**One limit worth stating, because it is an argument for writing specs down at
all.** The repository preserved the answer and lost the question. The epic's
comments show the inversion; the asking lived in a conversation that no longer
exists. A spec is the only place that survives.

## The threshold, which is not a size

The owner's words are "feature scale, large units, or on request", and the
mechanical reading of that is the one thing to avoid. **Size of diff and
collision surface are derivable, so they are the agent's job, not the
threshold.** Asking the owner for them is asking them to do the agent's work at
the hour of the day when their time is scarcest.

What makes work need a spec is **the number of things an agent cannot derive**.
Three tests, and one yes is enough:

1. **Someone could build the wrong thing correctly.** The requirement is not in
   the repository.
2. **The obvious approach might be wrong, and only the owner knows why.** An
   alternative has already been weighed and rejected somewhere outside the
   record.
3. **Whether to build it at all is still open.**

Worked through, in the permitting domain:

- **Renaming `permit_type` to `permit_class` across ninety files.** Enormous,
  touches everything, and derivable in full. No spec. Brief it and go.
- **Changing a resubmission window from 45 days to 30.** One line. The rule that
  makes 30 right is a municipal ordinance that appears nowhere in the code, and
  the question of what happens to applications already in flight has an answer
  only the owner has. Needs a spec, and the spec is four sentences.
- **Adding contractor licence verification against the state registry.** Needs
  one, and for test 2 rather than test 1: the registry has a nightly batch feed
  and a rate-limited live API, the owner has already ruled out the batch feed
  for a reason to do with how quickly a suspension has to take effect, and an
  agent reading the repository would pick the batch feed every time.

**A spec can be three sentences.** Decoupling it from length is what stops
everything getting labelled large, which is the failure mode this whole idea is
most likely to die of. Size correlates with the count of underivable things,
which is why the owner's phrasing points the right way, but it is a prompt to
ask the question rather than the answer to it.

**"On request" needs no justification.** The owner asking for a spec is a
threshold in itself.

## Where a spec lives, and what it becomes

**A spec is upstream of the backlog. It decomposes into units; it is not one.**
The container for that already exists and needs nothing built: an **epic**
carries prose context only, no scope bullets and no definition of done, and
exists to group work and explain why it exists (`github-backlog.md`, "Shape").
That is the same job.

So **the epic is the spec**, and refinement uses `create`, `link`, `comment` and
`label`, which the backlog port already has. On GitHub that is an issue with the
`epic` label, its children linked by real sub-issue edges, and each turn of the
argument appended as a comment. On beads it is `bd create -t epic` with the same
edges. `references/backlog-port.md` and its two implementations.

Three things come out of a session and they go to three different places:

- **The argument** stays on the epic, comments and all.
- **What was surveyed outside the repository** becomes a dated survey in
  `docs/research/`, because "which existing tool to use" is exactly what a
  survey is and an undated one reads as current for ever.
- **What survives the argument** becomes an ADR. **A spec proposes architecture;
  an ADR records it.** They are not the same document and should not merge. The
  spec argues; the ADR is what is left standing.

The children carry the ordinary anatomy from `briefing.md`. Refinement does not
change what a brief looks like. It changes how much of the brief the orchestrator
already knows before writing it.

## The gate

In ADR 0025's vocabulary refinement is a **gate**, not a check: an item carrying
it cannot be dispatched. That is assertable in a way most of what a spec phase
could promise is not. *"Does this item have a spec?"* is a fact. *"Is this well
understood?"* is a disposition, and this repository has learned what those are
worth.

**A label, not a custom state.** `label` is one of the port's eight verbs, so
`needs-refinement` works on GitHub and on beads with no second design. A state
would not port. It sits beside `needs-owner` as the second of the two
undispatchable reasons that no dependency edge covers, and the dispatch query
already reads it negatively:

```bash
gh issue list --limit 200 \
  --search "is:open -is:blocked -label:needs-owner -label:needs-refinement"
```

**The label comes off in the same motion that files the children.** Not when the
conversation feels finished. If the unit cannot be decomposed yet, refinement is
not done, whatever has been written. Where a session concludes that the unit was
one piece after all, say so on the item as you remove the label, because that is
a decomposition of one and a reader cannot tell it from an oversight.

**Nothing mechanical holds any of this, and nothing should.** CI does not read
the backlog, so a check that fails a build because an item lacks a spec cannot
exist here. The gate is the dispatch query, and the detection layer is that an
item with the label in a wave is visible in the wave announcement.

## Refine and dispatch in the same session

`SKILL.md` says to keep working until you are out of options that do not need
the owner, and to escalate through channels that do not wait. A spec session is
synchronous. Those read as contradictory and are not, but only if the order is
right.

**Open every refinement session by dispatching.** Run the dispatch query, launch
a wave, then start the conversation. The session is the one activity during
which you will not be watching the queue, so the queue has to be full before it
begins.

The reason it is an instruction about order rather than an encouragement is that
the failure has been measured, in this repository, on the epic used as the
worked example above:

- Epic #60 was opened at 14:46Z on 2026-08-12 and its premise was corrected at
  16:59Z. **In those 2h13m nothing was dispatched and nothing merged.** Two
  issues sat open and dispatchable throughout, one of them a defect in the
  guard this project ships, filed 27 minutes before the session started. It was
  worked 4h20m later.
- The **later** refinement of the same epic, from 17:25Z onward, overlapped
  **twelve merged pull requests**, six of them children of the epic still being
  argued. Nothing about the second session was different in kind. The queue was
  simply full when it began, because the first session had filled it.

The mechanism is ADR 0004's, in a new costume. There, finishing a good report
read as finishing the turn. Here, **a spec conversation is the most absorbing
thing an orchestrator does, and absorption reads as the loop being busy.** Both
failures happen to someone who already agrees with the rule, which is why more
emphasis does not reach either of them and an ordered obligation does.

So the session ends the way every other turn does, with `Next:` and
`Blocked on:` verbatim, and `Next:` is the next wave rather than the next
question.

## What refinement is not for

Collision surface, module boundaries, which files a change touches, what can run
concurrently, and how to run the tests. All derivable, all the agent's job. An
earlier version of this idea asked the owner to supply the batching plan for the
night run, on the reasoning that high collision surface is both what makes work
need a spec and what makes it hard to parallelise. That was withdrawn, and the
withdrawal is the clearest illustration of the rule at the top of this file: an
agent reads the repository and works out what touches what, so putting it in the
spec spends the scarcest hour of the day on the cheapest question.

**The rule stops at the spec, and `briefing.md` is not an exception to it.** A
brief carries reading order and the files that already exist, both derivable and
both kept, because the two documents have different writers and different
readers. A spec is written by the owner, whose hour is the scarce thing, for an
orchestrator with the repository already open. A brief is written by that
orchestrator, who has already read it, for an agent whose context is the scarce
thing and whose context running out is what silently rewrites the brief. Same
rule; different scarce resource. ADR 0043 has the evidence, including why the
traps were never the exception they look like.
