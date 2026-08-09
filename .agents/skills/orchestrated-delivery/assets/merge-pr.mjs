// The only sanctioned way to land a PR on the default branch.
//
// WHAT THIS PREVENTS
// GitHub cannot enforce required checks here: branch protection needs a paid
// plan on a private repo. Without enforcement, "check the run first" is a
// habit, and habits lapse exactly when things are busy. This does the check
// mechanically and refuses otherwise.
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

const prNumber = process.argv[2]
if (!prNumber || !/^\d+$/.test(prNumber)) {
  console.error('Usage: node scripts/merge-pr.mjs <pr-number>')
  process.exit(1)
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

let pr
try {
  pr = JSON.parse(
    gh([
      'pr',
      'view',
      prNumber,
      '--json',
      'number,title,state,isDraft,mergeable,headRefName,statusCheckRollup',
    ]),
  )
} catch (error) {
  console.error(`Could not read PR #${prNumber}: ${error.stderr || error.message}`)
  process.exit(1)
}

const refuse = (why) => {
  console.error(`Refusing to merge PR #${prNumber} (${pr.title}):\n  ${why}`)
  process.exit(1)
}

if (pr.state !== 'OPEN') refuse(`state is ${pr.state}, not OPEN.`)
if (pr.isDraft) refuse('it is a draft.')
if (pr.mergeable === 'CONFLICTING') refuse('it has conflicts with main. Rebase or merge main in first.')

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

console.log(`PR #${prNumber}: ${pr.title}`)
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
  console.error(`Merge failed: ${error.stderr || error.message}`)
  process.exit(1)
}

try {
  gh(['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`])
  console.log(`Merged and deleted branch ${pr.headRefName}.`)
} catch {
  console.log(`Merged. Branch ${pr.headRefName} could not be deleted; remove it manually.`)
}
