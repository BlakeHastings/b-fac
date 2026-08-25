// Ask every recent artifact in this repository whether its stored body is one
// of the shapes a body-carrying `gh` call leaves behind when it eats the body.
//
// WHAT THIS PREVENTS
// `scripts/post-body.mjs` (#143, ADR 0049) reads a body back after posting it,
// and covers four targets, all of them writes to an artifact that already
// exists. Creation is not covered, on purpose: wrapping `gh issue create` moves
// that script toward being a general `gh` front end, which ADR 0049 refuses.
// So the prevention layer has a hole, and it is the hole the incident went
// through. The worst artifact of #143 was an escalation issue created with
// `--body @-`, whose body stored as the two characters `@-` and sat blank
// because a question to the owner has nobody waiting on it. A brief is missed
// within the hour by the agent that needed it; that issue was not missed at
// all.
//
// SKILL.md's fourth constraint is the answer: whatever prevention you have, add
// detection. Detection runs on the one thing this failure cannot avoid
// producing, which is the stored body, and it does not care which call wrote
// it. `gh issue create`, a human at a terminal, another harness, or a session
// that died between the two halves of the two-step all leave the same artifact
// behind. All seven artifacts of #143 stored the literal `@-`, so this would
// have found every one of them without being told what they should have said.
//
// WHY THERE IS NO LENGTH FLOOR HERE EITHER
// The obvious version of this reads "report any body under N bytes", and it is
// the wrong version for the reason ADR 0049 gives: a legitimate one-line "ship
// it" is short, so a floor reports real work on its first outing, and a check
// whose findings are mostly noise gets switched off. That is #102's failure and
// #58's. There is no number here to tune. Every shape below is an exact literal
// or a pattern that a body somebody meant to write cannot match.
//
// THE SHAPES, AND WHY EACH ONE IS SAFE TO NAME
//   `@-`        `gh issue comment` and `gh pr create` do not read `@-`, which
//               is a `curl` and `gh api -f` convention. They store the two
//               characters. This is #143 exactly.
//   `@<path>`   The same convention's other half: `curl --data @file.md`. It
//               has not happened here yet, and it is one keystroke from the one
//               that did. A GitHub username is alphanumeric and hyphens only,
//               so an `@` token carrying `.`, `/` or `\` is not a mention that
//               somebody meant to post, which is what keeps this off real
//               comments.
//   empty       Never a body anyone meant to send. `post-body.mjs` refuses to
//               post one; this finds one that arrived by another route.
//
// WHAT THIS DOES NOT COVER
// Stated in the register ADR 0049 uses for the read-back, because a detection
// layer that overclaims is worse than none.
//
//   - **A body that was mangled rather than replaced.** The first two failures
//     of this class were backticks inside a double-quoted `--body` running as
//     command substitution and eating filenames. What is stored then is the
//     body, minus some of it, and nothing about its shape says so. Only a
//     comparison against the source file catches that, which is
//     `post-body.mjs ... --check`. This is the layer for the case where there
//     is no source file to compare against, and that is the case creation left.
//   - **A body that is wrong but plausible.** The right file, posted to the
//     wrong number, reads perfectly here.
//   - **Anything that is not an issue or a pull request.** Releases,
//     discussions, gists, commit comments. Also review bodies and inline review
//     comments, which `gh pr list --json reviews` holds and `--json comments`
//     does not. Measured on this repository: every pull request checked carries
//     its review text as ordinary comments and zero `reviews` entries, because
//     the process here posts a review rather than submitting one. A repository
//     that submits reviews would want that field added.
//   - **Anything older than the window.** This asks for the most recent
//     `--limit` issues and pull requests, in both states. A body blanked a
//     hundred issues ago is out of reach until somebody widens it.
//   - **Being run.** It needs a token and the network, so it is not in
//     `npm run check`, which is hermetic. A check nobody runs detects nothing,
//     and that is the honest cost of keeping the mechanical gate offline.
//
//   node scripts/check-bodies.mjs
//   node scripts/check-bodies.mjs --limit 200
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_LIMIT = 50

// A GitHub login is `[A-Za-z0-9-]`, so no mention can carry a separator or an
// extension. That is the whole reason this pattern can be run over real
// comments without reporting people who wrote `@someone` and nothing else.
const AT_PATH = /^@(-|\S*[./\\]\S*)$/

