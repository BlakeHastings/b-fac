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

This session opened at `1a01485`, version 0.38.0, with `npm run check` green,
**no pull requests open**, and the last commit six days behind it on 2026-08-18.
`main` has since moved to 0.41.0 across four merges.

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

**Each brief is a comment on its issue rather than in the dispatch message**, so
an agent that compacts can recover it with `gh issue view <n> --comments`. That
convention paid for itself this session for a reason nobody planned: see the
`@-` trap below.

**Landed this session**, in merge order, taking `main` from 0.38.0 to **0.41.0**:

- **#142** (#137), fan-out resume records and ADR 0044. Sent back once for
  carrying two contradicting ordinals for one object: a filename saying *fifth*,
  a heading saying *fourth*, and an H1 that had already found the right answer by
  dropping the number.
- **#144** (#138 with #116), `references/briefing.md` and ADR 0046. Sent back
  once: the ADR said "eight-element list" and there are ten. The count came from
  #116 and I repeated it in the brief without checking, which is the failure the
  same pull request adds a rule against. It is recorded inside ADR 0046 as
  exactly that, rather than quietly corrected.
- **#146** (#128), the `SessionStart` half. **This repo now runs the compaction
  hook it publishes**, with a test asserting `scripts/handoff-hooks.mjs` stays
  byte-identical to the asset. Mirror that copy on any change to the asset.
- **#148** (#143), `scripts/post-body.mjs` and ADR 0049. Posts a body from a
  file, reads the artifact back, and fails when they differ. **Use it.** It
  replaced the note at `reviewing.md:274` rather than joining it.

**Open:**

- **#147** (#135), the command-substitution probe hole.
- **#134**, **#145**, **#105**, all dispatched with briefs on their issues.
- `docs/handoff-2026-08-24`, this file. Docs are not payload, so no version bump.
  Merge it last.

**Expect a rebase chain.** The ruleset requires branches to be up to date, so
each merge puts every other open PR `BEHIND` and `merge-pr.mjs` refuses it by
design. Rebases belong to the branch owner, not the reviewer. #144 and #142 both
took 0.39.0 independently and did not conflict, which is #105 exactly: the more
disciplined the agents, the more identical the edit.

## What needs the owner

`needs-owner`, all with recommendations already on them: **#14** a third-party
marketplace listing, **#28** the shape of the visibility surface, **#57** paying
for usage testing, **#87** the `Parent: #N` line, which now has a measurement
under it rather than a preference.

**#141** is the live one: whether the `PreCompact` refusal should be wired into
this repository's tracked `.claude/settings.json`, which would refuse the owner's
own manual `/compact` when the handoff is stale. Split out of #128 so that
issue's safe half stayed dispatchable. My recommendation is yes, revised to
*settle #145 first*, because the staleness it refuses on rests on a measure now
known to be unsound where it ships. Both the recommendation and the revision are
on the issue.

## Dispatchable now, in the order I would take them

**#149** (issue creation is the one body-carrying call `post-body.mjs` does not
cover, and it is where the worst artifact died), **#130**, **#112**, **#114**,
**#93**, **#91**, **#64**, **#7**.

#134, #145 and #105 are dispatched rather than waiting, and each has its brief as
a comment on the issue.

**#134** is the sharpest of these, and the shape of the answer is the work: what
should a report do when it holds a strong hint it cannot trust? Its own lean is
"suppress rather than switch", weakly held. Whoever takes it should read #131 and
#133 first, and must not let a per-checkout legacy record set the repository's
mode. That inversion is what ADR 0037 exists to prevent.

**Blocked, with reasons:** #78 and #79 behind #28. #123, where per-repository
factory state lives.

## Traps that cost something in this session

- **`gh --body @-` writes the literal string `@-`.** It is a `curl` convention;
  `gh` takes `--body-file -`. The call exits 0 and prints a URL, and
  `gh issue view --comments` renders the stored body as `@-` with no sign
  anything is wrong. **Seven artifacts were written empty this way in one
  session**: four agent briefs, a measurement, a pull request body, and the body
  of an issue escalating a question to the owner. Three agents were dispatched at
  briefs that did not exist, and two of them worked their issues anyway from the
  issue bodies. The worst of the seven was the escalation, because nobody was
  waiting on it to notice. `references/reviewing.md:274` already said to use
  `--body-file`, and already carried its own note that it had been walked into
  once before, which makes this the third occurrence and a mechanism problem
  rather than a typo. Fixed in #148: **post through `scripts/post-body.mjs`**,
  which reads the artifact back and fails when it differs. ADR 0049. Creation is
  the one call it does not cover, which is #149.
- **The handoff's staleness is mtime, and every worktree resets it.** A twelve-day
  old file reads as under an hour old in a fresh worktree, and `mergesSince`
  counts from the same reset value, so both clocks say fresh at once. Measured,
  not reasoned about: #145. Consequence for anyone wiring the `PreCompact` half:
  it would refuse in the main checkout and never in a worktree.

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
