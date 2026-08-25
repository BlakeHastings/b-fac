// check-bodies.mjs, in both directions, with #143's own artifacts driven
// through it.
//
// The deny direction is the reason the script exists, so the case that matters
// most is the escalation issue: created with `--body @-`, stored as two
// characters, nobody waiting on it. It has to be found without being told what
// it should have said, because there is no source file for an artifact nobody
// kept one for.
//
// The allow direction matters just as much, and here it is louder than usual.
// This reports rather than refuses, so its failure mode is not a blocked post,
// it is noise: a scan whose findings are mostly things that are fine is a scan
// somebody stops running, and then it detects nothing. So the ordinary bodies
// this repository actually writes must all come back clean, including the short
// ones a length floor would have flagged.
//
// `gh` is a stub throughout, so these need no token, no network and no
// repository, which is what lets them run in the `Checks` job while the script
// itself cannot.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collect, diagnose, run, SOURCES } from './check-bodies.mjs'

// A `gh` that answers the two list calls from a fixture, so a test says what
// the repository holds without saying anything about how it got there.
function fakeGh({ issues = [], prs = [], calls = [] }) {
  return (args) => {
    calls.push(args)
    return JSON.stringify(args[0] === 'issue' ? issues : prs)
  }
}

function capture() {
  const out = []
  return { out, log: (line) => out.push(line), error: (line) => out.push(line) }
}

function issue(number, body, comments = []) {
  return {
    number,
    title: `issue ${number}`,
    body,
    url: `https://github.com/o/r/issues/${number}`,
    comments: comments.map((text, index) => ({
      body: text,
      url: `https://github.com/o/r/issues/${number}#issuecomment-${index}`,
      author: { login: 'BlakeHastings' },
    })),
  }
}

// THE ARTIFACT THIS EXISTS FOR
// #141: an issue created to carry a question to the owner, whose body stored as
// `@-`. Nobody was waiting on it, so nothing else was ever going to find it.
test('an escalation issue whose body stored as @- is found with no file to compare against', () => {
  const { out, log, error } = capture()
  const code = run({
    gh: fakeGh({ issues: [issue(141, '@-')] }),
    log,
    error,
  })
  assert.equal(code, 1)
  const report = out.join('\n')
  assert.match(report, /the body of issue #141/)
  assert.match(report, /Stored body: "@-"/)
  assert.match(report, /that is #143 exactly/)
  assert.match(report, /post-body\.mjs/)
})

test('all seven of #143 are found in one pass, bodies and comments alike', () => {
  const { out, log, error } = capture()
  const code = run({
    gh: fakeGh({
      issues: [
        issue(135, 'A real issue body.', ['@-']),
        issue(137, 'A real issue body.', ['@-']),
        issue(138, 'A real issue body.', ['@-']),
        issue(134, 'A real issue body.', ['@-']),
        issue(87, 'A real issue body.', ['@-']),
        issue(141, '@-'),
      ],
      prs: [issue(140, '@-')],
    }),
    log,
    error,
  })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /^7 of \d+ stored bodies did not survive/m)
})

test('an empty body is found, and is named as something nobody meant to post', () => {
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues: [issue(1, '   \n\n')] }), log, error })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /Nothing ever meant to post one/)
})

// One keystroke from the failure that happened. `curl --data @file.md` is the
// same convention, and `gh` would store it the same way.
test('the other half of the same convention is found before it costs anything', () => {
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues: [issue(1, '@brief.md')] }), log, error })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /one keystroke from #143/)
})

// THE ALLOW DIRECTION
// No length floor, so the shortest thing anybody really posts comes back clean.
test('the short real bodies a length floor would report are clean', () => {
  for (const body of ['Ship it.', 'Ship.', 'y', '+1', 'Closes #4', 'Done, see #148.']) {
    assert.equal(diagnose(body), undefined, `${JSON.stringify(body)} was reported`)
  }
})

// The `@` shapes are precise about what an `@` token can be. A GitHub login
// carries no dot, slash or backslash, so a comment that is nothing but a
// mention is not one of these, and reporting it would be exactly the noise that
// gets a detection layer switched off.
test('a comment that is nothing but a mention is not an argument convention', () => {
  for (const body of ['@BlakeHastings', '@claude', '@a-user', '@ me', 'Ask @user/thing about it']) {
    assert.equal(diagnose(body), undefined, `${JSON.stringify(body)} was reported`)
  }
})

test('a body containing @- inside real prose is not the defect', () => {
  assert.equal(diagnose('Do not use `--body @-`, it stores two characters.'), undefined)
})

// WHAT IT SAYS IT SCANNED
// A green here used to read as "nothing is wrong" when it meant "nothing is
// wrong in the last fifty". The seven standing findings sat inside a window
// that issues were pushing them out of, so this was on course to go green with
// nothing repaired, and an issue's deliverable was that exit code. #165.
test('a clean scan that read everything says so, and is an all-clear', () => {
  const { out, log, error } = capture()
  const code = run({
    gh: fakeGh({ issues: [issue(1, 'A body.', ['Ship it.'])], prs: [issue(2, 'A body.')] }),
    limit: 50,
    log,
    error,
  })
  assert.equal(code, 0)
  const report = out.join('\n')
  assert.match(report, /Checked 3 stored bodies\./)
  assert.match(report, /the whole history of this repository: every issue \(1\) and every pull request \(1\)/)
  assert.doesNotMatch(report, /clean as far as it looked/)
})

