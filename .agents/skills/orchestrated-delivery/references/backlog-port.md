# What the loop needs from a backlog

The backlog is the durable memory of the project. Chat is not. Anything an agent
should still know next week goes in a work item, an ADR or a gotchas file. That
is the whole requirement, and none of it is a requirement about GitHub.

This file says what the loop asks a task store for, as verbs.
`references/github-backlog.md` is one implementation of them, and the one this
repo uses. Read this file when the backlog is not GitHub's, when you are judging
whether a candidate tool can carry the loop, or when you are about to write
"issue" and mean "work item". It says *item* throughout for that reason.

**Guest mode is what forces the split.** A work repo's tracker holds the ticket
and is not yours to write to, so the factory's own working items live in a local
store until the publish step while the loop above them is unchanged. That is
`SKILL.md`'s "Two questions before the loop", and ADR 0021.

## The port, as verbs

Derived by enumerating every backlog operation the rest of this skill actually
asks for, rather than from any tool's command list. The last column is there so
the table can be re-derived instead of remembered.

| Verb | What the loop does with it | Asked for in |
| --- | --- | --- |
| `create` | Epics carrying prose context, leaf items carrying the full anatomy, and everything filed mid-flight by you or by an agent. Must hand back a stable id immediately, because seeding creates every parent before the children that name it | `github-backlog.md` (shape, seeding), `briefing.md`, the loop's step 8 |
| `read` | One item in full, by id. This is the first line of every brief's reading order, so it is the verb an implementation agent uses most | `briefing.md`'s annotated brief |
| `list` | Open items, filtered by label, and **not truncated**. `Next: nothing` is paid for by listing every open item and saying what each waits on, and a list that silently stops at thirty makes that claim false while looking complete. When the question is what to dispatch, the list is `block`'s and not this one | `SKILL.md` "Before you stop", `github-backlog.md` housekeeping |
| `comment` | The review record, posted before merging, in the three headings plus a verdict | `reviewing.md`, `assets/review.md` |
| `close` | With a pointer to whatever supersedes it. Deduplicating keeps the better framing and closes the other *into* it, which is a state change and a cross-reference in one move | `github-backlog.md` housekeeping, `briefing.md` |
| `link` | A real parent/child edge, so the graph is something you can read. Not a label convention | `github-backlog.md` |
| `block` | A real dependency edge, **and the list that computes readiness from it**. "Behind another item" is the one undispatchable reason that decays, and the edge is what stops it decaying. Read backwards, the same edge is what an item unblocks | `github-backlog.md`, `beads-backlog.md`, below |
| `label` | One per area, plus epic, plus the two undispatchable reasons no edge covers: waiting-on-the-owner and no-spec-yet. Escalation is what this verb shows at a glance, filtering the list for the first of those. Dispatch is that list read negatively **and** `block`'s ready list, because two of the three reasons live here and one does not | `SKILL.md` escalation and its `Next:` line, `github-backlog.md`, below |

Exactly one mutation of an existing body appears anywhere: adopting an orphan
adds a `Parent: #N` line beside the real edge. It rides with `link` rather than
earning an `edit` verb of its own.

## "Cannot be started yet" has to be in the list, not only in the body

Area and epic answer *what kind of work is this*. Neither answers **can this be
dispatched right now**, and that is the question the loop asks the list every
time it picks work.

This was found by triaging a backlog for dispatch rather than by reading the
skill. Two open items each ended with an explicit "do not build this yet" and
carried nothing that said so outside the body. From a listing they read as
ready, and briefing an agent on either would have been the orchestrator's
mistake rather than the writer's.

So the port asks the list for one thing more: when an item cannot be started,
**the reason, not just the fact**. The reason is load-bearing because each one
routes somewhere different, and two of the three are the orchestrator's own work
rather than an agent's:

- **waiting on the owner** is escalated, which is the channel above
- **behind another item** is ordered, and is the only one nobody can act on now
- **no spec yet** is scheduled into a refinement pass, which is a conversation
  with the owner rather than a dispatch. The spec that pass produces is an
  epic, so it costs the port no ninth verb: `references/refinement.md`

Collapse those into one "blocked" and the loop loses the two it could have moved
this turn. That is the argument for separating them, and it is an argument about
what happens next rather than about vocabulary: the names still matter less than
the distinction being visible without opening the item.

**One of the three decays, and it is the one nobody watches.** The owner is
waiting on their own escalations, and a missing spec is still missing tomorrow.
A blocker is cleared by a merge, and nothing about a merge re-reads a mark on
another item. Two consequences, and an implementation that skips either is
keeping a lie in its backlog and parking real work behind it:

1. **The blocker is named by id.** An item that cannot say what it is behind is
   not blocked, it is unrefined, and the mark is hiding that.
