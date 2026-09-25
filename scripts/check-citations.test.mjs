// check-citations.mjs, in both directions. The deny direction is a bare number
// in the payload, which a host reads as its own. The allow direction matters as
// much, because a check that flags a qualified citation, a comment or another
// repository's issue is one that gets switched off.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ILLUSTRATIVE, findBare } from './check-citations.mjs'

const MD = '.agents/skills/orchestrated-delivery/references/example.md'
const MJS = '.agents/skills/orchestrated-delivery/assets/example.mjs'

const cited = (file, text) => findBare(file, text).findings.map((f) => f.citation)

test('a bare ADR or issue number in shipped prose is a finding', () => {
  assert.deepEqual(cited(MD, 'ADR 0021 has the table.'), ['ADR 0021'])
  assert.deepEqual(cited(MD, 'the ADRs 0012 and 0014 say'), ['ADRs 0012'])
  assert.deepEqual(cited(MD, 'conflating them is what produced #122.'), ['#122'])
  assert.deepEqual(cited(MD, 'a write boundary (#63)'), ['#63'])
})

test('a qualified citation is not, including one wrapped across a line', () => {
  assert.deepEqual(cited(MD, 'b-fac ADR 0021 has the table.'), [])
  assert.deepEqual(cited(MD, 'is **b-fac ADR 0051** after'), [])
  assert.deepEqual(cited(MD, 'as settled in b-fac\nADR 0037.'), [])
  assert.deepEqual(cited(MD, 'what produced BlakeHastings/b-fac#122.'), [])
})

test('what only looks like a citation is not a finding', () => {
  // Another repository's issue says whose it is.
  assert.deepEqual(cited(MD, 'fixed upstream in cli/cli#9012'), [])
  // A path to a host's decision record, a heading, an HTML entity, an anchor.
  assert.deepEqual(cited(MD, 'then docs/architecture/decisions/0018.'), [])
  assert.deepEqual(cited(MD, '# Heading\n## 2 things'), [])
  assert.deepEqual(cited(MD, '&#123; and file.md#L12'), [])
})

test('in an asset script a comment line is not read and a string is', () => {
  const source = [
    '// ADR 0021 defines guest mode, and #122 moved the record.',
    '/* ADR 0029 */',
    ' * ADR 0037 in a block comment',
    "say('run this again. ADR 0021.')",
    'const x = `installed before #122`',
  ].join('\n')
  const { findings } = findBare(MJS, source)
  assert.deepEqual(
    findings.map((f) => [f.line, f.citation]),
    [
      [4, 'ADR 0021'],
      [5, '#122'],
    ],
  )
})

test('an illustrative phrase is exempt, and only that phrase', () => {
  const [file, phrase] = ILLUSTRATIVE.find(([, p]) => p.includes('#122'))
  assert.deepEqual(cited(file, `"${phrase} you'd rather I wait"`), [])
  // The same number cited for real in the same file is still a finding.
  assert.deepEqual(cited(file, `"${phrase} you'd rather I wait"\nwhat produced #122.`), ['#122'])
})

test('an illustrative phrase that has gone is reported, so it cannot hide the next one', () => {
  const [file, phrase] = ILLUSTRATIVE[0]
  assert.ok(findBare(file, 'nothing to see').stale.includes(phrase))
})
