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
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
//
// While it is on, a branch this cannot see is refused too. A check that
// passes whenever its lookup fails is a check that passes; ADR 0063.
const REFUSE_WHEN_BEHIND = true

// GitHub computes mergeability asynchronously, so mergeStateStatus reads
// UNKNOWN for some seconds after any push and then settles. Refusing on
// UNKNOWN would make this refuse at random, and a wrapper that refuses at
// random gets worked around — which costs more than the gap it closes. So it
// waits this long for an answer, and then says what it does not know rather
// than guessing either way.
const MERGE_STATE_ATTEMPTS = 6
const MERGE_STATE_WAIT_MS = 2500

function ghRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const failure = (error) => String(error.stderr || error.message).trim()

// `gh` and `sleep` are injected so the tests can drive every refusal without a
// token, a network or a pull request; `required` and `refuseWhenBehind` so
// they can drive the shipped placeholders and the switch in both positions.
// Every message names `pr.baseRefName` rather than looking up the default
// branch. They are the same branch in the normal case, and where they differ
// the base is the one the merge is actually judged against.
export async function run({
  prNumber,
  gh = ghRunner,
  sleep = wait,
  log = console.log,
  warn = console.warn,
  error = console.error,
  required = REQUIRED,
  refuseWhenBehind = REFUSE_WHEN_BEHIND,
}) {
  function readPr() {
    try {
      return JSON.parse(
        gh([
          'pr',
          'view',
          prNumber,
          '--json',
          'number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,' +
            'baseRefName,headRefName,headRefOid,isCrossRepository,statusCheckRollup',
        ]),
      )
    } catch (e) {
      error(`Could not read PR #${prNumber}: ${failure(e)}`)
      return null
    }
  }

  let pr = readPr()
  if (pr === null) return 1
  let polls = 0
  if (pr.mergeStateStatus === 'UNKNOWN') {
    log(`GitHub has not finished computing mergeability for PR #${prNumber}. Waiting...`)
  }
  while (pr.mergeStateStatus === 'UNKNOWN' && polls < MERGE_STATE_ATTEMPTS) {
    polls += 1
    await sleep(MERGE_STATE_WAIT_MS)
    pr = readPr()
    if (pr === null) return 1
  }

  const refuse = (why) => {
    error(`Refusing to merge PR #${prNumber} (${pr.title}):\n  ${why}`)
    return 1
  }
  const base = pr.baseRefName

  if (pr.state !== 'OPEN') return refuse(`state is ${pr.state}, not OPEN.`)
  if (pr.isDraft) return refuse('it is a draft.')
  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    return refuse(`it conflicts with ${base}. Send it back to rebase and re-verify.`)
  }

  // Latest conclusion per check name; a rerun should not be judged on its first result.
  const latest = new Map()
  for (const check of pr.statusCheckRollup ?? []) {
    const name = check.name ?? check.context
    if (!name) continue
    latest.set(name, check.conclusion || check.state || 'PENDING')
  }

  const problems = []
  for (const name of required) {
    const state = latest.get(name)
    if (state === undefined) problems.push(`${name}: never ran`)
    else if (state !== 'SUCCESS' && state !== 'NEUTRAL') problems.push(`${name}: ${state}`)
  }

  if (problems.length > 0) {
    return refuse(
      `required checks are not green:\n    ${problems.join('\n    ')}\n\n` +
        `  Fix the run, do not merge around it. If a check is wrong, change the check\n` +
        `  in its own PR and say so.`,
    )
  }

  // Green, but green against what? Everything above is a fact about the branch.
  // This is the question about the merge result.
  //
  // The compare API answers "is the head behind its base" from commits,
  // immediately, whatever GitHub has or has not finished computing. It asks by
  // the head's SHA, not its branch name: a fork's branch does not exist in this
  // repository, so the name is a 404, while the PR's head commit is reachable
  // here. Measured on a public fork PR, cli/cli#14519, where the name answered
  // 404 and the SHA answered a count. The SHA is also exactly what the checks
  // above ran on, which a branch that has moved since is not.
  const compare = `repos/{owner}/{repo}/compare/${base}...${pr.headRefOid}`
  let behind = null
  let blind = null
  try {
    const answer = gh(['api', compare, '--jq', '.behind_by']).trim()
    if (answer !== '' && !Number.isNaN(Number(answer))) behind = Number(answer)
    else blind = `the compare answered "${answer}", not a count`
  } catch (e) {
    blind = failure(e)
  }
  const behindPhrase = behind === null ? '' : ` by ${behind} commit(s)`

  const staleRefusal = () =>
    refuse(
      `the ${required.length} required check(s) are green, but the branch is behind\n` +
        `  ${base}${behindPhrase}, so that green is stale. It was produced against the\n` +
        `  branch point, not against what would land.\n` +
        // BEHIND is what GitHub reports when the base requires up-to-date
        // branches, so there the merge would also fail, with a less useful message.
        (pr.mergeStateStatus === 'BEHIND'
          ? `  ${base} requires the checks to have run on an up-to-date branch, so merging\n` +
            `  now returns HTTP 405, "${required.length} of ${required.length} required ` +
            `status checks are expected".\n`
          : '') +
        `\n  Send it back. The agent that owns the branch rebases it and re-verifies; you\n` +
        `  do not rebase it for them. Resolving someone's conflict makes you the author\n` +
        `  of a change you are about to review — parallelism.md, "Rebases are theirs,\n` +
        `  not yours". If that agent is gone, brief a fresh one whose job is rebase and\n` +
        `  re-verify rather than build.`,
    )

  if (pr.mergeStateStatus === 'BEHIND') return staleRefusal()
  if (refuseWhenBehind && behind !== null && behind > 0) return staleRefusal()
  if (refuseWhenBehind && behind === null) {
    // Not knowing is refused, not waved through. ADR 0063.
    return refuse(
      `the ${required.length} required check(s) are green, but this could not tell whether\n` +
        `  the branch is behind ${base}, so it cannot say that green is current. The\n` +
        `  compare failed:\n    ${blind}\n\n` +
        `  Refusing rather than guessing: a stale green is exactly what this line is\n` +
        `  for. The call it made, to rerun by hand:\n` +
        `    gh api ${compare} --jq .behind_by\n` +
        `  A transient error clears on a retry. One that persists is a gh, token or\n` +
        `  network problem to fix, not a reason to merge around this.`,
    )
  }

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
      clues.push(`It is also ${behind} commit(s) behind ${base}, which may be the cause.`)
    } else if (behind === 0) {
      clues.push(`It is not behind ${base}, so staleness is not the cause.`)
    }
    return refuse(
      `GitHub reports the merge state as BLOCKED, which is its answer for several\n` +
        `  different rules at once.\n\n` +
        `  If you have just pushed, that is the likely one: the rollup this script read\n` +
        `  lags a push by seconds, so the ${required.length} check(s) above can be the ` +
        `previous head's\n  green while the new run has not started. Wait for it and try again.\n` +
        (clues.length > 0 ? `\n  ${clues.join('\n  ')}\n` : '') +
        `\n  Otherwise BLOCKED covers required reviews, unresolved review threads, code\n` +
        `  owner rules, other required contexts and repository policy. Open the PR page:\n` +
        `  the merge box names the rule. Do not send it back to rebase without checking\n` +
        `  which one — BLOCKED is not BEHIND.`,
    )
  }

  log(`PR #${prNumber}: ${pr.title}`)

  if (pr.mergeStateStatus === 'UNSTABLE') {
    log(
      `Merge state is UNSTABLE: something outside the required set is red or still\n` +
        `running. The required check(s) are the contract, and they are green, so this\n` +
        `proceeds.`,
    )
  }

  if (pr.mergeStateStatus === 'UNKNOWN') {
    // Saying what is unverified, rather than refusing on a value that means
    // "GitHub has not answered yet".
    const waited = (polls * MERGE_STATE_WAIT_MS) / 1000
    warn(`Merge state is still UNKNOWN after ${waited}s of waiting.`)
    warn(`Unverified: whether ${base} has moved under this branch since the`)
    warn('checks ran, which is what the green above would then be stale against.')
    // The two branches below that name a problem are reachable only with
    // REFUSE_WHEN_BEHIND off; with it on, both were refused above.
    if (behind === null) {
      warn(`Could not compare the head against ${base} either: ${blind}`)
    } else if (behind > 0) {
      warn(
        `The commit comparison does say the head is ${behind} commit(s) behind ${base}.\n` +
          `If ${base} requires up-to-date branches the merge below will fail with HTTP 405;\n` +
          `if it does not, what lands is a combination nothing has run.`,
      )
    } else {
      warn(`The commit comparison says the head is not behind ${base}, which is`)
      warn('the case that usually goes wrong.')
    }
    warn('Proceeding on the check rollup alone.')
  }

  log(`All ${required.length} required check(s) green. Squash merging...`)

  try {
    // The REST endpoint rather than `gh pr merge`, which the guard blocks by name.
    gh(['api', '--method', 'PUT', `repos/{owner}/{repo}/pulls/${prNumber}/merge`, '-f', 'merge_method=squash'])
  } catch (e) {
    const message = failure(e)
    error(`Merge failed: ${message}`)
    if (/required status checks are expected/i.test(message)) {
      // The 405 this script exists to explain. With REFUSE_WHEN_BEHIND on it
      // takes base moving in the seconds since the compare above, so it is rare,
      // and the translation is worth printing when it happens.
      error(
        `\nThat is the stale-branch case: ${base} requires the checks to have run\n` +
          `on an up-to-date branch, and these ran on the branch point. Send it back to\n` +
          `the owning agent to rebase and re-verify.`,
      )
    }
    return 1
  }

  if (pr.isCrossRepository) {
    // headRefName names a branch in the fork. Deleting refs/heads/<that name>
    // here would delete whatever branch of this repository shares the name, and
    // a fork PR opened from the fork's own `main` would take this repository's
    // `main` with it wherever nothing protects that branch. ADR 0063.
    log(`Merged into ${base}. The head branch lives in a fork, so it is the fork's to delete.`)
  } else {
    try {
      gh(['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`])
      log(`Merged into ${base} and deleted branch ${pr.headRefName}.`)
    } catch {
      log(`Merged. Branch ${pr.headRefName} was already gone or could not be deleted; check by hand.`)
    }
  }

  return 0
}

async function main(argv) {
  const prNumber = argv[0]
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    console.error('Usage: node scripts/merge-pr.mjs <pr-number>')
    return 1
  }
  return run({ prNumber })
}

// Node 22 has no `import.meta.main`, so the module asks whether it is the entry
// point. Without this `run` could not be imported by a test without merging
// something, which is the same shape post-body.mjs uses.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(await main(process.argv.slice(2)))
}
