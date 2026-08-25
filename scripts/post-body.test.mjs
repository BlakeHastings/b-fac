// post-body.mjs, in both directions, with the defect it exists to catch driven
// through it for real.
//
// The deny direction is the whole reason the script exists, so the case that
// matters most here is a `gh` that behaves exactly as it did in #143: the write
// exits 0 and prints a comment URL, and the read-back returns the two
// characters `@-`. A check that has only ever been seen passing is what ADR
// 0001's appended correction is about.
//
// The allow direction matters just as much and for the reason #102 and #58 both
// record: a guard that refuses ordinary work gets switched off. So a one-line
// "Ship it." must post and verify, and a CRLF checkout must not read as a
// mismatch on every line.
//
// `gh` is a stub throughout. These tests need no token, no network and no
// repository, which is what makes them runnable in the `Checks` job.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TARGETS, compare, normalise, parseTarget, run } from './post-body.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'post-body-'))
let counter = 0
function sourceFile(content) {
  const path = join(scratch, `body-${(counter += 1)}.md`)
  writeFileSync(path, content)
  return path
}

const COMMENT_URL = 'https://github.com/o/r/issues/143#issuecomment-1'

// A `gh` that stores whatever it is handed, so a test can say what the artifact
// comes back holding without saying anything about how it got there.
function fakeGh({ stored, url = COMMENT_URL, kind = 'issue-comment', calls = [] }) {
  return (args) => {
    calls.push(args)
    if (args.includes('--json')) {
      return kind.endsWith('-body')
        ? JSON.stringify({ body: stored })
        : JSON.stringify({ comments: [{ url, body: stored }] })
    }
    return `${url}\n`
  }
}

function capture() {
  const out = []
  return { out, log: (line) => out.push(line), error: (line) => out.push(line) }
}

// THE DEFECT ITSELF
// `--body @-` exits 0, prints a URL, and stores two characters. Every signal
// available said it had worked; only the read-back disagrees.
test('a two-byte body stored under a real-looking success is refused', () => {
  const brief = sourceFile('## Brief\n\nReading order: AGENTS.md, then the issue.\n')
  const { out, log, error } = capture()
  const code = run({
    targetSpec: 'issue-comment:143',
    file: brief,
    gh: fakeGh({ stored: '@-' }),
    log,
    error,
  })
  assert.equal(code, 1)
  const report = out.join('\n')
  assert.match(report, /Refusing to report a successful post/)
  assert.match(report, /Stored body: "@-"/)
  assert.match(report, /stored 2/)
  assert.match(report, /--body @-/)
})

test('an empty artifact body is refused and named as the thing nobody is waiting on', () => {
  const question = sourceFile('Should the write boundary be owned or guest here?\n')
  const { out, log, error } = capture()
  const code = run({
    targetSpec: 'issue-body:141',
    file: question,
    gh: fakeGh({ stored: '@-', kind: 'issue-body' }),
    log,
    error,
  })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /nobody is waiting on it to notice/)
})

test('a body that arrives truncated is refused, and the offset says where', () => {
  const file = sourceFile('one\ntwo\nthree\n')
  const { out, log, error } = capture()
  const code = run({
    targetSpec: 'pr-body:144',
    file,
    gh: fakeGh({ stored: 'one\ntwo', kind: 'pr-body' }),
    log,
    error,
  })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /first difference at offset 7/)
})

// THE ALLOW DIRECTION
// There is no length floor, so the shortest real comment anyone posts must go
// through. A guard whose first outing refuses a "ship it" is a guard that gets
// removed.
test('a one-line "Ship it." posts and verifies', () => {
  const file = sourceFile('Ship it.\n')
  const { out, log, error } = capture()
  const code = run({ targetSpec: 'pr-comment:144', file, gh: fakeGh({ stored: 'Ship it.' }), log, error })
  assert.equal(code, 0)
  assert.match(out.join('\n'), /Posted and verified/)
})

