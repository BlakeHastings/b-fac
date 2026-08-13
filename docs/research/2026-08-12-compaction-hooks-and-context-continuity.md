# Compaction hooks, and what survives a context window filling up

**Verified on** 2026-08-12

Asked by **#124**, which needed to know whether an orchestrator's handoff could
be made to survive a compaction, and whether a hook could be made to insist on
one. ADR 0040 is the decision that came out of it.

Everything below was run on **Claude Code 2.1.228**, Windows 11, against a
scratch repository with its own `.claude/settings.json`, deliberately not this
one: a `PreCompact` hook that blocks affects live sessions the moment it is
registered. Timestamps in the raw output are UTC, so they read 2026-08-13.

The hook under test logged its stdin, optionally wrote stdout, and exited with a
code given on its command line.

## What was verified

### `PreCompact` exists, distinguishes the triggers, and its payload is this

```
{"session_id":"99777120-...","transcript_path":"C:\\Users\\...\\99777120-....jsonl",
 "cwd":"C:\\...\\compact-lab","prompt_id":"a09a1ec0-...",
 "hook_event_name":"PreCompact","trigger":"manual","custom_instructions":null}
```

The field is **`trigger`**, and `matcher: "manual"` / `matcher: "auto"` select on
it. Both were observed carrying their own value. There is **no `agent_id` and no
`agent_type`**, which matters below.

### Exit 2 from `PreCompact` blocks a manual compaction, and the message is shown

```
$ claude --model haiku -c -p "/compact"
Compaction blocked by PreCompact hook: [node probe.mjs 2 precompact-manual.log]:
REFUSED by probe hook: this is the stderr a blocking hook emits.
```

The hook's own stderr reaches the caller, prefixed with the command that
produced it. With the same hook exiting 0, the compaction completed silently.

Incidentally: `/compact` on a one-turn session answers `Not enough messages to
compact.` and no hook fires at all.

### Blocking an *automatic* compaction wedges the session, unrecoverably from inside

Session filled with ~15K tokens per turn against `--autocompact 100000`, with
`PreCompact` matcher `auto` exiting 2.

```
== turn 4 ==  FILL-4   -- AUTO PRECOMPACT FIRED: 1 entries
...
== turn 10 == FILL-10  -- AUTO PRECOMPACT FIRED: 7 entries
== turn 11 ==
Prompt is too long
-- auto-precompact entries: 8
== turn 12 ==
Prompt is too long
-- auto-precompact entries: 9
...
== turn 22 ==
Prompt is too long
-- auto-precompact entries: 19
```

Auto-compact first fired at turn 4 and was refused every time. From turn 11 the
session answered nothing but `Prompt is too long`, and it went on firing and
being refused for another twelve turns. **The gate cannot be satisfied**: the
thing it asks for is prose, and no prompt reaches the model to write it.

One escape exists, and only because the two triggers were wired separately:

```
$ claude -c -p "/compact"          # manual rule exits 0
$ claude -c -p "Reply with exactly: RECOVERED"
RECOVERED
```

A manual compaction recovers a wedged session. A hook blocking both triggers
would leave no way out.

### `SessionStart` matcher `compact` fires, and its stdout reaches the model

Fired 3 seconds after the `PreCompact` that allowed the compaction, same
`session_id`, payload `{"hook_event_name":"SessionStart","source":"compact",...}`.

```
$ # hook printed: MARKER-ZULU-7741: the injected handoff text.
$ claude -c -p "Search your entire context ... for MARKER-[A-Z]+-[0-9]+ ..."
MARKER-ZULU-7741
```

### No truncation at 1 MB

A generated payload with a distinct first, middle and last line was injected the
same way.

| Payload | First line | LINE-000600 | Last line |
| --- | --- | --- | --- |
| 102,502 bytes | intact | intact | intact |
| 1,048,661 bytes | intact | — | intact |

