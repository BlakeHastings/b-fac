# Handoff

**Written 2026-08-12, at `ccf9002`, version 0.18.0.** Second edition; the first
was written eight merges earlier the same day and was wrong about the largest
thing in it within the hour.

A snapshot, not a source of truth. Everything durable is in the issues, the
ADRs, and `orchestrating.md`; this file exists only to say where the work
stopped and what the next orchestrator would otherwise have to reconstruct. It
rots quickly. If it disagrees with the repository, the repository is right, and
if it is more than a few days old treat it as history.

## Where things stand

38 commits, version 0.18.0. The skill is 9 reference documents and 9 assets
behind one `SKILL.md`, installable as a plugin, and four harnesses have been
observed discovering it in a container.

Epic **#4 is 19 of 22**. **#60 is 13 of 21** and moved further in one day than in
the rest of the project. **#27 is 0 of 3 and parked**, deliberately, behind #28.

## The one thing that is actually happening next

**The owner is about to run the factory in guest mode on a real work
repository**, and feedback from that outranks everything in the backlog.

This is no longer the same sentence it was this morning. Guest mode then was an
instruction; ADR 0021 said so itself. It now has a gate that refuses outward
writes, a machine record that says which mode this checkout is in, a setup check
that reports the layers the mode actually calls for, and a discovery tool for
the host's own checks. None of it has ever run outside a test and a scratch
repository.

### The sequence, which is the useful part of this file

```bash
node <skill>/assets/guard-guest-writes.mjs --install   # in the host repo root
# restart the harness. Hooks are read once, at process start.
node .factory/guard-guest-writes.mjs --probe           # being refused is success
node <skill>/assets/check-setup.mjs                    # expect exit 0, four n/a rows
node <skill>/assets/discover-checks.mjs                # proposes, does not decide
node <skill>/assets/discover-checks.mjs --run          # the proposal is not real until this
```

Four things to say if they hit trouble, all in the docs and all easy to miss:

- **Invoke `b-fac:orchestrated-delivery`, never the bare name.** A bare skill
  name resolves to `~/.claude/skills/` first and cannot reach a plugin copy.
  Their personal copy is stale — it predates `check-setup.mjs`,
  `guard-guest-writes.mjs` and `backlog-port.md`. ADR 0012, and #34.
- **`bd setup claude` breaks guest mode**, even with `--stealth`: it writes
  `CLAUDE.md` and `.claude/settings.json` into the host repo. Guest mode is
  `bd init --stealth` and stop. The gate now refuses both, which is the point.
- **The probe must be run on its own line.** Inside a compound command the
  refusal kills everything else on that line, and it reads exactly like success.
  I lost a `git pull` that way and believed I was on a commit I was not (#82).
- **`discover-checks.mjs` refusing to propose is the correct outcome**, not a
  failure. It refused on three of the five repositories it was built against.

## What needs the owner, and what does not

**Theirs** (`needs-owner`): #14 a third-party marketplace listing, #28 the shape
of the visibility surface, #57 paying for usage testing, #87 whether the
`Parent: #N` body line still earns its place now that `gh` prints the edge.
Recommendations are on each. #28 is parked deliberately, and #78 and #79 are
labelled `blocked` behind it.

**One question is outstanding and is not on an issue.** What ecosystem is the
work repository — language, package manager, and whether a task runner or
Makefile is what people actually type. It is not a hinge for #68's design, with
one exception recorded in ADR 0032: a task *graph* (Bazel, Nx, Pants) turns the
entry point from a command into a query, which is a different shape.

**Dispatchable now, in the order I would take them:** #102 (the guard we ship
fails in both directions — in flight at time of writing), #104 (that guard
cannot be asked whether it is loaded), #100 (the machine record has one writer
and it only ever writes guest, so this repo prints NOT RECORDED for ever), #105,
#85, #86, #94, #91.

**Shaped but not started:** #80, the refinement stage. Read the owner's own
words on it: a spec carries what is in their head that an agent cannot derive,
and the test is whether an agent could work it out from the repository.

**Parked with reasons:** #64 stacked pull requests, #7 Cursor, #93 whether the
command reader should be one module — that last one is now a genuine open
question rather than a defect, because #101 made drift a red test.

## How this owner works

Discovered rather than stated, so it is not written down anywhere else.

- **Keep working while questions are outstanding.** Their instruction: *"your
  objective is to keep working even when you need to ask me questions unless
  there's no work that can be done without questions being answered."*
- **Ask in prose, never with a blocking multiple-choice tool.**
- **They contest things, and they are often right.** The design of epic #60
  changed materially twice because they pushed back.
- **The question whose answer changes the design is worth asking three times.**

## What the agents keep teaching

Across roughly forty dispatches, **the agents corrected the orchestrator far
more often than the reverse**, and always in the same way: the brief named a
specific artefact to check, and checking it disproved something in the brief.

The day this file was rewritten, that happened six times. Four are worth
carrying:

- I asserted only Claude Code has a pre-execution hook, so a gate could not be
  the portable answer. All five harnesses have one. The constraint is that only
  two document an *untracked* config file (ADR 0029).
- I drew the line at "shell syntax in, wrapper commands out" and then missed
  that `VAR=value cmd` is syntax. An agent found it, and found that it bypassed
  the liveness probe, which made a gate able to lie about being inert (#97).
- I repeated, in two briefs, that parallel branches would hit a one-line version
  conflict. When both guess the same next number there is no conflict at all,
  and the branch quietly claims a released version. The check catches it; the
  merge does not (#105).
- I described the guard we ship as having the holes we had closed. Measured, it
  fails the *other* way — it denies four ordinary commands, three of them the
  exact false positives this repo fixed under #58 (#102).

So the highest-leverage thing the next orchestrator does is **write briefs that
can prove the orchestrator wrong**, not review harder. Every one of those was
caught by an agent doing something the brief told it to check, and two by agents
reading files the brief told them not to touch and reporting rather than fixing.

**Verify what comes back by running it, not by reading it.** Every merge above
was preceded by re-running the agent's own measurements. One of those re-runs is
the only reason #102 exists.

## Known machine state, not a repo problem

`npm run check:plugin-load` fails on the owner's machine because
`~/.claude/skills/orchestrated-delivery` is stale and disagrees with the
canonical copy. It is #34, it passes in CI, and fixing it means writing to their
home directory, which is theirs to do. Six agents have now flagged it; each was
right to leave it alone.
