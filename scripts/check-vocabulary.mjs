// Fails when vocabulary from the original engagement reappears in the payload.
//
// WHAT THIS PREVENTS
// ADR 0002 re-domained every example to municipal permitting in one pass. The
// risk it does not cover is a future contributor writing a new example from
// memory of the original project, one phrase at a time, each too small to
// notice in review. This is the detection layer for that.
//
//   node scripts/check-vocabulary.mjs
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Multi-word wherever a bare word would fire on legitimate prose. `coverage`
// is deliberately absent: "test coverage" and "collision surface coverage" are
// both things this repo says, and a guard that flags them gets switched off.
// See the skill's own warning that a false positive costs more than a gap.
const BANNED = [
  [/\bcarriers?\b/i, 'insurer terminology; use "the inspecting authority"'],
  [/\bdental\b/i, 'benefits domain; use "plumbing" per ADR 0002'],
  [/\bmedical[- ]only\b/i, 'benefits domain; use "electrical-only"'],
  [/\bcoverage they (had )?declined\b/i, 'the strongest fingerprint in the skill'],
  [/\bdeclined coverage\b/i, 'the strongest fingerprint in the skill'],
  [/\battestations?\b/i, 'insurer terminology; use "permit"'],
  [/\bEINs?\b/, 'a US employer tax id; use "licence number"'],
  [/\btax ids?\b/i, 'use "licence number"'],
  [/\bquestionnaires?\b/i, 'use "intake form"'],
  [/\bcoverage[- ]gating\b/i, 'use "eligibility-gating"'],
  [/\bcontribution fields?\b/i, 'use "fee-schedule fields"'],
  [/\b75201\b/, 'a real postal code from the original examples; use 02139'],
  [/aspire start/i, 'an incidental stack fingerprint; use a bracketed placeholder'],
  [/check:collisions/i, 'an incidental script name; use a bracketed placeholder'],
]

// ADR 0002 documents the substitutions and necessarily quotes both sides, and
// this file lists the patterns. Excluding them by name beats a magic comment.
const EXEMPT = new Set([
  'docs/architecture/decisions/0002-one-substitute-domain-for-the-examples.md',
  'scripts/check-vocabulary.mjs',
])

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !EXEMPT.has(f))
  .filter((f) => /\.(md|mjs|js|json|py|ya?ml|txt)$/.test(f))

const findings = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [pattern, why] of BANNED) {
      if (pattern.test(line)) findings.push({ file, line: i + 1, text: line.trim(), why })
    }
  })
}

if (findings.length === 0) {
  console.log(`Vocabulary check passed across ${files.length} files.`)
  process.exit(0)
}

console.error(`Vocabulary from the original engagement found in ${findings.length} place(s):\n`)
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`)
  console.error(`    ${f.text.slice(0, 100)}`)
  console.error(`    ${f.why}\n`)
}
console.error('See docs/architecture/decisions/0002 for the substitution table.')
console.error('If a term is a genuine false positive, narrow the pattern. Do not')
console.error('add a blanket exemption: the next real one hides behind it.')
process.exit(1)
