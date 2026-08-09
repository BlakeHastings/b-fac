# Briefing an agent, and writing an issue

The highest-leverage thing an orchestrator does. A brief that states the task
gets you the task. A brief that states **what will bite** gets you the task plus
the defect nobody knew about.

## What a brief carries

- **Reading order**, by filename, in sequence. Agents that skip the ADRs rebuild
  decisions already made.
- **What already exists, by name.** Modules and functions to build on. Name
  files, not concepts. Without this you get a second implementation of something
  that works, and you notice when the diff is large.
- **Why it matters.** Calibration, not motivation. "This is the defect the whole
  project exists to fix" changes how hard someone looks at their own work.
- **The traps, specifically.** The thing that separates a brief from a task
  description.
- **Your steer, labelled as a steer.** "Override it if you disagree after
  looking" has been taken up correctly, with reasons, more than once.
- **What is out of scope, and its issue number.**
- **The acceptance test, concretely.** Not "verify it works" but "seed an
  applicant with electrical work only and confirm plumbing reads as not
  applicable rather than four blank fields."
- **Do not merge**, naming the sanctioned command as your job.
- **The report contract**: which decisions to report back, not a narrative.

Traps that each caught a real defect, as examples of the register:

- "`NeedAppearances`, or filled values are invisible in most viewers and the bug
  looks like the fill failed."
- "Mail scanners follow every link, so a token consumed on GET is burned before
  the human clicks."
- "A loader that fetches the record just to check it exists will serialize every
  field into the SSR payload."
- "An applicant controls this field, so a company called `=cmd|...` is a formula
  injection vector when the export opens in Excel."

Say where the landmine is even when you are not sure it is there.

## A real brief, annotated

Abridged, with the section each part demonstrates.

```
You are implementing GitHub issue #29 ("CSV and Excel export").

FIRST read, in order: AGENTS.md, docs/gotchas.md, docs/process/review.md,      <- reading order
docs/process/working-an-issue.md, docs/discovery/README.md, then
docs/architecture/decisions/0018. Then `gh issue view 29`.

WHAT IS ALREADY ON MAIN: [3 bullets naming exact files and functions]         <- build on this

SCOPE: single-submission and multi-submission export...                        <- scope

**THE SENSITIVE-FIELD DECISION IS THE MOST IMPORTANT THING IN THIS ISSUE,      <- steer,
and there is a precedent you should follow rather than a question to              labelled
reopen.** #59 excluded the licence number from the legacy PDF on one argument...

EXCEL-SAFE FORMATTING, this is the classic failure and the issue calls        <- the traps
it out:
- A licence number or a postal code that Excel reads as a number turns
  `02139` into `2139`...
- A value starting `=`, `+`, `-` or `@` is a formula-injection vector...

If you need an ADR use exactly **0025**. Run `[the collision check]`          <- collision
first.                                                                            control

ENVIRONMENT: `[bring up the isolated environment]` (migrations run            <- how to run it
automatically).

VERIFY BY OPENING THE FILE. ... Asserting on bytes is not enough here.       <- evidence bar

DO NOT MERGE. Push, open the PR with the three-lens body, stop. I merge      <- hard stop
with `node scripts/merge-pr.mjs <n>`.

Report: PR number, the fee-schedule column choice, what you did about        <- report
sensitive fields, how you handled formula injection and leading zeros,          contract
csv vs xlsx and why, and what you saw when you opened the file.
```

Note the evidence bar. "Asserting on bytes is not enough here" pre-empts the
review finding that would otherwise cost a round trip, because a spreadsheet's
whole failure mode is what a spreadsheet program does to the bytes once it has
them. Setting the bar in the brief is cheaper than discovering it in review.

## Tell them you might be wrong

Three things belong in every brief and all three are about your own fallibility.

**The artifact wins over the brief.** One orchestrator said there were "9
fee-schedule fields"; the spec had 8. Another briefed an agent about a constant
removed weeks earlier. Both agents checked and said so, which is the outcome you
want, but only because contradicting the orchestrator was explicitly expected.

**The issue might be stale.** An issue is a claim made at a moment, and the
moment passes. One said staff pages preloaded a font they never used; by the
time anyone worked it the premise was false in two independent ways, and the
right outcome was to close it. Say that checking the premise is part of the job,
or you get the change you asked for whether or not it was still needed.

**Read the file before you brief from it.** Briefing from memory of the repo is
where the wrong counts come from.

## The contract underneath

The agent has zero conversation context, so the brief is self-contained. Pass
artifacts **by path**, never pasted into the prompt body. Say explicitly whether
this is "write code" or "research and report".

**Never delegate understanding.** "Based on your findings, fix the bug" pushes
synthesis onto the agent. A brief naming the exact file and the exact change
proves the understanding is already on your side.

Constrain what comes back: evidence references (`file:line`), a state flag of
done / partial / blocked with the reason, and a length cap.

## Issues are briefs that outlive you

Same anatomy, plus the failure **in the owner's words** where you have them,
a "watch out for" section, and evidence if you have it. One issue opened with a
three-line transcript showing `"0111"` going in and `111` coming out. Nobody
argued.

When an agent finds something it cannot fix in place, file it with **their**
diagnosis, not your summary of it. If two agents file the same thing, keep the
better framing and close the other into it.

If an instruction of yours turns out wrong, correct it where the next person
will meet it. One project told an agent a staff portal should "stay plain";
that was too absolute and produced the one unstyled surface, so the correction
went into the body of the follow-up issue rather than staying a remark in a
conversation nobody would read again.
