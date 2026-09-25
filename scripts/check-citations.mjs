// Fails when the shipped skill cites one of this repository's ADRs or issues by
// bare number.
//
// WHAT THIS PREVENTS
// The skill's own setup gives a host repository its own
// `docs/architecture/decisions/`, numbered from 0001, and GitHub resolves a
// bare `#N` against whichever repository it is read in. So "ADR 0021" in a host
// repository names the host's ADR 0021, and "#122" names the host's issue 122.
// Both read as a reason and point at the wrong one. #202 counted 56 bare ADR
// citations in the shipped prose and 13 printed lines in check-setup.mjs alone,
// written one at a time, each too small to notice in review.
//
// WHAT COUNTS
// - `ADR 0021` or `ADRs 0012` not preceded by `b-fac `. A line break between
//   the two still counts as qualified, so wrapped prose is not a finding.
// - `#122` not preceded by `owner/repo`. `BlakeHastings/b-fac#122` is this
//   repository's; `cli/cli#123` is someone else's and says so.
//
// WHERE
// Everything under `.agents/skills/`, which is what a host installs. In an
// asset script a line that is a comment is not read: the brief for #202 decided
// that shipped prose and printed strings are qualified and source comments stay
// bare, so the check holds exactly that line and no further. A string literal
// is a finding whether or not it is printed, because telling the two apart
// needs a parser and every such string in the assets today is printed.
//
// The mirror under `.claude/skills/` is left to check:sync, as in
// check-reference-tables.mjs, so one drift is not reported twice.
//
//   node scripts/check-citations.mjs
import { readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const QUALIFIER = 'b-fac'
export const REPOSITORY = 'BlakeHastings/b-fac'

const PAYLOAD = /^\.agents\/skills\//
const SCRIPT = /\.(mjs|js|py)$/

// `first-run.md` is this repository's history told as a sequence, and its
// opening paragraph says so: every commit, issue, pull request and ADR it names
// is b-fac's, at a URL it gives. Qualifying each of them again would be noise in
// the one file where no reader can take them for their own.
const EXEMPT = new Set(['.agents/skills/orchestrated-delivery/references/first-run.md'])

// Files with bare citations still in them that this check tolerates until they
// are fixed, because other work held them when it landed (#202 lists why).
// Unlike EXEMPT this expires by itself: a pending file with nothing left to fix
// is a failure, so the entry is deleted in the change that clears it.
export const PENDING = new Set([])

// A number that is not a citation at all but a placeholder in an example: a
// status line to copy, a brief from another project, a `gh` invocation. They
// stay bare because the reader is meant to read them as their own. Each entry is
// the exact phrase, not the number, so the same number cited for real elsewhere
// in the file is still a finding. An entry whose phrase has gone is a failure
// too, since an exemption nothing uses is one the next real citation can hide in.
export const ILLUSTRATIVE = [
  ['.agents/skills/orchestrated-delivery/SKILL.md', 'Next: dispatching #41 and #43', 'the status-line template'],
  ['.agents/skills/orchestrated-delivery/SKILL.md', 'Asked in #52.', 'the status-line template'],
  ['.agents/skills/orchestrated-delivery/SKILL.md', 'Meanwhile: #42 does not', 'the status-line template'],
  ['.agents/skills/orchestrated-delivery/SKILL.md', "I'll start #122 unless", 'a quoted clause to delete, any number'],
  ['.agents/skills/orchestrated-delivery/references/briefing.md', 'GitHub issue #29', "another project's brief"],
  ['.agents/skills/orchestrated-delivery/references/briefing.md', '#59 excluded the licence number', "another project's brief"],
  ['.agents/skills/orchestrated-delivery/references/github-backlog.md', 'naming #61', 'the `gh issue edit 78 --add-blocked-by 61` example'],
  ['.agents/skills/orchestrated-delivery/references/github-backlog.md', 'Merging #61 and', 'the same example, continued'],
  ['.agents/skills/orchestrated-delivery/references/enforcement.md', 'A branch adding ADR 0009', "a host's hypothetical ADR"],
]

const ADR = /\bADRs? \d{4}\b/g
const ISSUE = /(?<![\w&])((?:[\w.-]+\/[\w.-]+)?)#(\d+)\b/g

// Blank rather than delete, so every index still maps to its original line.
function blank(text) {
  return text.replace(/[^\n]/g, ' ')
}

// A whole-line comment only. A trailing `// ...` after code stays in, because
// `https://` is not a comment and the assets print URLs.
const COMMENT_LINE = { js: /^\s*(\/\/|\/\*|\*)/, py: /^\s*#/ }

function withoutComments(file, text) {
  const comment = file.endsWith('.py') ? COMMENT_LINE.py : COMMENT_LINE.js
  return text
    .split('\n')
    .map((line) => (comment.test(line) ? blank(line) : line))
    .join('\n')
}

// Returns the bare citations in one file's text, and the illustrative phrases
// that file was expected to hold and does not.
export function findBare(file, text) {
  let scanned = SCRIPT.test(file) ? withoutComments(file, text) : text
  const stale = []
  for (const [where, phrase] of ILLUSTRATIVE) {
    if (where !== file) continue
    if (!scanned.includes(phrase)) stale.push(phrase)
    scanned = scanned.split(phrase).join(blank(phrase))
  }

  const lineOf = (index) => scanned.slice(0, index).split('\n').length
  const lines = text.split('\n')
  const findings = []
  const report = (index, citation) => {
    const line = lineOf(index)
    findings.push({ file, line, citation, text: lines[line - 1].trim() })
  }

  for (const m of scanned.matchAll(ADR)) {
    const before = scanned.slice(Math.max(0, m.index - QUALIFIER.length - 1), m.index)
    if (!new RegExp(`${QUALIFIER}\\s$`).test(before)) report(m.index, m[0])
  }
  for (const m of scanned.matchAll(ISSUE)) {
    if (m[1] === '') report(m.index, m[0])
  }
  return { findings, stale }
}

function payloadFiles() {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((f) => f && PAYLOAD.test(f) && !EXEMPT.has(f))
    .filter((f) => /\.(md|mjs|js|py|json|ya?ml|txt)$/.test(f))
}

function main() {
  const files = payloadFiles()
  const findings = []
  const stale = []
  const pending = []
  for (const file of files) {
    const result = findBare(file, readFileSync(file, 'utf8'))
    if (PENDING.has(file)) {
      if (result.findings.length === 0) stale.push({ file, phrase: '(PENDING, and nothing is left to fix)' })
      else pending.push(`${file}: ${result.findings.length} bare, pending`)
    } else {
      findings.push(...result.findings)
    }
    stale.push(...result.stale.map((phrase) => ({ file, phrase })))
  }
  for (const file of PENDING) {
    if (!files.includes(file)) stale.push({ file, phrase: '(PENDING, and the file is gone)' })
  }

  for (const line of pending) console.log(`  ${line}`)
  if (findings.length === 0 && stale.length === 0) {
    console.log(`Citation check passed across ${files.length} payload files.`)
    return 0
  }

  if (findings.length > 0) {
    console.error(`Bare citation of this repository in ${findings.length} place(s) in the payload:\n`)
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  ${f.citation}`)
      console.error(`    ${f.text.slice(0, 100)}\n`)
    }
    console.error(`A host repository has its own ADR numbers and its own issues, so a bare`)
    console.error(`number names one of theirs. Write "${QUALIFIER} ADR 0021" or "${REPOSITORY}#122".`)
    console.error(`A comment line in an asset script is not checked; its strings are.\n`)
  }
  for (const s of stale) {
    console.error(`  ${s.file}: exemption with nothing behind it: ${JSON.stringify(s.phrase)}`)
  }
  if (stale.length > 0) console.error('\nRemove or correct that entry in scripts/check-citations.mjs.')
  return 1
}

// Node 22 has no `import.meta.main`, so the module asks whether it is the entry
// point, as post-body.mjs does, and the tests can import `findBare` without
// running a scan of the working tree.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) process.exit(main())
