// Fails when the harness CLI versions pinned in the Dockerfile have gone stale.
//
// WHAT THIS PREVENTS
// `verify.mjs` proves the harnesses discover the skill. It proves it against
// the versions we pinned, and a pin never changes on its own, so re-running it
// weekly tests the same four binaries forever. The risk it cannot see is the
// one that already cost this project a wrong conclusion: `codex-cli 0.55.0` was
// on the machine when Phase 1 of #6 was written, it had no skills support at
// all, and "Codex cannot be verified" followed from that. 0.147.0 has the best
// discovery surface of the four.
//
// So this is the other half of the scheduled run. The container job asks "does
// the skill still work in the harnesses we pinned"; this asks "are those still
// the harnesses anyone is running".
//
// WHY AGE AND NOT RELEASES BEHIND
// The 0.55.0 story is usually told as "92 releases stale", and counting
// releases is the obvious check. It does not survive contact with these four
// registries. Measured on 2026-08-12, with every pin sitting on `latest`:
// @openai/codex had 65 versions published after its own `latest`, and
// opencode-ai had 28, because both ship prereleases continuously — opencode-ai
// has published 11,865 versions in total. A releases-behind check would be red
// within hours of a bump and would stay red, which is a check nobody reads.
//
// Age is comparable across packages with wildly different cadences. The same
// measurement in days: codex 0.55.0 was published 2025-11-04 and 0.147.0 on
// 2026-08-07, so the pin that produced the wrong conclusion was 275 days old.
// MAX_PIN_AGE_DAYS below is set well inside that.
//
//   node tools/harness-verify/check-pins.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCKERFILE = join(HERE, 'Dockerfile')

// A quarter. Long enough that the weekly run stays green through ordinary
// neglect, and a third of the 275 days it took to reach the state that made
// Codex look unverifiable. It is a review prompt, not a correctness boundary:
// going red here means "look at the pins", not "the skill is broken".
const MAX_PIN_AGE_DAYS = 90

// The full packument rather than the abbreviated install manifest, because only
// the full one carries `time`. That costs about 40 MB across the four, in a
// couple of seconds, which is nothing against the container build this runs
// beside.
const REGISTRY = 'https://registry.npmjs.org'

// Every pinned install in the image, read out of the Dockerfile rather than
// listed here. A second copy of the versions would be a second thing to keep in
// step, and the failure mode of getting that wrong is this check quietly
// approving a pin the image does not use.
function pinsFromDockerfile() {
  const lines = readFileSync(DOCKERFILE, 'utf8').split('\n')
  const start = lines.findIndex((line) => /^RUN npm install -g\b/.test(line))
  if (start === -1) {
    fail('No `RUN npm install -g` line in the Dockerfile, so there are no pins to read.')
  }

  const block = []
  for (let i = start; i < lines.length; i += 1) {
    block.push(lines[i])
    if (!/\\\s*$/.test(lines[i])) break
  }

  // Everything after the install verb and before the next command in the chain
  // must be a pinned package. An unparsed token fails rather than being
  // skipped: a parser that silently matches three of four packages looks
  // exactly like four healthy pins.
  const tokens = block
    .join(' ')
    .replace(/\\/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(4) // RUN npm install -g
  const pins = []
  for (const token of tokens) {
    if (token === '&&') break
    const match = /^(@?[^@\s]+(?:\/[^@\s]+)?)@(\d[^\s]*)$/.exec(token)
    if (!match) {
      fail(
        `Cannot read \`${token}\` in the Dockerfile's install block as a pinned package.\n` +
          '  Either it floats on a tag, or this parser has fallen behind the Dockerfile.\n' +
          '  Both are findings. Fix the pin, or fix the parser and say which in the PR.',
      )
    }
    pins.push({ name: match[1], version: match[2] })
  }

  if (pins.length === 0) fail('The Dockerfile install block named no packages.')
  return pins
}

function fail(why) {
  console.error(why)
  process.exit(1)
}

async function packument(name) {
  const response = await fetch(`${REGISTRY}/${name}`)
  if (!response.ok) {
    // Loudly, not silently. A network check that shrugs off a failed fetch
    // reports green having asked nothing, which is the exact shape of the
    // vocabulary check that scanned twelve files and missed the payload.
    fail(`${REGISTRY}/${name} answered ${response.status}. This check cannot say anything.`)
  }
  return response.json()
}

const days = (from) => (Date.now() - new Date(from)) / 86_400_000

const pins = pinsFromDockerfile()
const rows = []
const stale = []

for (const pin of pins) {
  const doc = await packument(pin.name)
  const published = doc.time?.[pin.version]

  if (published === undefined) {
    // The image cannot be rebuilt, which makes every other answer here moot.
    stale.push(
      `${pin.name}@${pin.version} is not a published version of that package.\n` +
        '    The image cannot be built from this Dockerfile at all. Either the pin is a\n' +
        '    typo, or the version was unpublished. Pin one that exists.',
    )
    rows.push([pin.name, pin.version, 'UNPUBLISHED', doc['dist-tags']?.latest ?? '?', ''])
    continue
  }

  const latest = doc['dist-tags']?.latest ?? '?'
  const age = days(published)
  rows.push([
    pin.name,
    pin.version,
    `${age.toFixed(0)}d old`,
    latest,
    latest === pin.version ? 'is latest' : `${days(doc.time[latest]).toFixed(0)}d old`,
  ])

  if (age > MAX_PIN_AGE_DAYS) {
    stale.push(
      `${pin.name} is pinned to ${pin.version}, published ${age.toFixed(0)} days ago.\n` +
        `    Latest is ${latest}. Read its changelog for changes to how skills are\n` +
        '    discovered, bump the pin, and re-run `npm run check:harnesses`.',
    )
  }
}

const header = ['package', 'pinned', 'pin age', 'latest', 'latest age']
const widths = header.map((_, column) =>
  Math.max(header[column].length, ...rows.map((row) => row[column].length)),
)
const line = (row) => `  ${row.map((cell, i) => cell.padEnd(widths[i])).join('  ')}`.trimEnd()
console.log(line(header))
for (const row of rows) console.log(line(row))

if (stale.length > 0) {
  console.error(`\n${stale.length} pin${stale.length === 1 ? '' : 's'} to look at:\n`)
  for (const problem of stale) console.error(`  ${problem}\n`)
  console.error(
    'Nothing here says the skill is broken. It says the versions this repo verifies\n' +
      'against have drifted from the ones people run. Bumping a pin is a deliberate\n' +
      'commit paired with a `npm run check:harnesses` run: see\n' +
      'docs/process/harness-verification.md.',
  )
  process.exit(1)
}

console.log(
  `\nAll ${pins.length} harness pins are under ${MAX_PIN_AGE_DAYS} days old. ` +
    `\`npm run check:harnesses\` is testing versions people still run.`,
)
