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
  if (!out.trim()) return { denied: false, reason: '' }
  const { permissionDecision, permissionDecisionReason } = JSON.parse(out).hookSpecificOutput
  return { denied: permissionDecision === 'deny', reason: permissionDecisionReason }
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
  // `42` rather than on the token a rule reads, which is exactly why nothing
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
  // #97. An assignment prefix binds a variable for the command that follows, so
  // the command is what follows it. Every line here merged before the fix, and
  // `GH_TOKEN=$SOMETHING gh pr merge` is an agent working around an auth
  // problem rather than an agent hiding, which is the case this guard is for.
  'GH_TOKEN=x gh pr merge 42 --squash',
  'FOO=1 BAR=2 gh pr merge 42',
  'FOO="a b" gh pr merge 42',
  'FOO=a\\ b gh pr merge 42',
  'if true; then GH_TOKEN=x gh pr merge; fi',
  'time GH_TOKEN=x gh pr merge 42',
  'GH_TOKEN=x gh api --method PUT repos/o/r/pulls/42/merge',
  // Each shell tool the hook is wired to can invoke the other one.
  'bash -c "gh pr merge 42"',
  'pwsh -Command "gh pr merge 42"',
  // The liveness probe is refused on purpose: being refused is its answer. If
  // this ever passes, a session has no way to tell a loaded guard from an
  // inert one, which is the state that went unnoticed here for two days.
  'node scripts/check-guard-live.mjs',
  'node ./scripts/check-guard-live.mjs',
  'node C:\\Users\\o\\repo\\scripts\\check-guard-live.mjs',
  // The line #97 turns on. A probe walked past reports the guard inert in a
  // session where it is live, and a false "inert" is worse than silence: it
  // arrives with the authority of a measurement, and it invites the reader to
  // go looking for another route.
  'GH_TOKEN=x node scripts/check-guard-live.mjs',
  // #82. The probe stays refused when it rides in on a compound line, for that
  // same reason: allowing it here would let anyone append `&& true` and get a
  // confident "inert" out of a live guard. What changes is the wording, and
  // that is asserted separately below.
  'git pull --ff-only --quiet origin main && node scripts/check-guard-live.mjs',
  'node scripts/check-guard-live.mjs && gh issue comment 82 --body "loaded"',
  'node scripts/check-guard-live.mjs || echo inert',
  'bash -c "git pull && node scripts/check-guard-live.mjs"',
  // #135. ADR 0037 made command substitution the documented way to find a path
  // that cannot be hard-coded, so the probe gets invoked in exactly the shape
  // that used to walk past the rule: `$(` closed the outer command, `node`
  // landed in one segment and the script name in the next, and the rule that
  // needs both saw neither. Every line here ran, and reported the guard inert
  // from inside a session where it was denying.
  'node "$(git rev-parse --path-format=absolute --git-common-dir)/../scripts/check-guard-live.mjs"',
  'node "$(cat pointer)/guard/check-guard-live.mjs"',
  'node $(cat pointer)/guard/check-guard-live.mjs',
  'GH_TOKEN=x node "$(cat pointer)/guard/check-guard-live.mjs"',
  'bash -c "node \\"$(cat pointer)/guard/check-guard-live.mjs\\""',
  // A `$(` that is never closed used to be covered by the outer command being
  // closed at the `$(`. It is now covered by unwinding the frame instead, and
  // this is the line that tells the two apart.
  'gh pr merge $(cat',
  'gh pr merge "$(echo 42',
  // The deny direction, which is where a placeholder could narrow the guard
  // rather than widen it. A `$(...)` can expand to nothing, so a word ending in
  // one is still that word, and `$(true)` prints nothing.
  'gh pr merge$(true)',
  'gh "pr" merge$(x)',
  'bash -c "gh pr merge$(x)"',
  // Newly refused, and it was a working merge before: the endpoint was split at
  // the `$(` and `apiEndpoint` never saw a path with `/merge` in it.
  'gh api "repos/o/r/pulls/$(cat n)/merge" --method PUT',
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
  // line below is shell-invalid and the parse of it is nonsense either way,
  // since `(` has split it since #58. The verdict is what has to stay allow.
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

  // #97's other direction, and the one that decides it. An `=` in an argument
  // is not an assignment prefix, and a rule that strips too eagerly turns an
  // argument into a command.
  'git commit -m "FOO=1"',
  'gh issue comment 5 --body "GIT_TRACE=1 git push"',
  'gh api repos/o/r/issues -f body="a=b"',
  'gh pr create --field key=value',
  'cd C:\\build\\out=release',
  // The name has to be a valid shell identifier. A shell reads `=x` as a
  // command name and fails to find it, so stripping it would invent a command
  // that never ran.
  '=x gh pr merge 42',
  // An assignment with no command after it runs nothing, and leaves the empty
  // segment #90's filter already handles.
  'FOO=1',
  'FOO=1 BAR=2',

  // The probe rule is held to the same standard as the merge rules: reading
  // the command, not the line. Talking about the probe is not running it.
  'echo "node scripts/check-guard-live.mjs"',
  'cat scripts/check-guard-live.mjs',
  'git add scripts/check-guard-live.mjs',
  'node scripts/check-collisions.mjs',

  // #135's other direction, and the one the change is widest against. A
  // substitution's result is an argument to the command it sits in, so the
  // words after it are that argument's text and not a command. The field
  // derivative that hit this bug fixed it by matching the raw line instead, and
  // had the guard refusing a heredoc that merely documented the probe within a
  // day. Every line here is the shape that would break under that fix.
  'echo "$(cat x)/gh pr merge"',
  'echo "$(cat pointer)/guard/check-guard-live.mjs"',
  'gh issue comment 135 --body "$(cat note) and gh pr merge stays denied"',
  'cat "$(git rev-parse --path-format=absolute --git-common-dir)/factory-home"',
  'git add "$(git rev-parse --show-toplevel)/scripts/check-guard-live.mjs"',
  // A subshell inside a substitution closes its own bracket, so the outer
  // argument is not handed back a bracket early and the tail of it stays text.
  'echo "$(cd repo && (pwd))/gh pr merge"',
  // Single quotes do not expand a substitution, so there is no command in here.
  "echo '$(gh pr merge 42)'",
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

