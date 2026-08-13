# Whether a subagent's compaction can be detected, and by what

**Verified on** 2026-08-13

Asked by **#127**, which needed to know whether an orchestrator can find out that
an implementation agent lost its brief mid-run. ADR 0041 is the decision that
came out of it. The parent survey is
[2026-08-12-compaction-hooks-and-context-continuity.md](2026-08-12-compaction-hooks-and-context-continuity.md),
whose closing question was exactly this one, filed there under "could not be
confirmed".

Two answers came back, and the second was not the question:

- **Yes, it is detectable**, from the compacting agent's own transcript rather
  than from any hook.
- **And the injection half of #124's design does reach subagents after all.**
  `SessionStart` fires for their compactions and its stdout lands in the
  subagent's resumed context. The parent survey recorded the opposite, from a
  run where the compaction died before it completed. Finding 8, and the
  reconciliation below it, which was done against that run's own transcripts.

Everything below was run on **Claude Code 2.1.228**, Windows 11, in a scratch
directory with its own `.claude/settings.json`, deliberately not this repository:
hook settings here are tracked, so they reach every worktree and every
implementation agent. Timestamps are UTC.

## Method, and why there is a control run

The lab is #124's, with one addition. A probe logged its stdin and exited 0, one
log per event, wired to `SessionStart`, `UserPromptSubmit`, `PreCompact` (both
triggers), `SubagentStart`, `SubagentStop` and `Stop`. Sixty ~13.8 KB files were
read one at a time by a `general-purpose` subagent under `--autocompact 100000`,
in a session whose own context stayed tiny.

Two additions, and both of them changed an answer.

**A control run in the same lab**: the same sixty files read by the *parent*
itself, no subagent involved. Several findings below are negatives about a
subagent, and a negative in a log is also what a hook that is not wired looks
like. The control turns each into a comparison between two runs.

**A positive control on the compaction itself.** Nothing below is claimed from a
hook log alone. A subagent compaction counts only when the `compact_boundary`
entry is in that agent's transcript, because a `PreCompact` that fires and then
kills the agent looks identical in a log and leaves nothing to observe
afterwards. That distinction is the whole of finding 8a.

An earlier attempt used #124's twelve 60 KB files and produced three dead agents
instead of a compaction. That failure is finding 6, it is why the files here are
small, and it turned out to be the explanation for the disagreement in 8a.

## What was verified

### 1. A subagent's compaction is written to the subagent's own transcript

Each subagent gets a transcript file of its own, beside the session's:

```
~/.claude/projects/<slug>/<session_id>.jsonl              the orchestrator's
~/.claude/projects/<slug>/<session_id>/subagents/
    agent-<agent_id>.jsonl                                one per subagent
    agent-<agent_id>.meta.json                            agentType, description, toolUseId, spawnDepth
```

Four compactions landed in one agent's file, each as two entries. The first:

```json
{"parentUuid":null,"logicalParentUuid":"575b4fc3-...","isSidechain":true,
 "agentId":"ab903e05a656751a2","type":"system","subtype":"compact_boundary",
 "content":"Conversation compacted","timestamp":"2026-08-13T15:48:14.200Z","level":"info",
 "compactMetadata":{"trigger":"auto","preTokens":67338,"durationMs":22805,
  "preservedSegment":{...},"preservedMessages":{...}}}
```

The second is the summary itself, a `user` entry with `"isCompactSummary":true`
whose text begins `This session is being continued from a previous conversation
that ran out of context.`

So the record carries the trigger, the size of what was thrown away, how long it
took, and which agent it happened to. The four in that run read `preTokens`
67338, 70414, 70595 and 70698.

Counting them is one command:

```bash
grep -c '"subtype":"compact_boundary"' \
  ~/.claude/projects/<slug>/<session_id>/subagents/agent-*.jsonl
```

### 2. The parent's own compactions land somewhere else, and say so

The control run compacted five times. Every boundary went into
`<session_id>.jsonl` with `"isSidechain":false` and **no** `agentId`:

