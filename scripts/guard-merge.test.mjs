// Both directions. A gap lets a merge through; a false positive gets the guard
// switched off, and the second is the likelier failure. The skill's own guard
// shipped three false positives in a day, so the allow cases below carry at
// least as much weight as the deny cases.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
  'gh pr me"rge" 42',
  'gh api --method PUT repos/o/r/pulls/42/merge',
  'gh api repos/{owner}/{repo}/pulls/1/merge -f merge_method=squash',
  'gh api -X PUT "repos/o/r/pulls/9/merge"',
  // A global flag sits between `gh` and its subcommand, so finding the
  // subcommand means stepping over flags rather than reading tokens 2 and 3.
  'gh --repo o/r pr merge 42',
  // Every way one command follows another. #58's fix reads the head of each
  // command rather than the whole line, so each of these has to be recognised
  // as a command boundary or the fix becomes a hole.
  'git push origin feature && gh pr merge 7',
  'cd repo; gh pr merge 42',
  'gh pr view 42 || gh pr merge 42',
  'git push origin feature\ngh pr merge 7',
  'yes | gh pr merge 42',
  '(cd repo && gh pr merge 42)',
  // #90. The line above passes without the fix, because the bracket lands on
  // `42` rather than on the token a rule reads — which is exactly why nothing
  // caught this. A `)` has to end a command with no `$(` open, as `(` does.
  '(cd repo && gh pr merge)',
  '(gh pr merge)',
  'bash -c "(cd repo && gh pr merge)"',
  // Grouping and the reserved words that introduce a command inside a compound
  // one. Every one of these is shell syntax an agent writes while doing
  // ordinary work, and every one of them merges the current branch's PR.
  '{ gh pr merge; }',
  'if true; then gh pr merge; fi',
  'if gh pr checks 42; then gh pr merge 42; fi',
  'if false; then echo no; else gh pr merge; fi',
  'for pr in 1 2; do gh pr merge $pr; done',
  '! gh pr merge 42',
  'time gh pr merge',
  'echo "$(gh pr merge 42)"',
  'echo `gh pr merge 42`',
  // An unterminated quote is text, not an argument that swallows the rest of
  // the line. Read the other way, an apostrophe hides everything after it.
  "echo don't && gh pr merge 5",
  // Each shell tool the hook is wired to can invoke the other one.
  'bash -c "gh pr merge 42"',
  'pwsh -Command "gh pr merge 42"',
  // The liveness probe is refused on purpose: being refused is its answer. If
  // this ever passes, a session has no way to tell a loaded guard from an
  // inert one, which is the state that went unnoticed here for two days.
  'node scripts/check-guard-live.mjs',
  'node ./scripts/check-guard-live.mjs',
  'node C:\\Users\\o\\repo\\scripts\\check-guard-live.mjs',
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

  // #58. The guard denied all of these, and none of them merges anything: the
  // blocked command appears as the *text* of an argument to a different one.
  // Recording that the guard works was the first thing it refused to allow.
  'gh issue comment 45 --body "| Command | Result |\n| gh pr merge --help | denied |"',
  'gh pr create --title "Fix the guard" --body "It denied a comment quoting gh pr merge."',
  'git commit -m "Deny gh pr merge before it runs, not after"',
  // The #45 probe flagged this one as the next false positive it expected.
  'echo "gh pr merge 1"',
  // A heredoc body is data. It is also how an agent writes a long --body, so
  // it is the second most likely place for the command to appear as prose.
  "gh pr create --body \"$(cat <<'EOF'\n| gh pr merge 42 | denied |\nEOF\n)\"",
  // A comment posted through the API, with the command in the payload.
  'gh api repos/o/r/issues/58/comments -f body="gh pr merge 42 was denied"',
  // An endpoint that is not a merge, with `/merge` in a field value.
  'gh api repos/o/r/issues/58/comments -f body="see /merge"',
  // Recursion into a shell payload must read it as a command line too, not
  // scan it, or the nested case reintroduces exactly the bug above.
  'bash -c "echo gh pr merge 42"',
  'pwsh -Command "gh issue comment 58 --body \'gh pr merge is denied\'"',

  // #90's other direction, and the expensive one. An unquoted `)` now ends a
  // command, so every bracket that is ordinary text has to stay text.
  'git commit -m "fix (again)"',
  'git add "docs/notes (draft).md"',
  'gh pr create --body "Denied: (cd repo && gh pr merge)"',
  'gh issue comment 90 --body "| `(cd repo && gh pr merge)` | allowed |"',
  // Windows paths carry brackets, and this hook runs on Windows. Unquoted, the
  // line below is shell-invalid and the parse of it is nonsense either way —
  // `(` has split it since #58. What matters is that the verdict stays allow.
  'cd C:\\Program Files (x86)\\repo',
  'pwsh -Command "ls \'C:\\Program Files (x86)\\Git\'"',
  // A leading reserved word is matched as a whole token, so a brace inside a
  // word is not one. The `gh api repos/{owner}/...` deny case above proves the
  // same thing from the other side.
  'mkdir -p docs/{process,architecture}',
  'echo "{ gh pr merge; }"',
  // The compound forms, with nothing in them to deny. The sanctioned path
  // inside an `if` is the shape this change most needs not to break.
  'if gh pr checks 42; then node scripts/merge-pr.mjs 42; fi',
  'for f in docs/*.md; do git add "$f"; done',
  '{ npm run check; }',
  'time npm run check',
  // Stripping a leading word can leave a segment with no tokens at all, and
  // every rule reads the first one. Without the filter this throws.
  'time',

  // The probe rule is held to the same standard as the merge rules: reading
  // the command, not the line. Talking about the probe is not running it.
  'echo "node scripts/check-guard-live.mjs"',
  'cat scripts/check-guard-live.mjs',
  'git add scripts/check-guard-live.mjs',
  'node scripts/check-collisions.mjs',
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

// The probe and the rule that refuses it are two files agreeing on a filename.
// Rename one and the probe stops being refused, which does not fail anything:
// it just answers "inert" for ever, in a session where the guard is fine.
test('the guard refuses the probe script that actually ships', () => {
  const probe = fileURLToPath(new URL('./check-guard-live.mjs', import.meta.url))
  assert.equal(existsSync(probe), true, 'scripts/check-guard-live.mjs is absent')
  assert.equal(run(`node ${probe}`).denied, true, 'the guard does not refuse its own probe')
})

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
