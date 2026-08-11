# 0001. Enforcement rests on a ruleset, not on the substitute layer

Status: accepted

## Context

The orchestrated-delivery skill ships a three-layer substitute for branch
protection: a merge wrapper, a `PreToolUse` guard, and a provenance audit that
fails CI when a commit reaches the default branch outside a pull request. All
three exist for one reason, stated in the skill: branch protection needs a paid
plan on a private repository.

This repository is public. Rulesets are free here, so the premise is gone. The
skill anticipates exactly this and calls it a revisit trigger: protect the
branch and delete most of the substitute, "rather than keep out of sentiment".

Deleting all of it would be wrong, though, and for a reason the skill's own
framing hides. A ruleset prevents *direct pushes*. It does not prevent an agent
from merging its own pull request, and "agents do not land code" is a separate
constraint from "nothing reaches main unreviewed". The two layers were doing two
jobs that happened to overlap on a private repo.

## Decision

**Keep the ruleset as the real control.** Require a pull request, require the
status checks, block force-pushes and deletion, and configure **no bypass
actors**. Bypass actors are the whole game here: agents run with the owner's
credentials, so an admin-bypass exemption is an agent exemption. An owner who
needs to push directly can remove the rule deliberately and put it back.

**Keep `guard-merge.mjs`**, narrowed to the job the ruleset does not do:
refusing `gh pr merge` and merges through `gh api` inside an agent session. Its
push-to-default-branch cases become redundant and come out.

**Keep `merge-pr.mjs`** as a convenience, not as a control. Its refusal message
explains *which* check is red, which a GitHub merge button does not.

**Drop `check-main-provenance.mjs`.** It detects commits that arrived outside a
pull request. With no bypass actors that commit cannot exist, so the check can
only ever pass. The skill's fourth constraint says to pair prevention with
detection because prevention can be silently bypassed; this prevention lives at
GitHub's end rather than in a hook the session might not load, so there is no
bypass for detection to catch.

## Consequences

The owner cannot push to `main` either. That is intended and is the difference
between a control and a habit.

If this repository ever goes private, this decision inverts: restore all three
layers from the skill's `assets/`, and pin the provenance baseline to the commit
that restores them.

The substitute layer still ships to users in the plugin payload, because most
repositories installing it will be private ones where the original premise
holds. What changed is what *this* repository runs, not what it distributes.
That distinction is the point: the plugin has to work for repos unlike this one.

**Layer 3 is deliberately absent here, so `assets/check-setup.mjs` will report it
missing in this repository and that is the correct answer.** The asset checks
what a private repo needs. Do not install the provenance audit here to make the
output green.

## Correction, recorded rather than edited away

This ADR said `check-main-provenance.mjs` was dropped. **For eight merged pull
requests, it was not.** A PowerShell parse error killed the script block that
contained the `git rm`, nothing in that block ran, and the next `git add -A`
committed the file. It then sat in `scripts/`, referenced by nothing, still
holding `REPLACE_WITH_BASELINE_COMMIT_SHA`, while this document asserted it was
gone. It was removed in #40.

Two things worth keeping from that.

The skill warns never to write an invariant ahead of the code that holds it,
because an invariant that is not true is worse than an absent one. This is that
failure, committed by the author of the warning, in the document that records
the decision. Nobody caught it by reading — not in review, not across eight PRs
that touched neighbouring files.

What did catch it was `assets/check-setup.mjs`, on its first run, in under a
second, built for #19 on the argument that reading a table is not installing
anything. It found the same class of defect in the repository that commissioned
it. That is the strongest evidence available for why the mechanism was worth
building, and it is why this correction is appended here rather than quietly
fixed in place.
