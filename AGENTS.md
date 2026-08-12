# AGENTS.md

This repo packages an orchestration workflow as an Agent Skill that runs across
coding harnesses. It is also **run by that workflow**, so the process docs below
describe how work actually happens here, not an aspiration.

## Invariants

- **`.agents/skills/` is canonical. `.claude/skills/` is generated.** Edit the
  first and run `npm run sync`. A change made in the mirror will be overwritten,
  and `npm run check:sync` fails the build when they differ.
- **`SKILL.md` frontmatter uses only the six Agent Skills spec fields**: `name`,
  `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Claude
  Code accepts more; nothing else does, and the Skills API hard-fails on unknown
  keys. Claude-specific values go under `metadata`.
- **The published examples name no real client.** ADR 0002 re-domained them to
  municipal permitting in one pass, and `npm run check:vocabulary` fails if the
  original vocabulary comes back. If you add an example, keep it concrete and
  keep it in that domain.
- **This repo's backlog is GitHub issues, addressed through `gh`.** That is the
  one line the backlog port asks every repo to state; the verbs behind it are in
  `.agents/skills/orchestrated-delivery/references/backlog-port.md`.
- **Agents do not merge.** Push the branch, open the PR, report, stop. Merging
  is the orchestrator's, through `node scripts/merge-pr.mjs <n>`.
- **A skill body stays under ~500 lines**, with detail pushed into
  `references/`. Progressive disclosure is the whole reason the format works.

## Running things

```bash
npm run check              # tests, mirror drift, vocabulary. The mechanical gate.
npm run sync               # regenerate .claude/skills/ from .agents/skills/
npm run check:version      # payload changed, so plugin.json's version must too
npm run check:plugin       # claude plugin validate . --strict
npm run check:plugin-load  # the real loader finds the skills, not just the JSON
claude --plugin-dir .      # load this repo as a plugin without installing it
```

The two `check:plugin*` scripts need the `claude` CLI, which is why `npm run
check` leaves them out. CI runs all four.

No dependencies, no lockfile, Node 22 built-ins only. If that stops being true,
add `npm ci` to `.github/workflows/checks.yml` and commit the lockfile.

CI runs two jobs, `Checks` and `Plugin`. Their names are matched by
`scripts/merge-pr.mjs`, so renaming a job in the workflow without updating that
script turns every merge into "never ran".

## Where to look

| For | Read |
| --- | --- |
| How to work an issue here | `docs/process/working-an-issue.md` |
| What "done" means | `docs/process/review.md` |
| How a version bump and a release happen | `docs/process/releasing.md` |
| Why something is the way it is | `docs/architecture/decisions/` |
| The workflow this repo ships | `.agents/skills/orchestrated-delivery/SKILL.md` |

## When something here is wrong

Correct it where the next person will meet it, not only in the conversation. A
rule broken by accident twice wants a check, not another paragraph. A gate that
has never caught anything should be deleted.