// Each shape answers "what does the stored body look like", never "how long is
// it". `note` is what a reader needs in order to not have to work out what they
// are looking at, which is the same reason `post-body.mjs` names `@-` in its
// mismatch report.
export function diagnose(body) {
  const text = String(body ?? '')
  if (text.trim() === '') {
    return {
      shape: 'empty',
      note: 'the body is empty. Nothing ever meant to post one.',
    }
  }
  if (AT_PATH.test(text.trim())) {
    return {
      shape: 'argument convention stored literally',
      note:
        text.trim() === '@-'
          ? 'that is #143 exactly: `--body @-` is a `curl` convention, `gh` stores the two characters, and the call still exits 0.'
          : 'that is the `curl --data @file` convention stored as text, which is one keystroke from #143.',
    }
  }
  return undefined
}

// Two `gh` calls rather than one per artifact. `comments` is a field on both
// list subcommands, so the whole window arrives in two requests, and a scan
// that takes a minute is a scan somebody stops running.
export const SOURCES = [
  {
    noun: 'issue',
    list: (limit) => [
      'issue',
      'list',
      '--state',
      'all',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,url,comments',
    ],
  },
  {
    noun: 'pull request',
    list: (limit) => [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,url,comments',
    ],
  },
]

// Returns every artifact in the window as `{ what, url, body }`, so the
// diagnosis below never has to know the difference between an issue and a pull
// request or between a body and a comment.
export function collect({ gh, limit = DEFAULT_LIMIT }) {
  const artifacts = []
  for (const source of SOURCES) {
    const items = JSON.parse(gh(source.list(limit)))
    for (const item of items) {
      artifacts.push({
        what: `the body of ${source.noun} #${item.number}`,
        url: item.url,
        title: item.title,
        body: item.body,
      })
      for (const comment of item.comments ?? []) {
        artifacts.push({
          what: `a comment on ${source.noun} #${item.number} by ${comment.author?.login ?? 'someone'}`,
          url: comment.url,
          title: item.title,
          body: comment.body,
        })
      }
    }
  }
  return artifacts
}

// The finding prints the stored body rather than a verdict about it, for the
// reason `post-body.mjs` prints the divergence: a reader who can see `@-` needs
// no further explanation, and a reader who cannot see anything is being asked
// to trust the tool.
export function findingReport(finding) {
  const stored = finding.body === undefined || finding.body === null ? '' : String(finding.body)
  const preview = stored.length <= 200 ? stored : `${stored.slice(0, 200)}...`
  return [
    `  ${finding.what}: ${finding.shape}`,
    `    ${finding.url ?? '(no url)'}`,
    `    Stored body: ${JSON.stringify(preview)}`,
    `    ${finding.note}`,
  ].join('\n')
}

export function run({ gh, limit = DEFAULT_LIMIT, log = console.log, error = console.error }) {
  let artifacts
  try {
    artifacts = collect({ gh, limit })
  } catch (problem) {
    error(`Could not read this repository's issues and pull requests: ${problem.stderr || problem.message}`)
    return 2
  }

  const findings = []
  for (const artifact of artifacts) {
    const diagnosis = diagnose(artifact.body)
    if (diagnosis) findings.push({ ...artifact, ...diagnosis })
  }

  if (findings.length === 0) {
    log(`Checked ${artifacts.length} stored bodies in the last ${limit} issues and pull requests. None is blank or a stored argument.`)
    return 0
  }

  error(
    `${findings.length} of ${artifacts.length} stored bodies did not survive the call that wrote them.`,
  )
  for (const finding of findings) error(findingReport(finding))
  error(
    `\nFix each one by posting the real body through` +
      `\n  node scripts/post-body.mjs <issue-body|pr-body|issue-comment|pr-comment>:<number> <file>` +
      `\nwhich reads the artifact back and refuses to call it posted unless it matches.`,
  )
  return 1
}

const USAGE = `Usage: node scripts/check-bodies.mjs [--limit N]

  --limit  how many issues and how many pull requests to read (default ${DEFAULT_LIMIT})

Reads the stored body of every recent issue, pull request and comment, and exits
non-zero when one of them is blank or is an argument convention stored as text.
See the header of this file and ADR 0050.`

function main(argv) {
  let limit = DEFAULT_LIMIT
  const rest = [...argv]
  const at = rest.indexOf('--limit')
  if (at !== -1) {
    const value = rest[at + 1]
    if (!/^\d+$/.test(String(value)) || Number(value) === 0) {
      console.error(USAGE)
      return 2
    }
    limit = Number(value)
    rest.splice(at, 2)
  }
  if (rest.length !== 0) {
    console.error(USAGE)
    return 2
  }
  return run({
    limit,
    gh: (args) =>
      execFileSync('gh', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      }),
  })
}

// Node 22 has no `import.meta.main`, so the module asks whether it is the entry
// point, the same way `post-body.mjs` does and for the same reason: the exports
// above have to be importable by a test without running the CLI.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
