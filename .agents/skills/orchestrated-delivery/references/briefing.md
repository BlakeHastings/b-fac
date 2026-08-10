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
- **The evidence bar, concretely.** Not "verify it works" but "seed an
  applicant with electrical work only and confirm plumbing reads as not
  applicable rather than four blank fields." Required rather than optional, and
  the only element here with a measurement behind it instead of an anecdote. Its
  own section is below.
- **Do not merge**, naming the sanctioned command as your job.
- **What to do with a question**, because an agent that blocks on one is worse
  off than you are: you are right there and could have answered it. Tell it to
  take the most defensible reading, carry on, and report the assumption under
  its own heading. A blocked agent holds a worktree open for nothing.
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

## The evidence bar

Note the evidence bar in that brief. "Asserting on bytes is not enough here"
pre-empts the review finding that would otherwise cost a round trip, because a
spreadsheet's whole failure mode is what a spreadsheet program does to the bytes
once it has them. Setting the bar in the brief is cheaper than discovering it in
review.

It is also the one element here that has been measured. Of 240 briefed agents,
41 were given an explicit bar. Those agents took a screenshot 66% of the time
against 19% for the rest, took 3.0 screenshots on average against 0.9, and
reported in first-hand proof verbs ("I opened", "I saw") 66% of the time against
44%.

Read that as an association, not a proven cause: an orchestrator who writes a
bar is probably briefing better in every other way too. It is a large effect and
it holds across three independent measures, which is enough to make it required
here and not enough to call it settled.

Bars of that shape:

- "Verify by opening the exported file in a spreadsheet program. Asserting on
  bytes is not enough here."
- "Seed an applicant with electrical work only and tell me what the plumbing
  section renders, not what the template says it should render."
- "Submit the intake form with licence number `0111` and report the exact value
  that reaches the database, not that the submit succeeded."

**A bar the agent cannot meet produces theatre instead of proof.** Name
something it can actually do where it is running. Asking for a screenshot from a
worktree with no browser buys you a paragraph explaining the absence, which is
the round trip the bar existed to save. When the environment is thin, lower the
bar to what it can reach: the request log, the row it wrote, the file on disk.

## Name what would prove you wrong

Telling an agent it may contradict you does not produce contradiction. Across
240 transcripts, 7 reports contradicted a stale brief or issue and were right:
"the brief's premise is stale", "the issue does not reproduce". None of those 7
briefs invited disagreement. Twenty briefs did invite it and produced none.
Twenty is not a large number and the invitation is cheap, so this is not proof
that saying it does nothing. What is clear is that something else did the work.

That something is **a named artifact with a checkable claim in it.** One
orchestrator said there were "9 fee-schedule fields" and pointed at the spec;
the spec had 8, and the agent said so. Another briefed an agent about a constant
removed weeks earlier, and named the file it was supposedly in. Given something
to check, agents checked it. Given permission to disagree, they did nothing with
it.

So write the check rather than the invitation:

- **The artifact, by path.** The spec, the migration, the file you counted from.
- **The claim it should confirm.** "I am asserting 9 fee-schedule fields, and
  that number comes from the spec rather than from the code."
- **What to do when they diverge.** Usually: the artifact wins, stop, and report
  the mismatch before building against either. Say which, because "follow the
  artifact" and "flag it and keep going" produce different work.

If you are briefing from memory, the file you did not open is the artifact to
name: say where the claim came from and make checking it the agent's first task.
That is not a licence to skip reading it, and it still beats a general
invitation to disagree, because it points at something.

Two more that have not been measured separately:

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
done / partial / blocked with the reason, and a length cap. Both of the last two
measure about as cleanly as the evidence bar. Briefs that demanded a state flag
got one 80% of the time against 23% for the rest, and briefs with a cap came
back at a median 2,120 characters against 3,902.

**The cap is on the report, not on the work.** All 20 of the longest transcripts
in that corpus were screenshot-driven: long meant the agent drove the app, not
that it wandered. Cap the write-up and raise the evidence bar in the same brief.
They pull in opposite directions on purpose.

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
