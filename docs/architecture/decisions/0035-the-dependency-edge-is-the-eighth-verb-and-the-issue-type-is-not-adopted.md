# 0035. The dependency edge is the eighth verb, and the issue type is not adopted

Status: accepted

Issue #86, from #62. Amends ADR 0024, which defined the port as seven verbs, and
ADR 0028, which recorded that beads gives the loop a computed ready state it had
not asked for. ADR 0022 supplies the principle the second decision turns on.

## Context

`gh` 2.94.0 gave GitHub first-class versions of two things the loop modelled by
convention: dependency edges (`--blocked-by`, `--blocking`, `is:blocked`) and
issue types (`--type`). beads has had dependencies all along and carries `epic`
as a type. So the port's `label` row disagreed with at least one implementation
in both places, which is the drift `references/backlog-port.md` exists to catch.

The two questions are independent and were answered differently.

Everything below was measured against `gh` **2.97.0** and beads **1.2.1** in
August 2026, not read from release notes. #62's whole cause was a stale binary.

## Decision

**`block` joins the verbs, and the port is eight.** A dependency edge between
items, plus the list computed from it. It is a separate verb from `link` because
the two answer different questions: the parent tree is read for epics, orphans
and collision batching; the dependency is read for dispatch.

**Only one of the three undispatchable reasons gets the edge, and it is the one
that decays.** Waiting-on-the-owner and no-spec-yet stay labels, because nobody
forgets to remove a mark that nothing external clears. "Behind another item" is
cleared by a merge, and nothing about a merge re-reads a mark on another item.

**The edge is adopted for what it does structurally, not because it exists.**
Two properties, both of which the label convention had to buy with habit:

1. **The blocker is named by id because an edge cannot be nameless.** The rule
   "if you cannot name the blocker, the issue is not blocked, it is unrefined"
   stops being a rule.
2. **Closing the blocker clears it.** Measured on GitHub: with an open blocker
   `--search "is:open is:blocked"` returned the issue and `-is:blocked` omitted
   it; with the blocker *closed* and the edge untouched, the two swapped, with
   nothing done to either issue. `is:blocking` is state-aware in the same way,
   so "unblocks other work" is a query rather than a label.

**The read is named as a command, not a field, and that is the load-bearing
half.** Both stores compute blockedness beside the stored state rather than
inside it, so both mislead the same way. `bd list` prints a blocked item as
`○ open` and `bd list --status blocked` returns nothing. `gh issue list` shows a
blocked issue with no marker of any kind, and both `blockedBy` in `--json` and
the `blocked-by:` line in `gh issue view` include blockers that are **already
closed**, the view line with no state at all. The port therefore asks for a
*ready list* (`bd ready`, `gh issue list --search "is:open -is:blocked"`), and
says plainly that holding the edges is not the same as answering the question.

**`epic` stays a label on GitHub and stays a type in beads, and the port
requires neither.** It requires only that "this is an epic" be visible in the
list without opening the item. Issue types are organisation-level configuration,
so a repository cannot carry its own and a user-owned one has none: `gh issue
edit <n> --type Epic` fails with `available types:` and nothing after it, and
`GET /repos/{owner}/{repo}/issues/types` 404s. That cost was known before this
issue. What settled it is the shape of the second failure: **`gh issue list
--type Epic` returns an empty list and exit 0.** Seeding would break loudly on a
setting outside the repository and reading would break silently, and reading is
what the loop does every turn. A filter that confidently returns nothing is the
same defect as a list that silently stops at thirty.

Letting the two stores spell one concept differently is ADR 0022's
adopt-rather-than-impose applied inside the port.

## Consequences

**The counter-argument was that a label needs no particular client and no
particular tracker, so an eighth verb raises the bar a candidate must clear.**
It loses because the bar was already higher: the port disqualifies a candidate
for having no parent/child edge, and git-bug was turned away on exactly that. A
store with a real parent edge and no dependency edge is a narrow class. But the
bar did move, and `backlog-port.md` now says so in the disqualifying-requirements
section rather than leaving it implicit.

**The port concedes `list-ready`, which it had argued against.** That row said
this loop has no computed ready state and reads the graph by eye. Both
implementations turned out to have one. The row now records the reversal instead
of being quietly edited, because a port whose divergences are explainable is the
whole basis of confidence in it (ADR 0024).

**The write needs a new client and the read does not.** `--add-blocked-by` and
`--json blockedBy` need `gh` 2.94.0. `is:blocked` is a server-side search
qualifier and ran unchanged on 2.88.1, nine releases behind. The old-client
fallback for the write is
`gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by`.

**This repository's own backlog is now out of step with its documentation, and
the fix is a backlog migration rather than a code change.** #78 and #79 carry the
`blocked` label, and the label's description says "Name the blocker by id; the
merge that unblocks it clears this". Converting those to edges and deleting the
label belongs with merging this change, not after it. An agent working an issue
does not re-tool the live backlog ahead of the decision landing, so it is named
here and in the pull request rather than done.

**Nothing mechanical holds any of this.** `check:references` holds the reference
table to the directory, and nothing holds the verb count to the files that
repeat it: `SKILL.md` three times, `README.md` once, `beads-backlog.md` twice,
with `github-backlog.md` naming the verbs in a list instead. A ninth verb has
six places to go wrong and this change had to find all of them by hand. The last
column of the verb table is still the only defence, and `backlog-port.md`'s
"How this rots" describes the failure mode exactly.
