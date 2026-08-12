// Both directions, for the guard this repository ships to other people.
//
// `scripts/guard-merge.test.mjs` covers the copy this repository runs on
// itself. This file covers `assets/guard-merge.mjs`, which is what a fresh
// repository installs as its only preventive layer, and until #102 nothing
// covered it at all. That is the copy where being wrong is most expensive,
// because nobody in that repository will read this file before trusting it.
//
// A gap lets a merge through; a false positive gets the guard switched off, and
// the second is the likelier failure. The shipped guard was failing in both
// directions at once when this file was written — `gh --repo o/r pr merge 42`
// walked straight through while `git commit -m "Deny gh pr merge before it
// runs"` was refused — so the allow cases below carry at least as much weight
// as the deny cases.
//
// WHAT THIS ASSERTS THAT command-reader.test.mjs DOES NOT
// That file proves all three copies read a command line the same way. It says
// nothing about what any of them then decides, and it must not: ADR 0033 keeps
// a push rule here that ADR 0001 deleted from this repository's copy. The rules
// are what this file is for.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GUARD = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/guard-merge.mjs', import.meta.url),
)

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
  // The working merge the shipped guard allowed. A global flag sits between
  // `gh` and its subcommand, so finding the subcommand means stepping over
  // flags rather than reading tokens 1 and 2.
  'gh --repo o/r pr merge 42',
  'gh -R o/r pr merge',
  'gh --hostname github.example.com pr merge 42',
  // The REST merge endpoints, reached directly.
  'gh api --method PUT repos/o/r/pulls/42/merge',
  'gh api repos/{owner}/{repo}/pulls/1/merge -f merge_method=squash',
  'gh api -X PUT "repos/o/r/pulls/9/merge"',
  // A push whose own arguments name the default branch. These are the rules
  // ADR 0001 removed from this repository's copy and ADR 0033 keeps here,
  // because the repository installing this has no ruleset to make them
  // redundant. Every one of them lands a commit on `main` with no pull request.
  'git push origin main',
  'git push origin HEAD:main',
  'git push origin main:main',
  'git push origin refs/heads/main',
  'git push origin +main',
  'git push --force origin main',
  'git push -f origin HEAD:main',
  'git push --force-with-lease origin main',
  // Deleting the default branch is a write to it.
  'git push origin :main',
  'git push --delete origin main',
  // Quoting comes off the tokens, so this reads the same as the bare form.
  'git push "origin" "main"',
  // The residual of the `--dry-run` allowance below, named rather than widened.
  // git's option parser accepts a bundled cluster, so `-nq` is a dry run and is
  // denied anyway. That is the harmless direction: matching any cluster
  // containing `n` would read `-on` — which is `-o n`, a push option — as a dry
  // run and allow a real push. Pinned so a change that appears to close this
  // has to change this line and say why.
  'git push -nq origin main',
  // The probe, refused on purpose: being refused is the answer it exists to
  // produce, and until #104 this was the one thing this repository's own guard
  // denied that the shipped one did not. The four forms are the four the issue
  // measured, translated into the shape ADR 0029 chose: `--probe` against the
  // guard itself rather than a second file this asset cannot promise ships
  // beside it.
  'node scripts/guard-merge.mjs --probe',
  'node ./scripts/guard-merge.mjs --probe',
  'node C:\\Users\\o\\repo\\scripts\\guard-merge.mjs --probe',
  // #97, and the reason it is a defect in a control rather than a gap: a probe
  // that walks past the rule reports the guard absent in a session where it is
  // live, and a false "not loaded" arrives with the authority of a measurement.
  'GH_TOKEN=x node scripts/guard-merge.mjs --probe',
  // Wherever the installing repository keeps it, and however the line is
  // written. The rule reads the file name, not the path.
  'node "scripts/guard-merge.mjs" --probe',
  'node .factory/guard-merge.mjs --probe',
  'bash -c "node scripts/guard-merge.mjs --probe"',
  // git's own flags come before the subcommand, and some swallow a value.
  'git -C /work/repo push origin main',
  'git -c push.default=current push origin main',
  // Every way one command follows another. Reading the head of each command
  // rather than the whole line is what stops the guard degrading into a text
  // scan, so each of these has to be recognised as a command boundary.
  'git push origin feature && gh pr merge 7',
  'cd repo; gh pr merge 42',
  'gh pr view 42 || gh pr merge 42',
  'git push origin feature\ngh pr merge 7',
  'yes | gh pr merge 42',
  'npm run check && git push origin main',
  '(cd repo && gh pr merge 42)',
  // A `)` has to end a command with no `$(` open, as `(` does, or the bracket
  // glues itself to the token a rule reads.
  '(cd repo && gh pr merge)',
  '(gh pr merge)',
  '(cd repo && git push origin main)',
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
  '{ git push origin main; }',
  'echo "$(gh pr merge 42)"',
  'echo `gh pr merge 42`',
  // An unterminated quote is text, not an argument that swallows the rest of
  // the line. Read the other way, an apostrophe hides everything after it.
  "echo don't && gh pr merge 5",
  // An assignment prefix binds a variable for the command that follows, so the
  // command is what follows it. `GH_TOKEN=$SOMETHING gh pr merge` is an agent
  // working around an auth problem rather than an agent hiding, which is the
  // case this guard is for.
  'GH_TOKEN=x gh pr merge 42',
  'GH_TOKEN=x gh pr merge 42 --squash',
  'FOO=1 BAR=2 gh pr merge 42',
  'FOO="a b" gh pr merge 42',
  'FOO=a\\ b gh pr merge 42',
  'if true; then GH_TOKEN=x gh pr merge; fi',
  'time GH_TOKEN=x gh pr merge 42',
  'GH_TOKEN=x gh api --method PUT repos/o/r/pulls/42/merge',
  'GIT_TRACE=1 git push origin main',
  // Each shell tool the hook is wired to can invoke the other one.
  'bash -c "gh pr merge 42"',
  'pwsh -Command "gh pr merge 42"',
  'bash -c "git push origin main"',
]

