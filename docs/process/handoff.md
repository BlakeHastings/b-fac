# Handoff

**Written 2026-08-24, at `1a01485`, version 0.38.0.** Third edition. The second
was written 2026-08-12 at `ccf9002` and version 0.18.0, and by the time it was
read it was wrong about nearly every number in it, which is the argument for
this file rotting rather than an argument against having it.

A snapshot, not a source of truth. Everything durable is in the issues, the
ADRs, and `orchestrating.md`; this exists only to say where the work stopped and
what a successor would otherwise reconstruct. If it disagrees with the
repository, the repository is right.

## Where things stand

`main` is at `1a01485`, version 0.38.0, and `npm run check` is green on it.
**No pull requests were open when this session started**, and the last commit
before it was 2026-08-18. The repository sat still for six days.

Epic progress, counted from the **sub-issue edge**:

| Epic | Closed | |
| --- | --- | --- |
| #4 Skill effectiveness | 24 of 30 | the live one |
| #60 Own the process, or guest in someone else's | 19 of 26 | |
| #3 Harness coverage | 5 of 7 | |
| #5 Distribution | 6 of 7 | |
| #27 Agent visibility | 0 of 3 | parked behind #28, deliberately |

**Count epics from the edge, never from the `Parent: #N` body line.** The line
is present on 45 of those 73 children and the edge is on all 73, so counting by
line undercounts silently. It told me #4 was "7 of 13" a minute before the edge
said 24 of 30. The measurement and both commands are on #87, the issue that asks
whether the line still earns its place.

## What happened since the last edition, which is the part that matters

**The guest-mode field run the last handoff was waiting on has happened.** That
was its "one thing that is actually happening next", and it is done: a
derivative factory ran this skill in the field for roughly six days, and on
2026-08-18 and 19 it produced #135, #136, #137 and #138. #136 is merged.

That changes what this repository is doing. For most of its life the findings
came from agents working *on* the skill. These four came from the skill being
**used**, by somebody else, on work that was not this repository, and they are
better evidence for it: each names an incident with a cost attached rather than
a smell. Treat field-sourced issues as outranking internally-generated ones,
because they are the only evidence here that is not self-referential.

Two of them carry a warning that generalises past their own scope:

- **#135**: the field derivative fixed the probe defect with a raw-line regex,
  and its own handoff records that regex refusing a heredoc that merely
  *documented* the probe. That is #58 exactly, reintroduced downstream, in a file
  whose header explains why it is wrong. **A downstream fix is evidence of a
  defect, not evidence of a remedy.**
- **#138**'s third refinement is this repository's own recurring failure: two
  variants of one question live in a single investigation and the narrower
  answer gets quoted as the broader one. It happened again while this file was
  being written, on the epic counts above.

## In flight right now

Three agents, dispatched in one wave at the start of this session. **Each brief
is a comment on its issue rather than in the dispatch message**, so an agent that
compacts can recover it with `gh issue view <n> --comments`.

- **#135** the command-substitution probe hole. Foundation bug, and the one I
  would land first.
- **#138 batched with #116**, both in `references/briefing.md`. Batched because
  #138 says so itself, and two agents in that file is a rebase somebody chose.
- **#137** fan-out resume state, in `references/parallelism.md`.

All three change the payload, so all three bump `.claude-plugin/plugin.json`,
and each was told to re-read `origin/main` at push time rather than guess a
number. **Expect a rebase chain**: the ruleset requires branches to be up to
date, so the first merge puts the other two `BEHIND`. That is the known price,
and `orchestrating.md` says not to relax the ruleset to avoid it.

A fourth branch, `docs/handoff-2026-08-24`, is this file. Docs are not payload,
so it does not bump the version. Merge it last.

## What needs the owner

`needs-owner`, all with recommendations already on them: **#14** a third-party
marketplace listing, **#28** the shape of the visibility surface, **#57** paying
for usage testing, **#87** the `Parent: #N` line, which now has a measurement
under it rather than a preference.

**One question is asked and is not on an issue of its own**: whether the
`PreCompact` refusal from `assets/handoff-hooks.mjs` should be wired into this
repository's tracked `.claude/settings.json`. It is written up inside #128, it
changes the owner's own live sessions, and #128 says explicitly to get their
answer rather than infer it. The `SessionStart` half needs no answer and can go
in without it.

## Dispatchable now, in the order I would take them

**#128** (the `SessionStart` half only), **#134**, **#130**, **#105**, **#112**,
**#114**, **#93**, **#91**, **#64**, **#7**.

**#134** is the sharpest of these, and the shape of the answer is the work: what
should a report do when it holds a strong hint it cannot trust? Its own lean is
"suppress rather than switch", weakly held. Whoever takes it should read #131 and
#133 first, and must not let a per-checkout legacy record set the repository's
mode. That inversion is what ADR 0037 exists to prevent.

**Blocked, with reasons:** #78 and #79 behind #28. #123, where per-repository
factory state lives.

## Traps that cost something in this session

- **`gh issue list --jq` is gh's own jq and does not accept `--arg`.** It also
  reads `\b` in a bash single-quoted expression as a backspace, so a `test()`
  filter returns zero matches and looks like a real answer. Both produced a
  confident empty count here. Compare a structural count against a case you know
  before believing it, which is the same warning #137 carries about `edges=0`.
- **`assets/check-setup.mjs` exits 1 in this repository and that is correct.**
  Layer 3, the provenance audit, is deliberately absent under ADR 0001, which
  spends this repo's one tolerable permanently-red line on it knowingly. Do not
  install `check-main-provenance.mjs` here to make the output green. This has now
  been rediscovered more than once, so it is written in ADR 0001, in the asset's
  own header, and now here.

## How this owner works

Unchanged from the last edition, and still not written down anywhere else.

- **Keep working while questions are outstanding.** Their words: *"your objective
  is to keep working even when you need to ask me questions unless there's no
  work that can be done without questions being answered."*
- **Ask in prose, never with a blocking multiple-choice tool.**
- **They contest things, and they are often right.**
- **The question whose answer changes the design is worth asking three times.**

## What the agents keep teaching

Carried forward because it has not stopped being true, and the field run is now a
second, independent source for it: **the agents correct the orchestrator more
often than the reverse**, and always the same way. The brief named a specific
artefact to check, and checking it disproved something in the brief.

So the highest-leverage thing the next orchestrator does is **write briefs that
can prove the orchestrator wrong**, and then **verify what comes back by running
it rather than by reading it**.
