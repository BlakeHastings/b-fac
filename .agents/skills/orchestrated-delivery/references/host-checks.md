# The host repo's checks, and what running them locally is worth

Guest mode has no remote check rollup to read, so ADR 0021's table says its gate
is **the host repository's own check command, run locally**. This chapter is how
the factory finds out what that command is, in a repository it did not create,
and what the answer is worth once it has it.

## The limit, before anything else

**A local gate runs a subset of a company's pipeline, and never its
environment.** Their runners have infrastructure, secrets, services and network
access a laptop does not. Their matrix has four operating systems. Their
integration suite talks to a database that exists for ninety seconds.

What running their checks locally buys is **fewer round trips**. It is not a
promise the pull request will pass, and a green local gate followed by a red
pipeline is the expected difference rather than a defect in either. ADR 0021
records it as a consequence for exactly that reason.

Say this out loud to the owner the first time you use it. `discover-checks.mjs`
prints it on every run and writes it into the record it produces, because a
limit nobody meets before they rely on it is a limit nobody knows about.

## Discovery is evidence-gathering, not inference

Three sources, ranked. **None of them is authoritative**, which is why the
output is a proposal rather than a decision.

| Tier | Evidence | Why it ranks there |
| --- | --- | --- |
| 1 | The repository's own task runner: `Makefile`, `justfile`, `Taskfile.yml`, `package.json` scripts | It is what the people who work here actually type. ADR 0022 and issue #66: conform where the host has a convention |
| 2 | The ecosystem manifest: `Cargo.toml`, `go.mod`, a `.sln`, `pyproject.toml`, `pom.xml`, `build.gradle`, `Gemfile` | What someone who had never seen this repository would type. Weaker, and a fine fallback where nobody wrote anything down |
| 3 | The pipeline: `.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile`, CircleCI | Read, printed, and **never proposed**. See below |

A tier-1 answer beats a tier-2 one, and **no amount of tier-3 evidence produces
a proposal at all**.

**A target named `check` is evidence, not a guarantee.** It may run a formatter
and no tests. It may shell out to a runner nobody on this machine has. That is
the whole reason the proposal has to be executed before anything depends on it.

### Why this is a script when ADR 0022 refused to build convention detection

Because this answer is executable and that one is not.

ADR 0022 rejected detection logic for *convention authority*: whether a
repository "believes in" decision records has no ground truth to check a
detector against, so a detector there is a guess wearing a uniform, and a wrong
guess is invisible afterwards. Whether `npm run check` is this repository's
check entry point is settled by running it, and a wrong guess exits non-zero in
front of you. **Executability is the difference**, and it is the whole of ADR
0032's argument.

## The pipeline is the most tempting source and the most misleading

It describes what runs in an environment you do not have. A job needing a
database, a cloud credential or a self-hosted runner is discovered easily, looks
runnable, and fails for reasons that have nothing to do with your change.

Two real examples, from repositories discovery was run against while it was
being built:

- A deployment repository with thirteen workflow files, no manifest and no task
  runner. The commands its pipeline describes include
  `terraform apply -input=false -auto-approve`. That is not a check. Run against
  a real backend it provisions infrastructure, and a gate that ran it would be
  the worst thing this repository has ever shipped.
- This repository's own pipeline, whose steps include
  `npm install --global @anthropic-ai/claude-code@<pinned>`. Correct in CI,
  where the runner is thrown away afterwards. On a developer's machine it
  changes their global toolchain to run a check.

So the pipeline commands are printed under their own heading, as description,
and there is no code path that promotes one into a proposal. **Read them. Do not
adopt one.** They are useful for a different purpose: they tell you what the
company will judge the pull request by, which is what the local gate is a
subset of.

## Nothing becomes the entry point until it has been run

```bash
node <this skill>/assets/discover-checks.mjs          # propose, and write nothing
node <this skill>/assets/discover-checks.mjs --run    # run the proposal, then record
```

`--run` executes each command, shows its output unfiltered, and records the
entry point **only if every command exited 0**. A failure records nothing.

This is the mechanical form of the rule that a check the factory invented and
never executed is worse than none: it produces confident red or confident green
about the wrong thing, and both are expensive.

**The measurement is what made the case.** Run against a Python repository whose
`pyproject.toml` carries a `[tool.ruff.lint]` section, discovery proposed
`uv run ruff check .` and then `uv run pytest`. The first is the conventional
command, it is supported by real evidence in the manifest, and it fails: the
project configures ruff and does not depend on it, so there is no ruff in the
environment `uv run` builds. The second passed eighty tests. A proposal adopted
without being run would have installed a gate that is red for ever, on a
repository whose tests are green.

