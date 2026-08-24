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
- **The evidence bar, concretely, and bounded.** Not "verify it works" but "seed
  an applicant with electrical work only and confirm plumbing reads as not
  applicable rather than four blank fields." Required rather than optional, and
  the only element here with a measurement behind it instead of an anecdote.
  Bounded means it also names what the agent may not touch to get there. Its own
  section is below.
- **Do not merge**, naming the sanctioned command as your job.
- **What to do with a question**, because an agent that blocks on one is worse
  off than you are: you are right there and could have answered it. Tell it to
  take the most defensible reading, carry on, and report the assumption under
  its own heading. A blocked agent holds a worktree open for nothing. This is
  the open question nobody has answered, not the artifact that contradicts your
  brief, which stops. Say which of the two you mean.
- **The report contract**: which decisions to report back, not a narrative.
  Include "say whether your context was compacted during the run", for the
  reason two sections below.

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

**Part of that list is derivable, and it stays anyway.** A spec is governed by
one rule, and reading order and what already exists by name plainly fail it: can
an agent derive this from the repository and its history, and if so, leave it out
(`references/refinement.md`). The rule holds. What changes is who pays. A spec is
written by the owner, whose hour is the scarce thing and whose reader is an
orchestrator with the repository open. A brief is written by an orchestrator who
has already read the repository, for an agent whose context is the scarce thing
and whose context running out is the failure three sections below. Pre-deriving
moves work off the budget that fails onto one that has already been spent.

**The traps never met that rule in the first place.** All four above turn on what
something outside the repository does: a viewer with an unset flag, a scanner
with a link, a framework with a loader's return value, a spreadsheet with a
leading `=`. No amount of reading the repository produces any of them. So the two
documents disagree about file names and reading order and about nothing else, and
what carrying those costs is never redundancy. It is being wrong about them,
which is the last rule in "Name what would prove you wrong".

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

**A bar it can only meet by exceeding its authority is worse than a weak one,
because a good agent will meet it.** Theatre is visible in the report; overreach
is not. One brief asked for a branch deliberately behind the default branch,
carrying green checks from its old base, so the merge wrapper could be watched
refusing it. That state cannot exist without a ruleset enforcing strict
up-to-date checks, so the only route to the evidence ran through the
repository's configuration, and the brief named nothing as out of bounds. The
agent took the least destructive route available, isolated the probe to a
throwaway base, disclosed it unprompted and cleaned up afterwards. It behaved
about as well as it could given what it was asked. The defect was in the bar.

So a bar carries two things and not one:

- **What the agent may not touch to satisfy it.** Repository and CI
  configuration, rulesets, branches other than its own, other people's pull
  requests, anything shared, deployed or billed. Name them beside the bar, where
  a briefer is already standing, rather than in a general safety paragraph
  somewhere above.
- **Your own check that the bar is reachable inside those bounds.** Walk the
  route before you write it: what would the agent actually run, and does any
  step of it need something on that list? The bounds are worth exactly what
  asking this is worth, and asking it takes a minute.

**Walk it as far as the data, not just the environment.** A bar naming something
on a screen quietly also requires whatever rows make that thing appear, and "the
app is running" does not imply "the row exists". One bar asked for proof that a
particular column of the permit queue rendered its status badge. The column reads
from a store no environment reachable from a worktree has rows in, so the queue
came up empty and the cell template never ran. The property that mattered was
*does the badge component render a status at all*; written as *does this column
render one*, it additionally demanded a data condition nobody could reach. The
property was provable and was in fact proven, at a site the agent picked for
itself. **Name the property, not the site**, and the rows stop being part of the
ask.

Both, in one bar:

- "Prove the intake API refuses a permit number that already exists. Build the
  duplicate in your own local database: do not touch the shared staging
  instance, the deployment config, or any branch but yours to construct the
  condition. If it cannot be built inside those bounds, stop and tell me what it
  would take."

Then say what to do when the two collide. **Stop, report the bar as unreachable
inside its bounds, and name what reaching it would need.** Say in the brief that
stopping there is a success, because an agent that does it has found a defect in
your brief, and that is worth more than the evidence would have been. Without
that sentence the same agent reads stopping as failing the task, and goes
looking for a route.

**None of this makes infrastructure off limits.** Some conditions only exist in
real infrastructure, and the simulated substitute hides the thing you were
looking for. The run above found two defects that editing the script's inputs
would have sailed straight past: a parser dropping a field it should have kept,
and a force-push leaving the merge state blocked against a check rollup that was
already stale. When the proof genuinely needs a live gate, say so, say who sets
it up, and say what comes down afterwards. Bounded is not the same as small.

