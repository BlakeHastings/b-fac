# 0044. A fan-out's resume record is a separate record, and the artifacts are its progress

Status: accepted

Parent epic #4, issue #137. ADR 0037 settled where per-repository factory state
lives, ADR 0040 made the orchestrator's own memory survive a compaction, and
ADR 0036 is the derivability rule this borrows.

## Context

A usage limit ended an orchestrator and roughly eleven agents in the same
instant, several of them one tool call from writing their output. It cost almost
nothing, which is the finding: the same event a week earlier would have cost the
whole run.

This is not the problem #124 and ADR 0040 solved. That one is a compaction,
which leaves an orchestrator running and believing it is the same one. This one
is simultaneous death, where nothing is left running at all and the question is
what a stranger can pick up off disk. `references/parallelism.md` reasoned about
agents colliding with each other and said nothing about all of them ending
together.

Two properties made the recovery cheap, and neither is about the agents.

**Nothing important was only in the orchestrator's context.** It had been
keeping a record outside the repository holding the target, the concurrency
ceiling it had measured, which candidates were reserved or absorbed, and the
queue in order.

**A partial artifact was distinguishable from a missing one.** Every item wrote
`<item>.json` and then `<item>.notes.md`, in that order, so a `.json` with no
`.notes.md` beside it read as *died after writing the JSON*. Eight of the nine
orphans needed only their notes. One was truncated mid-array and was redone.
Without the convention all nine would have been redone, and nothing in the
directory would have said which.

There is a third observation from the same run, about the recovery rather than
the design. The resumer's first sweep over the orphans reported `edges=0` for
every artifact, from a schema with no `edges` key. Nothing errored, because a
missing field reads as empty rather than failing, and a structural check aimed
at a field that does not exist returns one confident answer for every file it is
given.

## Decision

**A fan-out keeps a resume record, and it is a record type of its own rather
than a section of the handoff.** `references/continuity.md` forbids inventing a
document type by accident, so the boundary is written down in both files: the
resume record is **per-fan-out and disposable**, where the handoff is
**per-session and durable**. Deleting it is part of finishing the fan-out.

Folding it into the handoff was the alternative and it fails on the disposal.
The handoff is a durable snapshot the orchestrator tops up for as long as the
session lasts; a queue of ninety items is live for an hour and then meaningless,
and a dead queue sitting in a durable document reads as current work to the next
reader. Several fan-outs can also be in flight at once, which a single per-session
file has no shape for. The test that keeps them apart is stated as a symptom
rather than a rule: a resume record still being topped up when no fan-out is
running has become a second handoff.

**It holds only what cannot be derived from the output, which is ADR 0036's rule
pointed at a different reader.** The queue, the target, the reservations and the
measured ceiling are in the record because nothing else knows them. Progress is
not, because the output directory knows it better.

**The output directory is the authoritative progress record.** A list the
orchestrator maintains is a second copy of a fact that already exists, kept by
the process most likely to die before updating it, and it dies holding a count
that was true a few minutes ago. That is worse than having none, because a
resumer believes it.

**Partial output must have a shape that reads as partial, and the shape is that
the last thing written is a separate artifact.** The two-file convention is the
instance; the property is that "never started" and "died halfway" differ on
disk rather than in somebody's memory. A single file appended to as the agent
works satisfies neither, and forces a resumer to read everything to sort
anything. This is the half that turned nine re-runs into one, so it is stated as
a decision that has to be taken before the first agent is dispatched, not as a
recovery technique.

**The record lives in `factory/` inside the git common directory**, with the
handoff and the machine record. ADR 0037 settled that and no new location is
invented here. The property that matters is the one ADR 0037 measured:
`--git-common-dir` gives one answer from the main checkout and from every linked
worktree, and the session that resumes a dead fan-out is usually standing
somewhere else.

**The `edges=0` observation goes beside the rule as a trap, not into a check.**
A uniform answer across a batch is the signature of a check aimed at a field
that is not there, and it is indistinguishable from a real finding that happens
to be unanimous, which is what makes it expensive: it argues for redoing
everything. The instruction is to read one artifact known to be good before
trusting a check that condemns the batch. It generalises past resumption, so it
is written as a property of after-the-fact sweeps.

## Consequences

**Nothing mechanical enforces any of this**, and that is not a gap that can be
closed here. The two-file convention is a property of what an orchestrator tells
its agents to write, in a repository this skill does not control and about
artifacts it has never seen. A check shipped from here would have to guess the
output shape, which is the `edges=0` failure again, in a script.

**The guidance lands in `references/parallelism.md` rather than
`references/continuity.md`**, because the decision is taken when a fan-out is
dispatched and not when one dies. `parallelism.md` is what an orchestrator reads
before running more than one agent, which is the moment the artifact shape can
still be chosen. `continuity.md` carries one paragraph pointing across, so the
record list there stays honest.

**No new reference file, so neither reference table moves**, and `SKILL.md` is
untouched. Its table already routes "running more than one agent" to
`parallelism.md`, and a fan-out is that. The cost is that an orchestrator whose
run has already died looks in `continuity.md` first; the paragraph added there
is what covers it.

**The measured ceiling is the item most likely to be dropped from a record in
practice**, because it feels like an implementation detail rather than state. It
is called out separately for that reason: it was learned by running into a
limit, and a resumer that leaves it out pays that discovery again with less
budget than the session that paid for it first.

**This ADR took 0044 rather than 0043**, which was free. Three issues in the
same wave lost their briefs to a posting failure, so the assigned numbers went
with them, and 0043 is the number two other agents reasoning from "next free"
would both take. A gap is not a bug, and `check:collisions` catches the other
outcome only on the merge commit, after a rebase has already been paid for.
