# beads as the local work queue

**The other implementation of the backlog port, and the one guest mode uses.**
`references/backlog-port.md` says what the loop needs from any task store;
`references/github-backlog.md` is the same eight verbs in GitHub's nouns. Read
this when the factory is running on a repo that is not yours, where the host's
tracker is read-only and the loop's own items have to live somewhere on your
machine.

Everything here was run against beads **1.2.1** on Windows 11 (build 26200), in
a throwaway git repo, in August 2026. Commands rot; re-run before trusting.
Install is `npm install -g @beads/bd` or `brew install beads`. The project moved
from `steveyegge/beads` to `gastownhall/beads`, so a stale link is expected.

## Initialising, and the two ways it goes wrong

**Guest mode is `bd init --stealth`, and then nothing else.**

```bash
bd init --stealth
```

That writes `.beads/` and appends to `.git/info/exclude`, which is exactly ADR
0021's mechanism, arrived at independently. It creates no `.gitignore`, touches
no tracked file, and changes nothing in your global git config. Verified:
`git status --porcelain -uall` stayed empty in a scratch repo through an init,
twenty-odd writes and a `bd create --graph`.

**Do not then run `bd setup claude`, and do not believe its `--stealth` flag.**
The flag is on the command and it still wrote `CLAUDE.md` and
`.claude/settings.json` into the working tree. Against a host repo that already
tracked both, `git status` came back:

```
 M .claude/settings.json
 M CLAUDE.md
```

Two modified tracked files in somebody else's repository, from a command whose
own flag says invisible. The exclude list `bd init --stealth` writes covers
`.claude/settings.local.json` and not those two. It is a boundary violation in
ADR 0021's sense, so guest mode stops at `bd init --stealth`.

**Owned mode is `bd init --skip-agents`.** Bare `bd init` is an integration
installer wearing an init's name. In a scratch repo it wrote `AGENTS.md`,
`CLAUDE.md`, `.gitignore`, `.claude/settings.json`, `.codex/`, `.cursor/`, a
`.agents/skills/beads/SKILL.md`, and then **committed all nineteen files on its
own** as `bd init: initialize beads issue tracking`. It merges rather than
clobbers — a house rule in `AGENTS.md` and a hook in `.claude/settings.json`
both survived — but an unrequested commit is still an unrequested commit, and a
foreign skill landing in `.agents/skills/` is a real collision for any repo that
generates a mirror from that directory. `--skip-agents` skips all of it;
`--skip-hooks` skips the git hooks as well.

`bd metrics off` turns off the anonymous command telemetry that is on by
default. In a guest repo that is a courtesy to whoever owns it.

## The eight verbs