**A red baseline is a question, not a gate.** If the commands are right and the
host repository's checks were already failing before you changed anything, that
is worth asking about too: a gate whose baseline is red cannot tell your failure
from the one that was already there.

## Asking is an outcome, not a fallback

Where the evidence is thin or points two ways, discovery **refuses to decide**
and exits non-zero with a shape rather than a shrug:

```
CANNOT DECIDE. Ask, do not guess.
  What stopped it: <the specific ambiguity>
  The question, in one line:

      <a question naming the files, the candidates and the decision>

  Then confirm the answer by running it, which is the only thing that records it:

      node <this skill>/assets/discover-checks.mjs --run --command="<their command>"
```

The five states that produce it:

- **Two task runners both naming a check target.** A `Makefile` and a
  `package.json` that each answer is a question about which one this team runs.
- **A language-specific runner beside a foreign manifest.** `package.json`
  scripts cover the Node half of a repository that also has a `pyproject.toml`.
  Proposing them would be confident green about code they never touched.
- **Two ecosystems and no runner picking between them.**
- **The tool is not installed here.** The command may be exactly right and it
  cannot be confirmed on this machine, which is the state where a wrong check
  does most of its damage.
- **Nothing at all**: no runner, no manifest. Say so and ask.

`--command=` is how the answer comes back, and it still has to run before it is
recorded. That is what keeps escalation a loop that closes rather than a note in
a status update.

**Documents are listed and never parsed.** `CONTRIBUTING.md`, `AGENTS.md` and a
README are printed under "not read", because ADR 0022's rule is to read
artifacts rather than the documents describing them: a contribution guide that
has drifted from the log is the normal state of a contribution guide. They are
still the first place a human should look before answering the question.

## The entry point is a recorded line, not a file added to their repo

`--run` writes `.factory/checks.md`, beside the machine record, and appends
`/.factory/` to `.git/info/exclude` if the guest gate has not already. Afterwards
`git status --porcelain -uall` is byte-for-byte what it was before, and the
script checks that rather than claiming it.

**No wrapper script is installed.** Adding `check.sh` beside somebody's Makefile
is imposing a convention on a repository that already has one, which is the
thing ADR 0022 and issue #66 exist to prevent. If the entry point is two
commands because that is how this repository is shaped, the record holds two
commands.

The check command is a *repo fact* by ADR 0021's split, and it still goes in an
untracked file, because in a repository you are a guest in there is no
committable place to put one.

**The record goes stale.** It is one execution, on one machine, at one moment.
Re-run `--run` when the host repository changes how it builds, and when the
answer surprises you.

## What is not handled, by name

Discovery recognises the evidence that is cheap and general. Everything below is
out of scope on purpose, and none of it is silently mishandled: where discovery
cannot see the answer it asks rather than guessing.

- **Monorepo task graphs.** Turborepo, Nx, Lerna, pnpm workspaces, Bazel, Pants
  and Buck all mean "run the affected subset", and discovery reads the root
  manifest only. It will propose a root command that may run everything or
  nothing.
- **Build systems with no conventional check target.** CMake, Meson,
  Autotools, Earthly, Nix flakes.
- **Ecosystems not read at all.** Deno, Elixir, Swift Package Manager, Haskell,
  Scala, PHP, Zig, and Ruby beyond a `Gemfile` next to a `Rakefile`.
- **Anything behind a container.** A devcontainer, a `docker-compose` service
  or a `make` target that shells into one. Discovery sees the target and cannot
  see what is inside it.
- **A block scalar in a pipeline file.** A multi-line `run:` step is a shell
  script with its own control flow, and quoting one back as a command you could
  type would be the false confidence this chapter is about.
- **Sub-directory manifests.** A `package.json` in `web/` and a `pyproject.toml`
  in `api/` are read as neither. Only the repository root is scanned.
- **What a target shells out to.** The tool probe checks the runner, not the
  runner's children. `npm run test` may invoke a test runner nobody here has,
  and `--run` is what catches that.

**The list is short because it is honest.** Adding a plugin system for
ecosystems is how this becomes a build-system detection framework, and a long
speculative list of half-handled ones is worse than a short handled set with the
gap named.

## Where this sits in the sequence

Setup, in the order `references/first-run.md` gives it: install the write
boundary first, then discover the check entry point, then work. Discovery
depends on the gate having run, in the weak sense that `.factory/` and its
exclusion already exist by then; it will create both itself if it goes first.

`references/enforcement.md` says what each control is worth and what it does not
cover. This one covers no violation at all: it is a **check** in the strict
sense of that chapter, and what refuses is the operator declining to land work
on an integration branch while it is red.
