# 0030. A report may read the write boundary; a gate may not

Status: accepted

Parent epic #60, issue #92. ADR 0021 defines the boundary, ADR 0029 gives it a
gate and refuses to let that gate read it, ADR 0010 is why `check-setup.mjs`
exists, and ADR 0001 is the precedent for a layer that is permanently absent on
purpose.

## Context

`assets/check-setup.mjs` reports the enforcement layers a repository actually
has, because copying a control is not installing one. Its `LAYERS` table was
mode-blind, and it exits non-zero until every layer in that table is present and
wired.

Issue #76 then added a control it could not see: guest mode's write-boundary
gate, in `.factory/` and `.claude/settings.local.json`. `--install` prints its
own before-and-after, which is a second convention for the same job.

**A guest layer could not simply be appended to that table.** Mode-blind plus
fail-until-complete means such a row reports MISSING in every owned repository
for ever. That is the shape ADR 0001 already accepted once, for layer 3 here,
and it is tolerable exactly once: a permanently red line is the same failure as
a guard that cries wolf, and this repository documents both as things that get
switched off rather than fixed.

## Decision

**The report reads the mode from `.factory/machine.md`, and the gate beside it
still does not.** The two files are not disagreeing and the code says so where
the read happens.

A `PreToolUse` hook runs *before* the command it judges, so a `cd` in that
command has not happened yet and anything it reads off disk may describe a
repository the command will never touch. ADR 0029 has the measurement: the merge
guard's branch-dependent clause answering `allow` inside a worktree on a command
the main checkout denied. **A report is not a hook.** It has no command in front
of it to be wrong about, it runs where you are standing, and it prints the root
it resolved and the file every fact came from. The unsoundness is a property of
the hook's position in time, not of the filesystem.

What holds in both files: the mode is never inferred from the repository and
never from a git remote. A work repository is on GitHub too.

**Three states, and the third is a finding rather than an error.** Owned, guest,
and nobody having said. An unrecorded repository is reported against the owned
checklist, said out loud in the output rather than chosen quietly, and the summary
tells anyone standing in a repository that is not theirs to install the gate
instead of the four layers it just listed. The unrecorded state on its own never
moves the exit code, so a fully installed owned repository exits 0 while still
printing that nobody answered ADR 0021's question.

**An absent layer explained by the mode reports `n/a`, is not counted, and does
not move the exit code.** A guest repository with a correctly installed gate
exits 0 with four `n/a` rows and no `MISSING` anywhere.

**The gate keeps its own numbering.** It prints as `G`, not as layer 4, because
ADR 0029 makes it a different stack for a different mode protecting a different
thing, and enforcement.md already reads that way.

**Nothing reads `AGENTS.md`, because nothing writes it.** The issue supposed the
mode might also be recorded there as a repo fact. Two things say otherwise. ADR
0021 classifies the write boundary as a *machine* fact by definition, meaning whether
*this* operator on *this* checkout may publish outward, so it never belongs in
a committed file. And the one `AGENTS.md` line the skill does ask for names the
**backlog tool**, not the boundary. That line has no writer either; it is an
instruction, which is the same class of gap #76 found when it discovered nothing
had ever written the machine record. A reader for a fact nothing produces reads
an absent file for ever, so none was built.

## Consequences

**Owned is reachable only by hand.** The machine record has exactly one writer,
`guard-guest-writes.mjs --install`, and it only ever writes `guest`. So the two
states a repository reaches on its own are guest and unrecorded, and a recorded
`owned` needs somebody to type the line. The reader accepts it because it costs
one branch of a regex that had to exist anyway, and because refusing to read a
fact an operator went to the trouble of writing down would be perverse. That
`--install` has no owned-mode counterpart is filed rather than fixed here.

**This repository prints two things now instead of one.** Layer 3 `MISSING`,
which ADR 0001 decided and nobody should install away, and `Write boundary: NOT
RECORDED`, which is accurate: `.factory/` is untracked by design, so an owned
repository has no committable place to record the boundary and can never be
anything else. The second does not affect the exit code, which is what keeps
this from being the second permanently red line the context above rules out.

**The two assets now spell the same three paths.** `.factory/machine.md`,
`.factory/guard-guest-writes.mjs` and `.claude/settings.local.json` appear in
both. Accepted on ADR 0029's reasoning: an asset is copied into a host repo on
its own, and a two-file asset is a setup step that gets half done, which is the
failure this check exists to catch. A rename breaks the report quietly, which is
what `scripts/check-setup.test.mjs` is for: it installs with the real
`--install` rather than fabricating the layout.

**The report now checks the gate's own promise.** `--install` claims a host
repo's `git status --porcelain -uall` is byte-for-byte what it was before. A
gate that was committed, or wired by editing somebody's tracked
`.claude/settings.json`, works exactly as well and has already broken the
boundary it holds. Both are findings, and neither is visible in a file listing,
which is the same argument ADR 0010 made about wiring.

**A check that scans nothing passes**, and a mode-aware one has four new ways to
scan nothing: skip the wrong layers, skip them all, read the mode wrong, or
count nothing. The suite was therefore not trusted for passing. Nine mutations
were applied to the implementation one at a time (mode pinned to owned, pinned
to guest, the gate never absent, unwired treated as wired, notes counted as
findings, unrecorded made fatal, the host-repo inspection disabled, the mode
inferred from the gate's presence, and skipped layers counted), and every one
was caught, by between one and eight tests. No mutation survived.
