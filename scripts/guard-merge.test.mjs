// Both directions. A gap lets a merge through; a false positive gets the guard
// switched off, and the second is the likelier failure. The skill's own guard
// shipped three false positives in a day, so the allow cases below carry at
// least as much weight as the deny cases.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GUARD = fileURLToPath(new URL('./guard-merge.mjs', import.meta.url))

function run(command) {
  const out = execFileSync('node', [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  if (!out.trim()) return { denied: false }
  return { denied: JSON.parse(out).hookSpecificOutput.permissionDecision === 'deny' }
}

const DENIED = [
  'gh pr merge 42',
  'gh pr merge 42 --squash',
  'gh pr merge --auto 42',
  'gh   pr   merge   42',
  'gh pr "merge" 42',
  'gh api --method PUT repos/o/r/pulls/42/merge',
  'gh api repos/{owner}/{repo}/pulls/1/merge -f merge_method=squash',
  'git push origin feature && gh pr merge 7',
]

const ALLOWED = [
  // The sanctioned path must not match. If this ever fails, nothing can land.
  'node scripts/merge-pr.mjs 42',
  // Ordinary work.
  'git push origin intake/20-eligibility-gating',
  'git push -u origin HEAD',
  'gh pr create --fill',
  'gh pr view 42 --json statusCheckRollup',
  'gh pr list --limit 100',
  'gh api repos/{owner}/{repo}/issues/3/sub_issues -F sub_issue_id=9',
  // False positives the original guard actually produced, kept as regressions.
  'git commit -m "explain why we merge to main this way"',
  'git merge --ff-only origin/main',
  'git merge-base HEAD origin/main',
  // `merge` inside a name, not as a verb.
  'git checkout -b chore/merges-cleanup',
  'gh api repos/o/r/branches/merge-queue-test',
  // Empty and malformed payloads are not this guard's problem.
  '',
  '   ',
]

for (const command of DENIED) {
  test(`denies: ${command}`, () => {
    assert.equal(run(command).denied, true, 'should have been denied')
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command || '(empty)'}`, () => {
    assert.equal(run(command).denied, false, 'should have been allowed')
  })
}

test('a malformed payload does not deny', () => {
  const out = execFileSync('node', [GUARD], { input: 'not json', encoding: 'utf8' })
  assert.equal(out.trim(), '')
})