```
15:56:45.777 compact_boundary isSidechain=false agentId=undefined trigger=auto preTokens=71379
15:57:24.100 compact_boundary isSidechain=false agentId=undefined trigger=auto preTokens=70325
15:58:01.311 compact_boundary isSidechain=false agentId=undefined trigger=auto preTokens=70125
15:58:34.053 compact_boundary isSidechain=false agentId=undefined trigger=auto preTokens=69972
15:59:09.268 compact_boundary isSidechain=false agentId=undefined trigger=auto preTokens=69953
```

The record therefore answers "whose context was that" twice over, by which file
it is in and by two fields inside it. This is the thing `PreCompact` cannot do
and the reason detection is available at all.

### 3. `SubagentStop` carries `agent_id`, `agent_type` and `agent_transcript_path`

```json
{"session_id":"939384cb-...","transcript_path":"...\\939384cb-....jsonl",
 "cwd":"...","prompt_id":"de3dec57-...","permission_mode":"default",
 "agent_id":"ad2a9f0776ed5fbb0","agent_type":"general-purpose",
 "hook_event_name":"SubagentStop","stop_hook_active":false,
 "agent_transcript_path":"...\\939384cb-...\\subagents\\agent-ad2a9f0776ed5fbb0.jsonl",
 "last_assistant_message":"I have successfully read all 60 files ...",
 "background_tasks":[{"id":"ad2a9f0776ed5fbb0","type":"subagent","status":"running",
  "description":"Read 60 files and report final MARKER lines","agent_type":"general-purpose"}],
 "session_crons":[]}
```

`agent_transcript_path` is the file from finding 1, handed to a hook at the
moment the agent finishes. `last_assistant_message` is the report itself.

`Stop` carries the same `background_tasks` array while agents are running, which
is how a parent-side hook could know a subagent exists at all.

### 4. The compaction summariser is itself an agent, and it fires `SubagentStop`

The run with four subagent compactions logged **five** `SubagentStop` events and
one `SubagentStart`. Four of the five name agent ids that never started:

```
15:48:14.182  agent_type=(absent)         last_assistant_message="<analysis>\nThe conversation began with..."
15:49:09.012  agent_type=(absent)         last_assistant_message="<analysis>\nThe conversation consists of two phases separated by a context compaction..."
15:49:56.081  agent_type=(absent)         last_assistant_message="<analysis>..."
15:51:03.428  agent_type=(absent)         last_assistant_message="<analysis>..."
15:52:40.330  agent_type=general-purpose  last_assistant_message="s60.txt MARKER: SMALL-60 END MARKER-SIERRA-60..."
```

Each of the four lands 15 to 22 ms before a `compact_boundary` with the same
timestamp to the second. Their `agent_transcript_path` files are never written
to disk. The parent control run produced the same four-plus-one shape with
`background_tasks` empty, so this fires for an orchestrator's compaction too.

**Anything wired to `SubagentStop` must filter on `agent_type` being present.**
A hook that treats every `SubagentStop` as an implementation agent finishing will
fire once per compaction anywhere in the session, on a transcript path that does
not exist.

### 5. `SubagentStop` does not fire for a subagent that dies

The twelve-large-file attempt killed three agents with `Agent terminated early
due to an API error: Prompt is too long`. Three `SubagentStart`, three
`PreCompact` with `trigger: "auto"`, and **no `SubagentStop` at all**: the log
file was never created.

The transcript is still on disk, ending in an `assistant` entry with
`"isApiErrorMessage":true`. So the file survives the case the hook misses, which
is the argument for reading the record over listening for the event.

### 6. A subagent can die of `Prompt is too long` with nothing blocking anything

Same attempt, and worth separating from #124's result. That survey produced the
death with `PreCompact` exiting 2, and attributed it to the refusal. Here every
hook exited 0 and three agents out of three died anyway.

```
15:38:21.917  tool_result FILE-12 START ...      <- twelfth file read
15:38:22.176  PreCompact trigger=auto
15:38:22.192  assistant "Prompt is too long"
```

