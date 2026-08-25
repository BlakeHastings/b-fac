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
import { readFileSync } from 'node:fs'
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
