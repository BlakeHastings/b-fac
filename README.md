# b-fac

A loop for building a real project with agents, packaged to run in whatever
coding harness you already use.

You act as an orchestrator: break work into GitHub issues, brief implementation
agents that work in isolated worktrees, verify what comes back rather than
accepting it, and merge through a path that mechanically refuses red checks.
The workflow ships as an [Agent Skill](https://agentskills.io), plus the process
docs, PR template, backlog seeder and merge tooling that make it real in a repo.

It is distilled from a project that reached roughly 40 ADRs, 70 issues and 50
merged pull requests in four days without losing architectural control. Most of
it is calibration with the reason attached, so you can tell when the reason
stops applying. Five things are constraints, and each is there because breaking
it produced a specific failure.

## Install

### Claude Code

```
/plugin marketplace add BlakeHastings/b-fac
/plugin install b-fac@b-fac
```

Then invoke it as `/b-fac:orchestrated-delivery`, or just describe what you
want ("orchestrate this backlog", "review this PR before I merge") and let it
activate on its own.

### Every other harness

Copy the skill into the repo you want to use it in:

```bash
git clone https://github.com/BlakeHastings/b-fac
mkdir -p your-repo/.agents/skills
cp -r b-fac/.agents/skills/orchestrated-delivery your-repo/.agents/skills/
```

`.agents/skills/` is the cross-harness convention from the Agent Skills spec.
Four CLIs have been watched picking the skill up from it in a clean container:
Codex, Copilot and OpenCode with no configuration at all, and Gemini once the
folder is trusted. Invocation differs:

| Harness | Invoke with |
| --- | --- |
| Claude Code | `/orchestrated-delivery` (see the note below) |
| Codex CLI | `$orchestrated-delivery` (but see the note below) |
| Copilot CLI, OpenCode | `/orchestrated-delivery` |
| Gemini CLI | `/skills enable`, then the `activate_skill` tool |
| ChatGPT | `$orchestrated-delivery` |
| Cursor, VS Code / Copilot, Amp, Zed | `/orchestrated-delivery` |

ChatGPT, Cursor, Amp, Zed and the VS Code extension are on rows of their own
because nobody has watched any of them load this skill. Even on the four that
have been watched, what was observed is the skill being found and named; the
sigil you type in front of the name comes from each harness's own
documentation. The next section says which is which.

**Gemini needs the folder trusted.** It skips project skills in a folder it has
not been asked to trust, and says so rather than failing, so a first run can
look like a clean "no skills found".

**Codex namespaces the skill if a plugin manifest is in the tree.** The `cp`
above copies the skill alone, and Codex then reports it as
`orchestrated-delivery`. Clone or copy this whole repository instead and
`.claude-plugin/plugin.json` comes with it, at which point Codex reports
`b-fac:orchestrated-delivery` and that is the name you have to type. Observed on
codex 0.147.0 by moving the manifest aside and watching the bare name come back.
It is the same trap ADR 0012 documents for Claude Code, in a second harness.

**Claude Code is the exception.** It does not scan `.agents/skills/`, so copy
into `.claude/skills/` instead, or use the plugin above.

### How well is it actually supported?

Honesty matters more here than a long list of logos. There are two claims here
and they are not the same size: **a harness finding the skill** and **a model
using it**. Only the first has been observed anywhere but Claude Code.

| | Status |
| --- | --- |
| Claude Code, as a plugin | **Verified.** Manifests validated, load path checked by breaking it and watching it fail |
| Claude Code, from `.claude/skills/` | **Verified.** |
| Codex CLI, Gemini CLI, Copilot CLI, OpenCode | **Discovery verified.** Each was watched finding the skill under `.agents/skills/` in a clean container with no credentials, and losing it again when the skill was deleted in the same run. Nobody has watched a model use it |
| Cursor, the VS Code Copilot extension | **Untested,** and not testable this way. Neither has a headless surface to ask; `cursor-agent` has no skills commands at all |
| Everything else | **Untested.** The skill is spec-conformant and those harnesses read the spec, so it should work. Nobody has run it |

Reproduce the third row yourself, if you have Docker:

```bash
npm run check:harnesses
```

It pins the four CLI versions, so it also says nothing about whatever version
you are on. `npm run check:harness-pins` reports how far those pins have drifted
from what the registry is shipping today, and both run weekly in CI.
`docs/process/harness-verification.md` has the detail, including the three
harnesses that would report a `SKILL.md` gutted to its frontmatter exactly as
they report the real one.

If you use one of the untested ones, or you get further than discovery on one of
the verified ones, please open an issue saying what happened either way. A
confirmation is as useful as a bug.

## What is in here

| Path | What it is |
| --- | --- |
| `.agents/skills/orchestrated-delivery/` | **Canonical.** The skill, its references, and the assets it installs |
| `.claude/skills/` | Generated mirror, because Claude Code will not read the canonical path |
| `.claude-plugin/` | Marketplace and plugin manifests. This repo is both |
| `docs/process/` | How *this* repo is run, which is the same loop it ships |
| `docs/architecture/decisions/` | Why things are the way they are |
| `scripts/` | This repo's own tooling, not part of what gets loaded |
| `tools/harness-verify/` | The container that watches other harnesses find the skill. Out of `scripts/` because it needs Docker; ADR 0019 |

Installing the plugin copies **all** of that, because the marketplace entry is
sourced at the repository root. Only `.agents/skills/` is loaded; the rest sits
in the plugin cache doing nothing. ADR 0014 has the measurement and the reason
it is left that way. The figure that used to be here — 64 files, 360 KB — was
already wrong by a dozen files, which is what a hand-copied count does.

The skill itself is one `SKILL.md` with reference documents behind it, loaded on
demand rather than all at once:

| Read it when |
| --- |
| `references/briefing.md` — writing a brief or an issue |
| `references/reviewing.md` — a PR is waiting |
| `references/parallelism.md` — running more than one agent |
| `references/enforcement.md` — installing the controls, or one misfired |
| `references/github-backlog.md` — seeding or maintaining the issue graph |
| `references/first-run.md` — setting this up in a repo that has none of it yet |

That table and the one in `SKILL.md` are both written by hand, so
`npm run check:references` holds them to the directory: a reference document
with no row fails, and so does a row naming a file that is no longer there.

## Developing

```bash
npm run check           # tests, mirror drift, vocabulary
npm run sync            # regenerate .claude/skills/ from .agents/skills/
npm run check:plugin    # claude plugin validate . --strict
npm run check:harnesses # four other harnesses still find the skill (needs Docker)
```

No dependencies and no lockfile: everything runs on Node 22's built-ins.
`check:harnesses` is the exception to "everything is fast": it builds a 2 GB
container, so it is out of `npm run check` and out of the pull request gate, and
runs weekly instead. ADR 0020 says why.

**Edit `.agents/skills/`, never `.claude/skills/`.** The second is generated and
your change will be overwritten. `npm run check:sync` catches it, and CI runs
that gate on every pull request.

The mirror is a copy rather than a symlink on purpose. This repo is developed on
Windows, where git does not fail on a symlink without Developer Mode — it writes
a small text file containing the link target and exits 0, producing a `SKILL.md`
whose entire content is a path. See ADR 0003.

`SKILL.md` frontmatter is restricted to the six Agent Skills spec fields, even
though Claude Code accepts many more. The body is portable; the frontmatter is
not, and the Skills API rejects unknown keys rather than ignoring them.

### Contributing

This repo is run by the loop it ships, so the process docs are not decoration:

- `docs/process/working-an-issue.md` — branch naming, verification, merge discipline
- `docs/process/review.md` — the three lenses that define done

Agents working here do not merge. Push, open the PR, stop.

## Licence

MIT. The examples are real defects from a real project, re-domained so they
describe nobody's client. See ADR 0002.