The compaction fired in the same second as the failure, which is too late to
help. Refusing an automatic compaction is sufficient to kill a subagent; it is
not necessary. A single tool result that crosses the ceiling in one step does it
on its own. The sixty-file runs, whose steps were about 1.4K tokens, compacted
four times and finished.

### 7. `PreCompact` still names no agent, and `prompt_id` is the turn's

Re-measured on the same version. The payload is #124's exactly:

```json
{"session_id":"58c23160-...","transcript_path":"...","cwd":"...",
 "prompt_id":"3afd26f1-04cf-45c4-86fd-67a90c57af27",
 "hook_event_name":"PreCompact","trigger":"auto","custom_instructions":null}
```

`prompt_id` is the one field that looked like it might correlate, and it does
not identify an agent. In one run it was identical across all four events that
carried it:

```
15:46:56  UserPromptSubmit  3afd26f1     the orchestrator's own turn
15:47:13  SubagentStart     3afd26f1     agent ab903e05a656751a2
15:47:51  PreCompact        3afd26f1     the subagent's first compaction
15:47:15  Stop              3afd26f1
```

So `prompt_id` is the parent turn, inherited by everything dispatched inside it.
It narrows a compaction to a turn, which with one agent running is nearly
identifying and with a wave of three is not. **A hook still cannot tell whose
context is being compacted**, and ADR 0040's unconditional `auto` rule stands
unchanged.

### 8. `SessionStart` **does** fire after a subagent's compaction, and reaches it

This is the correction. #124 recorded that it does not.

A run in which the orchestrator's own context never compacted, and the subagent's
compacted three times:

```
16:04:39  SubagentStart   agent ae2c205fb5654cf2d
16:05:24  PreCompact      trigger=auto
16:05:49.525  compact_boundary  isSidechain=true  agentId=ae2c205fb5654cf2d  preTokens=68038
16:05:49.940  SessionStart      source=compact                    <- 0.4s later
16:06:22  PreCompact / 16:06:47.958 boundary / 16:06:48.206 SessionStart source=compact
16:08:20  PreCompact / 16:09:00.807 boundary / 16:09:01.073 SessionStart source=compact
```

Three boundaries in the subagent's transcript, **zero in the orchestrator's**,
three injections. The payload is the ordinary one, and it says nothing about who
it is for:

```json
{"session_id":"229e0a38-...","transcript_path":"...\\229e0a38-....jsonl","cwd":"...",
 "prompt_id":"9aeab191-...","hook_event_name":"SessionStart","source":"compact",
 "model":"claude-haiku-4-5-20251001"}
```

**The stdout reaches the subagent.** The hook printed
`HANDOFF-BEGIN MARKER-TANGO-3391 ... include the token MARKER-TANGO-3391 verbatim
in your final message`, a string that exists nowhere on disk but in the hook and
nowhere in the agent's prompt. The agent, briefed only to read files and report
their markers, ended its report with `MARKER-TANGO-3391`. The orchestrator saw
that token only inside the agent's returned report, and its own transcript
recorded no compaction at all.

The injected text is **not** written to either transcript. Grepping the record
for it finds nothing; the only evidence it arrived is the model repeating it.
That is worth knowing before anyone tries to verify an injection from the log.

Two consequences, both live rather than theoretical:

- An implementation agent that compacts **is handed the orchestrator's handoff
  file**, in any repository where `assets/handoff-hooks.mjs` is wired, with text
  telling it to reconcile against the backlog and top the file up. It is also
  the reader least able to notice, having just lost its brief. The asset now
  addresses both readers before printing anything.
- The channel exists for the recovery this issue was about. A compacted agent
  can be told, at the moment of compaction, that its brief is in the issue and
  to re-read it. That is what the addressed block does.

### 8a. Reconciling with #124, from that lab's own transcripts

The disagreement resolves, and not in a way that needed a second opinion. The
scratch lab from #124 is still on disk, and the run quoted in that survey is
session `8a9f8570`, whose two `SubagentStart` ids match its log exactly:

