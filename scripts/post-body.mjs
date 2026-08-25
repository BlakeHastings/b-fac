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
// `gh issue view <n> --json comments`; for the comment target the read is a
// bare `gh api` GET with no fields at all. No read carries a body argument of
// any kind, so there is nothing for an argument convention to be misread as. It
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
// WHY THERE IS A FIFTH TARGET AND WHY IT IS NOT THE `create` ADR 0050 REFUSED
// `comment:<id>` rewrites a comment that already exists. Until it landed, the
// four targets could add a comment or replace a body, so a comment that stored
// the wrong bytes could not be repaired at all, and every one of
// `check-bodies.mjs`'s standing findings is a comment (#164). ADR 0050 rejected
// a `create` target because the artifact's number is an *output* there and it
// needs a title, so it could never be a fifth row of a table whose whole shape
// is `write(number, file)`, `read(number)`, `pick`. **A comment id is an
// input**, and it is the only argument besides the file, so this one is that
// fifth row and nothing else. ADR 0052.
//
// `--edit-last` is not the missing flag and must not be added. On five of the
// six blanked briefs the most recent comment is the repost carrying the real
// text, so an "edit the last one" route overwrites the recovered brief and
// leaves the two characters exactly where they were. Addressing a comment by
// its id cannot make that mistake, which is the second reason the id is the
// right argument.
//
//   node scripts/post-body.mjs issue-comment:143 brief.md
//   node scripts/post-body.mjs pr-body:144 pr-body.md
//   node scripts/post-body.mjs comment:5402513885 repair.md
//   node scripts/post-body.mjs issue-comment:143 brief.md --check
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Five artifacts carry a body worth guarding: a comment on an issue or a pull
// request, the body of either, and a comment that already exists, addressed by
// its id. `write` appends or replaces; `read` fetches the artifact as JSON. The
// two are different `gh` subcommands on purpose.
//
// `appends` is the difference between adding an artifact and replacing one, and
// it is here because it is the one thing the mismatch report has to know: a new
// comment that came out wrong leaves two versions for a reader to choose
// between and has to be deleted, while a body or an existing comment is
// repaired by running the same command again. It used to be inferred from the
// kind's name, which stopped being true the moment a target replaced a comment.
export const TARGETS = {
  'issue-comment': {
    noun: 'the latest comment on issue',
    appends: true,
    write: (number, file) => ['issue', 'comment', number, '--body-file', file],
    read: (number) => ['issue', 'view', number, '--json', 'comments'],
    pick: (data, url) => pickComment(data.comments, url),
  },
  'pr-comment': {
    noun: 'the latest comment on pull request',
    appends: true,
    write: (number, file) => ['pr', 'comment', number, '--body-file', file],
    read: (number) => ['pr', 'view', number, '--json', 'comments'],
    pick: (data, url) => pickComment(data.comments, url),
  },
  'issue-body': {
    noun: 'the body of issue',
    appends: false,
    write: (number, file) => ['issue', 'edit', number, '--body-file', file],
    read: (number) => ['issue', 'view', number, '--json', 'body'],
    pick: (data) => data.body,
  },
  'pr-body': {
    noun: 'the body of pull request',
    appends: false,
    write: (number, file) => ['pr', 'edit', number, '--body-file', file],
    read: (number) => ['pr', 'view', number, '--json', 'body'],
    pick: (data) => data.body,
  },
  // The only `gh api` call in this file, and it is pinned rather than passed
  // through: one method, one path, one field, with nothing but the id
  // interpolated. A caller cannot reach a second endpoint through it, which is
  // what keeps it a target rather than the front end ADR 0049 refuses.
  //
  // `--field body=@<path>` is the file-reading half of the same `@` convention
  // that ate #143, and `gh api` is the one command that honours it, which is
  // why #143 happened to `gh issue comment` and not here. The body still never
  // appears on a command line, only a path to it does, so the property every
  // write above has is the property this one has. If that were ever wrong the
  // read-back below would say so, which is the point of the read-back.
  //
  // One endpoint covers both nouns: a comment on a pull request is an issue
  // comment to the API. Review comments and inline review threads are a
  // different endpoint and are not reachable here, the same gap
  // `check-bodies.mjs` names in its own header.
  comment: {
    noun: 'the comment with id',
    appends: false,
    write: (id, file) => [
      'api',
      '--method',
      'PATCH',
      `repos/{owner}/{repo}/issues/comments/${id}`,
      '--field',
      `body=@${file}`,
      '--jq',
      '.html_url',
    ],
    read: (id) => ['api', `repos/{owner}/{repo}/issues/comments/${id}`],
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
    throw new Error(
      `Target ${JSON.stringify(spec)} carries no number. ` +
        `${kind === 'comment' ? 'A comment id' : 'An issue or pull request number'} is required.`,
    )
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
    target.appends
      ? `  The comment is wrong. Delete it and post again through this script, rather` +
        `\n  than leaving two versions for a reader to choose between.`
      : `  The artifact is wrong now and nobody is waiting on it to notice. Fix it before` +
        `\n  anything else: re-run this command without --check once the file is right.`,
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
  number  an issue or pull request number, or for comment:<id> the comment id
          that check-bodies.mjs prints and that ends a comment's own URL
  --check read the artifact back and compare, without posting anything

Posts a body from a file, reads the artifact back, and exits non-zero when what
is stored is not what was sent. comment:<id> replaces what that comment holds,
which is not reversible, so read the id off the artifact you mean rather than
off a note about it. See the header of this file, ADR 0049 and ADR 0052.`

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
