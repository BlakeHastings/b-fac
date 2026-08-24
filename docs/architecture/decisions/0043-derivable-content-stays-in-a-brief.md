# 0043. Derivable content stays in a brief, because its writer has already paid for it

Status: accepted

Issue #116, parent epic #4. ADR 0036 supplies the rule this bounds, and #80 the
session that produced it. Landed with #138, which refines the same file.

## Context

ADR 0036 gave a spec one rule: **can an agent derive this from the repository
and its history?** If yes, leave it out. #116 asked whether the same rule
sharpens `references/briefing.md`, and filed the question rather than the change,
because that file holds the only measured claims in the skill and should not be
edited on a hunch.

The eight-element "What a brief carries" list predates the rule and was derived a
different way, from what worked across 240 subagent transcripts. Run the rule
over it and the elements do not sort cleanly. Four are plainly not derivable and
the rule agrees they belong. Three look derivable and the measurements say
include them anyway: reading order, what already exists by name, and the traps.

## What the evidence says

**The traps were never the exception they look like.** #116 named
`briefing.md`'s four example traps as the test set, on the observation that at
least one of them is in no repository. Classified, all four are:

| Trap | The fact it turns on | In the repository |
| --- | --- | --- |
| `NeedAppearances`, or filled values are invisible | what a PDF viewer does with an unset flag | no |
| Mail scanners follow every link | what a mail security appliance does to a link | no |
| A loader that fetches a record serialises every field | what a framework puts in the page it returns | no |
| A company called `=cmd\|...` is a formula injection vector | what a spreadsheet does with a leading `=` | no |

Every one is a fact about a system outside the repository, so no amount of
reading the repository produces it. The fourth carries one derivable half, that
an applicant controls the field, and it is there as the premise that makes the
underivable half land. **The rule and the list only ever disagreed about reading
order and file names**, which is a much smaller disagreement than the issue
expected to find.

**The corpus half of the test could not be run, and saying so is part of the
answer.** #116 also asked whether any brief in the corpus lost anything by
carrying derivable content. Those 240 transcripts were mined in #11 and are not
in this repository; #20 and ADR 0010 quote figures from them and no artefact
here reproduces them. So this decision rests on the trap classification above and
on the incidents the written record does carry, not on a re-measurement.

**What that record carries is three failures, all of one kind.** A brief
asserting "9 fee-schedule fields" against a spec that had 8. A brief naming the
file a constant was supposedly in, weeks after it was deleted. And #138's brief
asserting 14 call sites where there were 15, both numbers from the same terminal
minutes apart, because two variants of one question were live and the narrower
answer got quoted as the broader one. **Not one incident of a brief costing
anything by naming a file the agent could have found for itself.** The observed
cost of derivable content in a brief is staleness, never redundancy.

## Decision

**The derivability rule bounds a spec and is not extended to a brief.** The two
documents disagree, and they disagree for a reason that survives being stated:
the rule is about who pays, and the payer is different.

- A **spec** is written by the owner, whose hour is the scarce thing, and read by
  an orchestrator with the repository already open. Derivable content there is
  the owner doing the reader's job, which is the framing ADR 0036 records the
  owner withdrawing.
- A **brief** is written by that orchestrator, who has already read the
  repository, and read by an agent with zero context whose context is the scarce
  thing. `briefing.md`'s own compaction section is the reason it is scarce: when
  it runs out, the summariser keeps the shape of the brief and loses the bar, the
  bounds and the artefact. Pre-deriving moves work off the budget whose failure
  destroys the brief onto one that has already been spent.

Same rule, different scarce resource. **The finding is a sentence in each
document, not a rewrite**, which is the outcome #116 named as the good one.

**No measured claim moves.** The element list keeps its ranking, and the evidence
bar's three measures, the state flag at 80% against 23% and the length cap's
median are untouched. This adds a boundary to a rule; it does not re-rank
anything.

**The remedy for the staleness cost is re-derivation, not omission**, and it
lands in the same pull request as #138's third refinement: when a count is going
into a brief, re-derive it with the command you are about to write down. That is
the rule the two issues converge on, and it is why they were worked together.

## Consequences

**`references/briefing.md` gains two paragraphs and `references/refinement.md`
one.** The brief's copy sits under the element list, where a reader who has just
met the derivable elements is standing. The spec's copy sits in "What refinement
is not for", which is the section already about derivable content. ADR 0036
carries a pointer here. `SKILL.md` keeps the rule resident and unqualified, which
is correct: the rule as stated is about specs, and the qualification belongs one
level down, where the reader who needs it already is.

**Nothing mechanical can hold this and nothing should.** Whether a given line of
a brief was derivable is a judgment about a repository at a moment, and the
staleness this decision accepts is caught by the re-derivation habit and by
review, not by a check. What is assertable is that the sentence is present, and a
check for that is the ceremony this skill deletes.

**The count of underivable things is still the spec threshold**, unchanged. The
only thing that moved is that "derivable" no longer reads as an argument for
leaving something out of a brief, which it was starting to.

**This could be wrong in one direction and the direction is nameable.** If
pre-deriving turns out to cost more in wrong assertions than it saves in agent
context, the answer is not to delete the derivable elements but to narrow them to
what re-derivation is cheap for. Three incidents is not a rate. Measuring one
needs the corpus that is not here, and it is a follow-up rather than a guess made
now.
