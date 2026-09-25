# 0060. Compaction happens where we choose, and a warning buys the calm top-up

Status: accepted

Issue #191, parent epic #4. This revises the premise of ADR 0040 and keeps its
argument. ADR 0042 supplies the two-reader addressing, which every new output
here keeps. ADR 0004 is why the warning is called a prompt and not a control.

## Context

The owner asked for this twice. ADR 0040 quotes the first time, "about ninety
percent". The second, on 2026-09-25:

> whenever the factory's context reaches a limit like maybe 85%, then we need
> to compress and have it pick up where it left off.

ADR 0040 designed around the request because **context usage was not exposed
and no threshold existed**. On Claude Code 2.1.282 that is false, measured:

- The last main-thread assistant entry in the session transcript carries
  `message.usage`, and its input, cache-read and cache-creation tokens add up to
  the context in use. Every hook payload carries `transcript_path`.
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` chooses where automatic compaction fires,
  and `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets the window it is a percentage of.
  **Both work from an `env` entry in project `.claude/settings.json`**, with
  nothing exported in the shell. Measured in a scratch project whose settings
  carried a window of 100000 and an override of 60: the harness logged
  `effectiveWindow=80000` and `thresholdSource=env`, and compacted with 51,154
  tokens in use, where its own default for that window is about 67K. The same
  entries reached the hooks' environment.
- The percentage is of the window less 20,000 tokens kept back for the summary:
  windows of 100K, 200K and 1M logged `effectiveWindow` 80000, 180000 and 980000.
  That reserve is not documented.
- A subagent's `PostToolUse` payload carries `agent_id`; a main-thread one does
  not.

And the old design had not taken over the job. Across ten of the owner's
sessions every `compact_boundary` on record is `"trigger":"manual"`, each one
preceded by the owner asking for the handoff to be updated and followed by the
owner typing the resume instruction. "Top it up as part of the loop" was an
instruction, and it was not being followed unprompted.

## Decision

**The threshold is the harness's setting, not ours.** `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85`
and a window, in the project settings' `env` block. Nothing here computes when
to compact. The harness already does it, mid-turn, and the turn carries on
afterwards (measured).

**A `PostToolUse` branch warns once per climb, on the main thread only.** It
reads the context in use from the transcript's tail and, ten points below the
compaction percentage (75% against 85%), injects `additionalContext` telling
the orchestrator to top the handoff up now. A small file per `session_id` keeps
it to once, and is cleared by usage falling back under the line, which is what a
compaction does. A payload with `agent_id` exits before anything is read: a
subagent's handoff is its issue, and telling an implementation agent to write
the orchestrator's handoff is the wrong-reader failure ADR 0042 exists to
prevent.

**The window is read from the harness's own variable, not a table.** Transcript
model ids carry no `[1m]`, and the same model is served at 200K or at 1M, so a
model-family table would be a guess presented as a measurement. A statusline
sidecar would carry the real size, but the statusline is the owner's to
configure, and it never runs under `-p`. Where either variable is unset, the
hook says so once and warns nothing.

**`PreCompact` on `auto` refuses nothing, and prints what the summariser must
keep:** whose session this is, the handoff path, the loop step, and for an
implementation agent its issue and evidence bar. That stdout reaching the
summariser is measured and undocumented, so nothing depends on it. It is still
an unconditional exit 0.

**`SessionStart(compact)` adds the resume instruction the owner used to type.**
Load the skill again if it is gone, re-read the process docs, audit real issue
and PR state, then continue without being asked. It sits inside the
orchestrator's half of ADR 0042's two-reader block.

**The injection now respects a cap it used to ignore.** 2.1.228 carried 1 MB of
`SessionStart` stdout whole. 2.1.282 does not: over 10,000 characters, plain
stdout and `additionalContext` alike are swapped for a file path and a 2KB
preview. Measured with 23KB and 22.5KB markers, the first line arrived and the
middle and last did not. So the block is built whole first. If it would not
fit, the handoff's text is left out and the reader is told to Read the file,
rather than handed a preview cut at 2KB with no sign of where.

**Wired in this repository:** the two variables, `PostToolUse`, and `PreCompact`
matcher `auto`. A manual-`/compact` refusal is not wired. That is still #141's
decision.

## Consequences

**ADR 0040's argument stands and its premise does not.** The document is still
topped up by a calm orchestrator and never produced at the boundary. What
changed is that the calm moment no longer depends on the orchestrator's
initiative. It gets a warning at a point we chose. The warning is a prompt
(ADR 0004), and the control is the threshold. A Stop `decision:block`
backstop exists and was measured to make the model continue. It is out of scope,
and it is worth filing only if the warning is seen ignored twice.

**The hook runs on every tool call of every session and agent in this
repository.** Measured against a 50 MB transcript, about 50 ms a call against 41
ms for a bare `node` start, because it reads the tail and widens only when one
large tool result hides the last assistant entry.

**A window the harness caps is invisible to the hook.** This repository sets
1,000,000. On a model served at 200K the harness caps the window and compacts at
85% of 180K. The hook still divides by 980K and never warns first. Setting the
window to the model's is the host's job. continuity.md says so.

**Subagents compact earlier here than they did.** The override applies to
subagents, and a set window makes a 200K subagent compact proactively at 85%
rather than reactively at its limit. That is the side of the trade to be on,
since reactive compaction is how an agent dies of `Prompt is too long`.

**The thrash breaker bounds what may be injected.** Three refills within three
turns ends the turn. A re-injected handoff under 10,000 characters is about 2,500
tokens, which cannot refill a window by itself. The cap keeps it there.

**The reserve and the summariser route are undocumented.** If the 20K reserve
moves, the warning moves a few points with it, and the band's width absorbs
that. If `PreCompact` stdout stops reaching the summariser, the handoff is still
printed back after compaction, so nothing breaks.