test('a CRLF checkout is not a mismatch', () => {
  const file = sourceFile('## Brief\r\n\r\nRead AGENTS.md first.\r\n')
  const { log, error } = capture()
  const code = run({
    targetSpec: 'issue-comment:143',
    file,
    gh: fakeGh({ stored: '## Brief\n\nRead AGENTS.md first.' }),
    log,
    error,
  })
  assert.equal(code, 0)
})

// Someone else commenting between the write and the read is a race, not a
// divergence, and reporting it as one would teach people to ignore the report.
test('a comment posted by somebody else after ours is not read as a mismatch', () => {
  const file = sourceFile('Ship it.\n')
  const { log, error } = capture()
  const gh = (args) =>
    args.includes('--json')
      ? JSON.stringify({
          comments: [
            { url: COMMENT_URL, body: 'Ship it.' },
            { url: 'https://github.com/o/r/issues/143#issuecomment-2', body: 'Thanks!' },
          ],
        })
      : `${COMMENT_URL}\n`
  assert.equal(run({ targetSpec: 'issue-comment:143', file, gh, log, error }), 0)
})

test('a posted comment that is not in the artifact afterwards is a failure, not a pass', () => {
  const file = sourceFile('Ship it.\n')
  const { out, log, error } = capture()
  const gh = (args) =>
    args.includes('--json')
      ? JSON.stringify({ comments: [{ url: 'https://github.com/o/r/issues/143#issuecomment-9', body: 'Ship it.' }] })
      : `${COMMENT_URL}\n`
  assert.equal(run({ targetSpec: 'issue-comment:143', file, gh, log, error }), 1)
  assert.match(out.join('\n'), /could not be found/)
})

test('an empty source file is refused before anything is posted', () => {
  const file = sourceFile('   \n\n')
  const { out, log, error } = capture()
  const calls = []
  const code = run({ targetSpec: 'issue-comment:143', file, gh: fakeGh({ stored: '', calls }), log, error })
  assert.equal(code, 2)
  assert.equal(calls.length, 0)
  assert.match(out.join('\n'), /Refusing to post an empty body/)
})

test('--check compares without posting', () => {
  const file = sourceFile('Ship it.\n')
  const calls = []
  const { log, error } = capture()
  const code = run({
    targetSpec: 'issue-comment:143',
    file,
    checkOnly: true,
    gh: fakeGh({ stored: 'Ship it.', calls }),
    log,
    error,
  })
  assert.equal(code, 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].includes('--json'), true)
})

// A report that says "refusing to post" after a --check would be describing a
// write that never happened, and a mechanism whose output cannot be taken
// literally is the thing this whole issue is about.
test('--check does not claim to have refused a post it never made', () => {
  const file = sourceFile('## Brief\n\nRead AGENTS.md first.\n')
  const { out, log, error } = capture()
  const code = run({
    targetSpec: 'issue-comment:143',
    file,
    checkOnly: true,
    gh: fakeGh({ stored: '@-' }),
    log,
    error,
  })
  assert.equal(code, 1)
  const report = out.join('\n')
  assert.match(report, /Nothing was posted by this command/)
  assert.doesNotMatch(report, /Refusing to report a successful post/)
})

// THE READ-BACK MUST NOT SHARE THE FAILURE MODE
// If the read went through the same body-carrying argument the write does, a
// green here would confirm nothing at all. These two are the regression that
// keeps that true.
test('every write passes the body as a file and never as a command-line string', () => {
  for (const [kind, target] of Object.entries(TARGETS)) {
    const args = target.write('7', 'brief.md')
    // Either `--body-file <path>` or the `gh api` field that reads a file. What
    // matters is not which flag: it is that the argument list carries a path to
    // the body and never the body.
    const carriesTheFile = args.includes('brief.md') || args.includes('body=@brief.md')
    assert.equal(carriesTheFile, true, `${kind} does not pass the file it was given`)
    assert.equal(args.includes('--body'), false, `${kind} puts the body on the command line`)
    assert.equal(args.includes('-b'), false, `${kind} puts the body on the command line`)
  }
})

