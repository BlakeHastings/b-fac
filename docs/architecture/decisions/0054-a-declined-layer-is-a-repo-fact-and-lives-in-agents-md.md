# 0054. A declined layer is a repo fact, so its record is committed

Status: accepted

Issue #156, found in the comment thread on #152. ADR 0021 splits the
initialisation answers into repo facts and machine facts, ADR 0030 lets a report
read the machine record and explains why it built no reader for `AGENTS.md`, ADR
0037 puts per-repository state in the git common directory, ADR 0053 is the
nearest precedent for refusing a knob that quiets a report, and ADR 0001 with its
reversal in ADR 0051 is the worked example this is about.

## Context

`assets/check-setup.mjs` had three verdicts: `ok`, `MISSING`, and `n/a` for a
layer the write boundary excludes. It had no way to say that a layer applies and
the repository has looked at it and decided not to have it. Such a layer landed
in `MISSING` beside genuine neglect, and its `FIX:` line closed with a recipe for
doing the thing the repository had decided not to do.

**That is not a hypothetical, and writing it down is not a fix.** ADR 0001
declined layer 3 here. The instruction not to install it was written in this
repository three times: in that ADR, in `docs/process/handoff.md`, and in the
header of the asset itself, which called the resulting red line "this
repository's one tolerable permanently-red line". Issue #152 then asked for the
layer to be installed, citing none of them, filed by somebody who had run the
tool that morning. The decision was reversed in ADR 0051, and one of the two
arguments for reversing it was that the report kept arguing with it.

So the claim underneath this is stronger than "the output is untidy". **A report
that cannot represent a decision does not lose the argument with it; it wins, by
being louder than the paragraph asking readers to ignore it.** Three documents
lost to one `FIX:` line in under a day.

Fixing it here does not close it. #159 installed layer 3, so this repository has
no declined layer any more, and the defect moved rather than disappeared: it is
now every repository that declines a layer for its own reasons, which the
skill's own revisit trigger tells them to do.

## Decision

**A fourth status, `declined`, which is not counted and does not move the exit
code.** A repository that has declined a layer and installed the rest exits 0,
the way a guest repository with four `n/a` rows does.

**The record is a declared line in `AGENTS.md`, committed, and the location was
the whole design question.** The other candidate was the machine record in the
git common directory, which this file already reads and which would have been
less code.

ADR 0021 splits the answers by a test rather than by taste: a repo fact is true
for anyone who clones, a machine fact is about *this* operator on *this*
repository. The asset's own `OWNED_RECORD` states the split in those words and
sends repo facts to `AGENTS.md`. **A declined layer passes that test in one
line.** Everyone who clones has declined it, because what declined it is a
decision record they clone too. The write boundary fails the same test, which is
why the two records are in different places rather than in one place for
tidiness.

Three consequences make it decisive rather than merely tidy, and each is a
failure the other location has:

- **A fresh clone would forget.** The defect is a repository being told to
  install something it decided against. Put the record inside `.git/` and the
  next clone is told exactly that, on its first run, with the decision sitting in
  a tracked file two directories away. The record would be the one part of the
  decision that did not travel with it.
- **A declaration nobody can review is one anybody can set.** The issue's own
  constraint is that a `declined` verdict anyone can set is worse than the red
  line it replaces. What stops it becoming a checklist item is that setting it is
  a tracked change somebody merged. A line inside `.git/` appears in no diff, no
  review and no `git status`, which is exactly what makes that location right for
  an operator fact and wrong for this one.
- **The failure directions are opposite.** A machine record that is missing is
  the ordinary state of a fresh clone, so honouring it means a decision that
  quietly expires. A committed line that is missing means nothing was declined,
  which is the ordinary case and is what the report already prints.

**A pointer to a record in the repository, not free text.** The line is:

```
Enforcement layer 3: declined, recorded in docs/decisions/0004-no-audit.md
```

Free text loses on both halves of what a reason is for. It cannot be checked, so
"not needed here" satisfies it and the status becomes the checklist item this
must not become; and it ages in place, written once at the moment of declining
and never revisited, which is how three copies of ADR 0001's instruction came to
be arguing with a report. A path is checkable twice over without the tool forming
any opinion about prose.

**The tool never opens the record.** Reading prose to discover whether a decision
exists fails silently the first time somebody words it differently, and a check
that is wrong about that is worse than no check. The two questions asked are the
two a filesystem answers: is the record there, and is it in the repository
everyone clones. The second is asked of `git ls-files`, because a record present
in one working tree and in nobody's clone is the invisible declaration that ruled
out the machine record in the first place.

**Not required: that the path look like a decision record.** Insisting on
`docs/architecture/decisions/` would impose a convention rather than read one
(ADR 0022), and a repository keeping its decisions in one `DECISIONS.md` would be
refused for spelling. What matters is that the argument is in the repository.

