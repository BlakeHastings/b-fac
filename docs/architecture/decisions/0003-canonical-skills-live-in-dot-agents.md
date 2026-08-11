# 0003. The canonical skill lives in `.agents/skills/`, and Claude gets a mirror

Status: accepted

## Context

This repository ships one orchestration workflow and wants it to run in as many
coding harnesses as possible. Research into how that is actually done in 2026
turned up two facts that decide the layout between them.

**The portable unit is a skill, not a rules file, and not a slash command.**
Agent Skills was published as an open spec at agentskills.io in December 2025
and picked up by roughly forty products within months. Over the same period the
ecosystem folded slash commands *into* skills: Amp removed custom commands
outright, Cursor shipped a `/migrate-to-skills` command, Codex deprecated its
prompts directory, and Claude Code's own docs now say a file at
`.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md`
are the same thing. Shipping the workflow as a `SKILL.md` is therefore not one
option among several; it is the thing every harness converged on.

**`.agents/skills/` is the neutral location, and Claude Code is the holdout.**
The Agent Skills client implementation guide tells implementers to scan both
`.<client>/skills/` and `.agents/skills/`. Codex, Cursor, VS Code/Copilot,
Gemini CLI, OpenCode, Amp, Goose, Zed, Cline, Roo, Kilo and others comply.
Claude Code reads `~/.claude/skills/`, `.claude/skills/`, and a plugin's
declared skill paths, and nothing else — `.agents/skills` does not appear
anywhere in its documentation. Claude Code is a holdout twice over, since it
also does not read `AGENTS.md`.

There is a temptation to treat Claude as the primary and everything else as a
port, because Claude is what the author uses. That gets the dependency backwards
and would make every other harness a second-class citizen forever.

## Decision

**`.agents/skills/<name>/SKILL.md` is canonical.** One copy, edited directly.
Around forty harnesses read it from a plain clone with no glue at all.

**Frontmatter is restricted to the six spec fields** — `name`, `description`,
`license`, `compatibility`, `metadata`, `allowed-tools`. Claude Code accepts a
much richer set (`argument-hint`, `context: fork`, `model`, `effort`, `paths`
and more), and every one of them is a portability trap: the Skills API rejects
unknown keys outright rather than ignoring them. The body is portable; the
frontmatter is not. Anything Claude-specific goes under `metadata`.

**The plugin manifest points at the canonical path** rather than relocating it:
`"skills": ["./.agents/skills/"]`. A marketplace entry sourced at the repo root
may declare skill paths anywhere inside the plugin root, so no copy is needed
for the install path.

**`.claude/skills/` is a generated mirror**, written by
`scripts/sync-harnesses.mjs` and gated in CI. It exists for exactly one person:
the contributor who clones this repo rather than installing the plugin, and who
would otherwise be the only user in the ecosystem unable to run the thing the
repo is about.

**A copy, never a symlink.** This repo is developed on Windows, where a symlink
without Developer Mode and `core.symlinks=true` does not fail — git writes a
small text file containing the link target and exits 0. The mirrored `SKILL.md`
would then contain the literal string `../../.agents/skills/…` and would load
as a skill that does nothing. Apache Airflow, Next.js and others do symlink
`AGENTS.md` to `CLAUDE.md`, and it works fine for them because they are not
developing on Windows. Anthropic's own guidance is to use the `@AGENTS.md`
import on Windows instead.

**`AGENTS.md` stays thin**, with `CLAUDE.md` containing little more than
`@AGENTS.md`. A controlled study out of ETH Zurich found that context files
raise inference cost by over 20% while moving task success only a few points,
and that LLM-authored ones make things slightly worse. The finding argues for
an orientation file that points at documents, not one that inlines them.

## Consequences

A contributor can edit the mirror by mistake. The drift check catches it, and
its failure message says which copy is canonical and warns that the edit is
about to be overwritten. That is the cost of Claude not reading the convention
its own format's spec recommends.

Someone who both clones the repo and installs the plugin sees the skill twice,
once as a project skill and once namespaced under the plugin. Plugin skills are
namespaced so this never hard-conflicts, but the model sees two similar
descriptions.

Sourcing the plugin at `./` also means an install copies the whole repository,
including `CLAUDE.md`, `AGENTS.md`, `docs/` and `scripts/`, and that
`claude plugin tag` warns about `CLAUDE.md` on every release. This ADR did not
say so when it chose the layout. **ADR 0014 measures what ships, accepts it, and
records when that should be reconsidered.**

**Rejected for now: a generator** (`ruler`, `rulesync`). Both are real and
maintained, and `rulesync generate --check` is the only first-class drift gate
in the category. They earn their keep when you need divergent per-harness
frontmatter or MCP and subagent propagation. We need neither yet, and a
30-line script we understand beats a toolchain we would be holding wrong.
Revisit when a harness needs frontmatter the spec cannot express.

**Rejected for now: shipping the workflow as an MCP server.** The heuristic the
ecosystem settled on is that markdown carries what an agent must *know* and MCP
carries what it must *do* against a live system with credentials. This workflow
is procedural and wants to live in version control next to the code. Note also
that MCP *prompts* are not a portable command layer: Codex does not surface
them.
