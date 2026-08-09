// Both directions. A gap lets a merge through; a false positive gets the guard
// switched off, and the second is the likelier failure. The skill's own guard
// shipped three false positives in a day, so the allow cases below carry at
// least as much weight as the deny cases.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

// The guard being correct is worth nothing if it is wired to only one of the
// shell tools available. A real session ran `git push origin main` through a
// PowerShell tool and was not denied, because the hook matched `Bash` only.
// The skill's own enforcement.md still ships that wiring.
const settings = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.claude/settings.json', import.meta.url)), 'utf8'),
)
const entries = settings.hooks?.PreToolUse ?? []
const guardEntries = entries.filter((e) =>
  (e.hooks ?? []).some((h) => (h.command ?? '').includes('guard-merge.mjs')),
)

test('the guard is actually wired as a PreToolUse hook', () => {
  assert.equal(guardEntries.length > 0, true, 'nothing invokes guard-merge.mjs')
})

test('the guard covers every shell-capable tool, not just Bash', () => {
  for (const tool of ['Bash', 'PowerShell']) {
    const covered = guardEntries.some((e) => new RegExp(`^(${e.matcher})$`).test(tool))
    assert.equal(covered, true, `${tool} is not matched, so it bypasses the guard`)
  }
})

test('no `if` clause narrows the guard back to a single tool', () => {
  // `if` uses permission-rule syntax, which names one tool: `Bash(gh *)` does
  // not fire for PowerShell. The script already filters on command text and
  // exits immediately, so the filter buys latency at the cost of a hole.
  for (const entry of guardEntries) {
    for (const hook of entry.hooks ?? []) {
      assert.equal(hook.if, undefined, `\`if: ${hook.if}\` re-narrows the guard to one tool`)
    }
  }
})