| Verb | beads | Notes |
| --- | --- | --- |
| `create` | `bd create "Title" -t epic\|task\|bug -p 1 -l area:intake -d "..."` | `--silent` prints the id and nothing else, which is what a script wants. `--parent <id>` makes the child in the same call. **Epic is a type here and a label on GitHub**; the port asks only that it show in the list, and takes whichever the store gives away |
| `read` | `bd show <id>` | Renders description, labels, close reason, and a `CHILDREN` block with an *n*/*m* complete count |
| `list` | `bd list --limit 0`, `bd list --label needs-refinement` | Default limit is 50, and see below. When the question is what to dispatch it is `bd ready`, not `bd list`, for a reason worth reading before you pick one |
| `comment` | `bd comment <id> --file review.md`, read back with `bd comments <id>` | `--file` matters: the review record is four headings and a verdict, not a shell argument |
| `close` | `bd close <id> --reason "Duplicate of <id>, which has the better framing."` | The reason is stored and shown on the item |
| `link` | `bd dep add <child> <parent> --type parent-child` | Also `duplicates` and `related`. `--file deps.jsonl` for bulk |
| `block` | `bd dep add <blocked> <blocker> --type blocks`, read with `bd ready` and `bd blocked` | The same command as `link` with a different type, and a different question: this one decides dispatch. Below, including the trap |
| `label` | `bd label add <id> area:zoning` | Labels are also settable at create with `-l` and inherited by children unless `--no-inherit-labels`. Only one of the port's undispatchable reasons stays a label here; the other two are edges |

Two of those are better than the port asked for.

**`list` announces its own truncation**, which `gh issue list` does not:

```
Showing 2 issues (2 open, 0 in progress); more match (truncated by --limit). Use --limit 0 for all.
```

The port asks for a list that is "not truncated" because a silent stop makes
`Next: nothing` a lie. What it actually needs is a list that cannot lie about
being complete, and a truncation notice satisfies that as well as `--limit 0`
does.

**`link` removes the port's only body mutation.** On GitHub a `Parent: #N` line
is kept in the body beside the real edge. That was because the edge was
invisible in a terminal, and `gh` 2.94.0 closed most of that gap by printing
`parent:` and `sub-issues:` lines of its own, leaving the duplicate as cover for
older clients. Here `bd show` renders the tree and there is nothing to duplicate
at all.

## Seeding, which is the verb that matters

`create` is the loop's largest verb and the one the surveyed tools did not have,
because seeding a backlog is not maintaining one. beads has two bulk forms and
they are not equally useful.

`bd create -f seed.md` reads a markdown file and creates one item per `##`
heading with the following prose as the description. It ignores everything else:
`Priority:` and `Type:` lines in the body were parsed as prose and both items
came out P2 tasks. It is a way to file a list of titles, not a way to seed.

**`bd create --graph plan.json` is the seeding path.** One JSON file, keys
instead of numbers, parents and edges resolved inside a single atomic apply:

```json
{
  "commit_message": "Seed the zoning epic",
  "nodes": [
    { "key": "zoning",  "title": "Zoning map digitisation", "type": "epic", "priority": 1,
      "labels": ["area:zoning"],
      "description": "Counter staff still trace parcels off a 1987 paper map." },
    { "key": "parcels", "title": "Import the parcel polygons", "type": "task", "priority": 1,
      "parent_key": "zoning", "labels": ["area:zoning"] },
    { "key": "overlay", "title": "Overlay the historic district", "type": "task", "priority": 2,
      "parent_key": "zoning", "labels": ["area:zoning"] }
  ],
  "edges": [
    { "from_key": "overlay", "to_key": "parcels", "type": "blocks" }
  ]
}
```

```
Created 3 issues
  overlay -> permit-scratch-4sr
  parcels -> permit-scratch-3yl
  zoning -> permit-scratch-8ms
```

Node fields follow the JSON names `bd show --json` emits, and an unrecognised
one is dropped with a warning on stderr rather than silently, which is how the
schema is discoverable at all: `bd create --graph` documents itself by
complaining. `--dry-run` validates the graph and reports the edge and
parent-child counts before anything is written. Edges belong in the top-level
`edges` array; a `deps` array on a node takes different field names and is easy
to get wrong quietly.

This collapses `github-backlog.md`'s two phases into one call, which also
retires the resumable state file that existed because a phase could die halfway.
Note what does *not* transfer: the port says `create` "must hand back a stable
id immediately, because seeding creates every parent before the children that
name it". That clause describes GitHub, not the port. With an atomic graph
apply, ids never have to exist before the links do.

## Concurrent writers

The documented limit is that embedded mode is single-writer, and every prior
note in this repo repeats it as a reason to expect trouble. Measured, on this
machine, it did not produce any.

Twelve `bd create` processes launched simultaneously across three git worktrees
of one repo: twelve exit-zero, twelve distinct ids, twelve items in the
backlog. Then twenty-four simultaneous mixed writes — eight creates, eight
comments on one item, eight labels on one item — across the same three
worktrees:

```
24 mixed simultaneous ops: failures=0 wall=13.0156577s
```

Nothing failed and nothing was lost: eight new items, eight comments, eight
labels all present afterwards. Writers serialise behind a lock and wait rather
than erroring, which is the behaviour the factory needs and the opposite of the
lost-write and duplicate-id failures the survey recorded for the alternatives.
Thirteen seconds for twenty-four writes is roughly half a second each, so treat
the lock as a throughput ceiling and not a correctness risk. `bd init --server`
against an external `dolt sql-server` is the escape hatch if that ceiling ever
matters, and on this evidence it does not yet.

Worktrees need no configuration. `bd` finds the repository's one `.beads` from
any linked worktree, and issue data lives in Dolt under `refs/dolt/data` rather
than on the branch, so switching branches does not switch backlogs.

## "Cannot be started yet" is computed here, not labelled

The port asks the backlog to say in the list whether an item can be started, and
why not when it cannot. On GitHub that is a label somebody has to remember to
remove. Here it is derived, and the loop's two report lines are two commands:

```bash
bd ready      # what could be dispatched now
bd blocked    # what could not, and what each one is behind
```

Two of the port's three reasons have a mechanism, and neither is a label.

**Behind another item is the port's `block` verb**, and beads is where that verb
came from: GitHub now has the same edge, so the port stopped calling this one a
label. `bd dep add <blocked> <blocker> --type blocks` prints back as "depends
on", the blocked item leaves `bd ready`, and `bd blocked` names the blocker:

```
🚫 Blocked issues (1):

[P2] permit-scratch-ixt: Publish the parcel viewer
  Blocked by 1 open dependencies: [permit-scratch-52z]
```

**Closing the blocker returns it to `bd ready`, with nothing else done to either
item.** The decay the GitHub side pays for by hand is simply absent: there was
never a mark to go stale, only an edge that stopped mattering.

**Waiting on the owner is a gate**, and an ad-hoc one needs no formula:

```bash
bd gate create --type=human --blocks <id> --reason="Warn or block on an expired licence"
bd gate resolve <gate-id>
```

The gate is an item that the target depends on, which is why one mechanism
covers both reasons and why `bd show` renders it under `DEPENDS ON`. Gate items
are hidden from `bd list`, so an escalation costs the backlog no clutter: it is
an absence from `bd ready` and a line in `bd blocked`. `bd gate list` names the
open ones and `bd gate show` prints the reason, which is where the *why* lives,
one hop from the *that*.

**No spec yet has no mechanism**, so it is a label here as it is on GitHub. A
`human` gate carrying that reason is the alternative if you would rather it left
`bd ready` too, and the choice is whether an unspecced item should look
undispatchable or merely unprioritised.

**The trap is `bd list`.** A blocked item prints there as `○ open`, identical to
ready work, and `bd list --status blocked` returns nothing, because the stored
status stays `open` while blockedness is a computed flag beside it. `bd ready`'s
own legend prints `● blocked` as a status, which is what makes `--status
blocked` such a natural wrong guess. So the port's `list` verb is `bd ready` or
`bd list --ready` whenever the question is what to dispatch. Reach for `bd list`
and you reproduce the exact failure this requirement exists to prevent, on the
tool that had already solved it.

GitHub has the identical trap in a different costume, which is why the port
states it as a rule rather than leaving it in either implementation: there,
`gh issue list` shows a blocked issue with no marker at all and the `blockedBy`
field lists blockers that are already closed. Name the command, not the field.

**What an item unblocks is the same edge read backwards**, and it is on the
item rather than in a list: `bd show <blocker>` renders a `BLOCKS` section
naming each dependent. Neither store ranks its ready list by how much each
entry unblocks, so the loop's "pick work that unblocks the most" stays judgment
sitting on top of the edge.

## What beads adds that the port does not ask for

- **`bd ready` annotates each item it lists with its epic.** The ready list
  itself is no longer an extra: the port asks for one now, and this is where the
  asking came from. The annotation is the part still being given away.
- **Closing an epic with open children is refused**, not merely discouraged:
  `cannot close permit-scratch-8ms: 2 open child issue(s); close children first
  or use --force to override`. One line of housekeeping that decays fast is now
  mechanical.
- **Gates** — `human`, `timer`, `bead`, `gh:run`, `gh:pr`. This is the provider
  pattern the port points at. Understand it before designing a seam; do not
  build a sibling for it on the strength of this document. Note that a gate
  gates *starting* and not only closing, which is what the section above turns
  on: closing behind either an open gate or an open dependency is refused with
  `cannot close blocked issue: <id> is blocked by [<id>] (use --force to
  override)`, and the same edge keeps the item out of `bd ready` until then.

## What it costs

**The backlog stops being reviewable in a diff.** Items live in Dolt, and
`.beads/issues.jsonl` is an export for viewers rather than the source of truth,
and is not written at all unless `bd config set export.auto true`. This is the
same trade ADR 0018 accepted elsewhere, and it is easier here: in guest mode
there is no pull request to review the backlog in until the publish step, and
the items being reviewed are the factory's own working notes rather than
anything the host repo's reviewers will read.

**One line still has to name it.** The port's whole cost of being pluggable is
this file plus a sentence saying which tool a given repo uses. In owned mode
that sentence goes in `AGENTS.md`. In guest mode it is a machine fact, so it
stays out of the tree with everything else behind `.git/info/exclude`.
