// Fails when a skill body grows past its line budget.
//
// WHAT THIS PREVENTS
// AGENTS.md has said "a skill body stays under ~500 lines" since the start, and
// nothing held it. SKILL.md went 296, 388, 468, 482, 489, 495, 500 and then 501,
// each addition too small to notice in review and nothing ever moved out. #203.
// The budget is what progressive disclosure costs to keep: every line in the
// body is read on every activation, and a line in `references/` is read when
// its "read it when" says so.
//
// WHAT COUNTS
// Lines as `wc -l` and an editor's line numbers count them: a trailing newline
// ends the last line rather than starting another. Lines rather than tokens
// because that is the unit AGENTS.md states, and a limit nobody can check by
// eye gets argued with instead of met.
//
// WHERE
// Every `SKILL.md` under `.agents/skills/`. The mirror under `.claude/skills/`
// is left to check:sync, as in check-reference-tables.mjs.
//
//   node scripts/check-skill-size.mjs
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LIMIT = 500
const SKILLS = '.agents/skills'

export function countLines(text) {
  if (text === '') return 0
  const parts = text.split('\n')
  return text.endsWith('\n') ? parts.length - 1 : parts.length
}

function main() {
  const bodies = readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(SKILLS, entry.name, 'SKILL.md').replaceAll('\\', '/'))
    .filter((path) => existsSync(path))

  if (bodies.length === 0) {
    console.error(`No SKILL.md found under ${SKILLS}/, so there was nothing to measure.`)
    return 1
  }

  let over = 0
  for (const path of bodies) {
    const lines = countLines(readFileSync(path, 'utf8'))
    const verdict = lines > LIMIT ? 'OVER' : 'ok'
    if (lines > LIMIT) over++
    console.log(`  ${path}: ${lines} of ${LIMIT} lines, ${verdict}`)
  }

  if (over === 0) {
    console.log(`Skill size check passed: every body is within ${LIMIT} lines.`)
    return 0
  }

  console.error(`\n${over} skill body over the ${LIMIT}-line budget.`)
  console.error('Move detail into references/ and leave a "read it when" pointer behind.')
  console.error('Do not raise the limit to make this pass: the budget is the point. #203.')
  return 1
}

const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) process.exit(main())