**A declaration is honoured only where the layer is genuinely absent.** The layer
runs first and what is on disk wins. A layer that is installed and declared
declined reports its real verdict plus the contradiction, because `declined` over
an installed layer would be #170's false `ok` rebuilt on purpose. That is also
what keeps the record from rotting: the repository that reverses a decision is
told its declaration is stale, by the tool, on the next run.

**Once the word "declined" has been written about a layer, the report never
prints an install recipe for it again**, whether or not the declaration turned
out to be usable. An unusable declaration still reports `MISSING` at exit 1, but
its `FIX:` line is about fixing the declaration, and it says that deleting the
line is what brings the install instructions back. Somebody who typed that line
was not asking how to install it.

**Only the owned checklist is declinable, and gate G never is.** In a repository
you are a guest in, `AGENTS.md` is the host's file and writing it is the single
thing guest mode exists in order not to do. That is not a gap: in guest mode the
four owned layers are already `n/a` by mode, and the gate *is* the mode, so
declining it is declining guest mode rather than a layer of it. A line naming G
is reported and refused rather than ignored, because a line that silently does
nothing is how somebody comes to believe a control is switched off.

### Why this survives ADR 0053

ADR 0053 refuses pinning for the body-scan detector with an argument rather than
a preference: for a layer that prevents, the dangerous direction is quieter; for
a layer that only reports, it is louder. `check-setup.mjs` reports, so a
mechanism that makes it quieter has to answer for itself. Three things do.

**This does not silence a finding; it supplies a fact.** ADR 0053's refused knob
was a hand-maintained list of artifact ids duplicating what the scan had already
discovered. A declined layer is not something the tool discovered and is being
asked to forget. It is a decision the tool cannot see from the filesystem, in the
same class as the write boundary, which ADR 0030 already licensed a report to
read from a declaration and already turns into uncounted rows.

**The row stays on the screen with its `covers` line intact.** What is left
uncovered is printed exactly as before, and the summary names the declined layers
again underneath. Only the verdict and the recipe change. An allowlist removes
the line; this removes the argument.

**It is not hand-maintained and it does not need pruning.** ADR 0053's other
objection was that a pinning list must be pruned by hand after each repair and
requires knowing the answer in advance. Installing the layer is what retires this
record, and failing to remove the line is reported rather than obeyed.

Where ADR 0053 does reach it is the requirement that the mechanism not be
reachable by accident, and that is what the tracked pointer, the exact wording
and the refusal to honour a declaration over an installed layer are for.

## Consequences

**ADR 0030's refusal to read `AGENTS.md` is narrowed rather than reversed.** It
gave two reasons and both are about the write boundary rather than about the
file: the boundary is a machine fact by definition, and the one `AGENTS.md` line
the skill asks for has no writer, so a reader would read an absent file for ever.
Neither reaches here. This fact is a repo fact by that ADR's own test, and its
writer is a person declining a layer, which is a deliberate act rather than a
step somebody forgot. A repository that has declined nothing has no line, and
that is the ordinary case rather than a permanent absence.

**A second fixed location, and #171's question asked of it.** #171's lesson is
that a verdict derived from a fixed assumption about where things live is a
verdict about the assumption. The difference in direction is what makes this
acceptable: a repository with no `AGENTS.md`, or one keeping its conventions
elsewhere, has no declarations and gets exactly the report it got before. A fixed
guard path produced a wrong verdict about a correct repository; a fixed
declaration path produces the pre-existing verdict and no new claim.

**The ordinary report is unchanged, and that was checked rather than intended.**
With no declaration present, the output of the new asset against a repository
that is missing layer 3 is byte-for-byte the output of the old one, recipe
included. The status column's width is measured from the widest status in the
run, so it stays at seven where nothing widens it.

**This repository is not the worked example, deliberately.** All four layers
report `ok` here at exit 0 after #159, so the demonstration is a scratch
repository that declines layer 3 and records the decision in a tracked file. Six
defects were found in this asset in two days and every one was found by
installing it rather than by reading it, which is why the evidence for this is an
installed repository and not an argument.

**The suite was not trusted for passing.** Eight mutations were applied to the
implementation one at a time: the declaration honoured without a pointer, with a
pointer to a file that is not there, with a pointer outside the tree, with an
untracked declaring file, over an installed layer, and for gate G; the install
recipe printed for a declined layer; and the declined count folded back into the
exit code. Every one was caught.

**What this still does not cover.** A repository can commit a declaration for a
layer it never thought about, and nothing here can tell that from a decision: the
defence is that the line and the record are in a diff somebody reviewed, which is
a property of the repository's own process rather than of this tool. Two
declarations for one layer are read as the first one, which is a state with no
right answer. And the record is checked for existing, never for saying anything,
which is the deliberate limit: a tool that reads prose to decide whether a
decision exists fails silently the first time the prose is reworded.