2. **Clearing it belongs to the merge that unblocks it**, not to a sweep
   somebody remembers to run.

**So that one reason is an edge, and `block` is the eighth verb.** A dependency
edge gets both consequences structurally rather than by habit: an edge cannot be
nameless, so (1) is not a rule anybody can break, and closing the blocker clears
it with nothing done to either item, so (2) has nobody to remember it. Both
implementations already hold the edge (beads always has, GitHub does from `gh`
2.94.0), so a port that said `label` here was a port disagreeing with both of
its own instances, which is the drift this document exists to prevent.

**The counter-argument is real, and what beats it is narrower than it looks.** A
label convention needs no particular client and no particular tracker, so an
eighth verb raises the bar a candidate has to clear. What answers it is that the
bar was already higher: "The requirement that disqualifies candidates" below
turns a tool away for having no parent/child edge, and git-bug was turned away
on exactly that. A store with a real parent edge and no dependency edge is a
narrow class, and neither implementation here is in it. `block` spends almost
nothing in candidate-space that `link` had not already spent.

**What it does cost, unminimised.** The port is eight verbs, so every document
that said seven says eight. Writing the edge on GitHub needs a client new enough
to have the flag, where a label needed nothing. And the port now asks for the
computed ready state the `list-ready` row below explicitly declined, which is
this document conceding a point it had argued.

## Name the command the loop runs, not the field the store holds

This is the half that goes wrong, and it goes wrong the same way in both
implementations. Blockedness is computed *beside* the stored state rather than
being part of it, so the default list shows a blocked item as ordinary open work
and the raw field answers a different question than the one the loop asked:

- `bd list` prints a blocked item as `○ open`, identical to ready work, and
  `bd list --status blocked` returns nothing. `bd ready`'s own legend prints
  `● blocked` as a status, which is what makes that the natural wrong guess.
- `gh issue list` shows a blocked issue with no marker of any kind. `blockedBy`
  in `--json` and the `blocked-by:` line in `gh issue view` both list blockers
  that are **already closed**, and the view line prints no state at all.

So the port asks for a **ready list**, meaning a command that omits items with an
*open* blocker. `bd ready` and `gh issue list --search "is:open -is:blocked"`
are that command. `bd list` and `gh issue list` are not, and neither is reading
the edge field yourself unless you filter it on each blocker's state. A store
that holds edges and cannot list by them has handed the loop the data instead of
the answer, and that is worth knowing before you call it an implementation.

## Epic is whatever the store already spells it as

GitHub gained first-class issue types in the same release as the edges, and the
port does not adopt them. **A type is organisation-level configuration and a
label is not**, so adopting one makes seeding depend on a setting outside the
repository, which in guest mode the operator certainly does not control. That
alone is a cost against a benefit. What settles it is the shape of the two
failures, measured on a user-owned repository with no types configured: `gh
issue edit <n> --type Epic` fails with `available types:` and nothing after it,
while `gh issue list --type Epic` returns an empty list and **exit 0**. Seeding
breaks loudly on absent configuration and reading breaks silently, and reading
is what the loop does every turn. A filter that confidently returns nothing is
the same defect as the list that silently stops at thirty, wearing a flag
instead of a default.

beads, meanwhile, already carries epic as a type (`bd create -t epic`), because
it is free there. So the port asks only that **"this is an epic" be visible in
the list without opening the item**, and lets each store use whatever it gives
away. That is ADR 0022's adopt-rather-than-impose applied inside the port, and
it is why the two implementations can spell one concept differently without
either of them drifting.

## What the port deliberately does not need

**Output-format compatibility.** `--json`, `--jq` and `--template` are the
expensive half of imitating `gh`, needing an embedded jq, Go templates with a
pile of custom helpers, per-command field whitelists and two identifier spaces.
An agent reads prose. None of that buys the loop anything.

**A drop-in for `gh issue`.** Impossible rather than merely unwise: a `gh`
extension registers as a new top-level `gh NAME` command and nothing can shadow
a built-in one. Every candidate is a sibling command, and that is fine, because
the verbs were always the part the loop depends on.

## Against the six verbs the field converged on

Five surveyed tools independently arrived at roughly `list-ready`, `claim`,
`comment`, `close`, `link-pr`, `dep-add`. Most of that maps. The two
disagreements are the interesting part.