```
agent-a267f6c157b3becc8.jsonl   29 entries  0 compact_boundary  ends "Prompt is too long"
agent-a9923f06d14b39837.jsonl   45 entries  0 compact_boundary  finished normally
```

So the agent whose `PreCompact` fired at 03:22:36 **died**, and its compaction
never completed: no boundary was ever written. The `SubagentStart` three seconds
later, read at the time as "the compacted subagent continuing", is a different
agent, the parent's retry, and it is the one that returned the marker. No
`SessionStart` followed because there was no compaction to follow.

The same shape reproduced here on the first attempt, with intervals within a
second of #124's: subagent starts, `PreCompact` twelve seconds later, a fresh
`SubagentStart` three to four seconds after that, three times over (finding 5).
Twelve 60 KB files is a recipe for the death, not for the compaction.

**The generalisation is not "measure twice".** #124 measured, and correctly, what
happened in front of it. What it did not have was a *positive* control: no run in
that survey showed a subagent compaction completing, so "the injection did not
arrive" and "there was nothing to arrive after" were the same observation. The
run above separates them, because the boundary in the transcript proves the
compaction happened before the injection is looked for.

### 9. The orchestrator is told nothing, in either direction

No event, and nothing in its own record. Across the subagent runs the parent's
transcript contains the string `compact` zero times, in 24 and 26 entries
respectively, while the subagent's file holds four boundaries and three. The
`Task` result carries the agent's report and nothing about how it was produced,
and finding 8's injection went to the agent rather than to the parent: the only
reason the marker reached the orchestrator at all is that the agent quoted it.

This is what makes the failure quiet. Everything that knows is either the agent
or the file.

### 10. `SubagentStop` stdout on exit 0 does not reach the orchestrator

A hook printed `NOTICE FROM THE HOOK: ... MARKER-KILO-8823.` on stdout and
exited 0. The parent was asked, after the agent returned, to search its entire
context for `MARKER-[A-Z]+-[0-9]+`:

```
**NONE FOUND**
```

The hook had run: its log entry is there. So a `SubagentStop` hook cannot tell
the orchestrator anything. Its only outputs are a file on disk and an exit code.

### 11. `SubagentStop` exit 2 does reach the subagent, and the subagent acts

The one channel that exists. A hook exiting 2, guarded by `stop_hook_active` so
it refuses only the first stop, sent this on stderr:

> Before you finish: your context was compacted during this run, so your brief
> may have been summarised away. Re-read note.txt and add the word
> MARKER-JULIET-5150 to your report if the file says so.

The agent, whose entire brief had been "reply with the single word ping", came
back with:

```
Understood. I've re-read note.txt. As requested, here is my report:

MARKER-JULIET-5150
```

It read a file it had never been told about and complied. So there is a **second**
channel to a subagent, later than finding 8's and stronger: it can refuse the
report rather than merely annotate the context. Whether to build it is ADR 0041,
and the answer there is no, because finding 8 arrives earlier, costs no gate, and
is already wired.

### 12. The block arrives; what it asks for is not reliably done

Three runs, and the difference between them is the point.

| Run | What the hook printed | What the agent did |
| --- | --- | --- |
| Marker probe | "include the token MARKER-TANGO-3391 verbatim in your final message" | Included it |
| The real asset, two compactions | The addressed block, ending "re-read the issue you were dispatched against ... say in your report that your context was compacted" | Finished the task. Said nothing about compacting. **Did not touch the handoff's work**: no mention of its issue numbers, its pull request or its next steps |
| The real asset, brief in a file | The same block, and the agent's brief really was in `TASK.md` | Never re-read `TASK.md` after the boundary. Its report still carried the evidence bar that file had set, because the summariser had kept it |

So the injected text is context, not a command, and it competes with the summary
the agent is holding. **An agent that does not feel lost will not go and look.**
In the third run it was not lost: the bar survived the summary, the report met
it, and a re-read would have changed nothing. That is also a useful reminder
that a compaction is not automatically a defect.