`HANDOFF-END MARKER-OMEGA-011782` came back verbatim from the 1 MB run, which is
the generator's own count for that file. No cap was found, and nothing about the
output suggested one was near.

### Auto-compact can be disabled outright, and the documentation says so

`settings.md` documents `autoCompactEnabled` (**default** `true`) and names
`DISABLE_AUTO_COMPACT` as the environment-variable form. Confirmed by running:
with `autoCompactEnabled: false` and the same fill script that had fired
auto-compact at turn 4, ten turns produced **no** `PreCompact` at all and the
log file was never created.

**This corrects #124's own mechanism table**, which recorded "no documented way"
to disable it. It does not change the decision — see the ADR — because switching
auto-compact off reaches the same `Prompt is too long` sooner, with nothing left
to catch it.

### Method note: the table was checked against the documentation and was still wrong

That row is worth more as a fact about the method than as a fact about
auto-compaction. #124's table was not written from memory. It was compiled
against current documentation, marked row by row, and explicitly offered as
verified — and one row was still wrong in the direction that mattered most,
because "there is no escape hatch" is exactly the claim that makes a wedge sound
unavoidable. It was not the only table about this surface to be wrong that day.

The generalisation is not "check the documentation harder". It is that
**documentation was searched and the setting was not found, which is a different
result from the setting not existing, and the two are indistinguishable once
written into a table cell.** A row that records an absence is a claim about the
search, not about the product. Where an absence is load-bearing — and here it
decided whether a gate could ever be made safe — the thing to do is run it:
setting `autoCompactEnabled: false` and watching the hook never fire took one
script and five minutes, and it was the only step that could distinguish the two.

Every negative in this survey is therefore either measured or filed under
"could not be confirmed", and none of them is filed under "not documented,
therefore absent".

### A subagent's context compacts independently, and the far side does not reach it

A `general-purpose` subagent was told to read twelve 60 KB files, in a session
whose own context stayed tiny.

With `auto` exiting 0:

```
subagentstart.log  03:22:24  agent_id a267f6c157b3becc8
precompact-auto    03:22:36  trigger auto        <- no agent_id, no agent_type
subagentstart.log  03:22:39  agent_id a9923f06d14b39837
result: HANDOFF-END MARKER-OMEGA-000690
```

`sessionstart-compact.log`'s last entry was from 03:19, three minutes earlier:
**no `SessionStart` fired for the subagent's compaction.**

*Corrected 2026-08-13, and this one was wrong rather than incomplete.
`SessionStart` does fire after a subagent's compaction and its stdout reaches
that subagent. It did not fire here because **this compaction never completed**:
agent `a267f6c157b3becc8`'s transcript, still on disk, has no `compact_boundary`
in it and ends `Prompt is too long`. The `SubagentStart` at 03:22:39 is not that
agent continuing, it is `a9923f06d14b39837`, a fresh agent, and it is the one
that returned the marker. See
[2026-08-13-subagent-compaction-detection.md](2026-08-13-subagent-compaction-detection.md)
finding 8 and ADR 0042.*

With `auto` exiting 2, the same run:

```
subagentstart entries: 1
auto entries: 1   ("trigger":"auto")
Error: "Agent terminated early due to an API error: Prompt is too long"
```

The parent session was untouched and reported the error. So `PreCompact` fires
for a subagent, cannot be told apart from the orchestrator's own, kills the
subagent if refused, and is not followed by any injection.

*Refined 2026-08-13: the refusal is sufficient and not necessary. The same twelve
files killed three subagents with every hook exiting 0, because a single tool
result crossed the ceiling in one step and the compaction fired in the same
second as the failure. Nothing about the unconditional `auto` rule changes.*

### Nothing exposes context usage

Neither payload observed carried a token count, a percentage or a remaining
figure, and no hook event fires on a context threshold. The documented fields on
`PreCompact` are the ones quoted above.

## What was inferred rather than measured

