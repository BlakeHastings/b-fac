# 0071. A merge around the wrapper is detected by the trailer it did not write

Status: accepted

Issue #189. Extends ADR 0051 (the provenance audit) and ADR 0066 (its
baseline). ADR 0063 is why both copies of `merge-pr.mjs` change together.

## Context

"Agents do not merge" had one mechanical layer behind it, the merge guard, and
on 2026-09-25 five routes past it were found in one day: a `gh api` flag that
hid the endpoint, an unknown flag, a GraphQL `mergePullRequest` and its
relatives, the `merge-async` endpoint, and the command name spelled with its
extension. Each was fixed, and each was found by somebody looking, never by the
guard failing loudly. The field incident in #189 was not even one of them: the
agent used the permitted route.

The provenance audit cannot see any of these. It asks whether a commit on
`main` belongs to a merged pull request, and a merge by an agent is still a
merge of a pull request. So nothing on the result distinguished a merge taken
through `merge-pr.mjs`, which checks the required checks and the branch's
freshness first, from one taken around it.

The decision was made before this was worked: the guard stays and keeps
improving, but it is not the control. The control is detection on the result.

## Decision

**`merge-pr.mjs` writes a trailer into every squash it makes:
`Landed-by: merge-pr.mjs`.** Both copies, as a shared body.

Passing a message replaces GitHub's default one wholesale. That is true of
the REST merge endpoint this script uses, and of `gh pr merge --squash --body`
on gh 2.101.0, which sends `commitBody` to the `mergePullRequest` mutation only
when `--body` or `--body-file` is given and otherwise leaves GitHub to build
the default. This repository's squash settings are `PR_TITLE` and `PR_BODY`, so
the script rebuilds what the default held: the title with ` (#n)`, the PR body,
and the `Co-authored-by` lines of the PR's commits. The trailer and those lines
make one trailer block, which is what git's trailer parser reads. The body is
sent in a file through `gh api --input`, because a PR body can outgrow a Windows
command line.

Two things GitHub's default did and this does not. It hard-wrapped the body at
about 72 columns, and it sometimes put a `---------` line above the
co-authors. Neither carries information, and a merge message that keeps the
body's own lines is easier to read, not harder.

**The provenance audit requires the trailer above a new, explicit baseline,
`TRAILER_BASELINE`,** read with `git log --format=%(trailers:key=Landed-by)`,
so it costs no API call and counts only a trailer in the closing trailer block,
not the same words in the prose. Here it is
`5b9f8f1357fe06fee2cfe9f1df0b65f461922dce`, `main`'s head when this was
written and the last commit landed by a `merge-pr.mjs` that did not write the
trailer. Nothing at or below it is asked, because no commit there could have
carried it.

**The two findings are reported apart.** A commit with no merged pull request
is ADR 0051's finding and keeps its heading. A commit through a merged pull
request but without the trailer is printed under "A pull request reached main
without going through merge-pr.mjs", with the PR's number and what to do. A
commit that is both, a direct push without the trailer, is reported only as the
first: the trailer adds nothing to "no pull request at all".

**In the asset, `TRAILER_BASELINE` ships as `BASELINE`,** not as a second
placeholder. A repository installing the audit and the wrapper together has
the trailer on every commit above its baseline, so the two lines are the same
line and there is nothing new to set. Only a repository whose audit predates
its wrapper's trailer, as this one does, sets it. `BASELINE` in the asset stays
the installer's placeholder, as #215 left it. The copy test now allows exactly
these two lines to differ.

## The limit

**The trailer catches an accident, not an adversary.** Anyone can type
`Landed-by: merge-pr.mjs` into a merge message, through the UI or `gh pr merge
--body`, and the audit cannot tell. That is the right target: #189's incident
was an accident, and so is every guard bypass above, an agent reaching for the
ordinary command. An agent deliberately forging the trailer is a different
problem, and no amount of text in a commit solves it.

It also still runs after the fact. By the time it is red, the merge has
happened.

## Consequences

**A human merging in the GitHub UI now turns the audit red.** That is intended:
landing is the orchestrator's, through `merge-pr.mjs`. `AGENTS.md` says so
among its invariants, where the next person will meet it before the red run.

**`TRAILER_BASELINE` has to be `main`'s head when this lands, not before.** Any
commit landed between that head and this change's own squash went through the
old wrapper and has no trailer. So if `main` moves while this is open, the
branch takes `origin/main` and the constant, this ADR and its test move with it.
This change's own squash is the edge case: if the orchestrator lands it with
`main`'s current `merge-pr.mjs`, that commit has no trailer and the push run
reports it. Landing it with the branch's own copy of the script avoids that.
Either way, the first merge after it is the live test: it goes through the new
wrapper, must carry the trailer, and the `provenance` run on that push must be
green.

**Verified here:** a mutation that drops the trailer from the merge message in
`scripts/merge-pr.mjs` turns both of that copy's trailer tests in
`scripts/merge-pr.test.mjs` red, and one that makes the asset audit accept every
commit turns the three trailer findings in
`scripts/check-main-provenance.test.mjs` red, along with the drift test. The audit, run over a scratch
range holding one commit whose message `merge-pr.mjs` built and one merged
without it, prints the second only.
