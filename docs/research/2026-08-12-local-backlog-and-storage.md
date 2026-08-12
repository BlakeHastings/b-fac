# Local issue trackers and where a backlog can live

**Verified on** 2026-08-12

Asked for #60, to decide whether a backlog has to be GitHub's, and feeding #61.
Everything before "Inferred, not measured" was checked against a live source on
the verified-on date. Rehomed from an issue comment on that same date without
re-checking anything, so the date is the date of the research, not of the file.

## What the decision turns on

Two candidates survive, and **they answer different questions**, so the choice
is a choice of driver rather than of tool.

| | **beads** (`bd`) | **Backlog.md** |
| --- | --- | --- |
| Licence | MIT | MIT |
| Storage | embedded Dolt in `.beads/`, JSONL export | one `.md` plus frontmatter per task, in-tree |
| Forge sync | bidirectional GitHub, Jira, Linear | none found |
| Reviewable in a PR diff | no | yes |
| Agent story | `bd setup claude/codex/cursor`, MCP, `--json` | AGENTS.md/CLAUDE.md, MCP, versioned `--json` |
| Worktrees | all worktrees share one `.beads`, data in `refs/dolt/data` | in-tree, so one copy per worktree |
| Main risk | embedded mode is single-writer, and parallel agents need `bd init --server` | ID allocation and lost writes, both observed in production |

If the driver is "the same backlog works on and off GitHub", beads already is
that. If it is "the backlog lives in the repo, reviewable and greppable", it is
Backlog.md and the one-way GitHub import is ours to write. Both were actively
committed to within two days of the verified-on date.

## git-bug is architecturally right and still disqualified

The design is the one we would have drawn: issues in `refs/bugs/*`, outside the
working tree, shared across every worktree of a clone with no commit and no
merge. Confirmed locally, by writing a ref in the main repo and seeing it
instantly from a worktree.

Three disqualifiers, in order of weight:

1. **An open `Access is denied` bug on `bug new`, reproduced on Windows 11
   build 26200**, which is this machine's exact build. Open since 2024-03-08,
   33 comments, no fix PR. It is structural rather than incidental: the failure
   is renaming a pack object onto the empty blob that the Lamport-clock tree
   entries reference.
2. **No parent or sub-issue concept at all.** The op types have no notion of
   one, so a dependency graph would have to live in `SetMetadataOp`.
   `references/github-backlog.md` argues specifically for real sub-issue links
   over a label convention.
3. **Invisible in PR diffs**, being a disjoint DAG that no forge renders.

Also: v0.10.1 dates from May 2025 with trunk 234 commits ahead, and nothing
merged since 2026-07-01.

## Two arguments this survey overturned

**"SQLite bloats the repo" was right for the wrong reason.** The bloat claim is
unevidenced: the one published measurement has two revisions of an 864 KB
database packing to 329 KB, roughly one gzipped copy. Drop that argument. The
real hazard is **WAL**. SQLite's own documentation says separating a database
from its WAL file can lose committed transactions or corrupt the file, and the
universal advice to gitignore `-wal` means a `git checkout` or `git stash` over
a live database can commit a torn one. Taskwarrior 3 is the cautionary tale: it
moved to SQLite in 2024, sets `journal_mode=WAL` with no `busy_timeout`
anywhere, and two parallel read-only `task count` calls fail with "database file
is locked". Someone had to write a separate tool purely to merge conflicted
copies.

**Markdown-per-file is not conflict-free either. It relocates the problem to ID
allocation.** Backlog.md #711, observed twice in production: two writers
creating tasks between one another's pushes deterministically mint the same ID.
The maintainer rejected random IDs and shipped detection instead. And #843:
eight parallel `task edit` calls all exited 0 with seven writes silently lost,
12 of 12 trials losing a write when simultaneous. Fixed in August with fail-fast
locking; four write paths remain unprotected.

Two fixes worth stealing if this repo ever writes its own storage: take the
create lock in `$(git rev-parse --git-common-dir)` and scan sibling worktrees
including uncommitted files; and dstask's trick of moving the human-facing
sequential ID out of the committed file into a machine-local cache, which it did
precisely because per-task stored IDs caused merge conflicts across machines.

## Nothing in the Claude ecosystem to conform to

`~/.claude/todos/` is documented as legacy, no longer written and actively
swept. Do not build on any `~/.claude` path.

## Inferred, not measured

- **beads' single-writer limit** comes from its documentation, not from running
  parallel agents against it. The failure mode under our own worktree pattern is
  unmeasured.
- **`RaphaelDolling2020/gh-issue-sync` being SEO spam** is inference. What was
  measured is that it ranks highly in search and returns nothing from the API.
  "Impersonating mitsuhiko's real tool" is the most likely reading of that, not
  a fact. Either way, do not install it.

## Could not be confirmed

The original pass recorded nothing it had tried and failed to establish. Read
that as "no gap was noticed", not as "no gap exists": this survey went looking
for tracker candidates and was not asked what it had missed.

## Dead ends, recorded so nobody re-treads them

- `claude-task-master` pivoted to SaaS under MIT plus Commons Clause.
- `vibe-kanban` formally shut down in April 2026.
- `mcp-shrimp-task-manager` has been dead since 2025 and still tops every
  listicle, which is why it keeps coming back.
- SIT is dead and its domain now belongs to a restaurant startup.
- `driusan/tissue` does not exist.
- `RaphaelDolling2020/gh-issue-sync`: see above. Do not install it.

Popularity counts were part of the original pass and are deliberately not here.
They rot fastest, they were never what the decision rested on, and a stale one
argues for the wrong tool with an air of authority.

## An unrelated finding

`gh` shipped native sub-issue support in v2.94.0 (`--parent`,
`--add-sub-issue`, `--blocked-by`, `--blocking`, `--type`), which makes the raw
`gh api ... /sub_issues` recipe in `references/github-backlog.md` obsolete for
anyone current. That is #62.

## How this rots

The candidate table is the fragile part. beads had already moved repository and
changed storage engine once inside the month before this was written, which is
the whole reason this file exists rather than a memory. Anything here about
storage, sync or release state is a claim about 2026-08-12 and should be
re-checked before it decides anything.
