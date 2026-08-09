# 0002. Re-domain the examples to municipal permitting, once, consistently

Status: accepted

## Context

The skill's examples are its most valuable part and its only confidentiality
risk. They were distilled from a real client engagement, and several name the
industry unmistakably: a document that would have told a carrier a client had
coverage they declined, a medical-only client answering 45 of 69 questions,
excluding an EIN from a legacy PDF, a `questionnaire/20-coverage-gating` branch
name. A scout pass found six HIGH findings, all pointing at the same domain.

Two bad options were available. Publishing as-is puts a recognisable account of
a real engagement's defects on the internet under the author's name. Blurring
each example to "a business document with wrong information" destroys the thing
that makes the skill work: the briefing chapter's entire argument is that a
brief naming the specific trap finds the defect a generic one misses. A skill
that argues for specificity while demonstrating vagueness refutes itself.

There is also a seam risk. The carrier example appears in two files, and the
leading-zero identifier in three. Replacing them independently produces a text
where one passage says "carrier" and another says "authority", which a reader
notices and which invites exactly the reconstruction the change was meant to
prevent.

## Decision

Pick **one** substitute domain and move every example into it together.

The domain is **municipal permitting**. It was chosen because it carries a
structural analogue for every flagged example rather than because it sounds
neutral:

| Original | Replacement |
| --- | --- |
| a carrier told a client had coverage they declined | an inspecting authority told a contractor held an endorsement they waived |
| medical-only client, dental reads blank | electrical-only applicant, plumbing section reads blank |
| EIN / Tax ID excluded from the legacy PDF | licence number excluded from the legacy PDF |
| a declined attestation | an approved-but-unsigned permit |
| contribution fields | fee-schedule fields |
| `questionnaire/20-coverage-gating` | `intake/20-eligibility-gating` |
| a zip code coerced to `75201` | a postal code coerced to `02139` |

**Numbers that carry a lesson stay.** "9 fields when the spec had 8" teaches
that the orchestrator was wrong and the agent was right to say so, and that only
lands with a real off-by-one. "45 of 69" teaches recomputation, which needs two
numbers that could plausibly disagree. Only project telemetry gets rounded.

Incidental stack fingerprints (`aspire start --isolated`, `npm run
check:collisions`, the literal CI job names in `merge-pr.mjs`) become bracketed
placeholders, matching the convention the assets already use. These were never
instructive; the surrounding annotation carries the lesson.

## Consequences

`02139` is a better example than `75201`, because a postal code with a leading
zero demonstrates the coercion bug that the original merely asserted. That is
luck, not design, but it is worth noting that re-domaining improved one example.

The replacement domain must be applied in one pass and checked as a whole. A
grep for the flagged vocabulary belongs in CI so a future contributor writing
from the original engagement cannot reintroduce it a phrase at a time.

Anyone who worked the original project will still recognise the shapes. This
protects against a stranger identifying the client, which is the actual risk;
it does not and cannot protect against someone who was there.
