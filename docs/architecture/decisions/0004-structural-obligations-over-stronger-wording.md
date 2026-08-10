# 0004. When skill advice fails repeatedly, change the shape, not the volume

Status: accepted

## Context

Issues #15 and #16 are the two behaviours the owner named from experience before
any mining confirmed them: the orchestrator stops for a status update while
unblocked work remains, and it asks with a blocking question tool instead of an
asynchronous channel. Mining two sessions independently put numbers on the
first: roughly 21 stops, about 9.1 measured hours of idle in one session alone,
one gap of 4h28m.

The instruction that should have prevented all of it was already in the skill.
"Keep working until you are out of options that do not need me" was present for
every one of those stops, followed by "take it literally", and the owner
restated the operating model sixteen separate ways across the two sessions
without it taking.

That is the skill's own first principle happening to the skill: **an instruction
is not a control.** The skill's advice measurably works where it names something
concrete and fails where it asks for a disposition, and "keep working" is a
disposition. The obvious fix is a more emphatic paragraph, and the evidence says
the obvious fix is the one thing already proven not to work here.

The mechanism a miner named explains why. *Finishing a good report reads as
finishing the turn.* The summary is itself a completion signal, so the failure
happens even when the orchestrator has correctly concluded that nothing is
blocked. Emphasis cannot reach that, because the reader already agrees.

## Decision

**Prefer a structural obligation with a named artifact over stronger wording.**
Where advice has failed repeatedly, restate it as something the reader either
produces or visibly does not:

- The status report now ends with both of two literal lines, `Next:` and
  `Blocked on:`, every time. `Blocked on: nothing` is the empty case, not an
  omission, so a turn missing a line is countable rather than merely
  regrettable.
- `Next: nothing` is a claim that has to be paid for by enumerating every open
  issue and PR and what each waits on, rather than a default state.
- The loop grew a step 9 whose content is that there is no step that ends it.
- Escalation names the two asynchronous channels and says explicitly that both
  are worthless if the turn ends anyway.

**Keep the fix in `SKILL.md`, not a reference file**, against this repo's usual
progressive-disclosure bias. A rule about when you may stop has to be resident
at the moment of stopping, and a reference the orchestrator would have to decide
to open is exactly the disposition this ADR says not to rely on. The body went
from 206 to 275 lines against a ~500 line ceiling, which is affordable once.

## Consequences

The skill now prescribes a small amount of report *format*, which it does
nowhere else. That is the cost, and it is deliberate: the format is the control.
An editor tempted to relax `Next:` / `Blocked on:` back into prose should read
this ADR first, because prose is what the previous version was.

Nothing here is mechanically enforced. There is no linter for a turn that ended
early, so this remains an instruction shaped like a control rather than a
control. The detection layer is the record: idle gaps are visible in session
timestamps, and a stop with neither line is countable after the fact. If the
next mining pass still finds unblocked stops, the finding is that a shaped
obligation was also not enough, and the next layer is harness-level rather than
textual.

Applies beyond these two issues. Other backlog items describing behaviour the
skill already asks for should be read the same way: find the artifact the reader
must produce, and do not settle for an adjective.
