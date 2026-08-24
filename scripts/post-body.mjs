// Post a body to a GitHub artifact, then read it back and refuse to call it
// posted unless what is stored is what was sent.
//
// WHAT THIS PREVENTS
// A body-carrying `gh` call that succeeds, prints a URL, exits 0, and stores
// something that is not your text. This has happened three times here in three
// different ways, and the third time it wrote seven artifacts empty in one
// session (#143): four agent briefs, a measurement, a pull request body, and
// the body of an escalation issue whose only job was to carry a question to the
// owner. `--body @-` is a `curl` and `gh api -f` convention; `gh issue comment`
// and `gh pr create` do not read it, so they store the two characters `@-`.
// Before that, backticks inside a double-quoted `--body` ran as command
// substitution and ate filenames.
//
// The class is one class: the body travels as shell text, something eats it,
// and every signal available says it worked. `references/reviewing.md` carried
// a note about it and the note failed twice, so this is the note as a
// mechanism. ADR 0049.
//
// The failure is silent in both directions, which is the part that makes a
// mechanism necessary rather than tidy. `gh issue view <n> --comments` renders
// a two-byte body as `@-` and says nothing is wrong. So the read-back here
// never renders anything: it compares the stored bytes against the file's
// bytes, programmatically, and the answer is an exit code.
//
// WHY IT COMPARES CONTENT AND NOT LENGTH
// A minimum-length floor would catch `@-` and would also refuse a legitimate
// one-line "ship it" the first time somebody posted one, at which point it gets
// switched off and protects nothing. That is #102's failure and #58's. There is
// no threshold here and no number to tune. The one refusal that is not a
// comparison is an empty file, which is never a body anyone meant to post.
//
// WHY THE READ-BACK CANNOT SHARE THE FAILURE MODE
// The write is `gh issue comment <n> --body-file <path>` and the read is
// `gh issue view <n> --json comments`. The read carries no body argument of any
// kind, so there is nothing for an argument convention to be misread as. It
// returns JSON, parsed by Node, rather than the rendered view a human would
// read. And every `gh` call below goes through `execFileSync` with an argument
// array: no shell, no quoting, no substitution, and the body itself never
// appears on a command line at all.
//
// WHAT THIS IS NOT
// It is not a `gh` front end and it never lands anything. It posts bodies to
// artifacts that already exist. Landing is `node scripts/merge-pr.mjs <n>`.
// Creating an issue or a pull request stays `gh`'s: create it with a
// placeholder title and body, then set the real body through this. That is the
// case worth being strictest about, because an escalation issue's body has
// nobody waiting on it. A blank brief has an agent about to read it and
// complain; a blank question to the owner can sit there for ever.
//
//   node scripts/post-body.mjs issue-comment:143 brief.md
//   node scripts/post-body.mjs pr-body:144 pr-body.md
//   node scripts/post-body.mjs issue-comment:143 brief.md --check
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Four artifacts carry a body worth guarding: a comment on an issue or a pull
// request, and the body of either. `write` appends or replaces; `read` fetches
// the artifact as JSON. The two are different `gh` subcommands on purpose.
export const TARGETS = {
  'issue-comment': {
    noun: 'the latest comment on issue',
    write: (number, file) => ['issue', 'comment', number, '--body-file', file],
    read: (number) => ['issue', 'view', number, '--json', 'comments'],
    pick: (data, url) => pickComment(data.comments, url),
  },
  'pr-comment': {
    noun: 'the latest comment on pull request',
    write: (number, file) => ['pr', 'comment', number, '--body-file', file],
    read: (number) => ['pr', 'view', number, '--json', 'comments'],
    pick: (data, url) => pickComment(data.comments, url),
  },
  'issue-body': {
    noun: 'the body of issue',
    write: (number, file) => ['issue', 'edit', number, '--body-file', file],
    read: (number) => ['issue', 'view', number, '--json', 'body'],
    pick: (data) => data.body,
  },
  'pr-body': {
    noun: 'the body of pull request',
    write: (number, file) => ['pr', 'edit', number, '--body-file', file],
    read: (number) => ['pr', 'view', number, '--json', 'body'],
    pick: (data) => data.body,
  },
}

// `gh issue comment` prints the new comment's URL, which ends
// `#issuecomment-<id>`. Matching on it beats taking the last comment in the
// list: between the write and the read somebody else can comment, and
// comparing against their text would report a mismatch that is really a race.
// Where there is no URL to match, which is `--check` on an artifact somebody
// else wrote, the last comment is the only available answer and is used as one.
function pickComment(comments, url) {
  if (!Array.isArray(comments) || comments.length === 0) return undefined
  if (url) {
    const posted = comments.find((comment) => comment.url === url)
    // A URL that came back from the write and is not in the artifact's comments
    // is its own failure, and a louder one than a mismatch. Say so rather than
    // silently falling back to whatever is last.
    if (!posted) return undefined
    return posted.body
  }
  return comments.at(-1)?.body
}

export function parseTarget(spec) {
  const text = String(spec ?? '')
  const separator = text.lastIndexOf(':')
  const kind = separator === -1 ? text : text.slice(0, separator)
  const number = separator === -1 ? '' : text.slice(separator + 1)
  if (!Object.hasOwn(TARGETS, kind)) {
    throw new Error(
      `Unknown target kind ${JSON.stringify(kind)}. ` +
        `Expected one of: ${Object.keys(TARGETS).join(', ')}, as <kind>:<number>.`,
    )
  }
  if (!/^\d+$/.test(number)) {
    throw new Error(`Target ${JSON.stringify(spec)} carries no issue or pull request number.`)
  }
  return { kind, number, ...TARGETS[kind] }
}

