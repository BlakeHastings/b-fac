// The only sanctioned way to land a PR on the default branch.
//
// WHAT THIS PREVENTS
// GitHub cannot enforce required checks here: branch protection needs a paid
// plan on a private repo. Without enforcement, "check the run first" is a
// habit, and habits lapse exactly when things are busy. This does the check
// mechanically and refuses otherwise.
//
// It also refuses a branch whose green is stale. A rollup is a fact about the
// branch as it was; the question at merge time is whether those checks are
// green on the MERGE RESULT, which is the same distinction reviewing.md makes
// for human reviewers. One repository learned this the loud way: the wrapper
// printed "All 2 required checks green. Squash merging..." and GitHub answered
// "2 of 2 required status checks are expected. (HTTP 405)" — the checks had run
// against the branch's original base and main had moved. Where a ruleset
// requires up-to-date branches, that ruleset catches it. Here nothing else
// does: the merge succeeds and the untested combination is what ships.
//
// Always squash: one issue becomes one commit on main, so `git log --oneline`
// stays a readable list of changes rather than a wall of "fix lint" noise, and
// reverting a change means reverting one commit.
//
//   node scripts/merge-pr.mjs 42
import { execFileSync } from 'node:child_process'

// SETUP: the exact `name:` of each required CI job, as GitHub reports it in
// the check rollup. Take them from a real run, not from the workflow file:
//   gh pr view <n> --json statusCheckRollup --jq '.statusCheckRollup[].name'
// A name that never appears is treated as "never ran" and refuses the merge.
// That is the safe direction, but a typo here looks like a broken script.
const REQUIRED = ['REPLACE_WITH_REQUIRED_CHECK_NAME', 'REPLACE_WITH_ANOTHER_CHECK_NAME']

// SETUP: refuse a branch that is behind its base. On by default, and it has to
// be: without branch protection GitHub reports such a branch as mergeable and
// merges it happily, so this line is the only thing standing between a stale
// green and main. The cost is real and worth knowing in advance — every merge
// puts every other open PR behind, so three open PRs become a rebase chain.
// Turn it off only if you would rather ship a combination nothing has run.
const REFUSE_WHEN_BEHIND = true

// GitHub computes mergeability asynchronously, so mergeStateStatus reads
// UNKNOWN for some seconds after any push and then settles. Refusing on
// UNKNOWN would make this refuse at random, and a wrapper that refuses at
// random gets worked around — which costs more than the gap it closes. So it
// waits this long for an answer, and then says what it does not know rather
// than guessing either way.
const MERGE_STATE_ATTEMPTS = 6
const MERGE_STATE_WAIT_MS = 2500

const prNumber = process.argv[2]
if (!prNumber || !/^\d+$/.test(prNumber)) {
  console.error('Usage: node scripts/merge-pr.mjs <pr-number>')
  process.exit(1)
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readPr() {
  try {
    return JSON.parse(
      gh([
        'pr',
        'view',
        prNumber,
        '--json',
        'number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,' +
          'baseRefName,headRefName,statusCheckRollup',
      ]),
    )
  } catch (error) {
    console.error(`Could not read PR #${prNumber}: ${error.stderr || error.message}`)
    process.exit(1)
  }
}

let pr = readPr()
let polls = 0
if (pr.mergeStateStatus === 'UNKNOWN') {
  console.log(`GitHub has not finished computing mergeability for PR #${prNumber}. Waiting...`)
}
while (pr.mergeStateStatus === 'UNKNOWN' && polls < MERGE_STATE_ATTEMPTS) {
  polls += 1
  await sleep(MERGE_STATE_WAIT_MS)
  pr = readPr()
}

const refuse = (why) => {
  console.error(`Refusing to merge PR #${prNumber} (${pr.title}):\n  ${why}`)
  process.exit(1)
}

if (pr.state !== 'OPEN') refuse(`state is ${pr.state}, not OPEN.`)
if (pr.isDraft) refuse('it is a draft.')
if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
  refuse(`it conflicts with ${pr.baseRefName}. Send it back to rebase and re-verify.`)
}

// Deterministic where mergeStateStatus is not. The compare API answers "is the
// head behind its base" from commits, immediately, whatever GitHub has or has
// not finished computing. It makes the messages below specific, and it is the
// one thing worth saying while mergeability is still UNKNOWN.
function commitsBehindBase() {
  try {
    const behind = gh([
      'api',
      `repos/{owner}/{repo}/compare/${pr.baseRefName}...${pr.headRefName}`,
      '--jq',
      '.behind_by',
    ]).trim()
    return Number.isNaN(Number(behind)) ? null : Number(behind)
  } catch {
    // A fork's head branch does not exist in this repository, so the compare
    // is a 404 rather than an answer. Callers degrade to a vaguer message.
    return null
  }
}

// Latest conclusion per check name; a rerun should not be judged on its first result.
const latest = new Map()
for (const check of pr.statusCheckRollup ?? []) {
  const name = check.name ?? check.context
  if (!name) continue
  const state = check.conclusion || check.state || 'PENDING'
  latest.set(name, state)
}

const problems = []
for (const name of REQUIRED) {
  const state = latest.get(name)
  if (state === undefined) problems.push(`${name}: never ran`)
  else if (state !== 'SUCCESS' && state !== 'NEUTRAL') problems.push(`${name}: ${state}`)
}

