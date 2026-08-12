# 0039. The owned answer gets a writer, and it lives beside its reader

Status: accepted

Parent epic #60, issue #100. ADR 0021 defines the write boundary and calls it a
machine fact either way, ADR 0029 gives guest mode a gate and makes installing
that gate the declaration, ADR 0030 lets a report read the mode and decides that
an unrecorded one never moves the exit code, and ADR 0027 is the argument for
keeping a fact and the thing that answers for it in one file.

## Context

ADR 0021 said the write boundary is a machine fact **either way**, and had the
question asked out loud at initialisation. ADR 0029 then gave the record its one
writer: `guard-guest-writes.mjs --install`, which writes `Write boundary: guest`
unconditionally, because installing the gate *is* the guest declaration.

So the two states a repository reached on its own were guest and unrecorded, and
ADR 0030 wrote that down as a consequence rather than a defect: "Owned is
reachable only by hand ... That `--install` has no owned-mode counterpart is
filed rather than fixed here." This repository has printed `Write boundary: NOT
RECORDED` on every run of `check-setup.mjs` since, and would have for ever.

Two branches were open, and the issue put them fairly: build a writer, or decide
that owned needs no record and make the report's unrecorded output say so
instead of asking for a line nobody can produce.

**The second branch is the forbidden inference wearing softer words.** ADR 0021
forbids deriving the mode from the repository, and specifically from a git
remote, because a work repository is on GitHub too. "Nobody wrote the answer
down" is a fact about the repository in exactly the way "no gate is installed"
is. Telling an unrecorded repository that owned is the default and nothing more
is needed is letting silence mean owned, which is the direction ADR 0021 says
the failure is expensive in: guessing guest in a repository the owner controls
costs one question, and guessing owned in a work repository pushes branches
nobody asked for.

**What the absence actually costs is a signal, not a paragraph.** `NOT RECORDED`
means two different things and nothing tells them apart: nobody asked, which is
the state the question exists to catch, and asked, answered owned, nowhere to
put it, which is fine. Every owned repository was permanently in the second, so
the state carried no information. A line that is always printed is read the way
a permanently red line is read, which ADR 0030 already refuses once.

**And the remedy it printed could not be run.** The unrecorded reminder named
`guard-guest-writes.mjs --install`, which writes the other answer. ADR 0029's
rule about a refusal owing a remedy that works applies to a report as well as to
a gate: a wall with a signpost pointing nowhere is how a layer gets switched
off.

## Decision

**`check-setup.mjs --record-owned` writes the owned answer, and only that.** It
appends `/.factory/` to `.git/info/exclude`, writes `.factory/machine.md` with
`Write boundary: owned`, and stops. It installs nothing, wires nothing, and
copies nothing, because owned mode has no boundary for a gate to hold.

**The writer lives beside the reader**, which is ADR 0027's argument for the
probe and the rule being one file, applied to a fact instead of a control. The
one thing a writer and a reader of `Write boundary:` must agree on is the shape
of that line, and in one file they cannot disagree. It is also the answer to
"where would a new engineer look": the script that told you the boundary was
unrecorded is where the command to record it is.

Guest keeps its own writer. There the record is a byproduct of installing the
gate, and a guest record written without the gate would be a declaration with
nothing behind it, which is exactly the state layer G reports as `MISSING`.

**It refuses three ways, and each refusal writes nothing.** An existing
`.factory/machine.md` is not this command's to overwrite, whatever it says,
because replacing an answer from underneath is how an operator stops believing
the file. An installed `.factory/guard-guest-writes.mjs` is refused, because
that gate is somebody's deliberate guest declaration and recording owned over it
would manufacture the disagreement layer G exists to report. And a `git` that
does not answer is refused, because the record cannot then be kept out of the
tree, and a visible `.factory/` is the operator's scratch state showing up as
somebody's changes.

**It checks its own promise rather than asking to be believed.** The gate's
`--install` tells you to run `git status --porcelain -uall` yourself. This runs
it before and after and fails if anything was added, since it is a report and
already has git in its hands. Lines that vanish are the exclusion catching
scratch state that was already visible, which is a repair, so only additions
count.

**An unrecorded boundary still does not move the exit code**, and ADR 0030's
decision survives with a different reason underneath it. Its reason was that
nothing could answer the question, which this ADR ends. The reason that replaces
it is stronger: the record is untracked by definition, so **any checkout that is
not the operator's own has none and can never have one**. A CI runner clones
fresh, and a fatal unrecorded state would be red there by construction, for a
fact that is not about the code. That is the second permanently red line ADR
0030 refuses, so the answer stays no.

**The owned record carries the boundary and nothing else that is a fact**, and
that is worth saying out loud because it was the strongest argument for the
other branch. The guest record carries three things: the boundary, the backlog
tool, and the probe command. In owned mode the backlog and the check command are
*repo* facts by ADR 0021's own split, true for anyone who clones, and they
belong in a committed `AGENTS.md`. There is no gate, so there is no probe. A
timestamp was considered and refused: a boundary answer does not decay the way
`docs/research/` surveys do, and a field nobody diffs is noise. So the file is
mostly prose explaining why it is thin, and **the writer earns its place from
what the absence of the record costs, not from what its presence carries.**

## Consequences

**This repository stops printing `NOT RECORDED` for ever, once somebody runs the
command in their own checkout.** Not before: `.factory/` is untracked, so the
answer cannot ship in the repository and each operator records it once, per
clone. The unrecorded state now means what it is supposed to mean, which is that
the initialisation question was skipped.

**A third thing to run at initialisation was the live objection, and the shape
of the answer is what defeats it.** It is a flag on the second step rather than
a step of its own: the report that says the boundary is unrecorded prints the
command that records it, and both answers are now named there. `first-run.md`'s
numbered order gains a clause, not an entry.

**The paths are spelled a third time.** `.factory/` and the `.git/info/exclude`
append now exist in `guard-guest-writes.mjs`, `discover-checks.mjs` and here.
Accepted on ADR 0029's reasoning, which `discover-checks.mjs` already accepted
once: an asset is copied into a host repo on its own, and a two-file asset is a
setup step that gets half done. `check-setup.test.mjs` installs with the real
`--install` and records with the real `--record-owned`, so a rename is a red
test rather than a quiet drift.

**A report writes now, which it did not before.** The write is opt-in behind a
flag, and the blast radius of a misfire in a repository that is not yours is one
untracked file that makes this report use the owned checklist, which is already
the checklist it uses when nobody has recorded anything. It cannot reach the
gate, because the gate never reads the mode (ADR 0029), and it cannot reach a
tracked file. That containment is a property of owned mode having nothing to
install, and it would not survive this flag ever growing an install step.

**A check that scans nothing passes, and a writer has the same failure.** Eleven
mutations were applied one at a time (the record written as guest, the exclusion
skipped, an existing record overwritten, the guest gate ignored, the written line
spelled so the reader cannot parse it, a hook wired as well, the reminder losing
the owned command, the flag never dispatched, the exclude line appended on every
run, the record written anyway when git is silent, and the re-run line always
absolute). Every one was caught, by between one and seven tests. No mutation
survived.