| Theirs | Here |
| --- | --- |
| `list-ready` | **`block`'s read half**, and the row the decision above overturned. This used to say the loop had no computed ready state and read the graph by eye; both implementations turned out to have one, so the loop reads it. What is still judgment is "pick work that unblocks the most", because neither store ranks its ready list by how much each item unblocks |
| `claim` | **Not used.** Work is assigned by dispatching an agent with a brief, and the exclusion that matters is the worktree, not a field on the item. Claiming starts to matter with two orchestrators against one backlog, which is not a shape this skill describes |
| `comment` | The same verb |
| `close` | The same verb, plus the pointer that makes a duplicate close *into* its survivor |
| `link-pr` | Above the ceiling (below). GitHub does it from `Closes #N` in a pull request body, and in guest mode there is no pull request at all until publish |
| `dep-add` | `block`, and the load-bearing one. Here it is two verbs rather than one, because `link` is a second edge answering a different question: the tree is read for epics, orphans and collision batching, the dependency for dispatch |
| *(absent there)* | **`create`**, the largest verb here and in none of the six. The six describe maintaining a backlog that already exists. This loop seeds one in a single generated pass and then files against it all day |

**How much to trust that.** Convergence across five tools is suggestive and not
proof. The survey did not check whether any of them copied another, and two
plausibly did; `docs/research/2026-08-12-local-backlog-and-storage.md` is the
source and is explicit about what it verified. What raises the confidence is not
the count. It is that both disagreements have structural reasons rather than
being noise: `claim` is absent because isolation is a worktree here, and `create`
is present because this loop seeds. A port whose divergences are explainable is a
better bet than one that matched exactly by luck.

## The requirement that disqualifies candidates

**A real parent edge.** A label convention does not give you a tree you can
read, and closing an epic when its children are done, adopting an orphan, and
batching by collision surface all read that tree.

git-bug is the worked example. Architecturally it is the design this skill would
have drawn, with items in refs outside the working tree, shared across every
worktree of a clone with no commit and no merge. It was disqualified partly
because its operation types have no notion of a parent at all, so the graph would
have had to live in a metadata bag. Ask a candidate for the edge before you ask
it for anything else.

**A real dependency edge, and a list computed from it.** Since `block` joined
the verbs this disqualifies too, and it is the cheaper half of the same
question: a store that already models a parent edge almost always models this
one. What is worth asking separately is the second clause. Holding the edge is
not enough, because the loop's question is which items have no *open* blocker,
and a store that can only hand back the edges leaves the loop computing that
itself every turn, which is the failure the section above is about.

**The provider pattern already exists, so do not invent one.** beads models gates
on an item with types `human`, `timer`, `bead`, `gh:run` and `gh:pr`. A gate is a
dependency on a synthetic item, so it holds its target out of the ready list and
refuses its close, which makes it the previous section's mark and this one's
preflight in a single mechanism. That is "this item is not startable until a
condition is met", with GitHub as one driver behind the concept, in a shipped
tool. Worth knowing before anybody designs a seam from scratch.

## The ceiling, in the same breath

**A pluggable backlog frees one of the four things this workflow uses GitHub
for, not all four.** ADR 0021 has the table. The other three:

- **The merge wrapper** reads a pull request's check rollup, so it needs GitHub
  both to produce the checks and to report them in one place. In guest mode
  there is no rollup to read, and the substitute is the host's own check command
  run locally before work lands on your integration branch. That leaves you with
  checks and nothing that refuses, which is the correct weight there rather than
  a gap: landing means landing on your own branch, and the company's reviewers
  are what stands in the way afterwards.
- **The checks** run in Actions in owned mode. In guest mode they run on the
  company's CI, on the pull request, after publish, unchanged.
- **The ruleset** is GitHub's driver for a gate, and it is *never* installed in
  guest mode, because a ruleset is a change to somebody else's repository.

Those three nouns are `references/enforcement.md`'s, used the way it uses them:
a check reports and a gate refuses.

So the loop's memory is portable and the loop is not. A reader who takes "the
backlog is a port" as "the whole thing runs anywhere" has read a quarter of the
sentence.

## Pluggable means named, not abstracted

This skill is prose telling an agent what to run. It calls no APIs, so there is
nothing for an adapter layer to adapt, and a shim between markdown and a CLI is
machinery bought with nothing. What pluggable costs here is two things:

1. This file, saying what the loop needs.
2. **One line in `AGENTS.md` naming the tool that provides it**, beside the
   command that runs the checks. That is a repo fact in ADR 0021's sense, so it
   is committable in owned mode and true for anyone who clones.

The tool's own documentation supplies the commands. If the tool eventually
warrants a reference document, it becomes a sibling of `github-backlog.md` and
this file stays the definition.

**Choosing a tool is a separate decision and has not been made.** Nothing here
adopts anything.

## How this rots

The verb table is a claim about the rest of this skill on the day it was
written. When a reference document changes what it asks of the backlog,
re-derive the table from the files rather than editing it from memory. The last
column exists to make that cheap. Nothing mechanical holds it, which is the
usual reason a table like this goes quietly wrong.