if (problems.length > 0) {
  refuse(
    `required checks are not green:\n    ${problems.join('\n    ')}\n\n` +
      `  Fix the run, do not merge around it. If a check is wrong, change the check\n` +
      `  in its own PR and say so.`,
  )
}

// Green, but green against what? Everything above is a fact about the branch.
// This is the question about the merge result.
const behind = commitsBehindBase()
const behindPhrase = behind === null ? '' : ` by ${behind} commit(s)`

const staleRefusal = () =>
  refuse(
    `the ${REQUIRED.length} required check(s) are green, but the branch is behind\n` +
      `  ${pr.baseRefName}${behindPhrase}, so that green is stale. It was produced against the\n` +
      `  branch point, not against what would land.\n\n` +
      `  Send it back. The agent that owns the branch rebases it and re-verifies; you\n` +
      `  do not rebase it for them. Resolving someone's conflict makes you the author\n` +
      `  of a change you are about to review — parallelism.md, "Rebases are theirs,\n` +
      `  not yours". If that agent is gone, brief a fresh one whose job is rebase and\n` +
      `  re-verify rather than build.`,
  )

// BEHIND is what GitHub reports when the base requires up-to-date branches: the
// merge would fail with HTTP 405 and "N of N required status checks are
// expected", so refusing here turns that into a sentence that names the fix.
if (pr.mergeStateStatus === 'BEHIND') staleRefusal()
if (REFUSE_WHEN_BEHIND && behind !== null && behind > 0) staleRefusal()

if (pr.mergeStateStatus === 'BLOCKED') {
  // BLOCKED is GitHub's answer for several different rules at once, so this
  // says what it can rule out and points at the one place that names the rule.
  // Printing "rebase" here for every cause would send agents to do work that
  // fixes nothing, which is how a wrapper stops being believed.
  const clues = []
  if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    clues.push('reviewDecision is REVIEW_REQUIRED: an approving review is missing.')
  }
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    clues.push('reviewDecision is CHANGES_REQUESTED: a reviewer is holding it.')
  }
  if (behind !== null && behind > 0) {
    clues.push(`It is also ${behind} commit(s) behind ${pr.baseRefName}, which may be the cause.`)
  } else if (behind === 0) {
    clues.push(`It is not behind ${pr.baseRefName}, so staleness is not the cause.`)
  }
  refuse(
    `GitHub reports the merge state as BLOCKED.\n` +
      `  The ${REQUIRED.length} required check(s) above are green, so it is not those.\n` +
      (clues.length > 0 ? `\n  ${clues.join('\n  ')}\n` : '') +
      `\n  BLOCKED covers required reviews, unresolved review threads, code owner\n` +
      `  rules, other required contexts and repository policy. Open the PR page: the\n` +
      `  merge box names the rule. Do not send it back to rebase without checking\n` +
      `  which one — BLOCKED is not BEHIND.`,
  )
}

console.log(`PR #${prNumber}: ${pr.title}`)

if (pr.mergeStateStatus === 'UNSTABLE') {
  console.log(
    `Merge state is UNSTABLE: something outside the required set is red or still\n` +
      `running. The required check(s) are the contract, and they are green, so this\n` +
      `proceeds.`,
  )
}

if (pr.mergeStateStatus === 'UNKNOWN') {
  // Saying what is unverified, rather than refusing on a value that means
  // "GitHub has not answered yet".
  const waited = (polls * MERGE_STATE_WAIT_MS) / 1000
  console.warn(`Merge state is still UNKNOWN after ${waited}s of waiting.`)
  console.warn(`Unverified: whether ${pr.baseRefName} has moved under this branch since the`)
  console.warn('checks ran, which is what the green above would then be stale against.')
  if (behind === null) {
    console.warn(`Could not compare ${pr.headRefName} against ${pr.baseRefName} either.`)
  } else if (behind > 0) {
    console.warn(
      `The commit comparison does say the head is ${behind} commit(s) behind ` +
        `${pr.baseRefName}.\nWhat lands is a combination nothing has run.`,
    )
  } else {
    console.warn(`The commit comparison says the head is not behind ${pr.baseRefName}, which is`)
    console.warn('the case that usually goes wrong.')
  }
  console.warn('Proceeding on the check rollup alone.')
}

console.log(`All ${REQUIRED.length} required checks green. Squash merging...`)

try {
  // The REST endpoint rather than `gh pr merge`, which the guard blocks by name.
  gh([
    'api',
    '--method',
    'PUT',
    `repos/{owner}/{repo}/pulls/${prNumber}/merge`,
    '-f',
    'merge_method=squash',
  ])
} catch (error) {
  const message = error.stderr || error.message
  console.error(`Merge failed: ${message}`)
  if (/required status checks are expected/i.test(message)) {
    // The 405 this script exists to explain. It reaches here only when
    // mergeStateStatus was UNKNOWN above, so the translation is worth printing.
    console.error(
      `\nThat is the stale-branch case: ${pr.baseRefName} requires the checks to have run\n` +
        `on an up-to-date branch, and these ran on the branch point. Send it back to\n` +
        `the owning agent to rebase and re-verify.`,
    )
  }
  process.exit(1)
}

try {
  gh(['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`])
  console.log(`Merged into ${pr.baseRefName} and deleted branch ${pr.headRefName}.`)
} catch {
  console.log(`Merged. Branch ${pr.headRefName} could not be deleted; remove it manually.`)
}
