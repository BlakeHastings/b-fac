// Fails when two ADRs claim the same number.
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
//   node scripts/check-collisions.mjs
import { readdirSync, existsSync } from 'node:fs'

const DIR = 'docs/architecture/decisions'

if (!existsSync(DIR)) {
  console.log(`No ${DIR} yet, nothing to collide.`)
  process.exit(0)
}

const byNumber = new Map()
for (const file of readdirSync(DIR)) {
  const match = /^(\d{4})-/.exec(file)
  if (!match) {
    // A file that does not start with a number cannot be checked for
    // collisions, and silently skipping it is how a mis-named ADR escapes.
    if (file.endsWith('.md') && file !== 'README.md') {
      console.error(`${DIR}/${file} does not start with a 4-digit number.`)
      process.exit(1)
    }
    continue
  }
  const list = byNumber.get(match[1]) ?? []
  list.push(file)
  byNumber.set(match[1], list)
}

const collisions = [...byNumber.entries()].filter(([, files]) => files.length > 1)

if (collisions.length === 0) {
  console.log(`No ADR number collisions across ${byNumber.size} decisions.`)
  process.exit(0)
}

console.error('Two ADRs claim the same number:\n')
for (const [number, files] of collisions) {
  console.error(`  ${number}:`)
  for (const file of files) console.error(`    ${file}`)
}
console.error('\nRenumber yours to the next free number, checking the default branch')
console.error('AND every open pull request. Assigned-but-unused numbers leave gaps,')
console.error('and a gap is not a bug.')
process.exit(1)
