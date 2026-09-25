# 0070. A legacy guest record withholds the owned recipes, and moves no verdict

Status: accepted

Issue #134, left undone by #133 on purpose. ADR 0037 says a per-checkout record
is not the repository's answer, ADR 0030 lets a report read the mode where a
gate may not, ADR 0054 is the precedent for a claim the report cannot validate,
and ADR 0001 is why the exit code below is argued rather than assumed.

## Context

A repository holding `.factory/machine.md` saying `Write boundary: guest`, from
an install before #122, is reported with the boundary `NOT RECORDED`, so the
owned checklist applies and its four layers come back `MISSING`. #133 made the
paragraph under `Write boundary:` say not to install them. Measured on `main` at
`416e3f2`, in a real repository holding only that record: every one of the four
rows still closed with `FIX: Copy ...`, and the failing summary still said
"Install them from the skill's assets/ directory". The table and the summary
are what a reader in a hurry reads, and they pointed at installing a merge
wrapper, a guard hook and a CI workflow into a repository somebody had written
down was not theirs.

The two directions of this error are not the same size. Guest fixes offered in
an owned repository cost a confused minute. Owned fixes offered in a guest one
end with an agent opening a pull request that configures somebody else's CI.

The record cannot simply be believed. Two checkouts can hold two different
legacy records and neither can see the other, which is the state ADR 0037
ended. So the question was what a report does with a strong hint it cannot
trust. #134 named three answers: suppress the recipes without switching the
mode, a fourth state, or refusing to report the layers at all.

## Decision

**Suppress rather than switch.** The mode is unchanged: `Write boundary:` still
prints `NOT RECORDED`, every owned row keeps the verdict the owned checklist
gives it, and gate G stays `n/a`. What changes is the recommendation. Every
owned row that is `MISSING` prints `FIX: withheld.` with the reason, in place of
its recipe, and the failing summary says the layers are not offered and names
the one remedy, the guest install, instead of "install them".

**This is ADR 0054's third rule and not a new state.** ADR 0054 stops printing
an install recipe for a layer once anything has claimed it declined, whether or
not the claim validates, and a claim that fails validation falls back to
`MISSING`. A legacy guest record is a claim about the owned layers that fails
validation in the same way a dangling `declined` pointer does: it is real, it is
on disk, and the report cannot take it as the repository's. It gets the same
treatment, `MISSING` without a recipe. A fifth status would put a second
unvalidated-claim state beside the one the file already handles, and #130 is
arguing separately about another.

**Keyed to what the record says, not to its being there.** A legacy record
saying owned still gets every recipe, and a test holds that, so withholding on
the mere presence of `.factory/` cannot pass for the fix.

**The exit code stays 1.** ADR 0001's objection is to a red line nobody can act
on. This one has a single remedy printed under it,
`guard-guest-writes.mjs --install`, after which the repository is reported
against gate G and exits 0. Going green here would let an unrecorded boundary
pass as a finished setup, which is the state this report exists to make
somebody answer.

## Consequences

- A skimmer in a legacy guest repository reads four `MISSING` rows with no
  recipe, a summary that says they are not offered, and one command.
- A legacy record can now change what the report recommends. It still cannot
  change a verdict, the mode, the checklist or the exit code, and nothing is
  written to the machine record.
- The third candidate, refusing to report the layers, was not taken: it makes
  the report useless in the state where somebody most needs it.
- A legacy gate (`.factory/guard-guest-writes.mjs`) with no legacy record is not
  covered. `--record-owned` refuses over it, but this report has never read it
  as a boundary hint, and teaching it to is a separate change.