const ALLOWED = [
  // The sanctioned path must not match. If this ever fails, nothing can land in
  // any repository that installed this guard.
  'node scripts/merge-pr.mjs 42',
  'node ./scripts/merge-pr.mjs 42',
  'if gh pr checks 42; then node scripts/merge-pr.mjs 42; fi',

  // Ordinary work.
  'git push origin intake/20-eligibility-gating',
  'git push -u origin HEAD',
  'git push',
  'git push origin HEAD',
  'git push --force-with-lease origin intake/20-eligibility-gating',
  'git push origin HEAD:refs/heads/intake/20-eligibility-gating',
  'gh pr create --fill',
  'gh pr view 42 --json statusCheckRollup',
  'gh pr list --limit 100',
  'gh api repos/{owner}/{repo}/issues/3/sub_issues -F sub_issue_id=9',
  // Empty and malformed payloads are not this guard's problem.
  '',
  '   ',

  // A branch whose name merely starts with, contains or ends in the default
  // branch's is a different branch. The destination is compared whole.
  'git push origin main-fix',
  'git push origin fix-main',
  'git push origin release/main',
  'git push origin HEAD:main-fix',
  // The first positional names the remote, so a remote called `main` is not a
  // push *to* `main`.
  'git push main',
  'git push main HEAD:feature',

  // A dry run contacts the remote and changes nothing, so a rule about landing
  // code has nothing to act on. `assets/guard-guest-writes.mjs` has always
  // allowed it; this rule shipped for one review without it, which is the wrong
  // shape for a change whose whole argument is that false positives are the
  // dangerous half. `git push -h` lists exactly one `-n` and it is `--dry-run`,
  // so the short form is safe to match as a whole token.
  'git push --dry-run origin main',
  'git push -n origin main',
  'git push --dry-run --force origin HEAD:main',
  'git push -n origin :main',
  'git -C /work/repo push --dry-run origin main',
  'GIT_TRACE=1 git push --dry-run origin main',

  // The false positives the shipped guard actually produced, kept as
  // regressions. Each one is the reason a guard gets switched off rather than
  // a gap in one.
  //
  // A commit message that mentions the default branch, in the same line as a
  // push to a feature branch. This is the one the old text scanner read as a
  // push to `main`.
  'git commit -m "explain why we merge to main this way" && git push origin feature',
  'git commit -m "explain why we merge to main this way"',
  // The fast-forward that catches local `main` up after a pull request merges,
  // and a read-only query. Both were denied; neither writes anything remote.
  'git merge --ff-only origin/main',
  'git merge-base HEAD origin/main',
  'git merge-base --is-ancestor HEAD origin/main',
  // `merge` inside a name, not as a verb.
  'git checkout -b chore/merges-cleanup',
  'gh api repos/o/r/branches/merge-queue-test',

  // The guard denied all of these, and none of them merges anything: the
  // blocked command appears as the *text* of an argument to a different one.
  // Recording that the guard works was the first thing it refused to allow.
  'gh issue comment 45 --body "gh pr merge was denied"',
  'gh issue comment 45 --body "| Command | Result |\n| gh pr merge --help | denied |"',
  'gh pr create --title "Fix the guard" --body "It denied a comment quoting gh pr merge."',
  'git commit -m "Deny gh pr merge before it runs"',
  'git commit -m "Deny gh pr merge before it runs, not after"',
  'echo "gh pr merge 1"',
  'gh issue comment 5 --body "git push origin main is denied here"',
  // A heredoc body is data. It is also how an agent writes a long --body, so it
  // is the second most likely place for the command to appear as prose.
  "gh pr create --body \"$(cat <<'EOF'\n| gh pr merge 42 | denied |\nEOF\n)\"",
  // A comment posted through the API, with the command in the payload.
  'gh api repos/o/r/issues/58/comments -f body="gh pr merge 42 was denied"',
  // An endpoint that is not a merge, with `/merge` in a field value.
  'gh api repos/o/r/issues/58/comments -f body="see /merge"',
  // Recursion into a shell payload must read it as a command line too, not
  // scan it, or the nested case reintroduces exactly the bug above.
  'bash -c "echo gh pr merge 42"',
  'pwsh -Command "gh issue comment 58 --body \'gh pr merge is denied\'"',

  // Talking about the probe is not running it, and neither is reading it. The
  // probe rule is held to the same standard as the merge rules, which is the
  // standard the shipped guard failed three times in a day before #102.
  'echo "node scripts/guard-merge.mjs --probe"',
  'cat scripts/guard-merge.mjs',
  'git commit -m "Give the shipped guard a --probe mode"',
  'gh issue comment 45 --body "run node scripts/guard-merge.mjs --probe and paste the refusal"',
  'gh pr create --title "The guard we ship cannot be asked whether it is loaded" --body "node scripts/guard-merge.mjs --probe"',
  'bash -c "echo node scripts/guard-merge.mjs --probe"',
  // The guard invoked as a hook, which is what the wiring does on every command
  // and has no `--probe` in it. Denying this would be the guard refusing itself.
  'node scripts/guard-merge.mjs',
  'node "$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs"',
  // `--probe` is not a word this guard owns. Another script's flag is another
  // script's business.
  'node scripts/merge-pr.mjs --probe',
  'node scripts/check-setup.mjs --probe',
  // The four lines #104 measured, verbatim, and they stay allowed. They name
  // `check-guard-live.mjs`, which is ADR 0027's two-file probe and lives only in
  // the repository that ships this skill. `assets/` does not carry it, so an
  // installing repository does not have it. A rule matching a file name that
  // never arrives would refuse a command nobody can run while answering nothing,
  // which is the "inert" a rename produces, arrived at deliberately. ADR 0029's
  // one-file shape is above instead.
  'node scripts/check-guard-live.mjs',
  'node ./scripts/check-guard-live.mjs',
  'node C:\\Users\\o\\repo\\scripts\\check-guard-live.mjs',
  'GH_TOKEN=x node scripts/check-guard-live.mjs',

  // An unquoted `)` ends a command, so every bracket that is ordinary text has
  // to stay text.
  'git commit -m "fix (again)"',
  'git add "docs/notes (draft).md"',
  'gh pr create --body "Denied: (cd repo && gh pr merge)"',
  'gh issue comment 90 --body "| `(cd repo && gh pr merge)` | allowed |"',
  // Windows paths carry brackets, and this hook runs on Windows.
  'cd C:\\Program Files (x86)\\repo',
  'pwsh -Command "ls \'C:\\Program Files (x86)\\Git\'"',
  // A leading reserved word is matched as a whole token, so a brace inside a
  // word is not one. The `gh api repos/{owner}/...` deny case above proves the
  // same thing from the other side.
  'mkdir -p docs/{process,architecture}',
  'echo "{ gh pr merge; }"',
  // The compound forms, with nothing in them to deny.
  'for f in docs/*.md; do git add "$f"; done',
  '{ npm run check; }',
  'time npm run check',
  // Stripping a leading word can leave a segment with no tokens at all, and
  // every rule reads the first one. Without the filter this throws.
  'time',

  // An `=` in an argument is not an assignment prefix, and a rule that strips
  // too eagerly turns an argument into a command.
  'git commit -m "FOO=1"',
  'gh issue comment 5 --body "GIT_TRACE=1 git push"',
  'gh api repos/o/r/issues -f body="a=b"',
  'gh pr create --field key=value',
  'cd C:\\build\\out=release',
  // The name has to be a valid shell identifier. A shell reads `=x` as a
  // command name and fails to find it, so stripping it would invent a command
  // that never ran.
  '=x gh pr merge 42',
  // An assignment with no command after it runs nothing.
  'FOO=1',
  'FOO=1 BAR=2',

  // ADR 0033, and the gap it takes deliberately. A `git merge` is dangerous or
  // harmless depending on the branch you are standing on, and a PreToolUse hook
  // runs before its command and cannot know which that is. The earlier copy
  // shelled out to `git rev-parse` and was measured giving opposite verdicts
  // from a worktree and from the main checkout. These are allowed now, and the
  // provenance audit is what notices if one of them lands something.
  'git merge feature',
  'git merge --no-ff feature',
  'git merge --abort',
  // The other gap the guard states rather than half-closes: a destination the
  // command line does not spell out. `$b` here expands to `main` and the guard
  // sees `$b`. Pinned as an allow so the NOT COVERED section stays true rather
  // than aspirational, and so a later change that appears to close it has to
  // change this line and say why.
  'for b in main; do git push origin $b; done',
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

// ADR 0027's probe and its rule were two files agreeing on a filename, and a
// rename would have turned the answer into a permanent, silent "inert". Here
// they are one file, so the only thing left to assert is that the file really
// does refuse itself, at the path an installer will actually have it at.
test('the guard refuses the probe form of its own path', () => {
  assert.equal(run(`node ${GUARD} --probe`).denied, true, 'the guard does not refuse its probe')
})

// `npm test` puts `npm_lifecycle_event` in this process's environment and every
// child inherits it, so a probe run from here looks to itself exactly like one
// an installer wrapped in a package script. That is the state the next test is
// about; this one has to be run outside it.
const withoutNpm = () => {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('npm_')) delete env[name]
  return env
}

