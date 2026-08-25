# Handoff

**Written 2026-08-25, at `d22d22e`, version 0.45.0.** Fourth edition. The third
was written 2026-08-24 at `1a01485` and version 0.38.0, and was overtaken inside
a day: four merges, a reversed decision record, and a trap note of its own that
turned out to be the thing that misled the next orchestrator.

A snapshot, not a source of truth. Everything durable is in the issues, the
ADRs, and `orchestrating.md`; this exists only to say where the work stopped and
what a successor would otherwise reconstruct. If it disagrees with the
repository, the repository is right.

## Where things stand

This session opened at `1e0bdc4`, version 0.41.0, with **one pull request open
that had never had a green check across seven pushes**. It stands at `d22d22e`,
version **0.45.0**, after six merges, with `npm run check` green and
`assets/check-setup.mjs` exiting **0 for the first time in this repository's
history**.

| Epic | Closed | |
| --- | --- | --- |
| #4 Skill effectiveness | 33 of 44 | the live one, and it grew by fifteen this session |
| #60 Own the process, or guest in someone else's | 19 of 26 | |
| #3 Harness coverage | 5 of 7 | |
| #5 Distribution | 6 of 7 | |
| #27 Agent visibility | 0 of 3 | parked behind #28, deliberately |

**Count epics from the edge, never from the `Parent: #N` body line**, and the
last edition's warning was not strong enough. The orchestrator filed nine issues
this session, wrote `Parent: #4` in every one, and created **zero edges**; two
more filed by agents had the same gap. The count read `30 of 31`, which looks
like an epic nearly finished; the truth was `31 of 40`.
The line does not merely fail to earn its place: **writing it feels like doing
the thing it describes.** Measurement and both commands are on #87.

`gh` here is 2.88.1, below the 2.94.0 that `--add-sub-issue` needs, so use the
API form in `references/github-backlog.md`. It takes the child's internal `id`,
not its number.

## What happened this session

**The version line is the binding constraint on parallelism here, and nobody
knew.** PR #147 sat across seven pushes with no green check, three of its commits
empty ones pushed to nudge CI. The only conflict with `main` was one line, the
version in `plugin.json`, and while a pull request conflicts the forge stops
recomputing its merge ref, so `pull_request` runs are never dispatched. The
branch was dark rather than red, and an absent check reads exactly like a queue
that has not reached you. #151 has the measurement, #161 landed the advice, #105
closed with it.

Two corrections to that finding, both from agents checking rather than believing:

- The merge ref is not absent, it is **frozen**, at exactly the last sha that got
  a run. `git ls-remote` shows it present, so a casual check reads as refutation.
- Two of the three nudge commits **did** produce runs, both only because `main`
  had just released the number the branch was holding. That is #105's quiet case
  arriving by accident, and the one state in which the version check must fail.
  **That branch's CI could start only when it was certain to be red.**

**ADR 0001 was reversed on evidence, by #159 and ADR 0051.** Layer 3 was
deliberately absent on the argument that a ruleset with no bypass actors makes a
direct-push commit impossible. A ruleset is mutable configuration outside every
checkout, and a token that can merge can disable it, push, and restore it leaving
nothing behind. The audit found two real commits above the baseline, both
verified independently as bootstrap commits from before PR #1 existed. The
baseline sits **below** the finding rather than on the line that would have
hidden it, which was the real test of that task.

**The owner has not assented to that and should.** The weaker half of the
argument is a threat model whose actor is the owner, and a control aimed at the
owner's own bypass is a thing to agree to rather than discover. The stronger half
is not a threat model at all: three documents asking readers to ignore a standing
red line failed at least three times, most recently on the orchestrator.

## In flight right now

**Each brief is a comment on its issue rather than in the dispatch message**, so
an agent that compacts recovers it with `gh issue view <n> --comments`. Keep it.
It was load-bearing twice this session.

**Landed**, in merge order, `main` from 0.41.0 to **0.45.0**:

- **#147** (#135), the command-substitution probe hole. Unblocked by diagnosing
  the version line rather than nudging CI a fourth time.
- **#161** (#105 with #151), the version-line advice, both directions.
- **#158** (#149), `scripts/check-bodies.mjs` and ADR 0050. Detection for the one
  body-carrying call `post-body.mjs` cannot reach, which is creation.
