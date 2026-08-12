# 0019. Harness verification runs in a container, under `tools/`

Status: accepted

## Context

ADR 0003 chose `.agents/skills/` as canonical on the strength of published
research: roughly forty harnesses are documented as reading it, and Claude Code
is the holdout. Nothing had ever observed that. `check-plugin-load.mjs` proves
the claim for the one harness the research said would fail.

Two things had to be true for the rest to be checkable at all. The harnesses had
to be installable somewhere that is not a contributor's machine, and there had
to be a way to observe discovery without credentials, since a public repo's
`pull_request` runs get no secrets and paid inference is not something a check
may spend. The second is not obvious in advance and is not universal: Cursor's
CLI has no skills surface of any kind, so no amount of containerisation makes it
verifiable.

## Decision

**Harness verification runs in a Docker image with the harness CLIs pinned, and
lives in `tools/harness-verify/` rather than `scripts/`.** `scripts/` is what
`npm run check` and CI call, all of it Node built-ins with no dependencies and
no lockfile, per `AGENTS.md`. This needs a container and several minutes of
image build, and putting it in `scripts/` would imply it belongs in that set. A
second directory says the opposite, which is the true thing.

**The container is a correctness requirement, not only a convenience.** A
developer machine already has personal skills that every one of these harnesses
loads, so a green there can come from `~/.agents/skills/` rather than from the
repository. Isolation is what makes the answer mean anything.

**Discovery is observed credential-free or not at all.** `codex debug
prompt-input`, `gemini skills list`, `copilot skill list --json` and `opencode
debug skill` all answer from disk before a model is contacted. Where no such
command exists, the honest output is "not testable this way" rather than a check
built on an API key.

**Every run carries its own negative control.** The probe runs twice, the second
time with the skill trees deleted, and the sentinel must be present in the first
answer and absent from the second. Verification that only ever runs against a
healthy tree cannot distinguish a working check from a broken one.

## Consequences

A second place to look for a check. `docs/process/harness-verification.md` says
what it covers and CI does not run it, so the split should not surprise anyone,
but it is a split.

Pinned versions go stale, and bumping them is manual. The alternative,
`@latest`, makes a rebuild silently change what is being tested and lets an
upstream release turn the check red with no commit to blame.

Cursor and the VS Code extension stay unverified. Issues #7 and #8 cannot be
closed by tooling, and the Copilot CLI result is evidence about the discovery
roots rather than about the editor.

Three of the four harnesses cannot report the loaded body, so for those the
check proves the skill was discovered and its frontmatter parsed, not that the
body is not empty. Only opencode gets a size floor. This is the exact hole
`check-plugin-load.mjs` closed for Claude Code with its token count, and it is
open here.
