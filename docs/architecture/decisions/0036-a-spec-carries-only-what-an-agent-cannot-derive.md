# 0036. A spec carries only what an agent cannot derive, and it is an epic

Status: accepted

Issue #80, parent epic #4. ADR 0025 supplies the check/gate vocabulary, ADR 0024
and ADR 0035 the port's verbs, and ADR 0004 the argument for an ordered
obligation over a stronger sentence.

## Context

The owner asked for a refinement stage: large units of work get a spec, worked
out in conversation, before they can be dispatched. The stated rhythm is specs
during the day and dispatch at night, which makes the spec a handoff artefact
between a synchronous activity that needs a human and an asynchronous one that
must not.

The first framing of the issue answered "what goes in a spec" with collision
surface and a batching plan for the night run, on the reasoning that high
collision surface is both what makes work need a spec and what makes it hard to
parallelise. **The owner withdrew that**, and the withdrawal is the whole
decision:

> The purpose of that spec is what needs to be built, like the why behind it.
> The architectural decisions, and then whether it's a good idea, whether it's
> not, existing tools to use. Those sorts of things that exist in my mind may
> not exist in the agents.

Collision surface is derivable. Asking the owner for it spends the scarcest hour
of the day on the agent's own job.

Two things already existed and neither had a definition behind it. The
`needs-refinement` label was created with the backlog, and
`references/backlog-port.md` already named "no spec yet" as one of the three
reasons an item cannot be dispatched. Nothing said what a spec was, what put an
item over the line, or where the artefact lived.

## Decision

**One rule decides every line of a spec: can an agent derive this from the
repository and its history?** If yes it stays out; if no it goes in or it is
lost. That is `SKILL.md`'s escalation rule, which already says to ask the owner
anything about what the business promises or wants, applied in bulk and ahead of
the work rather than during it.

**The threshold is the count of things an agent cannot derive, not a size.** A
ninety-file mechanical rename is derivable in full and needs no spec; a one-line
change turning on an unwritten ordinance needs one, and that spec is four
sentences. Diff size and collision surface are ruled out explicitly as proxies,
because both are derivable and adopting either reproduces the framing the owner
withdrew. Size stays in the text as a prompt to ask the question, since it
correlates, and never as the answer.

**The gate is `needs-refinement`, which already exists, and it stays a label.**
`label` is one of the port's eight verbs (ADR 0024, ADR 0035), so a label works
on GitHub and on beads with no second design where a custom state would not
port. It is a gate in ADR 0025's sense rather than a check: a labelled item is
not dispatchable, and the dispatch query in `references/github-backlog.md`
already excludes it. ADR 0035's reason for keeping this one a label rather than
an edge still holds: nothing external clears a missing spec, so nobody forgets
to remove the mark.

**The spec is an epic, and nothing new is built to hold it.** An epic already
carries prose context only, no scope bullets and no definition of done, and
exists to group work and say why it exists. A spec is upstream of the backlog:
it decomposes into units and is not one. Those are the same shape, so refinement
spends `create`, `link`, `comment` and `label` and asks the port for nothing it
does not have. Research from a session goes to `docs/research/` as a dated
survey (#67); what survives the argument becomes an ADR. **A spec proposes
architecture; an ADR records it**, and they do not merge.

**No template.** The issue said so twice and the worked example says why: the
value was specific pushback and specific research, and a form with headings
invites completion instead of thought. Two properties replace a structure, both
checkable against the artefact afterwards: something was rejected with the
reason recorded, and the decomposition changed because of it. If the same
children would have been filed anyway, the session was ceremony, and this skill
deletes steps that never caught anything.

**Corrections are appended, never edited in.** An edited spec keeps the
conclusion and destroys the argument, which is precisely the half the rule above
says an agent cannot derive.

**A refinement session opens by dispatching a wave.** This is ADR 0004's move,
not an encouragement: the obligation is an order of operations with a named
artefact, because a spec conversation is the most absorbing thing an
orchestrator does and absorption reads as the loop being busy. Measured on this
repository's own record, which is also the worked example in the reference:
epic #60's premise sat unsettled from 14:46Z to 16:59Z on 2026-08-12 with
nothing dispatched and nothing merged, while #46 and #58 were open and ready and
#58 was a defect in the guard this project ships, filed 27 minutes earlier and
worked 4h20m later. The later refinement of the same epic overlapped twelve
merged pull requests, six of them its own children, because the queue was full
when that session began.

## Consequences

**The `needs-refinement` label's own description now disagrees with this ADR.**
It reads "Large unit of work with no spec yet; not dispatchable", which is the
size proxy the decision rules out. It wants to be about underivable content
instead. Following ADR 0035's precedent, an agent working an issue does not
re-tool the live backlog ahead of the decision landing, so it is named here and
in the pull request rather than done.

**Nothing mechanical holds any of this, and nothing can.** CI does not read the
backlog, so a check that fails a build because an item lacks a spec is not
available at any price. The gate is the dispatch query and the detection layer
is that a labelled item appearing in a wave announcement is visible. That is
weaker than this repository usually accepts, and it is the honest ceiling: the
assertable fact is whether the label is present, and everything about whether
the spec is any good is a disposition.

**The reference is the tenth in the directory and the body grew by 45 lines**,
to 433 against the ~500 ceiling. The part kept resident is the part a reader
must not have to decide to open: the derivability rule, the threshold, and the
dispatch-first ordering. What a spec contains and how the worked example proves
it are in `references/refinement.md`.

**Two personal skills on the author's machine cover neighbouring ground and are
deliberately not referenced.** `recursive-exploration` is a methodology for
traversing sources, which is the research half of a session; `diataxis` would
class a spec as explanation. Neither is portable, neither is installed with this
plugin, and a reference document pointing at a path that exists on one machine
is worse than no pointer. The overlap is also smaller than it looks: both
skills are about extracting from a corpus, and refinement is about extracting
from a person, which is the one source that answers back.

**The threshold is the part most likely to be wrong in practice**, in both
directions. Whether it catches every bug fix, or nothing at all, is a property
of a queue that has not run yet. Measuring it is a follow-up rather than a guess
made here.
