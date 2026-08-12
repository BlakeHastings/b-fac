# 0028. beads is the local implementation of the backlog port

Status: accepted

Parent epic #60, issue #77. ADR 0024 defined the port and deliberately did not
choose a tool. ADR 0021 defines the write boundary this has to respect. The
survey is `docs/research/2026-08-12-local-backlog-and-storage.md`, which is a
starting point rather than truth: beads had moved repository again by the time
this was written.

## Context

ADR 0024 ended with "nothing is adopted", and that was correct on the day. What
it left behind was a guest-mode run with a port and no tool, which means the
factory improvises a backlog — the exact thing the port exists to stop.

The owner chose beads. The remaining question was not which tool but whether the
chosen one survives contact: this machine is Windows 11, the survey never ran
anything on it, and the survey's own headline risk was that embedded mode is
single-writer while this workflow runs several agents in parallel worktrees.

## Decision

**beads (`bd`) is the local implementation of the seven verbs**, and
`references/beads-backlog.md` is the sibling of `references/github-backlog.md`
that maps them. Every command in it was run against a throwaway repository on
Windows 11 build 26200 with beads 1.2.1 before it was written down.

**Guest mode is `bd init --stealth` and stops there.** That one command writes
`.beads/` and appends to `.git/info/exclude`, which is ADR 0021's mechanism
arrived at independently by another project, and it leaves `git status` empty.
`bd setup claude --stealth` does not: it modified two *tracked* files in a host
repo, `CLAUDE.md` and `.claude/settings.json`, with the stealth flag on the
command line. The stealth exclude covers `.claude/settings.local.json` and
neither of those. So the boundary is drawn at the tool's commands rather than at
its flags, because one of its flags is wrong.

**Owned mode is `bd init --skip-agents`.** Bare `bd init` writes `AGENTS.md`,
`CLAUDE.md`, `.gitignore`, `.claude/settings.json`, `.codex/`, `.cursor/` and a
`.agents/skills/beads/SKILL.md`, then commits all nineteen files itself. It
merges rather than clobbers, so nothing was lost in the test, but a foreign
skill inside `.agents/skills/` would break this repository's generated mirror
and an unrequested commit is not something an agent working an issue should
produce.

**The single-writer warning is retired as a reason to plan around.** Twenty-four
simultaneous mixed writes from three worktrees of one repository: zero failures,
zero lost writes, 13.0 seconds. Writers serialise behind a lock and wait rather
than erroring. It is a throughput ceiling, not a correctness risk, and
`bd init --server` stays an escape hatch nobody has needed. This is the one
place the survey was actively misleading, and it was misleading because it was
inferred from documentation rather than measured.

## Consequences

**Two clauses in the port turn out to describe GitHub rather than the port**,
and are recorded here rather than edited into `references/backlog-port.md` on
one implementation's evidence. First, `create` "must hand back a stable id
immediately, because seeding creates parents in one phase and links children in
a later one" — `bd create --graph` applies nodes, parents and edges atomically
from keys, so ids never precede links and the resumable state file has nothing
to be resumable about. Second, the port's single body mutation, a `Parent: #N`
line kept beside the real edge, exists because GitHub's edge is invisible in a
terminal; `bd show` renders the tree, so the mutation disappears and the port is
a clean seven verbs with no writes to an existing body at all.

**`list` wants "not silently truncated" rather than "not truncated".** beads
truncates at 50 by default and says so on the same screen. That satisfies what
the requirement is for, which is that `Next: nothing` cannot be a lie.

**The loop gains a computed ready state it did not ask for.** `bd ready` is the
`list-ready` verb the port explicitly declined, and closing an epic with open
children is refused rather than discouraged. Neither changes the loop; both
retire a line of housekeeping that decays when skipped.

**The backlog stops being reviewable in a diff**, which ADR 0018 already
accepted for the generated mirror. It costs less here: in guest mode there is no
pull request until publish, and the items are the factory's working notes rather
than anything the host's reviewers read.

**This repository does not adopt it.** The backlog here stays GitHub issues, as
`AGENTS.md` says. Adopting beads means teaching the shipped skill to drive it,
not switching this repo's own store.

**Nothing mechanical holds this.** No check installs `bd`, verifies its version,
or catches the day `bd setup claude` starts honouring its own flag. The
reference document names the version it was verified against, and that is the
whole guard.
