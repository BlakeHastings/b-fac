# Handoff

**Written 2026-08-12, at `0d40286`, version 0.12.0.**

A snapshot, not a source of truth. Everything durable is in the issues, the
ADRs, and `orchestrating.md`; this file exists only to say where the work
stopped and what the next orchestrator would otherwise have to reconstruct. It
rots quickly. If it disagrees with the repository, the repository is right, and
if it is more than a few days old treat it as history.

## Where things stand

30 commits, **zero open pull requests, zero worktrees**, all checks green. The
skill is 8 reference documents behind one `SKILL.md`, installable as a plugin
today, and four harnesses have been observed discovering it in a container.

Twelve open issues, all parented to an epic. Epic **#4 is complete** — 19 closed,
nothing open that is not new work.

## The one thing that is actually happening next

**The owner is about to run the factory in guest mode on a real work
repository**, and feedback from that outranks everything in the backlog.

This matters more than its size suggests. Every design decision under epic #60 —
the write boundary, convention authority, the seven-verb port, "their reviewers
are the gate" — was derived from **one worked example: this repo**, which is
owned-and-ours, the easiest corner of the model. Guest mode has never been run.

Two things to tell them if they hit trouble, both already in the docs and both
easy to miss:

- Invoke `b-fac:orchestrated-delivery`, **never the bare name.** A bare skill
  name resolves to `~/.claude/skills/` first and cannot reach a plugin copy.
  Their personal copy is stale. ADR 0012 and #34.
- **`bd setup claude` breaks guest mode**, even with `--stealth`: it writes
  `CLAUDE.md` and `.claude/settings.json` into the host repo. Guest mode is
  `bd init --stealth` and stop. The tool ships `setup` as the obvious command,
  which is why this is written down.

When feedback arrives, resist filing it as ten issues. Look for what was wrong
**twice**. That rule has held all week.

## What needs the owner, and what does not

**Theirs** (`needs-owner`): #14 listing in a third-party marketplace, #28 the
shape of the visibility dashboard, #57 whether to pay for usage testing beyond
Claude. Recommendations are on each issue. #28 is parked deliberately with the
intended shape recorded.

**Dispatchable now, in the order I would take them:** #76 (guest mode's write
boundary is prose, not a control — the largest gap between what an ADR claims
and what exists), #68 (discovering an unknown repo's checks, the unbuilt half of
guest mode), #62 (an obsolete `gh api` sub-issue recipe; `gh` 2.94 has flags),
#82 (hook registration is snapshotted, the script it runs is not).

**Shaped but not started:** #80, a refinement stage where large work gets a spec
before it can be dispatched. Read the owner's own words on it — the purpose is
that *a spec carries what is in the owner's head that an agent cannot derive*,
and the test is whether an agent could work it out from the repository. It exists
to make the night run possible.

**Parked with reasons:** #64 stacked pull requests, #7 Cursor (no headless mode,
no skills surface).

## How this owner works

Discovered rather than stated, so it is not written down anywhere else.

- **Keep working while questions are outstanding.** Their instruction: *"your
  objective is to keep working even when you need to ask me questions unless
  there's no work that can be done without questions being answered."*
- **Ask in prose, never with a blocking multiple-choice tool.** They asked for
  this explicitly at the start of the session, before any work began.
- **They contest things, and they are often right.** The design of epic #60
  changed materially twice because they pushed back — once on the merge path
  staying GitHub, once on what a spec is for. Give a recommendation with its
  cost, then argue it if they disagree.
- **The question whose answer changes the design is worth asking three times.**
  Guest mode was designed as "replace GitHub locally" for two exchanges because
  I had not established the driver. When they answered, the design inverted.

## What the agents keep teaching, which is the most useful thing here

Across roughly thirty dispatches, **the agents corrected the orchestrator far
more often than the reverse**, and always in the same way: the brief named a
specific artefact to check, and checking it disproved something in the brief. The
fallibility clause that #20 removed produced zero contradictions across twenty
briefs; naming a checkable artefact produces one nearly every time.

So the highest-leverage thing the next orchestrator does is **write briefs that
can prove the orchestrator wrong**, not review harder. Two of my own false
invariants shipped this week and neither was caught by anyone reading — both were
caught by mechanisms an agent built.

## Known machine state, not a repo problem

`npm run check:plugin-load` fails on the owner's machine because
`~/.claude/skills/orchestrated-delivery` is stale and disagrees with the
canonical copy. It is #34, it passes in CI, and fixing it means writing to their
home directory, which is theirs to do. Several agents have flagged it; each was
right to leave it alone.
