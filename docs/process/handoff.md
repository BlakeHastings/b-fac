# Handoff

**Written 2026-09-25, at `f45a658`, version 0.54.1.** Fifth edition. The fourth
was written 2026-08-25 at `d22d22e`, version 0.45.0, and sat a month while
everything it listed as in flight landed or closed.

A snapshot, not a source of truth. Everything durable is in the issues, the
ADRs, and `orchestrating.md`; this exists only to say where the work stopped and
what a successor would otherwise reconstruct. If it disagrees with the
repository, the repository is right.

## Where things stand

`main` is `f45a658`, **0.54.1**, CI green, `npm run check` green locally (811).

| Epic | Closed | |
| --- | --- | --- |
| #60 Own the process, or guest in someone else's | 20 of 27 | |
| #3 Harness coverage | 5 of 7 | |
| #5 Distribution | 6 of 7 | |
| #27 Agent visibility | 0 of 3 | #183 is the first real answer to #28 |

#4 Skill effectiveness is closed. **Count from the edge, never from a
`Parent: #N` line**; #87 has why.

Between the editions, 0.45.0 to 0.54.0: the fourth edition's held briefs all
landed on 25 Aug (#156, #157, #162, #163, #170, #171, #174, #176), then #181
(`assets/machine-load.mjs`, read the box before a wave) on 7 Sep and #192
(compaction at 85%, a warning ten points before, resume from this file) today.

**Topped up twice on 2026-09-25, last at `387942f`, 0.54.12.**

Merged this session, each verified independently before merge (the review record is on each PR):

- **#194** (#193) paths compared by what the filesystem calls them: an 8.3 short name is not a second directory. `guard-guest-writes --scope` had **failed open** on it.
- **#197** (#185) the command-reader region carries a hash stamp, and the check fails when the code changes without it. ADR 0061.
- **#198** (#184) machine-load names a session's scratch work.
- **#207** (#180) three assets found "the repository" by looking for a `.git` directory; they now ask git.
- **#208** (#199) the merge guard let `gh api --silent .../merge -X PUT` through. One `ghApiCall` in the stamped region; ADR 0062. The guest gate had three holes of its own, all closed.
- **#209** (#200) `merge-pr.mjs` tested in both copies, and refuses what it cannot see. ADR 0063. **The shipped copy deleted the base repository's branch named after a fork's head**, so a host repository with an older copy can lose its `main`.

Then, in the second half of the day:

- **#213** (#210) the merge guard refuses the GraphQL merge mutations (`mergePullRequest`, `enablePullRequestAutoMerge`, `enqueuePullRequest`, `mergeBranch`), any GraphQL query it cannot read, and REST `merge-async`, which #208 had missed. ADR 0064. **Four distinct routes past the merge guard were allowed on this morning's `main`**, which is the evidence under #189.
- **#214** (#205) `merge-pr.mjs` reads the required checks from the ruleset, and never falls back to an empty list. ADR 0065.
- **#212** (#202) shipped text cites `b-fac ADR NNNN` and `BlakeHastings/b-fac#N`, and `check:citations` fails on a bare one. `guard-guest-writes.mjs` holds 8 bare citations under a `PENDING` entry, folded into #201.
- **#215** (#206) the provenance baseline moved past the two 9 August commits. A bare `check:provenance` now exits 0. ADR 0066.
- **#216** (#204) twelve ADR status lines point at what changed them, and `check:collisions` fails on a declared change that is not pointed back to.

**In flight:** #201 (the helpers copied outside the stamped region, the GraphQL rule #213 duplicated, and the 8 pending citations; **0.54.13**). Its brief is on the issue. **#203** (trim `SKILL.md`) waits for it, because both would edit `references/enforcement.md`.

**Adversarial review, 2026-09-25**, asked for by the owner: four read-only agents covering code, skill and docs, process, and factory-CLI prior art. The reports are **outside the repository** at `C:\Users\bhastings\source\repos\personal\b-fac-critique\`. The findings kept became #199 to #206 and #210. The headline: **omitting `version` is supported** and would remove the version line, which is on #151 with a recommendation. Refuted: the three reader copies, the no-dependencies rule for assets, making the mirror a symlink, and the skill's style.

## Open pull request

**#183, factory observability** (`factory-observability`, two commits, 7 Sep).
CLI, `/factory` commands, a plugin hook on five lifecycle events, a local page,
ADRs 0056 to 0058. `CONFLICTING` and at 0.52.0, so it needs a rebase and a
re-bump. **No review record yet.** It is the first thing that ships hooks into
every installer's sessions, so it wants a full review, not a rebase and merge.
Its own "not done": the page was never opened in a real browser.

**The owner rejected its decisions on 2026-09-25**, in their words: *"I don't like
the decisions made for that. We need to use proper um, CLI framework for that."*
And the CLI is a channel as well as a view: *"we will use the CLI for
communication via the agent out as well ... when the agent is uh, waiting on
something from the user, it needs to be able to ... put that on a queue that we
can see in the front end."* That is the larger work, and it is in refinement as **epic #196**, whose comments carry the owner's answers (same machine or several; transport is Claude Code's own messaging between sessions; Node and TypeScript) and a proposed design awaiting confirmation. **`CLAUDE_CODE_SESSION_ID` does reach a Bash call**, which undoes #183's ADR 0057 premise. Do not rebase or merge #183 as it stands.

## The field reports of 7 and 8 September

Filed from other repositories (`dbmd` among them), and the sharpest unworked
material here:

- **#189** an agent merged its own PR. Constraint 2 has never had a control.
- **#188**, **#182** force flags destroyed uncommitted work three times in a
  day, the owner's own layout edits among it; `git diff HEAD` hides untracked
  files.
- **#186** running the suite during a wave produced 27 failures from CPU alone.
- **#187** an agent worktree gets an empty `node_modules`.
- **#185** the shipped guard tells a host repo a test watches its copy.
- **#184** machine-load buckets a session's own scratch work as unknown.
- **#180** a test assumes a temp directory sits outside any repository.

## What needs the owner

`needs-owner`: #14, #28, #57, #87, #141, **#150** (em dashes versus the
operator's style rule), and **#151** (omit the plugin version; recommendation yes).
**#196's design** also waits on the owner. The larger piece of work the owner raised on
2026-09-25 is the factory CLI rework above.

## Dispatchable

#203 once #201 lands, then the field reports above, then #134, #130, #151, #154, #112, #114, #93, #91,
#64, #7. Blocked: #78 and #79 behind #28, #123.

## Traps that cost something

Carried forward from the fourth edition, all still true, plus two new at the top.

- **Remove a worktree only after the merge line prints.** Twice on 2026-09-25
  the orchestrator removed an agent's worktree in the same command as a
  `merge-pr.mjs` run that then refused: once on a pending check, once on a
  branch behind `main`. Nothing was lost only because the work was pushed. The
  second time cost a fresh agent to rebase. Gate the removal on
  `grep -q '^Merged into main'` against the wrapper's output.
- **`gh` may be logged in as the wrong account.** This machine holds two, and
  the work account `bhastings-t3` has read on this repository. With it active,
  `gh issue create` succeeds (issues need only read, so #193 carries the wrong
  author), while `gh pr create`, the sub-issue edge and `merge-pr.mjs` fail. A
  sub-issue POST with its errors discarded fails in silence. Run `gh auth status`
  before the first outward write, and never discard the error from an edge.
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
  A bare `npm run check:provenance` exits 0 since #215 moved the baseline past
  the two examined 9 August commits (ADR 0066), so any red from it is real.
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

Unchanged. The first two are also rules in `SKILL.md`, under "Working without the
owner" and "How to ask"; the last two are written down only here.

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