// #82. Refusing the probe is the answer the probe exists to produce, so this is
// the one denial in the guard that reads as success. When the probe is the
// whole tool call that reading is correct. When anything else is on the line,
// the harness threw that away too and the same words say "nothing is wrong"
// about a `git pull` that did not happen. Two orchestrators lost a command that
// way, the second after reading a warning about the first, so the tables below
// pin which message each shape gets.
//
// The verdict is deny on both sides and is asserted in DENIED above. What is
// asserted here is which denial.
const ALONE = [
  'node scripts/check-guard-live.mjs',
  'node ./scripts/check-guard-live.mjs',
  // A brace group is how #82's second measurement was actually taken. `}` is a
  // compound command's closing syntax rather than a command, so nothing is lost.
  '{ node scripts/check-guard-live.mjs; }',
  // An assignment prefix binds a variable for the probe and runs nothing itself.
  'GH_TOKEN=x node scripts/check-guard-live.mjs',
  // A shell in front of the probe is still a tool call that is only the probe.
  'bash -c "node scripts/check-guard-live.mjs"',
  // Asking twice loses nothing either.
  'node scripts/check-guard-live.mjs && node scripts/check-guard-live.mjs',
  // #135. The substitution names this command's own script; it is not a second
  // thing the caller wanted done. Telling them here to run the rest on its own
  // and then "ask the guard on its own" would send them in a circle, because
  // the substitution is how the guard is asked at all when the probe is not in
  // the working directory.
  'node "$(git rev-parse --path-format=absolute --git-common-dir)/../scripts/check-guard-live.mjs"',
  'node "$(cat pointer)/guard/check-guard-live.mjs"',
]

const IN_COMPANY = [
  // Verbatim from #82's comment. The pull never ran, `git log` still showed the
  // previous merge, and the guard's reply was the one being asked for.
  'git pull --ff-only --quiet origin main && node scripts/check-guard-live.mjs',
  // #82's opening loss, which was a `gh issue comment`, in the other order.
  'node scripts/check-guard-live.mjs && gh issue comment 82 --body "loaded"',
  'cd repo; node scripts/check-guard-live.mjs',
  'node scripts/check-guard-live.mjs || echo inert',
  // What is lost can sit on either side of a shell payload, so the question has
  // to be asked of the whole tool call and not of the segment the probe is in.
  'git pull && bash -c "node scripts/check-guard-live.mjs"',
  'bash -c "git pull && node scripts/check-guard-live.mjs"',
  'bash -c "echo hi" && node scripts/check-guard-live.mjs',
  // #135, the other way round. The probe sits *inside* the substitution here,
  // so the command the line runs is the `gh issue comment`, and that comment
  // really was thrown away. This is #82's opening loss written with a
  // substitution instead of an `&&`.
  'gh issue comment 82 --body "$(node scripts/check-guard-live.mjs)"',
  // A substitution locating the probe still loses whatever is chained to it.
  'git pull --ff-only && node "$(cat pointer)/guard/check-guard-live.mjs"',
]

for (const command of ALONE) {
  test(`says nothing is wrong: ${command}`, () => {
    const { denied, reason } = run(command)
    assert.equal(denied, true, 'the probe must be refused whatever else is on the line')
    assert.match(reason, /Nothing is wrong\./)
  })
}

for (const command of IN_COMPANY) {
  test(`says what was lost: ${command}`, () => {
    const { denied, reason } = run(command)
    assert.equal(denied, true, 'the probe must be refused whatever else is on the line')
    assert.match(reason, /nothing else on that line ran/)
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

// #153. `--probe` belongs to the shipped guard, which is its own probe. Handed
// to this copy it used to fall through to the hook body, read an empty stdin and
// exit 0 without a word, which is what an unloaded gate looks like. The command
// was prescribed by the machine record and by `check-setup.mjs` at the time.
//
// This is a signpost, not a second probe rule: `isLivenessProbe` is untouched,
// and the exit code says the answer is "ask elsewhere" rather than "nothing
// intercepted me".
test('--probe is refused with the probe that does exist, rather than silently ignored', () => {
  let failed = null
  try {
    execFileSync('node', [GUARD, '--probe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    failed = error
  }
  assert.notEqual(failed, null, 'a silent exit 0 is indistinguishable from an unloaded guard')
  assert.match(failed.stderr, /node scripts\/check-guard-live\.mjs/)
})

// And the hook path is untouched by it, which is the whole safety argument: the
// PreToolUse entry runs this file with no arguments and writes to stdin.
test('the hook still judges a command when no flag is in the way', () => {
  assert.equal(run('gh pr merge 42').denied, true)
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
