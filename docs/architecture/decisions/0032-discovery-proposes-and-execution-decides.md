# 0032. Discovery proposes, execution decides

Status: accepted

Parent epic #60, issue #68. ADR 0021 is the write boundary whose guest row this
makes true, ADR 0022 is the axis that refused to build detection logic, ADR 0025
is the check/gate vocabulary, and ADR 0030 is the neighbouring asset whose
output conventions this one follows.

## Context

ADR 0021's table has one row for guest mode's merge gate: "There is no remote
rollup to read. The gate is the host's own check command, run locally."

Nothing established what that command *is*. In a repository the factory built,
it is a line somebody wrote in `AGENTS.md` on day one. In a repository the
factory is a guest in, it has to be found, and the sentence had no producer,
which is the same gap ADR 0030 found twice already: an invariant written ahead
of the code that holds it.

Two things make finding it harder than it reads.

**Every source of evidence is partial.** A `Makefile` target named `check` may
run a formatter and no tests. An ecosystem manifest says what someone who had
never seen the repository would type. A pipeline file is the most complete
description available and it describes an environment that does not exist on
this machine.

**A wrong answer is worse than no answer.** A gate calling the wrong command
produces confident red or confident green about the wrong thing, and both are
expensive: the first gets the gate switched off, which is this repository's
documented failure mode for guards, and the second is the false confidence the
whole guest-mode design was built to avoid.

## Decision

**Discovery gathers evidence, ranks it, and proposes. Execution decides.**

**Three tiers, and the third can never win.** The repository's own task runner
outranks the ecosystem manifest, because ADR 0022 says conform where the host
has a convention and a task runner is that convention in its most literal form.
The pipeline is read, printed and **never proposed**, by construction rather
than by discipline: it describes an environment you do not have. Two commands
measured in real repositories make the case without argument —
`terraform apply -input=false -auto-approve` in a deployment repo's pipeline,
and a global toolchain install in this repository's own.

**Nothing becomes the entry point until it has been executed.** `--run`
executes the proposal, shows the output unfiltered, and records only if every
command exited 0. This is the load-bearing decision and the rest is
scaffolding: it is what converts "a check the factory invented and never ran is
worse than none" from an instruction into a control.

**Refusing to decide is an outcome with a shape**, not a suggestion to ask. Five
states produce it — two runners that both answer, a language-specific runner
beside a foreign manifest, two ecosystems and no runner choosing between them,
a tool that is not installed here, and nothing at all — and each prints what it
found, what it could not decide, and a question naming the files and the
candidates. `--command=` is how the answer comes back, and it still has to run
before it is recorded, so the escalation is a loop that closes.

**A script here, where ADR 0022 refused one, because this answer is
executable.** That ADR rejected convention detection on the grounds that a
detector with no ground truth to check itself against is a guess wearing a
uniform, and that a wrong guess is invisible afterwards. Whether `npm run check`
is a repository's check entry point has ground truth, and it is reached by
running it. Neither half of ADR 0022's argument survives that, and the
distinction is executability rather than effort.

**The entry point is a recorded line, never a file added to their tree.**
`.factory/checks.md`, untracked through `.git/info/exclude`, checked afterwards
against `git status --porcelain -uall` rather than claimed. Installing a
`check.sh` beside somebody's Makefile is imposing a convention on a repository
that has one, which is issue #66's whole complaint. Where the entry point is two
commands, the record holds two commands.

**The limit is printed on every run and written into the record.** A local gate
runs a subset of a company's pipeline and never its environment. That sentence
is in the script's output, in the file it writes, and at the top of
`references/host-checks.md`, because a limit met after somebody has relied on it
is not a limit.

## Consequences

**The check command is a repo fact kept in an untracked file**, which reads as a
contradiction of ADR 0021's split and is not one. That split says repo facts are
"committable in owned mode". In guest mode there is no committable place, so the
untracked file is where a repo fact goes when the tree is not yours. Owned mode
does not need this asset at all: a repository the factory built wrote its own
check command down.

**Recognition is broad and shallow, and the honesty comes from the tool probe
and from `--run`.** Discovery recognises a `Cargo.toml` on a machine with no
`cargo`, and says so rather than pretending. That combination is what lets the
handled set stay small without the unhandled set being silently mishandled.
`references/host-checks.md` names what is out of scope: monorepo task graphs,
CMake and Nix, several ecosystems, anything inside a container, block scalars in
pipeline files, and sub-directory manifests.

**Green here is a weaker claim than it looks, deliberately.** It says the
commands ran and exited 0 on this machine at this moment. It does not say they
are the whole of what the company checks, and the record says so in its own
body.

**The record goes stale and nothing detects that.** It is one measurement. The
mitigation is a sentence in the file telling the reader to re-run, which is
layer 0 by `references/enforcement.md`'s own numbering, and layer 0 is an
instruction. A detector would have to know when the host repository changed how
it builds, which is the host's business and not observable from here.

**One ecosystem question was left open rather than guessed.** The issue asked to
"handle what the owner actually works in", and the owner had not yet said which
ecosystem their work repository is. Rather than wait or pick, the tiers,
the ranking, the confirmation step and the escalation shape were built at the
level that does not depend on the answer, and the ecosystems named are the ones
verifiable from the machine this was built on. Adding one later is a row in a
table, not a redesign, which is the test of whether the level was right.

## What it was measured against

Discovery was run against five repositories with genuinely different shapes
before any of the above was written down, and two of the decisions came out of
what it found rather than going in.

| Shape | What discovery did |
| --- | --- |
| This repository: `package.json` with an aggregate `check` script | Proposed `npm run check`, tier 1. `--run` executed it in 14.6s, exit 0, recorded |
| A Rust project whose `Makefile` wraps `cargo` | Preferred `make check` over `cargo test`, then refused: `make` is not installed on this machine, and said so as the question |
| A deployment repository: thirteen pipelines, no manifest, no runner | Refused. Printed the `terraform apply` steps under "described, not proposed" |
| A plugin with `package.json` and `pyproject.toml` side by side | Refused: the Node scripts cover half the repository. Given the answer with `--command=`, ran 40 tests and recorded |
| A Python repository configuring ruff without depending on it | Proposed `uv run ruff check .` then `uv run pytest`. The first failed, the second passed 80 tests, and **nothing was recorded** |

The last row is the one that justifies the design. The proposal was
conventional, supported by real evidence in the manifest, and wrong. Adopted
without being run it would have installed a permanently red gate on a repository
whose tests are green.

The second row produced the tool probe. The fourth produced the
language-specific-runner-beside-a-foreign-manifest rule, which on its first
version proposed the Node half of that repository as the whole gate.