// GitHub stores LF, so a CRLF checkout would otherwise mismatch on every line
// and the guard would be switched off within a day on Windows. A trailing
// newline is normalised for the same reason: it is the one edit `gh` and the
// API are observed to make on their own. Nothing else is normalised, because
// every further liberty taken here is a divergence the read-back stops seeing.
export function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/, '')
}

export function compare(sent, stored) {
  if (stored === undefined || stored === null) {
    return { ok: false, reason: 'nothing was stored, or the posted artifact could not be found' }
  }
  const a = normalise(sent)
  const b = normalise(stored)
  if (a === b) return { ok: true }

  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1
  return {
    ok: false,
    reason: 'the stored body is not the file',
    sentLength: a.length,
    storedLength: b.length,
    divergesAt: at,
    stored: b,
  }
}

// The whole point is that the caller sees the divergence rather than a verdict,
// so a short stored body is printed in full. `@-` is named because it is the
// shape that produced #143 and a reader who sees it should not have to work
// that out again.
export function mismatchReport(target, file, result, checkOnly = false) {
  const lines = [
    checkOnly
      ? `The stored artifact does not match the file. Nothing was posted by this command.`
      : `Refusing to report a successful post.`,
    `  Target: ${target.noun} #${target.number}`,
    `  Source: ${file}`,
    `  Problem: ${result.reason}.`,
  ]
  if (result.sentLength !== undefined) {
    lines.push(
      `  Sent ${result.sentLength} characters, stored ${result.storedLength}, ` +
        `first difference at offset ${result.divergesAt}.`,
    )
    const preview = result.stored.length <= 200 ? result.stored : `${result.stored.slice(0, 200)}...`
    lines.push(`  Stored body: ${JSON.stringify(preview)}`)
    if (result.stored === '@-') {
      lines.push(
        `  That is the #143 defect exactly: \`--body @-\` is a \`curl\` convention,`,
        `  \`gh\` stores the two characters literally, and the call still exits 0.`,
      )
    }
  }
  lines.push(
    target.kind.endsWith('-body')
      ? `  The artifact is wrong now and nobody is waiting on it to notice. Fix it before` +
        `\n  anything else: re-run this command without --check once the file is right.`
      : `  The comment is wrong. Delete it and post again through this script, rather` +
        `\n  than leaving two versions for a reader to choose between.`,
  )
  return lines.join('\n')
}

function ghRunner(cwd) {
  return (args) =>
    execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// `gh` is injected rather than imported so the tests can drive the whole path,
// including the exact failure this exists to catch, without a network or a
// token. Nothing else in this repository's scripts needs that, because nothing
// else is a mechanism whose only job is to fail correctly.
export function run({ targetSpec, file, checkOnly = false, gh, log = console.log, error = console.error }) {
  let target
  try {
    target = parseTarget(targetSpec)
  } catch (problem) {
    error(problem.message)
    return 2
  }

  let sent
  try {
    sent = readFileSync(file, 'utf8')
  } catch (problem) {
    error(`Could not read ${file}: ${problem.message}`)
    return 2
  }

  // Not a length threshold. A file with nothing in it is the one body no caller
  // ever meant to send, and posting it destroys whatever is already there.
  if (!checkOnly && normalise(sent).trim() === '') {
    error(`Refusing to post an empty body from ${file}.`)
    return 2
  }

  let postedUrl
  if (!checkOnly) {
    try {
      const output = gh(target.write(target.number, file))
      postedUrl = (output.match(/https:\/\/\S+/) ?? [])[0]
    } catch (problem) {
      error(`gh refused the post: ${problem.stderr || problem.message}`)
      return 1
    }
  }

  let stored
  try {
    stored = target.pick(JSON.parse(gh(target.read(target.number))), postedUrl)
  } catch (problem) {
    // A write that happened and a read-back that did not is unverified, not
    // successful, and saying so is the entire contract of this script.
    error(
      `Posted, but could not read ${target.noun} #${target.number} back: ` +
        `${problem.stderr || problem.message}`,
    )
    return 1
  }

  const result = compare(sent, stored)
  if (!result.ok) {
    error(mismatchReport(target, file, result, checkOnly))
    return 1
  }

  log(
    checkOnly
      ? `Verified: ${target.noun} #${target.number} matches ${file} (${normalise(sent).length} characters).`
      : `Posted and verified: ${target.noun} #${target.number} matches ${file} ` +
        `(${normalise(sent).length} characters).${postedUrl ? `\n${postedUrl}` : ''}`,
  )
  return 0
}

const USAGE = `Usage: node scripts/post-body.mjs <kind>:<number> <file> [--check]

  kind    ${Object.keys(TARGETS).join(' | ')}
  --check read the artifact back and compare, without posting anything

Posts a body from a file, reads the artifact back, and exits non-zero when what
is stored is not what was sent. See the header of this file and ADR 0049.`

function main(argv) {
  const args = argv.filter((arg) => arg !== '--check')
  const checkOnly = argv.includes('--check')
  if (args.length !== 2) {
    console.error(USAGE)
    return 2
  }
  return run({ targetSpec: args[0], file: args[1], checkOnly, gh: ghRunner(process.cwd()) })
}

// Node 22 has no `import.meta.main`, so the module asks whether it is the entry
// point. Without this the exports below could not be imported by a test without
// running the CLI.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
