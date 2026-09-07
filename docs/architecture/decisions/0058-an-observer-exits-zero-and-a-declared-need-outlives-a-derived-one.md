# 0058. An observer exits zero, and a declared need outlives a derived one

Status: accepted

`references/enforcement.md` supplies the rule about a gate that wedges what it
protects. `docs/research/2026-08-13-subagent-compaction-detection.md` finding 12
is the measurement behind the second half.

## Context

Two decisions, joined because both are answers to the same question: how much
should an observability layer be allowed to depend on the model doing what it
was told?

**The first is about blast radius.** The observer ships inside a plugin, so it
loads for every session of everyone who installs it, including people using the
harness for something with no factory anywhere near it. `handoff-hooks.mjs`
already worked out what that costs when it goes wrong: a `PreCompact` hook that
refused an automatic compaction wedged the session it was protecting, with no
way out from inside, at the exact moment the session was most valuable. The
conclusion recorded there was that a gate that can wedge the thing it protects
is worse than no gate.

**The second is about what a need is.** A question needing an answer reaches the
store two ways. The agent runs `factory ask`, or the `Stop` hook parses the
`Blocked on:` line that "Before you stop" already mandates on every turn. The
tempting simplification is to treat those as one thing and deduplicate.

Finding 12 is the reason not to. Three runs measured what an agent does with an
instruction injected at a stop boundary: it complied with a marker probe and
then, twice, did not do what the block asked. The injected text is context, not
a command. Read across to this design, `factory ask` is an instruction like any
other, so a design in which the only record of a pending question is a command
the agent has to remember will lose questions, and lose them silently.

## Decision

**Every path in the hook exits 0, prints nothing, and never emits a permission
decision.** The whole body is wrapped so that a bug costs an event rather than a
tool call, and the catch is deliberately silent rather than logging to stderr:
an observer that starts narrating its own failures into the conversation has
become a participant. There is no flag that changes any of this. The tests
weight the allow direction accordingly, the way the guard's own tests do,
because a gap loses an event and a false positive breaks somebody's session.

**The wiring is lifecycle events only: `SessionStart`, `SessionEnd`,
`SubagentStart`, `SubagentStop`, `Stop`.** No `PreToolUse`, which was a
deliberate loss and not an oversight. Per-tool-call events would have made a
hook firing or not firing visible, which is the shape of failure that cost two
days once. They would also spawn a process on every shell call in every session
on the machine, for people who never asked for any of this. `SessionStart`
firing at all is what recovers most of the lost value, since it is the evidence
that the file is loaded.

**A declared need and a derived one are kept apart, and the disagreement between
them is the product.** Declared needs are durable and carry a severity, a blast
radius and an answerer, because a human wrote those. Derived needs live only as
long as the loop keeps restating them, which is not a shortcut but the semantics
the format already has: both lines are required every turn, so a blocker that
stops being printed has stopped being a blocker.

The useful reading is where they differ. A declared need nobody is restating is
a question the loop has forgotten it filed. A derived blocker with no
declaration is the agent skipping the CLI, which is layer 0 failing exactly
where finding 12 predicted. `factory status` names the second case out loud.

**So forgetting the CLI costs fidelity, not the record.** That is the whole
reason the `Stop` parse exists. It is the graceful degradation for an obligation
this repository has already measured that instructions do not carry.

## Consequences

**A derived need cannot be resolved, and `factory resolve` refuses it by
name**, pointing at `factory ask` instead. It has no durable identity to close,
which is the honest consequence of it being a restated claim rather than a filed
record. A refusal that explained nothing would read as a bug.

**Matching a declared need to its restatement is text comparison, and text
comparison is fragile.** The identity is the normalised question, after the
attribution and the asked-in pointer are split off the line. That split is
load-bearing rather than cosmetic: with `Owner.` left attached, the same question
filed and restated produced different keys and appeared twice with nothing saying
they were the same, which reads as two problems rather than as a parser bug. It
was wrong exactly that way once, and the tests pin it.

**Rewording a question in a later turn creates a second row.** Nothing here
detects paraphrase, and nothing should try: an observer guessing that two
sentences mean the same thing is a worse failure than showing both.

**The observer cannot tell you a hook did not fire for a given tool call**,
because it is not watching tool calls. Its self-knowledge stops at "something
fired in this project, this recently".

**Assistant prose is never recorded**, only the two mandated lines and the
fields around them. In guest mode the alternative would put a host repository's
material into a user-level log outside the tree, which the write boundary
forbids, and the cheapest way to hold that line is to never read the rest of the
message. There is a test asserting the body does not reach the log.
