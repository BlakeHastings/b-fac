// Fail when a commit reached `main` without a pull request behind it.
//
// WHAT THIS PREVENTS
// Branch protection needs a paid plan on a private repo, so
// nothing at GitHub's end stops a direct push to `main` or a merge taken with CI
// red. Two layers stand in for it, and both are preventive: `guard-merge.mjs`
// only loads in a Claude Code session that started with `.claude/settings.json`
// present, and `merge-pr.mjs` only binds whoever chooses to type it. A layer
// that can be bypassed cannot tell you it was bypassed.
//
// This one runs on the result, so it cannot be. For every commit a push added to
// `main` it asks the API which pull requests that commit belongs to. A squash
// merge from a PR is associated with it; a commit pushed straight to `main` is
// associated with nothing. That is the whole distinction, and it is the one we
// need. Record it in an ADR when you install it.
//
// It detects rather than prevents: by the time it fails, the commit is on main.
// The value is that the failure is loud, dated and attributable, which is what
// makes "we enforce this procedurally" an auditable claim instead of a promise.
//
//   node scripts/check-main-provenance.mjs              # $BEFORE..$AFTER, or HEAD
//   node scripts/check-main-provenance.mjs <sha> [...]  # named commits
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// History below this commit is not judged, and the line is not arbitrary: it is
// the commit that added `guard-merge.mjs` and `merge-pr.mjs`. Before it, the
// PR-only rule was a sentence in a document; from the commit after it, every
// commit on main came through a pull request, without exception. Judging
// anything earlier would report eleven violations that were not violations at
// the time, and a check whose output is mostly noise gets muted.
//
// Do not move this forward to silence a failure. Moving it forward is how a
// real violation gets absorbed into "history we agreed not to look at".
// SETUP: the commit that first made the PR-only rule a control rather than a
// sentence, normally the one that adds this script and the merge wrapper.
const BASELINE = 'f3b8a7a41c410fa1cda18c97c1d3819068ff8bfe'

const DEFAULT_BRANCH = 'main'

// The association shows up in the API a moment after the merge, not always
// during it. We retry rather than accept a rare false positive: this check's
// only output is a red build that says somebody bypassed the process, and a
// check that cries wolf even once a month stops being read. Waiting half a
// minute to be sure is cheap; being ignored is not.
const RETRY_ATTEMPTS = 5
const RETRY_DELAY_MS = 6000

