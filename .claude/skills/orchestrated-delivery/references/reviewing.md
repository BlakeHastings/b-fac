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

The pattern across all of them: check the property, not the artifact that claims
it. A test name is not a test. A green suite is not a working app. The one time
a check was done loosely it measured `tail`'s exit code instead of the script's,
and proved nothing.

That last row matters most. The evidence had been sitting in a day-one
extraction, read as harmless noise. An agent read the same bytes and saw a
document that would tell an inspecting authority a contractor held an
endorsement they had waived.
**Being the reviewer does not mean you saw it first.**

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
