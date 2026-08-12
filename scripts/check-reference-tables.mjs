// Fails when a hand-written table of a directory's contents disagrees with the
// directory it describes.
//
// WHAT THIS PREVENTS
// Two files restate the contents of the skill's references directory: SKILL.md's
// "References" table, which is what an agent reads to decide what to load, and
// README.md's, which is what a human reads before installing. Neither is
// generated. When `references/first-run.md` landed in #50 both lists were wrong
// the moment it merged, README's stayed wrong through the merge and every
// review of it, and the drift was found later by an agent doing something else.
// That is one direction. The other is a rename: a row survives the file it
// names, pointing a reader at a path that no longer exists, and nothing about
// that looks wrong in a diff.
//
// `docs/research/` (#67) has the identical shape with one table instead of two,
// so it is checked here rather than in a second script that would go stale the
// same way for the same reason. It carries one extra rule, because a survey has
// one property nothing else here needs: a date. An undated survey reads as
// current for ever, which is worse than never having written it.
//
// So this compares sets rather than reading prose. It cannot tell you a "read
// it when" description is wrong, or that a survey's decay note is honest. It
// can tell you that the rows and the files are the same set in both directions,
// and that every survey says when it was true.
//
//   node scripts/check-reference-tables.mjs
import { readdirSync, readFileSync } from 'node:fs'

// The mirror under .claude/skills/ is generated, so its copy of SKILL.md is
// covered by check:sync rather than here. Checking it too would report one
// drift twice and let a green here mean "the generator ran".
const CHECKED = [
  {
    directory: '.agents/skills/orchestrated-delivery/references',
    tables: ['README.md', '.agents/skills/orchestrated-delivery/SKILL.md'],
    // Rows name these by path. A bare filename would also match prose that
    // happens to mention a markdown file.
    rowPattern: /references\/([\w.-]+\.md)/g,
    noun: 'reference document',
  },
  {
    directory: 'docs/research',
    // The index lives beside the surveys, so it is a table and not an entry.
    skip: (name) => name === 'README.md',
    tables: ['docs/research/README.md'],
    // Rows link to a sibling, so there is no directory prefix to match on. The
    // date prefix is what makes the filename unambiguous instead, which is one
    // of the two reasons `surveyProblems` insists on it.
    rowPattern: /(\d{4}-\d{2}-\d{2}-[\w.-]+\.md)/g,
    noun: 'survey',
    problemsIn: surveyProblems,
  },
]

// The date is in the filename so a reader sees the age in a directory listing,
// and in the body so it survives being read on its own. Both copies are checked
// against each other, because the failure that produces a confidently wrong
// document is copying last month's survey and editing the parts you noticed.
function surveyProblems(path, name, text) {
  if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) {
    return [
      `${path} is not named YYYY-MM-DD-topic.md.`,
      '  A survey is only as good as its date, so the date goes in the filename.',
    ]
  }

  const claimed = /^\*\*Verified on\*\*\s+(\d{4}-\d{2}-\d{2})\s*$/m.exec(text)
  if (!claimed) {
    return [
      `${path} has no "**Verified on** YYYY-MM-DD" line.`,
      '  Without one it reads as current for ever. See docs/research/README.md.',
    ]
  }

  if (claimed[1] !== name.slice(0, 10)) {
    return [
      `${path} says it was verified on ${claimed[1]}, but its filename says ${name.slice(0, 10)}.`,
      '  Those are the same claim, so one of them is a leftover from a copy or a rename.',
    ]
  }

  return []
}

// Table rows only. These files also mention their own directories in prose,
// where a passing pointer is not a claim about what the directory contains, and
// counting those would make every cross-reference a row this check believes in.
function rowsIn(text, pattern) {
  const listed = new Set()
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    for (const match of line.matchAll(pattern)) listed.add(match[1])
  }
  return listed
}

let failed = false

for (const { directory, tables, rowPattern, noun, skip, problemsIn } of CHECKED) {
  const onDisk = readdirSync(directory).filter(
    (name) => name.endsWith('.md') && !(skip?.(name) ?? false),
  )

  for (const name of onDisk) {
    const path = `${directory}/${name}`
    for (const problem of problemsIn?.(path, name, readFileSync(path, 'utf8')) ?? []) {
      console.error(problem)
      failed = true
    }
  }

  for (const table of tables) {
    const listed = rowsIn(readFileSync(table, 'utf8'), rowPattern)

    // A check that scans nothing passes. If the table is renamed, reformatted
    // out of a markdown table, or deleted, every file below reports as
    // unlisted, which is loud but says the wrong thing. Say the right thing.
    if (listed.size === 0) {
      console.error(`${table} has no table row naming a ${noun} in ${directory}.`)
      console.error('Either the table moved out of this file or it stopped being a markdown')
      console.error('table. Point CHECKED in this script at wherever it went.\n')
      failed = true
      continue
    }

    const unlisted = onDisk.filter((name) => !listed.has(name)).sort()
    const phantom = [...listed].filter((name) => !onDisk.includes(name)).sort()

    if (unlisted.length === 0 && phantom.length === 0) {
      console.log(`${table} lists all ${onDisk.length} ${noun}s in ${directory} and no others.`)
      continue
    }

    failed = true
    for (const name of unlisted) console.error(`${table} has no row for ${directory}/${name}.`)
    for (const name of phantom) {
      console.error(`${table} has a row for ${directory}/${name}, which does not exist.`)
    }
    console.error('')
  }
}

if (failed) {
  console.error('Every file in a checked directory gets one row in each of its tables, and')
  console.error('every row names a file that is there. A rename happens in the file and in')
  console.error('every table naming it, in the same commit.')
  process.exit(1)
}