// Only a commit young enough for the API to still be catching up gets those
// retries. Anything older is being examined after the fact, where there is no
// lag left to wait out, so it answers immediately.
const LAG_WINDOW_MS = 15 * 60 * 1000

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gh(args) {
  return execFileSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function commitExists(rev) {
  try {
    git(['cat-file', '-e', `${rev}^{commit}`])
    return true
  } catch {
    return false
  }
}

// Which commits this run has to answer for.
//
// A push can add several commits at once, and only the head of it is visible in
// `github.sha`, so the range is what matters: every commit the push put on the
// branch gets asked about, not just the last one. `PROVENANCE_BEFORE` is
// `github.event.before`, which is the zero SHA on a branch creation and is not
// an ancestor at all after a force push. In either case `BASELINE..HEAD` is the
// honest fallback: it is every commit the baseline says we are willing to judge.
function commitsToCheck() {
  const named = process.argv.slice(2)
  if (named.length > 0) {
    return named.map((rev) => {
      if (!commitExists(rev)) {
        console.error(`Not a commit in this repository: ${rev}`)
        process.exit(1)
      }
      return git(['rev-parse', rev])
    })
  }

  const after = process.env.PROVENANCE_AFTER || 'HEAD'
  const before = process.env.PROVENANCE_BEFORE || ''
  const from = before && !/^0+$/.test(before) && commitExists(before) ? before : BASELINE

  return git(['rev-list', `${from}..${after}`])
    .split('\n')
    .filter(Boolean)
}

if (!commitExists(BASELINE)) {
  console.error(
    `The baseline commit ${BASELINE.slice(0, 8)} is not in this checkout, so nothing\n` +
      `can be judged against it. The workflow needs actions/checkout with\n` +
      `fetch-depth: 0; a shallow clone does not reach back far enough.`,
  )
  process.exit(1)
}

// A commit at or below the baseline predates the rule and is not judged.
function predatesBaseline(sha) {
  try {
    git(['merge-base', '--is-ancestor', sha, BASELINE])
    return true
  } catch {
    return false
  }
}

// The associated pull requests, narrowed to ones that actually explain how this
// commit got onto the default branch: merged, and targeting the default branch.
// An open PR, or one aimed at some other branch, associates a commit without
// landing it, so it is not evidence of anything.
function associatedPulls(sha) {
  let pulls
  try {
    pulls = JSON.parse(gh(['api', `repos/{owner}/{repo}/commits/${sha}/pulls`]))
  } catch (error) {
    console.error(
      `Could not ask the API about ${sha.slice(0, 8)}: ${error.stderr || error.message}\n` +
        `This check needs \`gh\` authenticated with pull-requests: read.`,
    )
    process.exit(1)
  }
  const landed = pulls.filter((pull) => pull.merged_at && pull.base?.ref === DEFAULT_BRANCH)
  return { all: pulls, landed }
}

function ageMs(sha) {
  return Date.now() - Number(git(['log', '-1', '--format=%ct', sha])) * 1000
}

const commits = commitsToCheck()

if (commits.length === 0) {
  console.log(`No new commits on ${DEFAULT_BRANCH} to account for.`)
  process.exit(0)
}

const violations = []
const accounted = []
let exempt = 0

for (const sha of commits) {
  if (predatesBaseline(sha)) {
    exempt += 1
    continue
  }

  const attempts = ageMs(sha) < LAG_WINDOW_MS ? RETRY_ATTEMPTS : 1
  let result
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = associatedPulls(sha)
    if (result.landed.length > 0) break
    if (attempt < attempts) await sleep(RETRY_DELAY_MS)
  }

  const subject = git(['log', '-1', '--format=%s', sha])
  if (result.landed.length > 0) {
    accounted.push(`${sha.slice(0, 8)}  #${result.landed[0].number}  ${subject}`)
  } else {
    const near = result.all
      .map((pull) => `#${pull.number} (${pull.state}, into ${pull.base?.ref})`)
      .join(', ')
    violations.push({
      sha,
      subject,
      author: git(['log', '-1', '--format=%an <%ae>', sha]),
      date: git(['log', '-1', '--format=%cI', sha]),
      near,
    })
  }
}

if (violations.length > 0) {
  console.error(
    `A commit reached ${DEFAULT_BRANCH} outside the pull request flow ` +
      `(${violations.length} of ${commits.length}):\n`,
  )
  for (const violation of violations) {
    console.error(`  ${violation.sha}`)
    console.error(`    ${violation.subject}`)
    console.error(`    ${violation.author}  ${violation.date}`)
    console.error(
      violation.near
        ? `    Associated pull requests, none of them merged into ${DEFAULT_BRANCH}: ${violation.near}\n`
        : `    No associated pull request.\n`,
    )
  }
  console.error(
    `This is not a broken build. The code may be perfectly good. What failed is\n` +
      `that it arrived without review or green checks, which on this repo nothing\n` +
      `at GitHub's end prevents (see the ADR you wrote when installing this).\n\n` +
      `What to do, in order:\n` +
      `  1. Work out how it got there: a direct push, a merge taken with checks\n` +
      `     red, or a rewritten history. \`git show <sha>\` and the push event on\n` +
      `     this run tell you most of it.\n` +
      `  2. Decide whether the change stands. If it does not, revert it through a\n` +
      `     pull request like anything else.\n` +
      `  3. Close the gap that let it through, and record it. Per\n` +
      `     the process doc: this is a defect in the guard, not a\n` +
      `     not a mistake by whoever pushed. Add the case to scripts/guard-merge.mjs.\n\n` +
      `Do not silence this by moving the baseline in this script forward.`,
  )
  process.exit(1)
}

const skipped = exempt > 0 ? `, ${exempt} predating the baseline` : ''
console.log(
  `Every new commit on ${DEFAULT_BRANCH} came through a pull request ` +
    `(${accounted.length} checked${skipped}).`,
)
for (const line of accounted) console.log(`  ${line}`)