// The half an installer reads. A probe that exits 0, or that says nothing about
// which state it observed, is worse than no probe: it turns an ambiguous silence
// into a confident one.
test('the probe reports not loaded, loudly, when nothing intercepts it', () => {
  let failed = null
  try {
    execFileSync('node', [GUARD, '--probe'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: withoutNpm(),
    })
  } catch (error) {
    failed = error
  }
  assert.notEqual(failed, null, 'the probe exited 0, so a session cannot tell loaded from inert')
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /NOT loaded/)
  // The three things the reader has to leave with: which process is unprotected,
  // why being configured did not help, and what to do about it.
  assert.match(failed.stderr, /in this process/)
  assert.match(failed.stderr, /read once/)
  assert.match(failed.stderr, /Restart/)
})

// A script runner re-invokes through a shell of its own, so the hook is shown
// `npm run <name>` and the file name the rule matches on is nowhere in that
// line. The probe would then run in a session where the guard is loaded and
// report it absent, which is the one wrong answer that looks like a right one.
// ADR 0027.
test('the probe refuses to report at all when a package script is in the way', () => {
  let failed = null
  try {
    execFileSync('node', [GUARD, '--probe'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...withoutNpm(), npm_lifecycle_event: 'probe' },
    })
  } catch (error) {
    failed = error
  }
  assert.notEqual(failed, null, 'a probe that cannot be refused must not report')
  assert.doesNotMatch(failed.stderr, /NOT loaded/, 'it answered a question it could not observe')
  assert.match(failed.stderr, /not through a package script/)
  // The remedy has to be the command that works, not a restart. A restart
  // cannot fix a state that is not wrong.
  assert.match(failed.stderr, /node scripts\/guard-merge\.mjs --probe/)
  // And the message has to name the runners it means. #110 measured npm 11.12.1,
  // pnpm 10.34.5, yarn 1.22.22 and yarn 4.18.0 all setting `npm_lifecycle_event`
  // on a `run`, so a message blaming npm alone tells a pnpm reader something
  // false about why they were refused. Pinned here because narrowing it back is
  // a one-word edit, and the words are the whole of a guard's interface at the
  // moment someone is deciding whether to trust it.
  assert.match(failed.stderr, /pnpm/)
  assert.match(failed.stderr, /yarn/)
})

