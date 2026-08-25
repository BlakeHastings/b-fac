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
//
//     A bounded scan that finds nothing is not an all-clear, and left alone it
//     is worse than that: **the findings age out**. This repository's standing
//     seven sat within a fifty-issue window while issues kept being filed, so
//     the tool was on course to exit 0 with nothing repaired, and #163's
//     deliverable was that exit code (#165). So every run says how far it
//     reached, in both directions, and `--all` reads the whole history for the
//     run that wants its green to mean something. The exit code stays binary:
//     a second non-zero for "I only read a window" would be red on a healthy
//     repository every ordinary run, which is how a report stops being read.
//     Pinning the known findings so they cannot age out was refused, because
//     for a layer that only reports, a list that can only make it louder is the
//     dangerous direction rather than the safe one. ADR 0053.
//   - **Being run.** It needs a token and the network, so it is not in
//     `npm run check`, which is hermetic. A check nobody runs detects nothing,
//     and that is the honest cost of keeping the mechanical gate offline.
//
// WHY THIS IS RED ON THIS REPOSITORY, AND WHAT WOULD MAKE IT GREEN
// Recorded here because the next person to run it meets the findings here, not
// on the issue that argued about them. Every finding this has reported on this
// repository is one of #143's leftovers: six briefs whose bodies stored as the
// two characters `@-`, each superseded minutes later by a comment carrying the
// real text, plus one deliberate reproduction on PR #148 kept as evidence and
// explained by the comment directly beneath it. None is a defect in this
// script and none is a false positive.
//
// The owner's decision (#163) is to repair all seven rather than to delete them
// or to accept a permanently red tool, because a report people learn to see red
// is a report people stop reading. Repair means rewriting each comment in place
// to say that the original was lost to `@-` and to point at where the real text
// is, which is what `post-body.mjs comment:<id>` exists for (#164, ADR 0052).
// One of the six, on #137, has no superseding comment at all: that brief was
// lost outright, and its repair says so rather than linking something that does
// not exist. No allowlist, then or later: ADR 0049 refuses that knob and this
// repository has paid for it twice, in #58 and #102.
//
//   node scripts/check-bodies.mjs
//   node scripts/check-bodies.mjs --limit 200
//   node scripts/check-bodies.mjs --all
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_LIMIT = 50

// `--all` in the only terms `gh list` takes, which is a number. It paginates
// and stops when the repository runs out, so this is the whole history for any
// repository this workflow is plausibly run against, and if it ever is not, the
// scope line says so rather than claiming a history it did not read.
const ALL_LIMIT = 100000

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
    // The `post-body.mjs` target that repairs this source's body. Naming it
    // here is what lets every finding print the command that fixes it.
    bodyTarget: 'issue-body',
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
    bodyTarget: 'pr-body',
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

// A comment's REST id is the last part of its own URL, and it is the argument
// `post-body.mjs comment:<id>` takes. Reading it off the URL rather than off the
// `id` field is deliberate: `--json comments` returns a GraphQL node id, which
// that endpoint does not accept.
const COMMENT_ID = /#issuecomment-(\d+)$/

// Returns every artifact in the window as `{ what, url, body, repair }`, so the
// diagnosis below never has to know the difference between an issue and a pull
// request or between a body and a comment, and `windows` saying how far the two
// list calls actually reached.
export function collect({ gh, limit = DEFAULT_LIMIT }) {
  const artifacts = []
  const windows = []
  for (const source of SOURCES) {
    const items = JSON.parse(gh(source.list(limit)))
    windows.push({
      noun: source.noun,
      got: items.length,
      // `gh` lists newest first, so the last item is how far back this reached.
      oldest: items.at(-1)?.number,
      // A list that came back shorter than it was asked for is the whole of it:
      // there was nothing older to return. Exactly `limit` items is reported as
      // bounded even when the repository happens to hold exactly that many,
      // which errs toward claiming less than was scanned rather than more.
      exhaustive: items.length < limit,
    })
    for (const item of items) {
      artifacts.push({
        what: `the body of ${source.noun} #${item.number}`,
        url: item.url,
        title: item.title,
        body: item.body,
        repair: `${source.bodyTarget}:${item.number}`,
      })
      for (const comment of item.comments ?? []) {
        const id = (COMMENT_ID.exec(comment.url ?? '') ?? [])[1]
        artifacts.push({
          what: `a comment on ${source.noun} #${item.number} by ${comment.author?.login ?? 'someone'}`,
          url: comment.url,
          title: item.title,
          body: comment.body,
          repair: id ? `comment:${id}` : undefined,
        })
      }
    }
  }
  return { artifacts, windows }
}

