# 0051. The provenance audit comes back, because a ruleset is configuration and not a fact

Status: accepted

Supersedes the "Drop `check-main-provenance.mjs`" decision in ADR 0001. The rest
of 0001 stands unchanged.

## Context

ADR 0001 dropped layer 3, the provenance audit, from this repository. The
argument was short and looked airtight: this repo is public, rulesets are free
here, the ruleset requires a pull request with no bypass actors, so a commit that
reached `main` outside a pull request cannot exist and the audit can only ever
pass. It went further and said the absence was correct rather than pending:

> **Layer 3 is deliberately absent here, so `assets/check-setup.mjs` will report
> it missing in this repository and that is the correct answer.** Do not install
> the provenance audit here to make the output green.

That instruction is written in three places: ADR 0001, `docs/process/handoff.md`,
and the header of `assets/check-setup.mjs`, which calls the resulting red line
"this repository's one tolerable permanently-red line". Issue #152 asked for the
audit to be installed and cited none of them.

Two things are worth checking before treating #152 as a stale issue.

**The ruleset's configuration is as ADR 0001 describes it.** Read from the API
today, ruleset `main` (id 20608052, created 2026-08-09T11:00:43) is `active`,
scoped to `~DEFAULT_BRANCH`, and carries four rules: `deletion`,
`non_fast_forward`, `pull_request` with `allowed_merge_methods: ["squash"]`, and
`required_status_checks` on the contexts `Checks` and `Plugin`. `bypass_actors`
is empty and `current_user_can_bypass` is `"never"`. Nothing about the premise
has rotted.

**The premise is still narrower than it reads.** A ruleset is not a property of
the repository. It is mutable configuration living at GitHub's end, invisible
from any checkout, and an owner can set `enforcement` to `disabled`, push, and
set it back inside a minute. ADR 0001 itself makes the point that agents run
with the owner's credentials, and then does not apply it here: a token that can
merge can also PATCH the ruleset. None of that leaves anything in the tree. It is
a bypass, of the exact shape the skill's fourth constraint is about, and the only
difference from a hook that failed to load is which side of the network it is on.
ADR 0001 treats that difference as decisive. It is not: what matters is whether
the bypass leaves a trace, and neither one does.

**And the cost it accepted was not paid once.** `check-setup.mjs` has exited 1 on
this repository since it was written, and the standing red has been picked up as
a defect repeatedly, most recently as #152, which reached an agent as work.
`AGENTS.md` already states the rule this breaks: a rule broken by accident twice
wants a check, not another paragraph. Three paragraphs asking readers to ignore a
red line have now failed at least as many times, and `docs/process/review.md`
says to delete a gate that produces ceremony instead of signal. Between deleting
the report and satisfying it, satisfying it is the smaller change and leaves the
repository running what it publishes.

## Decision

**Install layer 3.** `scripts/check-main-provenance.mjs` is a copy of
`.agents/skills/orchestrated-delivery/assets/check-main-provenance.mjs`, byte for
byte apart from its `BASELINE` line.

**`BASELINE` is `f3b8a7a`, the repository's first commit, which added
`guard-merge.mjs` and `merge-pr.mjs`.** That is the commit the asset's own
guidance names and the one `check-setup.mjs` names in its FIX line. It is not the
commit that makes the output green, and that was the choice:

- `f3b8a7a` is where the PR-only rule first existed in this repository as
  something other than prose. The audit above it reports two commits.
- `dadeae4`, the last commit before the ruleset was created at 11:00:43 on the
  same morning, would have been defensible on the asset's other sentence, the one
  about the first commit under a real control. It is also, exactly, the line that
  makes the two reported commits disappear.

Taking the second would have been the failure mode this whole layer exists to
prevent, so the baseline sits below the finding and the finding is reported. If
the noise later proves worse than the record, moving it is a one-line change to
be argued in its own pull request, not something to decide while looking at a red
run.

**A workflow of its own, `.github/workflows/provenance.yml`, triggered only by a
push to `main`.** ADR 0009's objection to a new job name is that it becomes a
required check context, a fourth copy of a string kept in step across a workflow,
`merge-pr.mjs`'s `REQUIRED` array and the ruleset. A required context is one
GitHub can see on a pull request head. This workflow never runs on one, so it
cannot produce a required context and adds no fourth copy. The ruleset's required
list is untouched at `Checks` and `Plugin`.