const SOURCE = readFileSync(GUARD, 'utf8')

// The second way `check-setup.mjs` depends on this file. Layer 2's report now
// tells the reader to ask the guard whether it is loaded, which is a command
// only this file can answer, and the two agree on a path and a flag and nothing
// else, which is exactly the shape the DEFAULT_BRANCH pin below exists for. So
// the line check-setup.mjs prints is rebuilt from its own source here and handed
// to the guard, which has to refuse it.
const CHECK_SETUP = readFileSync(
  fileURLToPath(
    new URL('../.agents/skills/orchestrated-delivery/assets/check-setup.mjs', import.meta.url),
  ),
  'utf8',
)

test('the probe line check-setup.mjs prints is one this guard refuses', () => {
  const path = CHECK_SETUP.match(/^const MERGE_GUARD = ['"]([^'"]+)['"]/m)?.[1]
  assert.ok(path, 'check-setup.mjs declares no MERGE_GUARD, so the path it prints is a guess here')
  const flag = /node \$\{PROBE_TARGET\} (--[\w-]+)/.exec(CHECK_SETUP)?.[1]
  assert.equal(flag, '--probe', 'check-setup.mjs prints a flag this guard does not answer to')
  assert.equal(
    run(`node ${path} ${flag}`).denied,
    true,
    'the guard does not refuse the line check-setup.mjs tells the reader to run',
  )
})

// The knob and the check that reads it are two files agreeing on a shape.
// `check-setup.mjs` matches this line to tell an installer their guard is
// protecting a branch their repository does not have, and it can only report
// that if the declaration keeps the form it greps for.
test('DEFAULT_BRANCH is declared in the form check-setup.mjs reads', () => {
  const declared = SOURCE.match(/^const DEFAULT_BRANCH = ['"]([^'"]+)['"]/m)?.[1]
  assert.equal(declared, 'main', 'check-setup.mjs cannot find the guard\'s DEFAULT_BRANCH')
})

// ADR 0029's reason for refusing a shared module: what a repository is handed
// has to be one file, because a two-file asset is a setup step that gets half
// done. An import added here would be invisible until somebody's install broke.
test('the asset is one file, with nothing to import beside it', () => {
  const imports = [...SOURCE.matchAll(/^\s*(?:import\b[^\n]*from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/gm)]
  const local = imports.map((m) => m[1]).filter((specifier) => specifier.startsWith('.'))
  assert.deepEqual(local, [], 'the shipped guard cannot depend on a file beside it')
})
