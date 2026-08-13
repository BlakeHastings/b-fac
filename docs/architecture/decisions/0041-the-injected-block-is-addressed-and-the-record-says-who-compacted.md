# 0041. The injected block is addressed to whoever compacted, and the record is what says an agent did

Status: accepted

Issue #127, split out of #124, parent epic #4. The measurements are
`docs/research/2026-08-13-subagent-compaction-detection.md`. This decision
corrects ADR 0040 on one measured point. ADR 0025 supplies the check/gate
vocabulary and ADR 0004 the preference for a structural obligation over a
stronger sentence.

## Context

ADR 0040 closed with a consequence: a long-running subagent can lose its brief,
`SessionStart` does not fire after its compaction, and so "nothing here fixes it
and nothing here can". The failure it describes is real and quiet. An
implementation agent gets its brief once, in the dispatch message. Its context
fills, the summariser keeps the shape of the brief and loses the evidence bar,
the files it was told not to touch and the artefact it was told to check.
Nothing errors. The agent reports confidently, and the orchestrator's next
signal is a pull request answering a slightly different question.

**The premise turned out to be wrong.** `SessionStart` with `source: "compact"`
fires after a subagent's compaction like any other, and its stdout lands in that
subagent's resumed context. Measured: three compactions in an agent's own
transcript, three injections 0.4 seconds later, in a session whose own context
never compacted, and the marker printed by the hook came back inside the agent's
report.

The disagreement was resolved rather than voted on. #124's scratch lab is still
on disk, and in the run it drew that conclusion from, the subagent whose
`PreCompact` fired **died**: no `compact_boundary` was ever written to its
transcript, and the `SubagentStart` three seconds later is a second agent, the
parent's retry, which is the one that returned the marker. No injection followed
because no compaction completed. That shape reproduced here on the first
attempt, three agents out of three, with intervals within a second of #124's.

## Decision

**The `SessionStart` block is addressed to both possible readers, before it
prints anything.** The payload carries `source` and no `agent_id`, and its
`transcript_path` is the parent's file either way, so the hook cannot know
whether it is talking to the orchestrator or to an implementation agent. Guessing
is the expensive option in one direction: an agent handed the orchestrator's
handoff as though it were its own state will start doing the orchestrator's next
steps, and it is the reader least able to notice, having just lost its brief. So
the block says which reader the file belongs to, tells a dispatched agent not to
act on it, and tells it what it has actually lost and where to get it back.

**That is the recovery, and it is the only one that arrives in time.** It reaches
the agent at the moment of compaction, mid-run, before the work continues. It
costs nothing extra: the hook is already wired, already fires, and was already
printing into that context unaddressed.

**Detection is the record, and it is a check.** A subagent's compaction writes a
`compact_boundary` entry into
`~/.claude/projects/<slug>/<session_id>/subagents/agent-<agent_id>.jsonl`, with
the trigger, the tokens discarded and the agent's id; the orchestrator's own go
into the session file with `isSidechain: false` and no `agentId`. One `grep`
before reviewing a long agent's pull request says whether its report was written
by an agent that lost something. It reports and refuses nothing, which is ADR
0025's *check*, and it is read by the reviewer rather than by a mechanism.

**Nothing new is wired, and both alternatives were measured rather than
assumed.** A `SubagentStop` hook is easy to write, since the event carries
`agent_id`, `agent_type` and an `agent_transcript_path` pointing at exactly that
file. Its stdout does not reach the orchestrator, so it could only write a file
the orchestrator must remember to read, which is what the `grep` already is. Its
exit 2 does reach the subagent and the subagent obeys, which makes it a real
gate on the report, and it is still declined: it arrives after the work rather
than during it, it fires on every stop in a repository whose hook settings are
tracked, the same event also fires for the compaction summariser with no
`agent_type` and a transcript path that does not exist, and it never fires at all
for an agent that died of `Prompt is too long`. Finding 8's injection is earlier,
cheaper and already installed.

**The brief carries the rest, in prose.** The durable half of a brief belongs in
the issue rather than in the dispatch message, the brief names the issue as the
artefact to re-read, and the report contract asks whether the context compacted,
as a cross-check against the transcript rather than as the detection.

## Consequences

**ADR 0040 is wrong where it says the far side does not exist for subagents.**
Corrected here rather than edited there, per this repository's habit with #124's
own mechanism table. Nothing else in 0040 moves: the `auto` rule stays
unconditional, and the reason is unchanged.

**The shipped asset was doing something nobody intended.** In any repository
where `handoff-hooks.mjs` is wired, every implementation agent that compacted was
being handed the orchestrator's handoff with an instruction to reconcile against
the backlog and top the file up. That was live before this change and invisible,
which is the argument for the positive control below rather than for more care.

**A survey that measures an absence needs a positive control.** #124 measured
correctly and generalised from a run where the event it was looking for had
nothing to follow. "The injection did not arrive" and "there was nothing to
arrive after" were the same observation, and only the boundary in the transcript
separates them. That is a sharper rule than the method note it extends: filing a
negative as measured is necessary and it is not sufficient, because a negative is
about a run, and a run that failed early tests nothing.

**The check depends on an undocumented schema.** `compact_boundary`,
`compactMetadata`, `isSidechain` and the `subagents/` layout are internal. The
survey names the command to re-run, and this decision accepts the exposure,
because the alternative is knowing nothing.

**#124's account of the subagent death is refined, and its rule is unchanged.**
Three agents died of `Prompt is too long` here with every hook exiting 0, when a
single tool result crossed the ceiling in one step. Refusing an automatic
compaction is sufficient to kill a subagent and it is not necessary.

**Something is now expected of the reviewer that was not before.** A paragraph in
`references/reviewing.md` rather than a mechanism, and that is the trade this
repository usually prefers: a check a person can skip beats a gate that fires on
every agent in every repository the skill is installed into.