// The obvious patch for "cannot edit a comment" was `--edit-last`, and it would
// have overwritten the reposted brief that carries the real text while leaving
// the two characters in place. It is not a flag this file forgot; it is one it
// must not grow. #164.
test('no target reaches a comment by being the last one', () => {
  for (const [kind, target] of Object.entries(TARGETS)) {
    assert.equal(
      target.write('7', 'brief.md').includes('--edit-last'),
      false,
      `${kind} edits the last comment rather than a named one`,
    )
  }
})

test('no read-back carries a body argument for a convention to be misread as', () => {
  for (const [kind, target] of Object.entries(TARGETS)) {
    const args = target.read('7')
    for (const argument of args) {
      assert.equal(/^--body/.test(argument), false, `${kind} reads back through ${argument}`)
      assert.equal(argument, argument.replace('@-', ''), `${kind} reads back through @-`)
    }
    // A `view` subcommand, or for the comment target a bare `gh api` GET. The
    // property is the same one: the read is not a write and carries no field.
    if (args[0] === 'api') {
      assert.equal(args.includes('--method'), false, `${kind} reads back with a method`)
      assert.equal(args.includes('--field'), false, `${kind} reads back with a field`)
      assert.equal(args.length, 2, `${kind} reads back with more than a path`)
    } else {
      assert.equal(args[1], 'view', `${kind} does not read back with a view subcommand`)
    }
  }
})

// THE FIFTH TARGET
// All seven artifacts the detection layer reports are comments, and until this
// existed none of the four targets could rewrite one. #164, ADR 0052.
test('a comment is addressed by its id and rewritten in place', () => {
  const file = sourceFile('Repaired under #163. The real brief is at ...\n')
  const calls = []
  const { out, log, error } = capture()
  const gh = (args) => {
    calls.push(args)
    return args.includes('--method')
      ? 'https://github.com/o/r/issues/138#issuecomment-5402513885\n'
      : JSON.stringify({ body: 'Repaired under #163. The real brief is at ...' })
  }
  assert.equal(run({ targetSpec: 'comment:5402513885', file, gh, log, error }), 0)
  assert.match(out.join('\n'), /Posted and verified: the comment with id #5402513885/)
  assert.deepEqual(calls[0].slice(0, 4), [
    'api',
    '--method',
    'PATCH',
    'repos/{owner}/{repo}/issues/comments/5402513885',
  ])
  assert.deepEqual(calls[1], ['api', 'repos/{owner}/{repo}/issues/comments/5402513885'])
})

test('a comment edit that stored something else is refused like every other target', () => {
  const file = sourceFile('Repaired under #163.\n')
  const { out, log, error } = capture()
  const gh = (args) => (args.includes('--method') ? 'url\n' : JSON.stringify({ body: '@-' }))
  assert.equal(run({ targetSpec: 'comment:5402513885', file, gh, log, error }), 1)
  const report = out.join('\n')
  assert.match(report, /Stored body: "@-"/)
  // Replacing a comment is repaired by running the same command again. Telling
  // the caller to delete it, which is what the old suffix test would have done
  // for a kind that does not end in `-body`, would be telling them to destroy
  // the artifact they were repairing.
  assert.match(report, /re-run this command/)
  assert.doesNotMatch(report, /Delete it/)
})

test('a target with no number or an unknown kind is a usage error', () => {
  assert.throws(() => parseTarget('issue-comment'), /An issue or pull request number is required/)
  assert.throws(() => parseTarget('comment:abc'), /A comment id is required/)
  assert.throws(() => parseTarget('discussion:1'), /Unknown target kind/)
  assert.deepEqual(
    { kind: parseTarget('pr-body:144').kind, number: parseTarget('pr-body:144').number },
    { kind: 'pr-body', number: '144' },
  )
  assert.deepEqual(
    { kind: parseTarget('comment:5402513885').kind, number: parseTarget('comment:5402513885').number },
    { kind: 'comment', number: '5402513885' },
  )
})

test('normalise touches line endings and the trailing newline, and nothing else', () => {
  assert.equal(normalise('a\r\nb\n\n'), 'a\nb')
  assert.equal(normalise('  leading space kept'), '  leading space kept')
  assert.equal(normalise('trailing space kept  '), 'trailing space kept  ')
  assert.equal(compare('a', undefined).ok, false)
})
