import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, declaredChanges, missingBackPointers } from './check-collisions.mjs'

const adr = (status, preamble) => `# Title\n\n${status}\n\n${preamble}\n\n## Context\n\nADR 0001 amends nothing down here.\n`

test('the status paragraph runs to the first blank line and the preamble to the first heading', () => {
  const { status, preamble } = parse(adr('Status: accepted, and amended\nby ADR 0009.', 'Amends ADR 0002.'))
  assert.equal(status, 'Status: accepted, and amended by ADR 0009.')
  assert.equal(preamble.trim(), 'Amends ADR 0002.')
})

test('a clause with a change verb claims every ADR it names, wherever the verb sits', () => {
  assert.deepEqual([...declaredChanges('Amends ADR 0024, which had seven verbs, and ADR 0028, which had none.')], ['0024', '0028'])
  assert.deepEqual([...declaredChanges('ADR 0049 is the mechanism this extends and, in one place, corrects.')], ['0049'])
  assert.deepEqual([...declaredChanges('This revises the premise of ADR 0040 and keeps its argument.')], ['0040'])
  assert.deepEqual([...declaredChanges('Supersedes the "Drop" decision in ADR 0001.')], ['0001'])
})

test('a citation without a change verb, or in another clause, owes nothing', () => {
  assert.deepEqual([...declaredChanges('Extends ADR 0019. ADR 0025 supplies the vocabulary.')], [])
  assert.deepEqual([...declaredChanges('ADR 0050 built the scan this corrects; ADR 0049 is where the knob is refused.')], ['0050'])
})

test('the body is not read, so an argument about an old ADR is not a declaration', () => {
  assert.deepEqual([...declaredChanges(parse(adr('Status: accepted', 'Issue #1.')).preamble)], [])
})

test('a declared change needs the earlier ADR\'s status to name the later one', () => {
  const adrs = new Map([
    ['0001', adr('Status: accepted', 'Issue #1.')],
    ['0002', adr('Status: accepted', 'Amends ADR 0001.')],
  ])
  assert.deepEqual(missingBackPointers(adrs), [{ later: '0002', earlier: '0001' }])

  adrs.set('0001', adr('Status: accepted, and amended by ADR 0002.', 'Issue #1.'))
  assert.deepEqual(missingBackPointers(adrs), [])
})

test('a pointer in the body does not count, because the status is where a reader looks', () => {
  const adrs = new Map([
    ['0001', adr('Status: accepted', 'Issue #1.') + '\n*Reversed by ADR 0002.*\n'],
    ['0002', adr('Status: accepted', 'Supersedes ADR 0001.')],
  ])
  assert.deepEqual(missingBackPointers(adrs), [{ later: '0002', earlier: '0001' }])
})

test('a declaration about an ADR that does not exist here is left to the citation checks', () => {
  const adrs = new Map([['0002', adr('Status: accepted', 'Amends ADR 0001.')]])
  assert.deepEqual(missingBackPointers(adrs), [])
})
