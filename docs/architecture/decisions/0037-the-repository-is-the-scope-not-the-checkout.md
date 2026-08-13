# 0037. The repository is the scope, not the checkout

Status: accepted

Parent epic #60, issue #122. ADR 0021 defines the write boundary and where
machine facts live, ADR 0029 gives guest mode a gate and refuses to put it in
the operator's home directory, ADR 0030 lets a report read the mode and forbids
a gate to, ADR 0039 gives the owned answer a writer, and ADR 0012 is the
precedent for a check that reads outside the repository.

## Context

**Found by the owner, in the first real guest-mode run, on a work repository.**
Not by a test, not by an agent, and not by any of the four documents above,
three of which describe the arrangement that was wrong.

`--install` wrote `.factory/` and `.claude/settings.local.json` into the working
tree, both untracked by design, because ADR 0021 forbids touching a tracked file
in a repository you are a guest in. **A linked worktree has no untracked files.**
So a worktree had no gate, no machine record and no hook registration, and the
subagents that push branches, open pull requests and comment on the host's
tracker are precisely the sessions that run in worktrees. Every write the
boundary exists to refuse was made by a process the boundary never reached.

Nothing here caught it because this repository's own `.claude/settings.json` is
tracked, so it checks out in every worktree and the merge guard has always
reached subagents. Guest mode uses `settings.local.json` *because* it must not
be tracked. **The mechanism that makes guest mode polite is the mechanism that
made it absent.** ADR 0019's reason for containerising harness verification
applies again: this repository is not a fair test of itself.

Two things were measured before anything was decided, in a scratch repository
with real linked worktrees.

**Where the harness reads settings from.** Claude Code 2.1.228, `SessionStart`
hooks used as markers:

| Session started in | Main checkout's `.claude/settings.local.json` fires |
| --- | --- |
| the main checkout | yes |
| a sibling linked worktree | **no** |
| a linked worktree nested at `.claude/worktrees/x` inside the main checkout | **no** |

There is no parent search, no repository search, and nothing reads `.git/`. The
project scope is the directory the session started in and nothing else.
`$CLAUDE_PROJECT_DIR` is that same directory, so in a worktree session it is the
worktree — which settles the open question in the issue: the hook's *script
path* does not resolve either, so the script needed relocating and not only the
wiring.

The operator's own `~/.claude/settings.json` **is** read for a worktree session.
Measured without writing to it: a hook launched from a worktree session saw
`CLAUDE_CODE_ENABLE_TELEMETRY=0`, which is set only by the `env` block of that
file.

**Which git fact is the same from every checkout.** The clause ADR 0029 killed
was the merge guard's `git rev-parse --abbrev-ref HEAD`, and what made it
unsound was that its answer differed between checkouts of one repository, so a
worktree allowed a command the main checkout denied. From a main checkout and a
sibling and a nested worktree of it:

    git rev-parse --show-toplevel      three different answers
    git rev-parse --git-dir            three different answers
    git rev-parse --git-common-dir     one answer, byte for byte

`.git/info/exclude` was already being resolved through `--git-common-dir` in
`guard-guest-writes.mjs`, with a comment saying "a linked worktree and its main
checkout share one. That is the right scope." **The reasoning was already in the
file and had been applied to one file out of three.**

## Decision

**Per-repository factory state lives in the git common directory.** The gate,
the machine record and the discovered check command move from `.factory/` at the
working-tree root to `factory/` inside `.git/`. One repository, one copy, read
identically from every checkout.

That also retires half of ADR 0021's mechanism and strengthens what it was for.
`.git/info/exclude` was chosen over `.gitignore` because editing a tracked
ignore file to hide your own scratch state is itself a change to somebody else's
repository. True, and one step short: git does not look inside `.git/` at all,
so "the host repo's `git status` is unchanged" stops depending on an exclude
line having taken and becomes a property of the location. The exclude append
survives only for `.claude/settings.local.json`, which is the one thing still
written into a working tree.

**The registration has two forms, they cover different sessions, and both are
named out loud.**

| Registration | Covers | Written by |
| --- | --- | --- |
| `.claude/settings.local.json` in one checkout | sessions started in that directory, and nothing else | `--install` |
| `~/.claude/settings.json`, carrying `--scope` | every session inside the one repository it names, worktrees included, and worktrees that do not exist yet | **the operator** |

`--install` writes the first and **prints** the second. ADR 0029's first refusal
survives intact and is worth restating rather than quietly dropping: writing to
somebody's home directory is theirs to do, and #34 is a live example of a stale
copy there that several agents correctly declined to fix. Printing a block is
not installing it, and ADR 0029 already contemplated exactly that.

**`--scope` answers ADR 0029's second refusal instead of waiving it.** That
refusal was the real one: a user-level hook follows the operator into every
other repository on the machine, where every command it refuses is a false
positive by construction, and this repository has written down three times what
happens to a guard that cries wolf. So the printed block names the repository it
was installed for, and the gate exits without judging anything anywhere else.

Two properties make that different in kind from the clause ADR 0029 refused, and
both are why the answer here is a scope rather than an honest admission that the
gate is machine-wide.

