// The copy in `scripts/` and the copy in `assets/` differ by one line, and this
// is what holds them there.
//
// WHAT THIS PREVENTS
// #152 asked for the asset to be copied rather than rewritten, and named the
// reason: an edit made in the copy leaves the two disagreeing with nothing
// noticing. This repository has already paid that bill once. ADR 0001 recorded
// that `scripts/check-main-provenance.mjs` had been deleted; it had not, and it
// sat there through eight merged pull requests still holding
// `REPLACE_WITH_BASELINE_COMMIT_SHA` while the document said otherwise. Nobody
// caught it by reading.
//
// So the agreement is asserted rather than intended, which is ADR 0031's shape
// for two copies of the same reader. Unlike `guard-merge.mjs`, where ADR 0033
// keeps a deliberate difference between the shipped rules and this repo's, the
// audit has exactly one line it is allowed to differ on: the baseline, which is
// a fact about this repository and cannot ship.
//
// A failure here means one of two things, and the diff says which. Either the
// asset improved and the copy did not, in which case re-copy and re-set the
// baseline; or somebody edited the copy, in which case the fix belongs in the
// asset so every repository installing this gets it.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const ASSET = read('../.agents/skills/orchestrated-delivery/assets/check-main-provenance.mjs')
const INSTALLED = read('./check-main-provenance.mjs')

const BASELINE_LINE = /^const BASELINE = '([^']*)'$/m

test('the installed copy differs from the asset only in its baseline', () => {
  const blanked = (source) => {
    const lines = source.split('\n')
    const at = lines.findIndex((line) => BASELINE_LINE.test(line))
    assert.notEqual(at, -1, 'no `const BASELINE = ...` line to exempt')
    lines[at] = '<baseline>'
    return lines.join('\n')
  }
  assert.equal(
    blanked(INSTALLED),
    blanked(ASSET),
    'scripts/check-main-provenance.mjs has drifted from the asset it was copied from',
  )
})

test('the baseline is a real commit id rather than the placeholder', () => {
  const baseline = BASELINE_LINE.exec(INSTALLED)?.[1]
  assert.match(
    baseline,
    /^[0-9a-f]{40}$/,
    'a baseline that is not a full commit id makes the audit exit before judging anything',
  )
})

// `assets/check-setup.mjs` reads this declaration out of the source to tell an
// installer their audit is watching a branch their repository does not have. It
// greps for the line, so the line has to keep its shape.
test('DEFAULT_BRANCH is main, declared in the form check-setup.mjs reads', () => {
  const declared = INSTALLED.match(/^const DEFAULT_BRANCH = ['"]([^'"]+)['"]/m)?.[1]
  assert.equal(declared, 'main')
})

// THE BASELINE STILL LEAVES THE AUDIT SOMETHING TO FIND
//
// ADR 0066 moved the baseline from `f3b8a7a` to `dadeae4`, past the two
// bootstrap commits ADR 0051 examined. The risk in moving a baseline is the one
// the script's own comment names: history above the line quietly stops being
// judged. So these drive the real script, not a reimplementation of it, with
// only `gh` replaced. The stub answers every "which pull requests is this
// commit in?" with an empty list, which is exactly what the API says about a
// commit pushed straight to `main`. Git is real, so this needs the full
// history, which the `Checks` job already fetches with `fetch-depth: 0`.
//
// The stub is installed by patching `execFileSync` before the script loads and
// syncing the builtin's ESM exports, rather than by putting a fake `gh` on
// PATH: `execFileSync('gh', ...)` on Windows looks for `gh.exe` and nothing
// else, so a shell-script stub would be invisible there.

const SCRIPT = fileURLToPath(new URL('./check-main-provenance.mjs', import.meta.url))

// The two commits ADR 0051 examined, oldest first, and the first commit above them.
const ROOT = 'f3b8a7a41c410fa1cda18c97c1d3819068ff8bfe'
const BOOTSTRAP = [
  '2ff792e4fda164a05ccde96a42dc15efcb943e7f',
  'dadeae4bb076d44f0ffd30f0105c5e8d6327112f',
]
const FIRST_ABOVE = 'e67a1100ca9465c3c1343f51f319d43b1b066e02'

const STUB = `
import cp from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const real = cp.execFileSync
cp.execFileSync = (file, args, options) => {
  if (file !== 'gh') return real(file, args, options)
  appendFileSync(process.env.STUB_GH_LOG, args.join(' ') + '\\n')
  return '[]'
}
syncBuiltinESMExports()
`

function audit(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'provenance-'))
  const log = join(dir, 'gh.log')
  try {
    const result = spawnSync(
      process.execPath,
      ['--import', `data:text/javascript,${encodeURIComponent(STUB)}`, SCRIPT, ...args],
      {
        encoding: 'utf8',
        env: { ...process.env, PROVENANCE_BEFORE: '', PROVENANCE_AFTER: '', ...env, STUB_GH_LOG: log },
      },
    )
    let asked = []
    try {
      asked = readFileSync(log, 'utf8').split('\n').filter(Boolean)
    } catch {
      // No log file means gh was never called.
    }
    return { ...result, asked }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the baseline sits on the later of the two bootstrap commits ADR 0051 examined', () => {
  assert.equal(BASELINE_LINE.exec(INSTALLED)?.[1], BOOTSTRAP[1])
})

test('a direct push above the new baseline is still reported', () => {
  const { status, stderr, asked } = audit([FIRST_ABOVE])
  assert.equal(status, 1, stderr)
  assert.match(stderr, /outside the pull request flow \(1 of 1\)/)
  assert.match(stderr, new RegExp(FIRST_ABOVE))
  assert.match(stderr, /No associated pull request\./)
  assert.equal(asked.length, 1)
  assert.match(asked[0], new RegExp(`commits/${FIRST_ABOVE}/pulls`))
})

test('a range starting below the baseline judges only what is above it', () => {
  const { status, stderr, asked } = audit([], { PROVENANCE_BEFORE: ROOT, PROVENANCE_AFTER: FIRST_ABOVE })
  assert.equal(status, 1, stderr)
  assert.match(stderr, /outside the pull request flow \(1 of 3\)/)
  assert.match(stderr, new RegExp(FIRST_ABOVE))
  for (const sha of BOOTSTRAP) assert.doesNotMatch(stderr, new RegExp(sha))
  assert.equal(asked.length, 1, `gh was asked about more than the one commit: ${asked}`)
})

test('the two examined bootstrap commits are exempt and never asked about', () => {
  const { status, stdout, stderr, asked } = audit(BOOTSTRAP)
  assert.equal(status, 0, stderr)
  assert.match(stdout, /0 checked, 2 predating the baseline/)
  assert.deepEqual(asked, [])
})