- **#159** (#152), layer 3 and ADR 0051, above.
- **#169** (#160 with #153), five defects in the shipped enforcement assets. Layer
  3 now reads a workflow's `on:` block rather than its whole text, and the report
  prints the probe belonging to the guard actually installed. Verified end to end:
  the printed line is refused in a session where the guard is loaded, where the
  old one ran and exited 0 in silence.
- **#168** (#164 with #165), `post-body.mjs comment:<id>` and ADRs 0052 and 0053.
  The detector now prints each finding's own repair command and says how far it
  looked.

**Dispatched:** **#163**, repairing the seven blanked comments, against the
target #168 built for it. Its first brief was wrong twice and both errors are
recorded on the issue: it named a tool that cannot edit a comment, and it set a
success condition reachable by waiting.

**Held, briefs already written:** **#156**, which is the general form of the
mistake this session made. **#157**, **#162**, **#170** and **#171**, all
waiting on nothing but a dispatch.

**#170 and #171 are the sharpest of those.** #170 is a false `ok`: a workflow
naming the audit only in a comment reads as running it, so a repository is told
it has a detection layer when what it has is a comment. #171 partly undoes #169,
because the probe line is now derived from the guard, which only helps when the
guard sits where the hard-coded constant says.

**Expect a rebase chain.** The ruleset has `strict_required_status_checks_policy`,
so every merge puts every other open pull request `BEHIND`. Rebases belong to the
branch owner. **Sequence deliberately and say which branch is second**: this
session put #158 ahead of #159 so their shared conflict in `AGENTS.md` and
`package.json` fell to one branch once rather than to both.

## What needs the owner

`needs-owner`, all with recommendations: **#14** a marketplace listing, **#28**
the visibility surface, **#57** paying for usage testing, **#87** the
`Parent: #N` line, which now has this session's eleven-for-eleven failure under
it.

**#150 is the live one**: the operator's standing rule forbids em dashes and this
repository's shipped prose is full of them. Every artifact written this session
follows the rule, so the seam is not growing, but it is a seam and every agent
has to be told which side of it they are on. Three options and a recommendation
are on the issue.

**#141** remains: whether the `PreCompact` refusal should be wired into this
repository's tracked settings, which would refuse the owner's own manual
`/compact`. Recommendation is yes, after #145.

## Dispatchable now, in the order I would take them

**#145** and **#134** first, because both were dispatched in the previous session
and produced nothing, so the briefs are written and the work is untouched. Then
**#130**, **#112**, **#114**, **#93**, **#91**, **#64**, **#7**.

**#134** is still the sharpest of those: what should a report do when it holds a
strong hint it cannot trust? Its own lean is "suppress rather than switch",
weakly held. Read #131 and #133 first, and do not let a per-checkout legacy
record set the repository's mode. That inversion is what ADR 0037 prevents.

**#151** keeps its mechanism question open even though #161 landed its advice.
The recommendation is direction 2, moving the bump out of the branch, with a hole
that must be closed first: `merge-pr.mjs` is a convenience and not a control, so
a bump living only there demotes the guarantee to a habit.

**Blocked, with reasons:** #78 and #79 behind #28. #123, where per-repository
factory state lives. #163 behind #164.

## Traps that cost something

Carried forward where still true, and the last four are new this session.

- **`gh --body @-` writes the literal string `@-`.** It is a `curl` convention;
  `gh` takes `--body-file -`. The call exits 0 and prints a URL, and
  `gh issue view --comments` renders the stored body as `@-` with no sign
  anything is wrong. Eight artifacts were written empty this way in one session.
  Fixed in #148: **post through `scripts/post-body.mjs`**, which reads the
  artifact back and fails when it differs. ADR 0049. Creation is covered by
  detection instead, `check:bodies`, ADR 0050.
- **The handoff's staleness is mtime, and every worktree resets it.** A twelve-day
  old file reads as under an hour old in a fresh worktree, and `mergesSince`
  counts from the same reset value, so both clocks say fresh at once. #145.
- **`gh issue list --jq` is gh's own jq and does not accept `--arg`.** It also
  reads `\b` in a bash single-quoted expression as a backspace, so a `test()`
  filter returns zero matches and looks like a real answer. Compare a structural
  count against a case you know before believing it.