**A mutation proof shows a check has teeth today; a scan-integrity test keeps it
having teeth.** Ask for both whenever you are commissioning a check that works by
scanning rather than by compiling. The first is the familiar one: break the thing
on purpose, watch the check go red, fix it, watch it go green. The second pins the
scan itself, that it sees a known-present case, does not see a known-absent one,
and reaches more than N sites. It guards a failure this skill's own repository has
shipped, where a check passed while scanning none of the files it existed to
protect, because the list it built had quietly stopped including them. A check
asserting over an empty set passes for ever and proves nothing, and a mutation
proof taken on the day it was written does not catch it. One agent added the
second half unasked; it is cheaper to ask.

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

**The same rule, for an adversarial brief: name the failure to construct, not
the disposition to adopt.** "Assume this is wrong and find problems" is an
invitation, and invitations get you taste. "Construct a lockout using role
deactivation, bundles, or a split key set" names an artifact the agent either
produces or reports it could not. It is the rule above with the claim inverted:
not "confirm this count", but "build this failure". One such brief named six
specific attacks; the agent built three, one of them a sequence nobody had
reasoned about. Name more attacks than you expect to land, and say that "I tried
to build this and could not, and here is what stopped me" is a result. Without
that, an agent who fails to construct yours goes looking for something else to
call a finding. `references/reviewing.md` has what the pass is for.

Two more that have not been measured separately:

**The issue might be stale.** An issue is a claim made at a moment, and the
moment passes. One said staff pages preloaded a font they never used; by the
time anyone worked it the premise was false in two independent ways, and the
right outcome was to close it. Say that checking the premise is part of the job,
or you get the change you asked for whether or not it was still needed.

**Read the file before you brief from it, and re-derive a count with the command
you are about to write down.** Briefing from memory of the repo is where the wrong
counts come from, and having read the file is not enough on its own. One brief
asserted 14 call sites; there were 15. Both numbers came out of the same terminal
minutes apart, from two variants of one question: the per-file breakdown had
covered two file extensions and the total that reached the brief had covered one.
Nothing was broken and the check answered exactly what it was asked. The defect
was that two variants were live in a single investigation and the narrower answer
got quoted as the broader one, which put the extra site in the excluded extension
where no later sweep of the narrower kind could ever have found it. It has since
happened again, to an orchestrator counting this project's own epics: 7 of 13 off
the `Parent: #N` lines in the bodies, 24 of 30 off the sub-issue edges, one
minute apart in one terminal. Twice is a property of the system. **Scrolling up
to a number is not re-deriving it**, and neither is asking the question a second
way.

## The brief has to survive the agent's own compaction

A dispatch message is said once. An agent that works for an hour fills its
context, the harness replaces the conversation with a summary, and **the
summariser keeps the shape of the brief and loses the specifics**: the evidence
bar, the files it was told not to touch, the artefact it was told to check. The
agent carries on. It reports confidently. What you get back is a good-faith
answer to a slightly different question, and it reads like an agent that did not
read carefully.

Nothing carries a brief across that boundary. What does reach a compacted agent
is whatever the `SessionStart` hook prints, and the block this skill ships uses
it to say "your brief is the issue, re-read it" (`references/continuity.md`,
measured). That is a pointer, not the brief. **It only works if the brief is
somewhere to point at**, which costs three lines and no machinery.

- **Put the durable half in the issue**, not in the dispatch message, and name
  the issue in the brief as the thing to re-read. This is the same move as
  "pass artifacts by path", applied to the brief itself. An agent that can
  re-read the issue recovers the scope, the traps and the bar; one holding them
  only in a compacted context cannot.
- **Say what a continuation summary obliges.** The agent can tell this happened:
  the summary it is holding opens with "This session is being continued from a
  previous conversation that ran out of context". Tell it that finding those
  words means re-reading the issue and the named artefacts **before** it reports,
  and that doing so is expected rather than an admission.
- **Ask for it in the report.** One line: did your context compact. It is a
  cross-check, not the detection, because the report is the artefact under
  suspicion. The detection is the transcript, and it is the reviewer's.

Scope is the other half of this, and it belongs in the dispatch decision rather
than in the brief: an agent given twelve files to read and a narrow question is
a compaction waiting to happen. `references/parallelism.md`.

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
