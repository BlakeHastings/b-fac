# 0069. A destructive git command is refused on a tree holding uncommitted work

Status: accepted

Issue #188, the guard half. Amends ADR 0068, which kept the `git arguments`
region out of `scripts/guard-merge.mjs` because that file read no `git`. ADR
0001 is the decision this one is measured against: it removed the rules that
looked at a tree, for a reason that still holds, and ADR 0029 still refuses a
shared module.

## Context

One orchestrating session destroyed uncommitted work three times with a force
flag: an agent's only file, untracked, under `git worktree remove --force`
(#182); a backlog item under `git reset --hard`; and the owner's `README.md`
and ten layout files under a second `git reset --hard`. A written rule came
after the first two and did not stop the third. The orchestrator is not the only
writer in a main checkout, and nothing it can read says who wrote what.

## Decision

**Both merge guards refuse `git reset --hard`, `git checkout -f`, `git switch
-f` or `--discard-changes`, `git checkout -- <paths>`, `git checkout .`, `git
restore` without `--staged`, `git clean -f`, a bare `git stash drop`, `git
stash clear` and `git worktree remove --force`, when the tree they act on holds
something they would destroy.** It is a second rule in the existing guards, in
a marked region, `uncommitted work`, with its own stamp. A new guard file would
have been a fourth copy of the reader.

What counts is what each command takes, read from `git status`:

| command | judged on | counts |
| --- | --- | --- |
| `reset --hard`, `checkout -f`, `switch -f` | the tree | tracked changes and untracked files |
| `checkout -- <paths>`, `checkout .`, `restore` | the paths it names | tracked changes |
| `clean -f` | the paths it names | untracked files, and ignored ones with `-x` or `-X` |
| `stash drop` with no entry, `stash clear` | the stash | its entries |
| `worktree remove --force <path>` | `<path>` | tracked changes and untracked files |

**Allowed on a clean tree, and allowed in a linked worktree**, because a
throwaway worktree is the remedy and a guard that blocks it gets switched off.
Two exceptions to the worktree allowance. `worktree remove --force <path>` is
judged on `<path>`, wherever it runs. The stash is judged on the stash, with no
worktree allowance, because every worktree of a repository shares one stack.

**The tree** is the directory in the payload's `cwd`, moved by each `git -C`.
A `cd` earlier on the same line cannot be followed: the hook runs before the
line does. It is listed as not covered, and the refusal points at `git -C`. A
path built from a variable the hook inherited is expanded; one it cannot
resolve (a variable the line sets, a `$(...)`, `--git-dir`, `--work-tree`) is
refused rather than guessed at.

**The override is `git -c guard.destructive=ok ...`**, on git's own line. An
environment prefix was the brief's example and was not chosen: PowerShell has
no prefix form, the reader strips a prefix before any rule sees the command,
and `$env:` would outlive the one command it was meant for. git ignores a `-c`
it does not know. An override an agent adds on its own is a finding for review,
not a failure of the guard.

## Where this departs from the brief

- **The stash.** The brief listed `git stash drop` and `git stash clear` beside
  the tree commands. Judged on the tree they are wrong both ways: `stash apply`
  then `drop` is refused because the apply dirtied the tree, and a drop in a
  linked worktree is allowed although the stack is shared. They are judged on
  the stash instead, and a drop that names its entry is allowed.
- **Paths and kinds.** `checkout -- <paths>`, `restore` and `clean` are judged
  on the paths they name and on the kind of file they touch, so an unrelated
  edit does not refuse a restore of another file.
- **`git switch -f`** is added. It is `checkout -f` by its newer name.

## Consequences

The false-positive cost was measured before choosing. No instruction in
`docs/`, `AGENTS.md` or the skill tells anyone to run a command this refuses;
the only hits are the prose describing this rule, and #182's in-flight text
names `--hard` only to send it to a worktree.

Across the 1,114 shell commands in this project's session transcripts on
2026-09-25, 26 were commands the rule examines, not counting the measurement's
own. The 12 run in a linked worktree are allowed. Of the 14 run from the main
checkout, 2 were `git worktree remove --force`, judged on the worktree removed,
one of them right after a clean `status --porcelain`, so allowed. The other 12
ran behind a `cd` into a review worktree (`cd $W && ... git checkout -q -- .`).
The rule judges those on the main checkout, so each would be refused if, and
only if, the main checkout held tracked changes at that moment. That is the
measured cost. The refusal says why and names `git -C` with a literal path as
the way through.

The file names say only the first rule. They are left alone so the hook entries
that run them keep working.

The `git arguments` stamp moved in all three guards, because `gitCall` now
returns the `-C` and `-c` values beside the arguments.
