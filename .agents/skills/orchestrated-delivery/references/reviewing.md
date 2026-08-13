# Reviewing what comes back

The three lenses that define "done" live in the process doc agents read
(`assets/review.md`, installed as `docs/process/review.md`). This file is the
part that is yours: judging a returned claim.

Mechanical checks are not a lens. They are the price of admission and they run
in CI. If a mechanical check is missing, adding it is cheaper than reviewing for
it forever.

## Verify the central claim yourself

Not everything. The one thing that, if false, makes the change worthless or
dangerous. Reports are usually honest, and honest is not the same as verified.

How real claims were actually checked:

| Claim | How it was checked |
| --- | --- |
| "An electrical-only applicant answers 45 of 69" | Recomputed from the spec |
| "The invariant checks fail on violation" | Ran them against violations and checked **exit codes**, not console output |
| "The sensitive-field tests have teeth" | Deleted the `sensitive` flag and confirmed 4 tests across 3 files went red |
| "No answers leak on a later visit" | Read what the loader returns. The type has no field for them |
| "The palette meets contrast" | Ran the audit, then recomputed two ratios by hand |
| "The reveal does not speak the value" | Read where the announcement string is set. The value never reaches it |
| "The leading zero survives now" | Re-ran the exact probe that had proved the bug |
| "The blank template is blank" | It was not. Three dropdowns shipped pre-filled |
| "The permit search answers in 600ms" | Re-timed at the boundary. The 600ms was the reviewer's own HTTP tool finishing a TLS handshake, not the search |
| "The intake form loads cold in 8.4s" | Timed from cold container to first byte: 23.6s. The 8.4s had started the clock once the container was already up |

The pattern across all of them: check the property, not the artifact that claims
it. A test name is not a test. A green suite is not a working app. The one time
a check was done loosely it measured `tail`'s exit code instead of the script's,
and proved nothing.

The blank-template row matters most. The evidence had been sitting in a day-one
extraction, read as harmless noise. An agent read the same bytes and saw a
document that would tell an inspecting authority a contractor held an
endorsement they had waived.
**Being the reviewer does not mean you saw it first.**

### A measurement is not a discrete check

Every row above except the last two is discrete: a test is red or it is not, a
type has a field or it does not. Discrete checks survive a sloppy instrument.
Measurements do not, and in one session three of them came back wrong in the
same direction, the flattering one. None of the three was careless. Each number
was obtained in a reasonable way with the nearest instrument, and the nearest
instrument is the one that measures the wrong boundary, usually on the generous
side of it.

Three rules, cheapest and most valuable first.

**State the instrument beside the number.** "23.6s from cold container to first
byte" can be argued with. "8.4s" cannot, so it is not yet a claim, it is a
figure. Refuse the bare figure in an agent's report and refuse it in your own.

**Measure at the boundary the applicant meets.** They wait for a rendered page,
not for a handler to return. Warm caches, in-process timings and a connection
you already had open all move the number the same way, which is why the bias has
a direction.

**Prefer an instrumented run to a convenient one-liner.** Yours is usually the
worse instrument, because yours is whatever was already to hand. Constraint 3
still stands: verify the central claim yourself. When that claim is a number,
verifying it means naming the boundary and the instrument you would accept,
then reading the run that used them, rather than reaching for a faster copy of
the same wrong probe.

Refusing a bare figure here is the round trip an evidence bar exists to save. If
the central claim is going to be a number, put the boundary and the instrument
in the brief instead, as `references/briefing.md` says to do with any bar.

## Check whether the agent still had its brief

A long-running agent's context compacts, and when it does the summariser keeps
the shape of its brief and loses the evidence bar, the out-of-scope list and the
artefact it was told to check. Nothing errors and nothing tells you. The report
you are reading may be a good-faith answer to a smoothed-over version of what
you asked.

It is on the record, per agent:

```bash
grep -c '"subtype":"compact_boundary"' \
  ~/.claude/projects/<slug>/<session_id>/subagents/agent-*.jsonl
```

A non-zero count is not a finding and it does not make the work wrong. What it
changes is how much a **silence** in the report is worth. An agent that never
mentions the constraint you set may have met it, or may no longer have been able
to see it, and those two are indistinguishable from the report alone. So verify
the central claim as usual, and then check the parts of the brief the report
does not mention: the bar, the bounds, the artefact you named.

Asking for it in the brief is the cheap half (`references/briefing.md`), and a
report that says "no compaction" against a transcript that shows four is its own
kind of signal. `references/continuity.md` has the mechanics and ADR 0041 has
why this is a check and not a gate.

## Verify the merge result, not the branch

An agent verifies against the branch point it started from. By the time you
review, that is usually not what it will land on, and **its verification has
quietly expired**.

Cheap version: diff the file lists of the branch point against the default
branch. No overlap means the agent's own run still means something. Overlap
means re-run it or send it back.

One PR had passed 51 tests on its own branch four merges earlier, one of which
renamed a type its surfaces render through. Nothing turned out to be wrong, but
nothing had tested the combination either, and that combination is what ships.

If end-to-end tests do not run on pull requests, a green CI is not evidence the
default branch stays green. Run them yourself before merging.

## Read for what is missing

The strongest reviews find the absence. A confirmation page the user can
navigate back to. An audit log with a column a secret would fit in. A fallback
that quietly undoes the security model.

Ask what the natural, slightly-wrong version of this change looks like, then
check whether that is what you have.

## Prefer unrepresentable to unreached

The best work makes bad states impossible rather than merely avoided: a state
object with no field for the thing that must not leak, a type that cannot
express an approved-but-unsigned permit, an audit table with no column for a
value.

Name it when you see it. It is the pattern you want repeated.

## Send it back for the small thing

One inaccurate comment is worth a round trip. A comment saying the opposite of
what the code does poisons every other comment in the file. Sending one PR back
for a single wrong claim produced three more found by grep, plus a fourth that
had gone stale when an earlier PR landed.

## Never merge known duplication with a plan to fix it after

Hold the second PR until the first lands so the duplicate can be folded rather
than shipped and cleaned up. "We will fix it next PR" is how an invariant
becomes advisory.

## Say what beat the ask

Reviews are the only feedback these agents get. "You proved the claim instead of
asserting it" gets you proof next time.

## Recording it

Post the outcome before merging, in the same three headings the PR uses, plus a
verdict of ship / ship with follow-ups (linked) / needs work. Say what you
independently verified rather than what you accepted, and be specific about how.

**Use `--body-file` with a quoted heredoc.** Backticks inside a double-quoted
`--body` run as command substitution and silently eat filenames. This was
documented and then walked into again within the hour, which is the general
lesson: where you can, replace the note with a mechanism.
