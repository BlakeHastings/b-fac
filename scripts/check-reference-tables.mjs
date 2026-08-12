// Fails when a hand-written table of the skill's reference documents disagrees
// with the directory it describes.
//
// WHAT THIS PREVENTS
// Two files restate the contents of one directory: SKILL.md's "References"
// table, which is what an agent reads to decide what to load, and README.md's,
// which is what a human reads before installing. Neither is generated. When
// `references/first-run.md` landed in #50 both lists were wrong the moment it
// merged, README's stayed wrong through the merge and every review of it, and
// the drift was found later by an agent doing something else. That is one
// direction. The other is a rename: a row survives the file it names, pointing
// a reader at a path that no longer exists, and nothing about that looks wrong
// in a diff.
//
// So this compares sets rather than reading prose. It cannot tell you a "read
// it when" description is wrong; it can only tell you the rows and the files
// are the same set, in both directions.
//
//   node scripts/check-reference-tables.mjs
import { readdirSync, readFileSync } from 'node:fs'

const REFERENCES = '.agents/skills/orchestrated-delivery/references'

// The mirror under .claude/skills/ is generated, so its copy of SKILL.md is
// covered by check:sync rather than here. Checking it too would report one
// drift twice and let a green here mean "the generator ran".
const TABLES = ['README.md', '.agents/skills/orchestrated-delivery/SKILL.md']

const onDisk = new Set(readdirSync(REFERENCES).filter((file) => file.endsWith('.md')))

// Table rows only. Both files also mention reference documents in prose, where
// a passing pointer is not a claim about what the directory contains, and
// counting those would make every cross-reference a row this check believes in.
function rowsIn(text) {
  const listed = new Set()
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    for (const match of line.matchAll(/references\/([\w.-]+\.md)/g)) listed.add(match[1])
  }
  return listed
}

let failed = false

for (const file of TABLES) {
  const listed = rowsIn(readFileSync(file, 'utf8'))

  // A check that scans nothing passes. If the table is renamed, reformatted out
  // of a markdown table, or deleted, every file below reports as unlisted,
  // which is loud but says the wrong thing. Say the right thing instead.
  if (listed.size === 0) {
    console.error(`${file} has no table row naming a reference document.`)
    console.error('Either the table moved out of this file or it stopped being a markdown')
    console.error('table. Point TABLES in this script at wherever it went.\n')
    failed = true
    continue
  }

  const unlisted = [...onDisk].filter((name) => !listed.has(name)).sort()
  const phantom = [...listed].filter((name) => !onDisk.has(name)).sort()

  if (unlisted.length === 0 && phantom.length === 0) {
    console.log(`${file} lists all ${onDisk.size} reference documents and no others.`)
    continue
  }

  failed = true
  for (const name of unlisted) {
    console.error(`${file} has no row for ${REFERENCES}/${name}.`)
  }
  for (const name of phantom) {
    console.error(`${file} has a row for references/${name}, which does not exist.`)
  }
  console.error('')
}

if (failed) {
  console.error(`Every file in ${REFERENCES} gets one row in each table, and every row`)
  console.error('names a file that is there. A renamed reference document has to be')
  console.error('renamed in both tables in the same commit.')
  process.exit(1)
}
