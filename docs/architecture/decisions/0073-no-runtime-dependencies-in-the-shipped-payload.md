# 0073. No runtime dependencies in the shipped payload, and the CLI ships as a committed bundle

Status: accepted

Issue #232, a child of epic #196. Replaces the rule `AGENTS.md` stated as "No
dependencies, no lockfile, Node 22 built-ins only".

## Context

Epic #196 wants a `factory` CLI, and the owner asked for a proper CLI framework
in Node or TypeScript. The orchestrator's prior-art research picked commander,
typed through `@commander-js/extra-typings`, bundled by esbuild into one file
committed inside the plugin. #232 records that choice. The research measured
commander at 39.6 KB; that is the minified figure, and it reproduces here as
40.2 KB for the whole minified bundle.

That collides with a rule, and the rule lived in fewer places than #232 says.

**Where the old rule was stated.** `AGENTS.md`, under "Running things", not in
its Invariants list: "No dependencies, no lockfile, Node 22 built-ins only. If
that stops being true, add `npm ci` to `.github/workflows/checks.yml` and commit
the lockfile." The comment above the test step in `checks.yml` said the same,
and so did `README.md`'s Developing section. The shipped skill text said "This
repository has no dependencies" in `references/briefing.md`.

**ADR 0014 does not state it.** #232 says this change amends ADR 0014. ADR 0014
decided that the plugin ships the whole repository and that the `CLAUDE.md`
warning is expected; it says nothing about dependencies. It matters here for a
different reason: because the whole repository ships, everything committed
reaches an installer, and nothing in an install runs `npm ci`. That is what
makes "no *runtime* dependencies in the *shipped* payload" the rule worth
keeping, and a committed bundle the way to keep it. ADR 0014's decision stands
untouched, so it carries no back-pointer.

**ADR 0018 and ADR 0019 describe the old rule as a fact of their time.** ADR
0018 argues the mirror must be committed partly because "`package.json` has no
dependencies and no lockfile, CI has no install step by design". CI now has one,
but `npm ci` does not run `npm run sync`, and the mirror is for a session that
starts before anything has run, so the argument holds. ADR 0019 put the harness
check in `tools/` because `scripts/` is "Node built-ins with no dependencies and
no lockfile". `scripts/build-cli.mjs` is now the one script there that needs
`node_modules`; the container argument for `tools/` is unaffected. Both keep
their decisions and their text.

## Decision

**The rule is: no runtime dependencies in the shipped payload.** Source may
have dev dependencies. What an installer receives needs Node and nothing else.

- **The CLI ships as one committed file, `cli/factory.mjs`**, bundled by
  `scripts/build-cli.mjs` from `cli/src/`. Its first lines say it is generated.
  It is the `.claude/skills/` mirror's situation again, so it gets the mirror's
  gate: `npm run check:bundle` builds in memory and fails unless the result is
  byte-for-byte the committed file.
- **Every dev dependency is pinned exactly and the lockfile is committed.** A
  fresh build equals the committed one only on the same toolchain, so the check
  also refuses to compare when the installed esbuild is not the pinned one,
  rather than reporting drift that is really a version skew.
- **CI's `Checks` job runs `npm ci`; the `Plugin` job does not.** The `Plugin`
  job is therefore an installer's position, and `check-plugin-load.mjs` runs
  the bundle there from the path the loader reports, so a bundle that reached
  for `node_modules` fails in CI rather than on a stranger's machine.
- **`npm run check:types` runs `tsc`**, because esbuild strips types without
  reading them and nothing else would see a type error.
- **The CLI's version is the plugin's**, read from `plugin.json` at run time.
  One version number in one place is `releasing.md`'s rule, and baking it in at
  build time would make every version bump a bundle change.
- **`cli/` is payload** in `check-version-bump.mjs` and `releasing.md`.
- **The bundle is not minified.** 113 KB rather than 40 KB, so that someone
  reading a stack trace or the file itself can follow it. Commander's licence
  and extra-typings' are appended to it, because MIT asks that the notice travel
  with every copy and the package's own `LICENSE` stays in `node_modules`.
- **Dependabot is not pointed at npm.** Moving a dev dependency changes the
  bundle, so it is a change somebody makes and rebuilds on purpose.

## Consequences

`npm run check` is no longer zero-step: a fresh clone or worktree runs `npm ci`
first. `check:types` and `check:bundle` say so when it has not happened. An
agent worktree's `node_modules` can now arrive present but empty here too, which
`references/briefing.md` used to say could not happen in this repository.

The tree an install copies grows by about 145 KB: the bundle (113 KB), the
lockfile (28 KB) and the source. Those last two are inert for an installer, as
the repository-development files in ADR 0014 are. That is well short of the
order-of-magnitude growth ADR 0014 named as its trigger for revisiting.

A bundle built on Windows must equal one built on Linux, or CI goes red on every
pull request that touches `cli/`. It did on the pull request that introduced
this, which is the only evidence of that so far.

Nothing puts `factory` on a `PATH`, and this does not establish how a session
finds the plugin's install path to run `node <plugin root>/cli/factory.mjs`.
The first child of #196 that gives the CLI a caller has to settle that.
