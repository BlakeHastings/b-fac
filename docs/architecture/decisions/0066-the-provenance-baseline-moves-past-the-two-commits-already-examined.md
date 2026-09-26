# 0066. The provenance baseline moves past the two commits already examined

Status: accepted. ADR 0071 adds a second baseline, for the `Landed-by`
trailer, and leaves `BASELINE` where this put it.

Issue #206. Amends the `BASELINE` decision in ADR 0051 and the consequence that
followed from it, "a full-history run is therefore red". The rest of 0051 stands.

## Context

ADR 0051 installed the provenance audit with `BASELINE` at `f3b8a7a`, the
repository's first commit, and not at `dadeae4`, the line that would have made
its output green. The reason was sound: choosing the green line while looking at
a red run is how a real violation gets absorbed into history nobody reads. So the
baseline sat below the finding, the audit was seen to report it, and 0051
recorded what the two commits were.

That demonstration is done, and what it bought is on record. What it cost has
kept being paid. A bare `npm run check:provenance` exits 1 every time, and three
places tell the reader to expect that and look past it: `AGENTS.md`, the header
of `.github/workflows/provenance.yml`, and the handoff. A standing red that
readers are asked to ignore is the pattern 0051 was written to remove from
`check-setup.mjs`, and 0051 left the exit open in its own words: "If the noise
later proves worse than the record, moving it is a one-line change to be argued
in its own pull request, not something to decide while looking at a red run."
This is that pull request.

**The two commits were examined, and the examination is in ADR 0051's
Consequences.** Re-read on 2026-09-25 before moving anything:

- The bare audit reported exactly `2ff792e` and `dadeae4`, `2 of 83`, both
  `No associated pull request.`
- `repos/{owner}/{repo}/commits/<sha>/pulls` returns an empty array for both,
  not an association the filter discarded.
- `git log --first-parent main` puts them second and third, between `f3b8a7a`
  (10:35:58 -05:00) and `e67a110`, the squash of pull request #1.
- Pull request #1 was created at 16:03:04Z and merged at 16:03:34Z, which is
  11:03 local, four minutes after `dadeae4` at 10:59:20.
- Ruleset 20608052 was created at 12:00:43 -04:00, 11:00:43 local, and is
  `active`.

Everything 0051 said about them still holds: no pull request existed in the
repository when either landed, so neither could have had one, and the gap they
came through was closed by the ruleset before the next commit.

## Decision

**`BASELINE` in `scripts/check-main-provenance.mjs` is `dadeae4`**, the later of
the two examined commits and the last commit before the ruleset. The asset's
`BASELINE` is a placeholder for installers and is not touched.

This is not the move the script's comment forbids. "Do not move this forward to
silence a failure" is about a finding nobody has looked at. These two were
looked at, named and explained in an accepted ADR a month before the line moved
past them, and the reasoning that kept them visible is preserved there rather
than deleted. Moving the line past an unexamined commit would still be wrong, and
anything a later reader finds above `dadeae4` is exactly as reportable as before.

**A test proves that last sentence rather than asserting it.**
`scripts/check-main-provenance.test.mjs` runs the real script with only `gh`
stubbed to answer the way the API does for a direct push, an empty list. It
checks that `e67a110`, the first commit above the new baseline, is reported as a
violation; that a range starting at `f3b8a7a` asks about and reports only that
commit; and that the two bootstrap commits are exempt and never sent to the API.
Moving the baseline one commit further, to `e67a110`, turns three of those red.

## Consequences

**A bare `npm run check:provenance` exits 0**, with 81 commits each naming a
merged pull request. A red from it now means something arrived, the same as the
push-triggered run. `AGENTS.md` and the workflow's header say so instead of
explaining the red away.

**The two commits are no longer in any run's output.** Their record is ADR
0051's Consequences, which keeps the timeline and the empty API answers. Naming
them to the script now counts them as predating the baseline; seeing the audit
report them again means running it with the baseline set back to `f3b8a7a`.

**What the baseline cannot do is unchanged.** It still only decides which
history is judged. The audit still runs after the fact and still cannot see a
ruleset disabled and restored between pushes.
