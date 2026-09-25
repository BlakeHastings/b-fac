// check-skill-size.mjs counts lines the way `wc -l` and an editor do, so the
// number it prints is the number a reviewer sees. An off-by-one here would put
// the budget at 499 or 501 without anyone having decided that.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { LIMIT, countLines } from './check-skill-size.mjs'

test('a trailing newline ends the last line rather than starting another', () => {
  assert.equal(countLines('one\ntwo\n'), 2)
  assert.equal(countLines('one\ntwo'), 2)
  assert.equal(countLines(''), 0)
  assert.equal(countLines('\n'), 1)
})

test('the budget is the one AGENTS.md states', () => {
  assert.equal(LIMIT, 500)
  assert.equal(countLines('x\n'.repeat(LIMIT)) > LIMIT, false)
  assert.equal(countLines('x\n'.repeat(LIMIT + 1)) > LIMIT, true)
})
