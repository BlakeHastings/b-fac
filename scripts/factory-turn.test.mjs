// The parser over the two lines "Before you stop" already mandates.
//
// WHY THE METADATA SPLIT GETS THE MOST TESTS HERE
// It is the part that was wrong first and the part whose failure is silent.
// With "Owner." left welded to the question, a filed need and the same question
// restated in a turn produce different keys, so the front end shows one open
// question twice and nothing anywhere says they are the same. That reads as two
// problems rather than as a parser bug, which is the worst kind.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTurn, blockerKey, _test } from '../cli/lib/turn.mjs'

const CANONICAL = [
  'Some report body above.',
  '',
  'Next: dispatching #41 and #43 as one wave, briefs below.',
  'Blocked on: warn-or-block on an expired licence. Owner. Asked in #52.',
  '  Meanwhile: #42 does not touch that path, so it goes out in this wave.',
].join('\n')

test('the format from SKILL.md parses into every field it carries', () => {
  const parsed = parseTurn(CANONICAL)
  assert.deepEqual(parsed.present, { next: true, blocked: true })
  assert.equal(parsed.next, 'dispatching #41 and #43 as one wave, briefs below.')
  assert.equal(parsed.nextIsNothing, false)
  assert.equal(parsed.blockers.length, 1)

  const [blocker] = parsed.blockers
  assert.equal(blocker.question, 'warn-or-block on an expired licence')
  assert.equal(blocker.answerer, 'owner')
  assert.equal(blocker.askedIn, '52')
  assert.equal(blocker.meanwhile, '#42 does not touch that path, so it goes out in this wave.')
})

test('"Asked in #52" is where it was asked, never something it blocks', () => {
  const [blocker] = parseTurn(CANONICAL).blockers
  assert.deepEqual(blocker.blocks, [], 'the asked-in number must not become a dependency')
})

test('a blocker that does name what it holds up keeps those numbers', () => {
  const parsed = parseTurn('Blocked on: the retention answer holds #61 and #62. Owner.')
  assert.deepEqual(parsed.blockers[0].blocks, ['61', '62'])
})

test('a filed need and the same question restated share a key', () => {
  const [derived] = parseTurn(CANONICAL).blockers
  const declared = { question: 'warn or block on an expired licence?' }
  assert.equal(
    blockerKey(derived),
    blockerKey(declared),
    'the cross-check between declared and derived needs is exactly this equality',
  )
})

test('"nothing" on either line is recorded as present and empty, not as absent', () => {
  const parsed = parseTurn('Next: nothing\nBlocked on: nothing')
  assert.deepEqual(parsed.present, { next: true, blocked: true })
  assert.equal(parsed.nextIsNothing, true)
  assert.deepEqual(parsed.blockers, [])
})

test('a turn that skipped the format is recorded as having skipped it', () => {
  const parsed = parseTurn('I have finished the review and everything looks good.')
  assert.deepEqual(parsed.present, { next: false, blocked: false })
  assert.deepEqual(parsed.blockers, [])
})

test('several blockers each become a row', () => {
  const parsed = parseTurn(
    [
      'Next: #40.',
      'Blocked on: the retention window. Owner. Asked in #52.',
      'Blocked on: whether the licence field is retired. Owner. Asked in #53.',
    ].join('\n'),
  )
  assert.equal(parsed.blockers.length, 2)
  assert.deepEqual(
    parsed.blockers.map((b) => b.askedIn),
    ['52', '53'],
  )
})

test('a Meanwhile attaches to the blocker above it and not to a later one', () => {
  const parsed = parseTurn(
    [
      'Blocked on: first question. Owner.',
      '  Meanwhile: doing #10.',
      'Blocked on: second question. Owner.',
    ].join('\n'),
  )
  assert.equal(parsed.blockers[0].meanwhile, 'doing #10.')
  assert.equal(parsed.blockers[1].meanwhile, null)
})

test('bullets, bold and fences do not stop a line being counted', () => {
  const parsed = parseTurn('- **Next:** #40\n* Blocked on: a question. Owner.')
  assert.equal(parsed.present.next, true)
  assert.equal(parsed.present.blocked, true)
  assert.equal(parsed.blockers[0].question, 'a question')
})

// The false-positive direction. A guard that mangles ordinary prose gets
// switched off, and a parser that eats half of every question is the same
// failure wearing different clothes.
test('the word owner inside a question is not an attribution', () => {
  const { question, answerer } = _test.splitBlocker("the owner's retention policy for #9")
  assert.equal(question, "the owner's retention policy for #9")
  assert.equal(answerer, 'owner', 'it still reads as answerable by the owner')
})

test('a blocker with no attribution and no pointer still parses', () => {
  const [blocker] = parseTurn('Blocked on: nobody has decided the export format').blockers
  assert.equal(blocker.question, 'nobody has decided the export format')
  assert.equal(blocker.answerer, null, 'an unassigned blocker is a finding, not a default')
  assert.equal(blocker.askedIn, null)
})

test('an empty or non-string message returns the empty shape rather than throwing', () => {
  for (const input of [undefined, null, '', '   ', 42, {}]) {
    const parsed = parseTurn(input)
    assert.deepEqual(parsed.present, { next: false, blocked: false })
    assert.deepEqual(parsed.blockers, [])
  }
})

test('a line that merely mentions the words is not a Next line', () => {
  const parsed = parseTurn('I explained what Next: means in the docs I wrote.')
  assert.equal(parsed.present.next, false, 'the marker has to open the line')
})
