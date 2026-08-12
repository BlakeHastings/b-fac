# 0027. The guard answers whether it is loaded, by refusing a probe

Status: accepted

Issue #46, unblocked by #45. Related: ADR 0025, which named the axis this sits
on, and `references/enforcement.md`'s "Installed is not a state you can assume".

## Context

A hook is written into `.claude/settings.json`, loaded by a process at startup,
and fires on a command. Only the third denies anything, and the middle state is
invisible from inside. This repo lost two days and roughly fifteen dispatched
agents to it: the CLI process started three hours before the `PreToolUse` block
existed, so the guard was never in its snapshot, and it never fired once. The
script was correct the whole time.

Nothing reported this, and ADR 0025's vocabulary says why. Layer 2 is the only
**gate** in the stack. A check that never runs leaves a missing report; a gate
that never fires leaves nothing at all, and a gate with nothing to deny is
indistinguishable from a gate that was never loaded. `assets/check-setup.mjs`
answers *configured*, which is the state that was never in doubt.

## Decision

**`scripts/check-guard-live.mjs` exists in order to be refused.** The guard
matches it by name and denies it. If the guard is loaded, the harness refuses
the tool call and prints the guard's own message; the script never runs. If the
guard is not loaded, nothing intercepts anything, the script runs, says so, and
exits 1.

**Absence is the signal, and there is no artifact to misread.** The obvious
alternative, a `SessionStart` hook writing a heartbeat, has the same
bootstrapping property (no hooks, no heartbeat) but leaves a file behind, and a
file can be stale. Reading a previous process's heartbeat reports healthy on a
session with no hooks at all, which is the exact failure inverted. Avoiding it
means binding the heartbeat to the current process, and neither candidate is
free: `CLAUDE_CODE_SESSION_ID` is the *parent's* id inside a subagent, and
`CLAUDE_PID` is only known to be present in the tool environment, not the hook
one. A probe that persists nothing has no identity to get right.

**The rule lives in the guard, not in a hook of its own.** Only this guard can
answer whether this guard is loaded. A second hook would answer for itself and
leave the reader to infer the rest, which is the inference this ADR exists to
stop being made.

**It is invoked once, by hand, and never wired into CI or `npm run check`.** It
answers a question asked when taking over a session or after changing hook
settings. In CI there is no harness, so the answer would always be "inert", and
a check that must fail is not a check.

## Consequences

The first run after any change to the guard answers "inert" in a session that
loaded the previous copy, because that copy has no rule to refuse the probe.
The output therefore reports what was observed (the script ran) separately from
what that means (no hook, or an older hook), rather than asserting the second.

The probe and the rule are two files agreeing on a filename, so a rename would
silently turn the answer into a permanent "inert". A test asserts the guard
refuses the script that actually ships.

`npm` is not a supported way to run it: npm re-invokes through a shell of its
own and the hook never sees the script name, which would produce a confident
wrong answer. The script detects `npm_lifecycle_event` and refuses to report.

The probe rule is held to the same standard as the merge rules, and reads what
a command invokes rather than what its text contains. Talking about the probe
is not running it.
