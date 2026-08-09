# CLAUDE.md

Claude Code does not read `AGENTS.md`, so this file imports it. Everything that
applies to every harness lives there; keep this file to Claude-only mechanics.

@AGENTS.md

## Claude-only notes

- The canonical skills are in `.agents/skills/`, which Claude Code does not
  scan. `.claude/skills/` is a **generated mirror** — edit the canonical copy
  and run `npm run sync`. `npm run check:sync` fails if they have drifted.
- To load the plugin from a clone without installing it: `claude --plugin-dir .`
- `SKILL.md` frontmatter is restricted to the six Agent Skills spec fields on
  purpose, even though Claude Code accepts many more. See ADR 0003 before
  adding `argument-hint`, `context`, `model` or similar.
