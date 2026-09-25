// Fails when two ADRs claim the same number, or when an ADR says it changes an
// earlier one and the earlier one does not say so back.
//
// WHAT THIS PREVENTS
// Parallel branches each add a file whose name must be unique repo-wide.
// Neither branch is wrong alone, nothing conflicts textually, both merge, and
// merge order silently decides which ADR keeps its identity. Three agents on
// one project claimed 0005 and 0006 between them, each taking "the next free
// number" from a default branch that had already moved.
//
// This only means anything AGAINST THE MERGE RESULT. A branch adding 0009 is
// fine in isolation and collides only once the default branch has one too, so
// CI must run it on the merge commit. GitHub's `pull_request` event checks out
// the merge commit by default, which is what makes this work.
//
// THE BACK-POINTER (#204)
// Every ADR here said `Status: accepted` for ever, including ADR 0040 after
// three later ADRs had corrected it, so a reader landing on the old one had no
// way to know. Where a later ADR's preamble (the lines between its status and
// its first heading) says it supersedes, amends, corrects, revises or revisits
// ADR N, ADR N's status paragraph must name it. Only the preamble is read, and
// only those verbs, so an ADR that merely cites or builds on another owes
// nothing. The check cannot find a change the later ADR does not declare; it
// makes a declared one impossible to leave one-sided.
//
//   node scripts/check-collisions.mjs
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = 'docs/architecture/decisions'

const CHANGE = /\b(supersed(?:es|ed)|amends|corrects|revises|revisits)\b/i
const CITED = /\bADR\s+(\d{4})\b/g

// The status paragraph runs from `Status:` to the first blank line; the
// preamble is whatever follows it before the first `## ` heading.
export function parse(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => /^Status:/.test(line))
  if (start === -1) return { status: '', preamble: '' }
  let end = start
  while (end < lines.length && lines[end].trim() !== '') end++
  let heading = end
  while (heading < lines.length && !/^## /.test(lines[heading])) heading++
  return {
    status: lines.slice(start, end).join(' '),
    preamble: lines.slice(end, heading).join(' '),
  }
}

// Returns the ADR numbers an ADR's preamble declares it changes. A sentence
// (or clause, split on `;`) that carries a change verb claims every ADR it
// names, so "ADR 0049 is the mechanism this extends and, in one place,
// corrects" counts, and "ADR 0025 supplies the vocabulary" does not.
export function declaredChanges(preamble) {
  const changed = new Set()
  for (const clause of preamble.split(/(?<=[.;])\s+/)) {
    if (!CHANGE.test(clause)) continue
    for (const [, number] of clause.matchAll(CITED)) changed.add(number)
  }
  return changed
}

// adrs: Map of number -> file text. Returns [{ later, earlier }] for every
// declared change the earlier ADR's status does not point back to.
export function missingBackPointers(adrs) {
  const missing = []
  for (const [later, text] of adrs) {
    for (const earlier of declaredChanges(parse(text).preamble)) {
      if (earlier === later || !adrs.has(earlier)) continue
      const { status } = parse(adrs.get(earlier))
      if (!new RegExp(`\\bADR\\s+${later}\\b`).test(status)) {
        missing.push({ later, earlier })
      }
    }
  }
  return missing
}

function main() {
  if (!existsSync(DIR)) {
    console.log(`No ${DIR} yet, nothing to collide.`)
    return 0
  }

  const byNumber = new Map()
  for (const file of readdirSync(DIR)) {
    const match = /^(\d{4})-/.exec(file)
    if (!match) {
      // A file that does not start with a number cannot be checked for
      // collisions, and silently skipping it is how a mis-named ADR escapes.
      if (file.endsWith('.md') && file !== 'README.md') {
        console.error(`${DIR}/${file} does not start with a 4-digit number.`)
        return 1
      }
      continue
    }
    const list = byNumber.get(match[1]) ?? []
    list.push(file)
    byNumber.set(match[1], list)
  }

  const collisions = [...byNumber.entries()].filter(([, files]) => files.length > 1)

  if (collisions.length > 0) {
    console.error('Two ADRs claim the same number:\n')
    for (const [number, files] of collisions) {
      console.error(`  ${number}:`)
      for (const file of files) console.error(`    ${file}`)
    }
    console.error('\nRenumber yours to the next free number, checking the default branch,')
    console.error('every open pull request AND every worktree (`git worktree list`), where')
    console.error('an unpushed ADR is invisible to the other two. Assigned-but-unused')
    console.error('numbers leave gaps, and a gap is not a bug.')
    return 1
  }

  const adrs = new Map()
  for (const [number, [file]] of byNumber) {
    if (file.endsWith('.md')) adrs.set(number, readFileSync(`${DIR}/${file}`, 'utf8'))
  }
  const missing = missingBackPointers(adrs)
  if (missing.length > 0) {
    console.error('An ADR says it changes an earlier one, and the earlier one does not say so:\n')
    for (const { later, earlier } of missing) {
      console.error(`  ADR ${later} changes ADR ${earlier}, whose status does not name ADR ${later}.`)
    }
    console.error('\nAdd the pointer to the earlier ADR\'s status paragraph, for example')
    console.error('"Status: accepted, and amended by ADR NNNN, which ...". Do not rewrite')
    console.error('its reasoning: the record of what was believed at the time is the point.')
    return 1
  }

  console.log(
    `No ADR number collisions across ${byNumber.size} decisions, and every declared change is pointed back to.`,
  )
  return 0
}

// Node 22 has no `import.meta.main`, so the module asks whether it is the entry
// point before running, which lets the test import the functions above.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) process.exit(main())