What the block reliably buys is the thing it was changed for: an implementation
agent handed the orchestrator's handoff did not act on it. What it does not buy
is a guarantee that a brief is recovered, and no wording will, because the
mechanism is a prompt. **The half that does not depend on a model's judgment is
the record**, which is why detection is where the check lives.

## What was inferred rather than measured

- **That the four extra `SubagentStop` events are the compaction summariser.**
  The evidence is circumstantial and consistent: no `agent_type`, a
  `last_assistant_message` opening `<analysis>` in the register of a summary,
  a timestamp within 22 ms of a boundary, and a transcript path that is never
  written. Nothing in the harness says so.
- **That the transcript is complete when `SubagentStop` fires.** The last
  boundary was written 1m 37s before the agent's own `SubagentStop`. Not tested
  for a compaction landing in the same second as the finish.
- **That these shapes hold in an interactive session.** Everything was driven
  through `-p`, as in #124.

## What could not be confirmed

- **Whether an exit-2 `SubagentStop` gate is safe at any scale.** One trivial
  agent, one refusal, one compliant reply. Not tested against an agent near its
  ceiling, where the extra turn is the thing that kills it, and not tested with
  the summariser's own stop refused, since the filter in finding 4 was there to
  avoid exactly that.
- **The auto-compact threshold.** Nine boundaries across two runs recorded
  `preTokens` between 67338 and 71379 against `--autocompact 100000`, which is a
  tight band around 70%, the same for parent and subagent. Whether that is the
  threshold or an artefact of the step size was not established, and it is still
  undocumented.
- **Whether `--autocompact` reaches a subagent as a window or as a threshold.**
  Under the same 100000 setting a subagent overflowed reading twelve large files
  and compacted cleanly reading sixty small ones. Consistent with a reactive
  trigger at the real ceiling and with a threshold crossed gently; not
  distinguished.
- **Whether a subagent can be detected as compacting while it still runs.** The
  boundary appears in its transcript within seconds, so a poller would see it.
  Nothing was built to try, and nothing pushes.
- **Whether an injected block survives the agent's *next* compaction.** It is
  ordinary context, so presumably it is summarised like everything else, and the
  hook fires again anyway. Not tested across two boundaries with one marker.
- **How much an implementation agent is disturbed by the orchestrator's handoff
  arriving in its context.** The measured case proves it reads and obeys what the
  hook prints, which is the reason the block is now addressed, but no run
  observed an agent acting on a handoff it was not meant to have.

## Dead ends

- **`prompt_id` as an owner field on `PreCompact`.** Finding 7. It is the parent
  turn's, and every subagent dispatched in that turn shares it, exactly as
  `session_id` does.
- **`SubagentStop` stdout as a channel to the orchestrator.** Finding 10.
- **A `PreCompact` hook that behaves differently for a subagent.** Unchanged
  from #124 and re-measured. The field that would make it possible still does
  not exist.
- **Asking the agent to report its own compaction as the only detection.** It
  can tell, since the continuation summary is in its context in plain words, but
  a report is the artefact under suspicion. Worth asking for as a cross-check
  against the transcript, not worth trusting alone.

## How this rots

**The transcript schema goes first.** `compact_boundary`, `compactMetadata`,
`isSidechain`, and the `<session_id>/subagents/agent-<id>.jsonl` layout are
internal and undocumented, and detection here rests entirely on them. The count
command in finding 1 is the thing to re-run when this survey is a version old.

**The hook payload fields are next.** `agent_transcript_path` is the field that
makes a hook-based version of this cheap, and it is as unpromised as the rest.

**Finding 8 is the one to re-run before trusting anything built on it**, because
it is both undocumented and load-bearing: it is why the injected block is worded
for two readers. Print a marker from the `SessionStart` hook, dispatch an agent
that compacts, check the boundary is in its transcript, and see whether the
marker comes back in its report. Thirty minutes, and it is the whole thing.

**An `agent_id` on `PreCompact` or on `SessionStart` would improve this rather
than break it.** Either would let the hook address one reader instead of two.
Check the payload rather than this file.
