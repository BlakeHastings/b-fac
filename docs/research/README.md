# Research

Dated surveys of what existed **outside this repo** at the moment a decision was
made. Prior art, candidate tools, what the standards call a thing, and which
options were rejected and why.

## A survey is not an ADR

An ADR in `docs/architecture/decisions/` says **what was decided and why**, and
stays true as long as the decision stands. A survey says **what existed on one
day**, and starts going wrong immediately. Keep them separate and have the ADR
cite the survey. Merging them produces a decision record that looks stale
because its evidence is, and evidence that looks binding because a decision is
sitting on top of it.

## When a survey is worth writing

**Write one when a decision turns on what exists outside this repo and
re-establishing that would cost more than about an hour**; anything cheaper
belongs in the issue or the ADR that used it, because a survey per lookup is how
this directory stops being read.

## The shape

- **Filename `YYYY-MM-DD-topic.md`**, dated the day the research was done, so a
  reader sees the age before opening the file. Checked.
- **A bold `Verified on` line under the title** carrying the same date as the
  filename. Checked.
- **What it was asked, and by which issue.** A survey with no question behind it
  is a link dump.
- **What was verified** against a live source, which is the body.
- **What was inferred**, in a section of its own. Reasoning from documentation
  or from a tool's own claims is not the same as having run it, and the two are
  indistinguishable a month later unless they were split at the time.
- **What could not be confirmed**, likewise. "Nobody looked" and "we looked and
  could not tell" are different, and the second is worth more than either a
  guess or silence.
- **A dead ends section**, so a rejected option does not get re-researched by
  the next person who searches the same words.
- **A closing note on how it rots**, naming which parts go first.

Popularity counts stay out. They rot fastest, they are rarely what a decision
rests on, and a stale one argues for the wrong tool with an air of authority.
Licence, storage model, activity and known failure modes are the parts worth
carrying.

## Keeping them honest

**A stale survey is worse than none, because it reads as current.** If something
cannot carry a date and an honest note about what will go wrong first, do not
add it here.

When a fact turns out to be wrong, correct it in place and say so in the same
sentence, dated. When the whole picture has moved, write a new dated survey and
add a line at the top of the old one pointing at it, rather than editing the old
one until it claims a currency it does not have. The original is evidence of
what was known when a decision was made, and a decision made on wrong
information is easier to revisit when the wrong information is still legible.

## Not payload

These do not ship. They are why-we-chose notes for contributors, not
instructions for an agent, and ADR 0018 already accepts that a third of the
plugin payload is a mirror nothing reads. `scripts/check-version-bump.mjs`
treats only `.agents/skills/`, `.claude/skills/` and `.claude-plugin/plugin.json`
as payload, so adding a survey does not require a version bump and should not.

## The surveys

| Survey | Asked for | What it settled |
| --- | --- | --- |
| [2026-08-12-local-backlog-and-storage.md](2026-08-12-local-backlog-and-storage.md) | #60, #61 | Which local issue trackers are real candidates, and why every git-native storage format relocates the conflict problem rather than solving it |
| [2026-08-12-local-gating-hooks-and-vocabulary.md](2026-08-12-local-gating-hooks-and-vocabulary.md) | #60, #63, #65 | That a local gate is one runner-agnostic entry point rather than a CI emulator, why `act` cannot authorise a merge, and where the check/gate/driver vocabulary comes from |
| [2026-08-12-compaction-hooks-and-context-continuity.md](2026-08-12-compaction-hooks-and-context-continuity.md) | #124 | That refusing a manual compaction works and refusing an automatic one wedges the session, that `SessionStart` injects a handoff intact at 1 MB, and that a subagent's compaction fires the same hook indistinguishably and gets no injection back |
| [2026-08-13-subagent-compaction-detection.md](2026-08-13-subagent-compaction-detection.md) | #127 | That a subagent's compaction is recorded in the subagent's own transcript and is therefore detectable after the fact, that no hook can tell the orchestrator, and that the one channel reaching a subagent arrives at its stop |

`npm run check:references` holds that table to this directory in both
directions: a survey with no row fails, and so does a row naming a file that is
not here.

One more survey is still only in a GitHub comment, on issue #28, covering agent
visibility surfaces. It belongs here on the same terms and has not been moved
because #28 is open and owns it.
