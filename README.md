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

`.agents/skills/` is the cross-harness convention from the Agent Skills spec,
and most harnesses scan it with no further configuration. Invocation differs:

| Harness | Invoke with |
| --- | --- |
| Claude Code | `/orchestrated-delivery` (see the note below) |
| Codex CLI, ChatGPT | `$orchestrated-delivery` |
| Cursor, VS Code / Copilot, Amp, Zed, OpenCode | `/orchestrated-delivery` |
| Gemini CLI | `/skills enable`, then the `activate_skill` tool |

**Claude Code is the exception.** It does not scan `.agents/skills/`, so copy
into `.claude/skills/` instead, or use the plugin above.

### How well is it actually supported?

Honesty matters more here than a long list of logos.

| | Status |
| --- | --- |
| Claude Code, as a plugin | **Verified.** Manifests validated, load path checked by breaking it and watching it fail |
| Claude Code, from `.claude/skills/` | **Verified.** |
| Everything else | **Untested.** The skill is spec-conformant and those harnesses read the spec, so it should work. Nobody has run it. |

If you use one of the untested ones, please open an issue saying what happened
either way. A confirmation is as useful as a bug.

## What is in here

| Path | What it is |
| --- | --- |
| `.agents/skills/orchestrated-delivery/` | **Canonical.** The skill, its references, and the assets it installs |
| `.claude/skills/` | Generated mirror, because Claude Code will not read the canonical path |
| `.claude-plugin/` | Marketplace and plugin manifests. This repo is both |
| `docs/process/` | How *this* repo is run, which is the same loop it ships |
| `docs/architecture/decisions/` | Why things are the way they are |
| `scripts/` | This repo's own tooling, not part of the payload |

The skill itself is five reference documents behind one `SKILL.md`, loaded on
demand rather than all at once:

| Read it when |
| --- |
| `references/briefing.md` — writing a brief or an issue |
| `references/reviewing.md` — a PR is waiting |
| `references/parallelism.md` — running more than one agent |
| `references/enforcement.md` — installing the controls, or one misfired |
| `references/github-backlog.md` — seeding or maintaining the issue graph |

## Developing

```bash
npm run check        # tests, mirror drift, vocabulary
npm run sync         # regenerate .claude/skills/ from .agents/skills/
npm run check:plugin # claude plugin validate . --strict
```

No dependencies and no lockfile: everything runs on Node 22's built-ins.

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