test('a clean scan that filled its window says how far back it reached and refuses to be an all-clear', () => {
  const issues = Array.from({ length: 3 }, (_, index) => issue(30 - index, 'A body.'))
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues, prs: [] }), limit: 3, log, error })
  assert.equal(code, 0)
  const report = out.join('\n')
  assert.match(report, /the 3 most recent issues \(back to #28\)/)
  assert.match(report, /clean as far as it looked/)
  assert.match(report, /--all/)
})

test('a scan that found something still says what it read, because the window is why a finding is the last one', () => {
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues: [issue(1, '@-')], prs: [] }), limit: 1, log, error })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /the 1 most recent issue \(back to #1\)/)
})

// WHAT IT READS, AND WHAT IT MUST NOT
// The scan carries no body argument of any kind, for the same reason ADR 0049
// gives for the read-back: a read that went through a body-carrying flag could
// be misread by the same convention it is looking for.
test('every source is a list subcommand with no body argument to be misread', () => {
  for (const source of SOURCES) {
    const args = source.list(50)
    assert.equal(args[1], 'list', `${source.noun} is not read with a list subcommand`)
    for (const argument of args) {
      assert.equal(/^--body/.test(argument), false, `${source.noun} reads through ${argument}`)
    }
    assert.equal(args.includes('--json'), true, `${source.noun} does not ask for JSON`)
  }
})

test('the window is two calls whatever it holds, not one per artifact', () => {
  const calls = []
  const many = Array.from({ length: 40 }, (_, index) => issue(index + 1, 'A body.', ['Ship it.']))
  run({ gh: fakeGh({ issues: many, prs: many, calls }), log: () => {}, error: () => {} })
  assert.equal(calls.length, 2)
})

test('closed artifacts are in the window, because a blanked issue can be closed', () => {
  for (const source of SOURCES) {
    const args = source.list(50)
    assert.equal(args[args.indexOf('--state') + 1], 'all', `${source.noun} skips closed artifacts`)
  }
})

test('a comment is located by its own url, not by the issue it is on', () => {
  const { artifacts } = collect({ gh: fakeGh({ issues: [issue(143, 'A body.', ['@-'])] }) })
  const comment = artifacts.find((artifact) => artifact.what.startsWith('a comment'))
  assert.match(comment.url, /#issuecomment-0$/)
})

// THE REMEDY IT PRINTS HAS TO BE ONE THAT WORKS
// The closing advice used to name the four targets that existed, and every
// finding this has ever reported is a comment, which none of the four could
// rewrite. A detector that prescribes an inapplicable remedy is worse than one
// that prescribes none, so each finding now carries its own. #164.
test('a blanked comment is told to repair itself by its own comment id', () => {
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues: [issue(138, 'A real body.', ['@-'])] }), log, error })
  assert.equal(code, 1)
  const report = out.join('\n')
  assert.match(report, /Repair: node scripts\/post-body\.mjs comment:0 <file>/)
  assert.doesNotMatch(report, /issue-comment\|pr-comment/)
})

test('a blanked body is told to repair itself by the artifact number', () => {
  const { out, log, error } = capture()
  const code = run({ gh: fakeGh({ issues: [issue(141, '@-')], prs: [issue(140, '@-')] }), log, error })
  assert.equal(code, 1)
  const report = out.join('\n')
  assert.match(report, /Repair: node scripts\/post-body\.mjs issue-body:141 <file>/)
  assert.match(report, /Repair: node scripts\/post-body\.mjs pr-body:140 <file>/)
})

// A repair line naming a target that cannot reach the artifact is the defect
// this replaced, so an artifact with no reachable target says that instead of
// guessing at one.
test('a comment whose url carries no id is not given a command that would miss', () => {
  const { out, log, error } = capture()
  const withoutId = {
    ...issue(1, 'A real body.', ['@-']),
    comments: [{ body: '@-', url: 'https://github.com/o/r/pull/1#discussion_r1', author: { login: 'x' } }],
  }
  const code = run({ gh: fakeGh({ issues: [withoutId] }), log, error })
  assert.equal(code, 1)
  assert.match(out.join('\n'), /no post-body\.mjs target reaches this artifact/)
})

// A scan that cannot reach the repository has found nothing, which is not the
// same answer as finding nothing wrong, and saying so is the whole contract.
test('a gh that refuses is an error, not a clean scan', () => {
  const { out, log, error } = capture()
  const code = run({
    gh: () => {
      throw Object.assign(new Error('exit 4'), { stderr: 'gh: not authenticated' })
    },
    log,
    error,
  })
  assert.equal(code, 2)
  assert.match(out.join('\n'), /not authenticated/)
  assert.doesNotMatch(out.join('\n'), /None is blank/)
})
