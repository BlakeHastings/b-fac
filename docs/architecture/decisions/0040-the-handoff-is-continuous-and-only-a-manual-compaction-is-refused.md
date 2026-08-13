# 0040. The handoff is continuous, and only a manual compaction is refused

Status: accepted

Issue #124, parent epic #4. The measurements are
`docs/research/2026-08-12-compaction-hooks-and-context-continuity.md`. ADR 0025
supplies the check/gate vocabulary, ADR 0027 the reason a gate's silence is
ambiguous, and ADR 0004 the argument for a structural obligation over a stronger
sentence.

## Context

The owner asked for this during the first real guest-mode run, in their words:

> as the context window fills up, we need to have a way of continuing the
> factory context. Like I've been doing with you, where the orchestrator has a
> handoff document that it updates. Once we hit about ninety percent context
> usage, we should trigger the transition automatically where it writes the
> handoff document, and then a compression happens, and the orchestrator picks
> up where it left off using the handoff document.

Two facts turn that request into a different design.

**Context usage is not exposed** — not to hooks, not to the statusline, not
through any environment variable, and no threshold event exists. The ninety
percent is unavailable. It is also unnecessary: `PreCompact` fires at exactly
that moment and the harness decides when it is.

**A hook cannot make the model do work.** stdout, stderr, exit codes. No tool
calls and no slash commands, so a hook cannot write prose. Its whole vocabulary
is refuse and inject.

## Decision

**The orchestrator tops the handoff up as part of the loop. The hooks check and
carry; they do not produce.** The boundary is the wrong place to write the
document twice over. It is written by the most degraded version of the
orchestrator, and this repository's own worked example was written at a *calm*
moment and was false about its largest claim within the hour because eight
issues closed underneath it. Worse, the boundary that matters cannot be gated at
all: automatic compaction is the one that fires in a long session, and it must
never be refused. A boundary trigger is therefore unavailable for the only case
it exists to cover.

**`manual` may be refused. `auto` may not, ever, unconditionally.** Measured:
refusing an automatic compaction leaves the session growing until every request
comes back `Prompt is too long`, with the hook still firing and still refusing
for as long as anyone keeps trying. **A gate that cannot be satisfied is worse
than no gate**, and this one cannot be satisfied by construction — what it asks
for is prose, and no prompt reaches the model to write it. The rule is a bare
`if (payload.trigger !== 'manual') process.exit(0)` with no conditions on it,
and the test that holds it there is the most valuable one in the suite.

**And `auto` is also how a subagent compacts.** A subagent's context compacts
independently, `PreCompact` fires for it, and the payload carries no `agent_id`
and no `agent_type` — nothing a hook could read to tell whose context it is
looking at. Measured, a blocking `auto` rule killed a `general-purpose` subagent
with `Agent terminated early due to an API error: Prompt is too long` while the
parent was untouched. This repository's hook settings are tracked, so they reach
every worktree, so they reach every implementation agent. That is a second and
independent reason the rule is unconditional rather than careful.

**The far side is `SessionStart` matcher `compact`, printing the file whole.**
Its stdout is added to the resumed context — measured, and measured intact at
1 MB with its first, middle and last lines present. Nothing truncates and
nothing summarises: a handoff that silently lost its second half would be worse
than one that was never injected, because the reader cannot tell the two apart.

**Staleness is the file's own mtime against two clocks**, commits on the default
branch since, and wall-clock hours. No format is required of the handoff and
nothing is parsed out of it, which is what keeps this from becoming a convention
the document has to satisfy. Five merges rather than one, because a handoff that
must be rewritten after every merge is a handoff nobody writes.

**No new document type, and no fifth location.** The backlog, the decision
records, `orchestrating.md` and the review record already carry everything
durable; the handoff is only where the work stopped. Where it lives in guest
mode is one knob at the top of the asset, and **ADR 0037 supplies the value**:
`factory/` inside the git common directory, which is one path from the main
checkout and from every linked worktree. This ADR adopts that answer rather than
inventing a parallel one.

**No `--install`, and the reason changed rather than expired.** It was written
as "guessing at #122's answer in code", and #122 has since landed. What replaces
it is what #122 measured: the harness reads project settings from the directory
a session starts in and nowhere else, so hook *registration* cannot go in the
common directory either, and `guard-guest-writes.mjs` needed a machine-wide
block behind a `--scope` argument to reach a worktree at all. An installer here
is therefore not a path calculation but a second copy of that decision, taken
for a gate whose failure mode is different. This asset is copied to `scripts/`
and wired by hand like `guard-merge.mjs`, and whether it earns the other
treatment is a question for after it has been used.

## Consequences

**The gate may never fire, and if it does not it should be deleted.** An
orchestrator that never types `/compact` never meets it. That is a real
possibility and the honest ceiling of what a refusal can be here, so the value
of this change is mostly in the injection and in the loop obligation, not in the
gate. The detection layer is that nobody has ever seen the message.

**This gate cannot be probed the way the guards can.** ADR 0027's probe works by
being refused, and `PreCompact` never sees a command line to refuse. `--probe`
answers the rules half only and says so in its own output. The loaded half has a
better answer than any guard here has: **after a compaction, the injected block
is either in the context or it is not.** Unlike a heartbeat file there is nothing
to go stale, because it cannot be read from a previous process. That is the one
liveness question in this skill that is free to ask.

**A long-running subagent can still lose its brief.** `SessionStart` does not
fire after a subagent's compaction — measured by timestamp — so the injection
half of the mechanism simply does not exist for them. Nothing here fixes it and
nothing here can. Filed separately rather than absorbed.

**#124's own mechanism table was wrong about one row, and the row was checked.**
It recorded no documented way to disable auto-compaction; `autoCompactEnabled` is
documented in `settings.md`, `DISABLE_AUTO_COMPACT` beside it, and both were
confirmed to work. The correction changes nothing about the decision — disabling
auto-compaction reaches the same `Prompt is too long` sooner, with nothing left
to catch it — and it is recorded anyway, because the row was compiled against
current documentation rather than from memory and was still wrong in the
direction that mattered: "there is no escape hatch" is the claim that makes a
wedge sound unavoidable.

**The general form is a rule this project should hold.** A search of the
documentation that finds nothing is a fact about the search, not about the
product, and a table cell erases that difference. Where an absence is
load-bearing, run it. Five minutes of `autoCompactEnabled: false` and a fill
script was the only step that could tell the two apart, and it is the same shape
as this repository's older lesson that a check which scans nothing passes. The
survey files every negative as either measured or explicitly unconfirmed, and
none as "not documented, therefore absent".

**The reference is the eleventh and `SKILL.md` grew by 34 lines**, to 468 against
the ~500 ceiling. What is kept resident is the part a reader must not have to
decide to open: top it up in the loop, never refuse an automatic compaction, and
look for the injected block afterwards.