- **`assets/check-setup.mjs` exits 0 here, as of #159.** Layer 3 was deliberately
  absent under ADR 0001 and is now installed under **ADR 0051**.
  `npm run check:provenance` audits the whole history and is red on purpose,
  naming two commits from 9 August that predate the ruleset. The workflow judges
  only what each push adds, so it is green until a real violation.
- **A session that ends mid-flight leaves worktrees locked onto its branches.**
  Ten were inherited, five locked, four holding branches this session needed,
  including the only open pull request's. The first dispatch failed on it.
  `references/parallelism.md` covers cleanup after an agent *finishes*, which is
  the case that did not happen. #154.
- **Three dispatches from the previous session produced nothing**, while the
  handoff listed them as in flight. Two had zero commits; one had a commit that
  existed in a single clone and had never been pushed, now preserved at
  `origin/skill/105-version-line-no-conflict`. **Check branches before believing
  a handoff's in-flight list**, this one included.
- **A shared scratchpad path bypasses `post-body.mjs`.** It reads the file once
  and compares those bytes, so the read-back is sound, but the two-step is two
  processes reading one mutable path: it posts the wrong body and verifies it
  truthfully. Give every agent a path inside its own worktree. #162.
- **`post-body.mjs` could not edit a comment**, while `check-bodies.mjs` told you
  to use it on comments. Both the repair instruction on #163 and the detector's
  own closing advice named a route that did not exist. Fixed in #168, ADR 0052:
  `comment:<id>` replaces in place, and **`issue-comment:<n>` still appends**, so
  confusing the two leaves a stray comment behind. It happened twice here.
- **A detector with a bounded window goes green by attrition.** #163's original
  success condition was an exit code that would have arrived on its own. The
  scan reached back to #82 when the work started and to **#87** by the time the
  tool was fixed, leaving one of its own seven findings on the boundary. #168
  makes every scan state how far it looked, ADR 0053, and **`--all` is the run to
  quote**, five seconds over the whole history. Pinning was refused with an
  argument rather than waved away.

## Mistakes the orchestrator made, kept rather than tidied

Three, all recorded on the issues themselves.

- **Filed #152 against a decision already recorded in three places**, having run
  the tool that morning. The tool is why: ADR 0001 lived in it as a source
  comment at line 31 while its runtime output at line 847 ended with an
  instruction to do the forbidden thing. That is #156, and it is the reusable
  half.
- **Killed a good agent on an assumption.** On finding ADR 0001 I stopped the
  agent mid-task, believing it was making my mistake. It had already found the
  ADR and written the superseding argument. **Read the work before stopping the
  worker.** Nothing was lost only because it had pushed nothing.
- **Handed out an ADR number checking only `main` and open pull requests.** Two
  agents took 0050, one in an unpushed worktree. `check:collisions` catches it
  against the merge result, which is the mechanism working, but it cost a
  renumber, and a blind `sed` over the number would have rewritten the other
  branch's legitimate citation.

## How this owner works

Unchanged, and still not written down anywhere else.

- **Keep working while questions are outstanding.** Their words: *"your objective
  is to keep working even when you need to ask me questions unless there's no
  work that can be done without questions being answered."*
- **Ask in prose, never with a blocking multiple-choice tool.**
- **They contest things, and they are often right.**
- **The question whose answer changes the design is worth asking three times.**

## What the agents keep teaching

Carried forward, and this session is the strongest evidence yet: **the agents
corrected the orchestrator far more often than the reverse**, and always the same
way. The brief named a specific artefact to check, and checking it disproved
something in the brief.

This session, in order: the claim that `main` had moved under #147's guard files
(zero bytes had), the prose saying three nudge commits could never have worked
(two did), the framing of the scratchpad hole (the read-back is sound, the
two-step is not), the whole premise of #152 (already decided against), and the
repair instruction on #163 (impossible with the tool it named).

So the highest-leverage thing the next orchestrator does is **write briefs that
can prove the orchestrator wrong**, and then **verify what comes back by running
it rather than by reading it**. Every merge this session was preceded by
re-running the agent's own measurement with a different case list, and one of
those re-runs is the only reason #162 exists.