- **That `--autocompact 100000` behaves like the default window, only smaller.**
  The wedge was produced against a 100K window on a model whose real window is
  larger, so the session had slack that a default-window session would not. The
  wedge still arrived; a session at its real ceiling should arrive sooner, not
  later. Not separately measured.
- **That the second `SubagentStart` is the compacted subagent continuing.** The
  timing says so — it lands 3 seconds after the compaction and 15 seconds after
  the first, which is not enough time to read twelve files — and the parent
  received one result. Not confirmed from the transcript. *Wrong, 2026-08-13,
  and confirmed from the transcript this time: it is a second agent,
  `a9923f06d14b39837`, dispatched after the first died. That inference is what
  made the `SessionStart` row above look like a fired-and-nothing-followed rather
  than a compaction that never happened.*
- **That the same shapes hold in an interactive session.** Everything here was
  driven through `-p` / `-c -p`. The hooks are process-level and the compaction
  is the harness's, so there is no obvious reason for a difference, and no
  measurement of one either.

## What could not be confirmed

- **Whether `PreCompact` stdout reaches anything on exit 0.** The documented set
  of events whose stdout becomes context is `UserPromptSubmit`,
  `UserPromptExpansion` and `SessionStart`; `PreCompact` is not in it. Not tested
  directly, and the design does not depend on it.
- **Whether a subagent's compaction can be detected at all.** Nothing in the
  `PreCompact` payload distinguishes it. A hook could in principle correlate
  against `SubagentStart` by `session_id`, but every subagent shares the parent's
  `session_id`, so that identifies concurrency and not ownership. Not pursued.
  *Corrected 2026-08-13: it can, from the record rather than from the hook. A
  subagent's compaction writes a `compact_boundary` entry into that subagent's
  own transcript file. `PreCompact` is still no help, and `prompt_id` on it turns
  out to be the parent turn's, shared by everything dispatched in that turn. See
  [2026-08-13-subagent-compaction-detection.md](2026-08-13-subagent-compaction-detection.md)
  and ADR 0042.*
- **The real auto-compact threshold as a fraction of the window.** Auto-compact
  first fired at turn 4 of ~15K tokens each, which is consistent with anything
  from 40% to 70% of 100K. The number is not documented and was not narrowed.
- **Whether the 1 MB injection was actually held whole or partly re-compacted on
  arrival.** Both end markers came back, which is the property that matters, but
  the accounting behind it was not inspected.

## Dead ends

- **A 90% context trigger, which is what the request asked for.** Context usage
  is not exposed to hooks, to the statusline, or to any environment variable, and
  no threshold event exists. `PreCompact` fires at that moment anyway, so the
  percentage is unnecessary rather than merely unavailable.
- **Having the hook write the handoff.** A hook has stdout, stderr and an exit
  code. It cannot call a tool or run a slash command, so it cannot produce prose.
- **A probe in the register of `guard-merge.mjs`'s.** That probe works by being
  refused, and `PreCompact` never sees a command line. The substitute is the
  injected block itself, which is observable in the resumed context and cannot go
  stale.
- **`git rev-list` against `origin/<branch>` for the staleness count.** It
  measures what was last fetched rather than what exists, and a hook that fetches
  is a hook that hangs. The local branch is used instead, and the count is
  documented as a floor.

## How this rots

**The exit-2 behaviours go first.** Both are behaviour of one CLI version, and
the auto-compact wedge in particular is the kind of thing a release could fix by
downgrading a refused auto-compact to a warning. Re-run the fill script before
trusting the asymmetry for a new major version.

**The subagent findings are next**, because they are entirely undocumented and
therefore unpromised. An `agent_id` appearing on the `PreCompact` payload would
make the hole addressable; a `SessionStart` firing after a subagent's compaction
would close it outright. *That second one was not a future release. It was
already true and this survey had it backwards, for the reason recorded above.
The prediction was right about which row would move first and wrong about which
direction it would move from.*

**The size result is the most durable** and also the least likely to be leaned
on: no handoff is going to approach 1 MB, and the finding's only job is to
justify not truncating.