- **It is not a verdict.** Every rule still reads the command text and nothing
  else. The scope decides whether this gate is about this repository at all,
  which is a fact about the session, not about the command in front of it.
- **The fact it reads is invariant across checkouts**, measured above. The
  clause that failed was wrong precisely because its fact was not, and reading
  the mode off disk — the other thing ADR 0029 refused — is still refused: the
  scope is a literal written into the wiring when the operator installed it, not
  a file the gate goes and consults. Installing the gate is still the
  declaration.

**It fails toward allowing.** A scope that cannot be resolved, because git does
not answer or the directory is not a repository, means this is not the
repository the hook was installed for and the gate stands aside. The other
direction would have a machine-wide hook denying `git push` in every directory
on the machine where git happens to be silent, which is the false positive that
gets the whole thing uninstalled by Tuesday.

**The cost is one new hole and it goes in the file's own list.** A command that
`cd`s from an out-of-scope directory into the guest repository and pushes is
allowed, because a `PreToolUse` hook runs before the `cd`. That is the same seam
as `sudo git push` and `env gh pr create`, which the gate already leaves open
and already explains: the threat model is an agent that forgot, not one that is
hiding.

**The report tells the truth from a worktree, which meant learning both
questions.** `check-setup.mjs` reads the machine record from the common
directory, so the mode is right from any checkout, and it reads
`~/.claude/settings.json` for the machine-wide registration, which ADR 0012
already established a check here may do: the question "which sessions is this
gate registered for" has an answer that is not inside the repository, and
reporting only the half that is would be the same lie. Layer G now enumerates
`git worktree list` and names the checkouts with no wiring, so a gate wired for
some sessions and not others is PARTIAL with the gap listed by path, rather than
`ok`.

## Consequences

**The worst state the old arrangement reached was not the one the issue
described, and it is worth recording because nobody had run it.** From a
worktree of a repository recorded as guest, `check-setup.mjs` did not report
`[ ok ] G`. It reported the boundary NOT RECORDED, reported all four *owned*
layers MISSING, and told the operator to install a merge wrapper, a guard hook
and a CI workflow **into a repository they are a guest in** — every one of them
a change to somebody else's repository, which is the single thing guest mode
exists to prevent. And `--record-owned`, whose two refusals both read the
checkout, would happily write `Write boundary: owned` into that worktree, leaving
the repository holding two records that contradicted each other: exactly the
disagreement ADR 0039 built those refusals to prevent, manufactured by standing
in a different directory.

**"Which sessions does this cover" is now a question every layer here has to
answer, and only this one does.** The merge guard is wired through this
repository's tracked `.claude/settings.json`, so it reaches worktrees by
accident rather than by design, and a repository installing this skill's owned
stack into an untracked settings file has the identical hole with nothing
reporting it. Filed rather than fixed here: layer 2 deserves its own change, for
the same reason ADR 0029 gave for not extending the merge guard in passing.

**`--scope` costs one `git rev-parse` per shell tool call**, and only when it is
present. The per-checkout wiring is unscoped and spawns nothing extra.

**A machine-wide install is a deliberate pair.** Installing it and removing it
are both the operator's, and `--install` says so where it prints the block. What
is refused is a *silently* machine-wide gate, not a machine-wide one.

**Two `.factory/` directories can now exist**, in a repository installed before
this. Nothing reads the old one. Both `--install` and layer G report it and
neither removes it: deleting a directory in a repository that is not ours,
because we think we know what is in it, is the wrong way round.

**#123 asked where per-repository factory state belongs and blocked itself
behind this issue, on the grounds that whatever #122 did would be its first data
point.** The answer generalises: the git common directory takes all three files
that were in `.factory/`, needs no external store, needs no server, and is
per-repository rather than per-checkout by construction. What it does **not**
solve is the half that is not state at all. The hook *registration* has to live
where the harness looks, and the harness looks in the working tree, so no store
however well chosen would have covered it. #123 should close into this for the
state and stay open for nothing, or be reopened for a question that is actually
about a store — surviving a re-clone, which this does not.

**The suite was not trusted for passing, and one mutation survived the first
pass.** Eleven were applied to the implementation one at a time: the machine
record written to the checkout instead of the common directory, the scope
comparison always true, always false, and case-sensitive on Windows, the printed
block carrying no `--scope`, that block written to the home directory instead of
printed, layer G ignoring the machine-wide registration, layer G counting an
out-of-scope one, layer G no longer enumerating the other checkouts,
`--record-owned` reading the checkout again, and the discovered check command
going back to the working-tree root. Ten were caught, by between one and
twenty-four tests each.

The survivor is worth naming because of which direction it fails in. **Nothing
asserted that the scope comparison is case-insensitive on Windows.** The two
sides come from different places — one from `git rev-parse`, one from a JSON
string the operator pasted — and on Windows they can spell the same path two
ways. A case-sensitive compare makes the gate stand aside *inside* the
repository it was installed for, silently, in the allowing direction: the same
shape of hole as the one this issue is about, reintroduced by the fix for it.
There is a test now.
