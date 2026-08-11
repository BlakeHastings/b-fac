# 0010. The skill reports which of its own layers are installed

Status: accepted

## Context

The skill's setup section listed its assets in a table and asked the reader to
copy and edit them. Nothing about that produces a result. Issue #19 measured
what follows: in one orchestrated project the step was never done, 20 merges
went through raw `gh pr merge`, and a pull request landed with its main check
still `pending`. The orchestrator had read the table at turn one.

The same corpus makes the opposite case for mechanisms. Across 240 subagent
transcripts and 16,410 commands no agent merged, but the guard hook was
observed denying a real command in that corpus, so compliance was
over-determined and the sentence cannot be credited for it.

This is ADR 0004 again on a different surface: where advice has failed
repeatedly, restate it as something the reader either produces or visibly does
not. 0004 could only reach for a report format, because no artifact existed to
check. Here one does — the layers are files and JSON — so this can be an actual
check rather than a shaped obligation.

## Decision

**Ship `assets/check-setup.mjs`, and make setup end with its output.** It
reports each layer in `references/enforcement.md` as `ok`, `PARTIAL` or
`MISSING` and exits non-zero until all four are present *and wired*. The
orchestrator runs it before installing anything, so the first output is four
`MISSING` lines, and again afterwards, and puts both in the first status update.

**It reports wiring, not presence.** A guard script in `scripts/` that no
`settings.json` invokes reports `MISSING`, not `PARTIAL`, because it is the same
layer as an absent one plus a file. It also fails an unedited `REQUIRED` or
`BASELINE` placeholder, a matcher naming a single shell tool, and a
`DEFAULT_BRANCH` constant naming a branch the repo does not have.

**It requires Node**, which issue #19 explicitly warned against assuming. Taken
deliberately: layers 1 to 3 *are* Node scripts, so a repo that cannot run this
cannot install them either, and saying so is useful output rather than a gap.
The `LAYERS` table is written to be read by eye where it cannot be run, and the
script resolves the repo root from the working directory rather than from its
own path, so the first run works from inside the installed skill.

## Consequences

The skill now ships a check about itself, which is a new kind of asset here: the
other six are installed and then used, this one is used before any of them
exists. The cost is that its expectations are a second copy of the setup table
and will drift from it if the layers move.

It is not a control on this repo. Nothing forces an orchestrator to run it, so
it remains an instruction one level up — but an instruction whose result is an
artifact, which is the whole of ADR 0004's argument. If a later mining pass finds
setups still skipped, the next layer is the installing repo's CI running it, not
more words here.

Run against this repo it immediately reported layer 3 `MISSING`:
`scripts/check-main-provenance.mjs` is present, unedited and invoked by no
workflow, which ADR 0001 decided to drop and nobody deleted. Filed separately.
