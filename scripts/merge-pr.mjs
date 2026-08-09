// The sanctioned way to land a PR on the default branch.
//
// WHAT THIS IS
// A convenience, not a control. On this repository the ruleset is the control:
// it requires a pull request and green checks, with no bypass actors, so
// GitHub refuses a bad merge whether or not anyone runs this. See
// docs/architecture/decisions/0001.
//
// It is still worth keeping for two reasons. It says *which* check is red and
// why, where the merge button says only that checks have not passed. And it
// gives guard-merge.mjs a specific command to point agents away from, which a
// button cannot.
//
// On a private repository without a ruleset this file is load-bearing rather
// than convenient, which is the situation the shipped template assumes.
//
//   node scripts/merge-pr.mjs 42
import { execFileSync } from 'node:child_process'

// The exact `name:` of each required job as GitHub reports it in the check
// rollup. Take them from a real run, not from the workflow file:
//   gh pr view <n> --json statusCheckRollup --jq '.statusCheckRollup[].name'
// A name that never appears is treated as "never ran" and refuses the merge.
// That is the safe direction, but a typo here looks like a broken script.
// These must stay in step with .github/workflows/checks.yml and the ruleset.
const REQUIRED = ['Checks']

const prNumber = process.argv[2]
if (!prNumber || !/^\d+$/.test(prNumber)) {
  console.error('Usage: node scripts/merge-pr.mjs <pr-number>')
  process.exit(1)
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const defaultBranch =
  gh(['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']).trim() ||
  'main'

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
if (pr.mergeable === 'CONFLICTING') {
  refuse(`it conflicts with ${defaultBranch}. Send it back to rebase and re-verify.`)
}

// Latest conclusion per check name; a rerun should not be judged on its first result.
const latest = new Map()
for (const check of pr.statusCheckRollup ?? []) {
  const name = check.name ?? check.context
  if (!name) continue
  latest.set(name, check.conclusion || check.state || 'PENDING')
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
console.log(`All ${REQUIRED.length} required check(s) green. Squash merging...`)

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

// The repo is set to delete branches on merge, so this is usually a no-op that
// fails harmlessly. Kept for the case where that setting is ever turned off.
try {
  gh(['api', '--method', 'DELETE', `repos/{owner}/{repo}/git/refs/heads/${pr.headRefName}`])
  console.log(`Merged and deleted branch ${pr.headRefName}.`)
} catch {
  console.log(`Merged. Branch ${pr.headRefName} was already gone or could not be deleted.`)
}
