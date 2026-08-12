# beads as the local work queue

**The other implementation of the backlog port, and the one guest mode uses.**
`references/backlog-port.md` says what the loop needs from any task store;
`references/github-backlog.md` is the same seven verbs in GitHub's nouns. Read
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

## The seven verbs

| Verb | beads | Notes |
| --- | --- | --- |
| `create` | `bd create "Title" -t epic\|task\|bug -p 1 -l area:intake -d "..."` | `--silent` prints the id and nothing else, which is what a script wants. `--parent <id>` makes the child in the same call |
| `read` | `bd show <id>` | Renders description, labels, close reason, and a `CHILDREN` block with an *n*/*m* complete count |
| `list` | `bd list --limit 0`, `bd list --label waiting-on-owner` | Default limit is 50, and see below |
| `comment` | `bd comment <id> --file review.md`, read back with `bd comments <id>` | `--file` matters: the review record is four headings and a verdict, not a shell argument |
| `close` | `bd close <id> --reason "Duplicate of <id>, which has the better framing."` | The reason is stored and shown on the item |
| `link` | `bd dep add <child> <parent> --type parent-child` | Also `duplicates`, `blocks`, `related`. `--file deps.jsonl` for bulk |
| `label` | `bd label add <id> waiting-on-owner` | Labels are also settable at create with `-l` and inherited by children unless `--no-inherit-labels` |

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
is kept in the body beside the real edge, because the edge is invisible in a
terminal. Here `bd show` renders the tree, so there is nothing to duplicate and
nothing to keep in sync.

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

This collapses `github-backlog.md`'s three phases into one call, which also
retires the resumable state file that existed because phase two could die
halfway. Note what does *not* transfer: the port says `create` "must hand back a
stable id immediately, because seeding creates parents in one phase and links
children in a later one". That clause describes GitHub, not the port. With an
atomic graph apply, ids never have to exist before the links do.

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

## What beads adds that the port does not ask for

- **`bd ready`** lists items with no open blockers, annotated with their epic.
  The port says this loop has no computed ready state and does it by eye over
  the graph. It now has one, and "pick work that unblocks the most" is still
  judgment on top of it.
- **Closing an epic with open children is refused**, not merely discouraged:
  `cannot close permit-scratch-8ms: 2 open child issue(s); close children first
  or use --force to override`. One line of housekeeping that decays fast is now
  mechanical.
- **Gates** — `human`, `timer`, `bead`, `gh:run`, `gh:pr`, evaluated by
  `bd gate check` at close preflight. This is the provider pattern the port
  points at. Understand it before designing a seam; do not build a sibling for
  it on the strength of this document.

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