The alternative, a step in the existing `Checks` job, would have cost all three
things: it would run on pull request heads where the commits are not on `main`
yet and there is nothing to audit, it would become the fourth copy ADR 0009
refuses, and it would convert the one detective layer into a fourth preventive
one. `check-setup.mjs` reports that last shape as a partial install in so many
words.

**`npm run check:provenance` is the local entry point, and it is not part of
`npm run check`.** It needs `gh` authenticated and one API call per commit, which
is the same reason `check:plugin` and `check:plugin-load` are left out. The
workflow names the script file directly rather than the npm alias, because
`check-setup.mjs` decides whether the layer is wired by looking for
`check-main-provenance` in a workflow's `run:` values. It read the whole file
when this was written, comments included, which made the workflow's own header
count as running it; #170 narrowed it to where a workflow actually invokes
something, and the reason for naming the file directly is unchanged and now
load-bearing rather than incidental.

**`scripts/check-main-provenance.test.mjs` holds the copy and the asset
together.** #152 asked for a copy rather than a rewrite and named the reason:
otherwise the two disagree and nothing notices. This repository has already paid
that bill, in the correction appended to ADR 0001. The test allows exactly one
line to differ, the baseline, which is a fact about this repository and cannot
ship.

## Consequences

**The audit reports two commits, and they stay reported.** Both are from this
repository's first twenty-four minutes, before the ruleset existed:

```
  dadeae4bb076d44f0ffd30f0105c5e8d6327112f
    Make the skill harness-agnostic and document how to use it
    Blake Hastings <blakehastings@outlook.com>  2026-08-09T10:59:20-05:00
    No associated pull request.

  2ff792e4fda164a05ccde96a42dc15efcb943e7f
    Rework enforcement for a public repo, and give it teeth
    Blake Hastings <blakehastings@outlook.com>  2026-08-09T10:47:16-05:00
    No associated pull request.
```

They are bootstrap, not bypass, and the report is accurate rather than an
artifact of how the audit reads history. `repos/{owner}/{repo}/commits/<sha>
/pulls` returns an empty array for both, not an association the filter then
discarded. The reason is in the timeline:

| Local time, 9 August | |
| --- | --- |
| 10:35:58 | `f3b8a7a`, the baseline, exempt |
| 10:47:16 | `2ff792e` reaches `main` |
| 10:59:20 | `dadeae4` reaches `main` |
| 11:00:43 | ruleset `main` created, active, no bypass actors |
| 11:03:04 | pull request #1 opened, the first in this repository |
| 11:03:34 | #1 merged as `e67a110` |

No pull request existed here until four minutes after the second of them, so
neither could have had one. Both are first-parent commits on `main` pushed
directly by the owner while the repository was being set up. The other 56
commits above the baseline each name a merged pull request into `main`. Neither
commit is a candidate for reverting, and per the process doc the gap they came
through was closed by the ruleset before the third one landed.

**A full-history run is therefore red, and a run over a push is green.** The
workflow passes `PROVENANCE_BEFORE` and `PROVENANCE_AFTER`, so it judges only the
commits that push added and stays green until a real violation. `npm run
check:provenance` with no range audits everything above the baseline and reports
the two commits above, every time. That is the cost of the baseline choice, taken
knowingly: the alarm that matters is the push run, and the manual run is an audit
whose answer happens to be the same two lines until someone adds a third.

**`assets/check-setup.mjs` now exits 0 in this repository**, for the first time.
The handoff note and ADR 0001's closing paragraph, which both told readers to
expect a 1, are corrected in place rather than left to be rediscovered a fourth
time.

**What this still does not cover.** It runs after the fact, by design: by the
time it fails, the commit is on `main`. It cannot see a ruleset that was disabled
and restored, only the commit that arrived while it was. And it asks the same API
that a token strong enough to disable the ruleset could, in principle, be used to
mislead. The value is that the failure is loud, dated and attributable, not that
it is unforgeable.

**A defect found in the asset while wiring this, reported rather than patched
here.** `check-setup.mjs` decides whether the audit's workflow also triggers on a
pull request with `runner.text.includes('pull_request')` over the whole file, so
a comment explaining why the workflow does not use that trigger reads as the
trigger being present. It reported PARTIAL against a workflow that was already
correct. `provenance.yml` avoids the token in prose and says why; the asset is
payload and its fix belongs in a change that bumps the plugin version.
