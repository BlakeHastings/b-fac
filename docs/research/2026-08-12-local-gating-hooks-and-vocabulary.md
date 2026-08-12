# Running the gate locally: CI, hooks, and what to call any of it

**Verified on** 2026-08-12

Asked for #60, for the guest-mode half: what a factory can enforce on one
machine when it may not touch the company's CI. Feeds #63 and #65. Everything
before "Not confirmed" was checked by fetch or local experiment on the
verified-on date. Rehomed from an issue comment on that same date without
re-checking anything.

## beads already models the seam we were about to invent

The earlier objection was that making a task tracker trigger a merge gate is
using a to-do list as a CI system. That was wrong on the part that matters.

Its **git hooks** really are pure data-sync plumbing: `pre-commit` exports
JSONL, `pre-push` runs `dolt fsck`, and on timeout they warn and let the commit
through. Nothing there runs your code.

But beads also has **gates**, with types `human`, `timer`, `bead`, `gh:run` and
`gh:pr`, enforced at close preflight. It already models "this issue cannot close
until a check passes", and `gh:run` means GitHub is **already one driver behind
that concept** in a tool we were going to adopt anyway. beads does not run CI
and is not a CI system; it waits on one. So the work is adding a `local:run`
sibling to `gh:run`, not designing a provider pattern from nothing. It also has
script hooks in `.beads/hooks/` on create, update and close, and an events
journal with `bd events tail --follow`.

**This survey exists because of what it corrected.** Notes written weeks earlier
said the repository was elsewhere and the storage was something else. By this
date beads had moved to `gastownhall/beads` and its storage was Dolt, with
`.beads/issues.jsonl` described in its own docs as "an export, not the source of
truth". Two facts, both wrong, both load-bearing, inside a month.

## Local checks are nearly free, because the answer is what we already do

**One runner-agnostic entry point, with the Actions YAML as a thin wrapper
around it.** This repo already has that shape: `npm run check`, called by
`.github/workflows/checks.yml`. Guest mode's local gate is therefore
`merge-pr.mjs` running `npm run check` instead of reading a remote rollup, which
is the same set of checks by construction, with no second definition to drift.
Zero adoption tax, and the only option that survives a locked-down work machine
where you cannot install a daemon.

The honest limit: this reproduces **steps**, never the **environment**. Node
version, OS and tooling still differ between a laptop and a runner. **Dagger**
(v0.21.8, Apache-2.0, healthy) is the only surveyed tool that closes that gap,
and it needs a container runtime. Reach for it if "works locally, fails in CI"
becomes a recurring complaint. It is not one today.

**`act` is disqualified for gating**, and this is the part worth keeping. Its
fidelity gaps **fail open**: `permissions`, `timeout-minutes`,
`continue-on-error` and `job.environment` are silently ignored, OIDC is
undefined, and artifacts are broken on the current upload action. A gate whose
failure mode is "passes anyway" is worse than no gate. Use `act` to reproduce a
CI failure; never to authorise a merge. Forgejo and Gitea Actions inherit the
same engine and the same behaviour.

## Hooks, precisely

`--no-verify` is narrower than usually assumed. On `git push` it toggles
`pre-push` and nothing else; on `git commit`, `pre-commit` and `commit-msg`. It
has no effect on any server-side hook, confirmed against a local bare repo where
both `--no-verify` and `--force` were refused by `pre-receive`.

Two things do defeat a local server-side hook, both verified:
`git push --receive-pack='git -c core.hooksPath=/dev/null receive-pack'`, and
deleting the hook file. So even a bare-origin design is a guarantee only against
a client that is not actively hostile, which is the right threat model for one's
own machine and is worth stating rather than overselling.

**No hook manager is worth adopting here.** One gate and one `npm run check` do
not justify a dependency; a committed `.githooks/pre-push` plus `core.hooksPath`
is one line. If that ever changes, take **lefthook**: a single Go binary, no
runtime, and the only surveyed manager with server-side hook support. Two
corrections to common belief while the notes are open: overcommit has **no**
server-side support, and **husky is dormant**, 21 months without a release.

## The vocabulary is standard-backed, so borrow it

The check/gate split is not ours to invent. **Zuul** draws exactly this line: a
*check* pipeline is pre-merge and advisory, a *gate* pipeline is triggered by
approval and merges on success. GitHub agrees structurally, in that a *check
run* reports and it takes the modifier **required** plus a ruleset to make it
refuse. Gerrit splits the same two slots as a `Verified` label versus a submit
requirement.

Worth adopting: **event, trigger, pipeline** (of jobs and steps) on a
**runner**, producing **checks**, enforced by a **gate**, with the pluggable
implementation called a **driver**, which is Zuul's word for precisely "GitHub
Actions is one flavour".

Prefer *pipeline* to *workflow*. GitHub is alone in saying workflow, against
GitLab, Zuul, Tekton, Woodpecker, Concourse, CDEvents and OpenTelemetry.

The one cost: colloquially people say "the checks are blocking the merge", which
conflates the two halves, so our writing will cut against the grain
occasionally. GitHub's own need for the word *required* is the argument that the
bare noun is ambiguous and the split is worth keeping.

## Inferred, not measured

- **`local:run` as a small addition to beads** follows from beads having a
  driver-shaped gate type. Nobody has read the code that resolves a gate, so the
  size of that change is an estimate.
- **Dagger closing the environment gap** is what Dagger claims and what its
  design implies. It was not run here.

## Not confirmed

b4, Patchwork, snowpatch and the patch-based flow documentation were never
checked against a live source. They look irrelevant to both modes as described,
but that is a judgement made without reading them. The pass ran out of WebSearch
budget at 200 of 200, so anything needing fresh discovery rather than fetching a
known URL wants a new pass rather than a re-read of this file.

## Dead ends

- **Earthly is dead.** Shutdown announced April 2025, migration pointed at
  Dagger. Delete it from any list it is still on.
- **`act`, for gating.** See above. Fine as a reproduction tool.
- **Hook managers, all of them, for now.** husky dormant, overcommit has no
  server-side hooks, lefthook is the one to take if the need ever appears.

## How this rots

The vocabulary section is the durable half: Zuul, Gerrit and GitHub are not
going to redefine these words this year. Everything about a specific tool's
health or version is a claim about 2026-08-12, and the beads correction at the
top is the demonstration that a month is long enough to make one wrong.