// What a reader needs in order to tell "clean" from "clean as far as I looked".
// It is printed in both directions, because a window that hid nothing this time
// is the same window that will hide the next thing.
export function scopeSentence(windows) {
  const reach = windows.map((window) =>
    window.exhaustive
      ? `every ${window.noun} (${window.got})`
      : `the ${window.got} most recent ${window.noun}${window.got === 1 ? '' : 's'} (back to #${window.oldest})`,
  )
  const whole = windows.every((window) => window.exhaustive)
  return `Scanned ${whole ? 'the whole history of this repository: ' : ''}${reach.join(' and ')}.`
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
    finding.repair
      ? `    Repair: node scripts/post-body.mjs ${finding.repair} <file>`
      : `    Repair: no post-body.mjs target reaches this artifact. Say so on an issue` +
        `\n            rather than assembling a gh call for it.`,
  ].join('\n')
}

export function run({ gh, limit = DEFAULT_LIMIT, log = console.log, error = console.error }) {
  let scan
  try {
    scan = collect({ gh, limit })
  } catch (problem) {
    error(`Could not read this repository's issues and pull requests: ${problem.stderr || problem.message}`)
    return 2
  }
  const { artifacts, windows } = scan
  const scope = scopeSentence(windows)
  const bounded = windows.some((window) => !window.exhaustive)

  const findings = []
  for (const artifact of artifacts) {
    const diagnosis = diagnose(artifact.body)
    if (diagnosis) findings.push({ ...artifact, ...diagnosis })
  }

  if (findings.length === 0) {
    log(`Checked ${artifacts.length} stored bodies. ${scope} None is blank or a stored argument.`)
    // Exit 0 here means "nothing wrong in what I read", and only the whole
    // history makes that the same claim as "nothing wrong". Saying which one
    // this was is the difference between an all-clear and a green that arrived
    // because the findings aged out of the window (#165).
    if (bounded) {
      log(
        `Anything older was not read, so this is clean as far as it looked rather than an` +
          `\nall-clear. Re-run with --all for a green that means the whole repository.`,
      )
    }
    return 0
  }

  error(
    `${findings.length} of ${artifacts.length} stored bodies did not survive the call that wrote them.` +
      `\n${scope}`,
  )
  for (const finding of findings) error(findingReport(finding))
  // Every finding carries its own target above, because the four that existed
  // when this advice was first written could add a comment or replace a body,
  // and every finding this has ever reported here is a comment, which none of
  // them could repair (#164). Naming a remedy that does not apply is worse than
  // naming none, so the remedy is now computed per finding rather than listed.
  error(
    `\nWrite the replacement body to a file, then run that artifact's Repair line.` +
      `\npost-body.mjs reads the artifact back afterwards and refuses to call it posted` +
      `\nunless what is stored is what you sent. One file per artifact: a path reused` +
      `\nacross two of them verifies what was sent rather than what was meant (#162).`,
  )
  return 1
}

const USAGE = `Usage: node scripts/check-bodies.mjs [--limit N | --all]

  --limit  how many issues and how many pull requests to read (default ${DEFAULT_LIMIT})
  --all    read the whole history, which is the only run whose exit 0 is an
           all-clear rather than a statement about a window

Reads the stored body of every issue, pull request and comment it reaches, and
exits non-zero when one of them is blank or is an argument convention stored as
text. It always says how far it reached, in both directions. See the header of
this file, ADR 0050 and ADR 0053.`

function main(argv) {
  let limit = DEFAULT_LIMIT
  const rest = [...argv]
  const all = rest.indexOf('--all')
  if (all !== -1) {
    limit = ALL_LIMIT
    rest.splice(all, 1)
  }
  const at = rest.indexOf('--limit')
  if (at !== -1) {
    const value = rest[at + 1]
    // A window and "everything" together is two answers to one question, and
    // guessing which was meant is how a scan quietly reads less than the caller
    // thinks it did.
    if (all !== -1 || !/^\d+$/.test(String(value)) || Number(value) === 0) {
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
