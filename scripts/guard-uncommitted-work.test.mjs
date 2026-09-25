// The merge guards' second rule, #188 and ADR 0069: a destructive git command is
// refused when the tree it acts on holds uncommitted work, and allowed on a clean
// tree and in a linked worktree.
//
// Both guards carry the rule as one marked region, which command-reader.test.mjs
// holds to one text. This file drives the rule through each whole guard, from a
// real `PreToolUse` payload against a real main checkout and a real linked
// worktree, because the part a text comparison cannot see is the part that asks
// git about a directory. Both directions matter: a false positive on the
// worktree, the remedy, is how a guard gets switched off.
//
//   npm test
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GUARDS = {
  'scripts/guard-merge.mjs': fileURLToPath(new URL('./guard-merge.mjs', import.meta.url)),
  'assets/guard-merge.mjs': fileURLToPath(
    new URL('../.agents/skills/orchestrated-delivery/assets/guard-merge.mjs', import.meta.url),
  ),
}

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'b-fac-uncommitted-')))
const MAIN = join(root, 'main')
const LINKED = join(root, 'linked')
const slash = (path) => path.replaceAll('\\', '/')

const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

before(() => {
  mkdirSync(MAIN)
  git(MAIN, 'init', '--quiet', '--initial-branch=main')
  git(MAIN, 'config', 'user.name', 'test')
  git(MAIN, 'config', 'user.email', 'test@example.invalid')
  git(MAIN, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(MAIN, 'tracked.txt'), 'one\n')
  writeFileSync(join(MAIN, '.gitignore'), 'node_modules/\n')
  git(MAIN, 'add', 'tracked.txt', '.gitignore')
  git(MAIN, 'commit', '--quiet', '-m', 'init')
  git(MAIN, 'worktree', 'add', '--quiet', '-b', 'side', LINKED)
})
after(() => rmSync(root, { recursive: true, force: true }))

function reset() {
  for (const dir of [MAIN, LINKED]) {
    git(dir, 'reset', '--quiet', '--hard')
    git(dir, 'clean', '-qfdx')
  }
  git(MAIN, 'stash', 'clear')
}

function dirty(dir) {
  writeFileSync(join(dir, 'tracked.txt'), 'edited\n')
  writeFileSync(join(dir, 'new.txt'), 'untracked\n')
}

function run(guard, cwd, command) {
  const payload = {
    session_id: 'test',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  }
  const out = execFileSync('node', [guard], { input: JSON.stringify(payload), encoding: 'utf8' })
  if (!out.trim()) return { denied: false, reason: '' }
  const { permissionDecision, permissionDecisionReason } = JSON.parse(out).hookSpecificOutput
  return { denied: permissionDecision === 'deny', reason: permissionDecisionReason }
}

// Every command the rule names, each with the tree it is judged on.
const TREE_COMMANDS = [
  'git reset --hard',
  'git reset --hard origin/main',
  'git checkout -f',
  'git checkout --force side',
  'git switch --discard-changes side',
  'git checkout -- tracked.txt',
  'git checkout .',
  'git restore tracked.txt',
  'git restore --staged --worktree tracked.txt',
  'git clean -fd',
  'git clean -f',
]

for (const [name, guard] of Object.entries(GUARDS)) {
  for (const command of TREE_COMMANDS) {
    test(`${name}: \`${command}\` is refused in a dirty main checkout, and names what it would lose`, () => {
      reset()
      dirty(MAIN)
      const { denied, reason } = run(guard, MAIN, command)
      assert.equal(denied, true)
      assert.match(reason, command.includes('clean') ? /\?\? new\.txt/ : / M tracked\.txt/)
      assert.match(reason, /git -c guard\.destructive=ok/)
    })
    test(`${name}: \`${command}\` is allowed in a clean main checkout`, () => {
      reset()
      assert.equal(run(guard, MAIN, command).denied, false)
    })
    test(`${name}: \`${command}\` is allowed in a dirty linked worktree, where the work belongs`, () => {
      reset()
      dirty(LINKED)
      assert.equal(run(guard, LINKED, command).denied, false)
    })
  }

  test(`${name}: a restore from the index and a clean each count only what they touch`, () => {
    reset()
    writeFileSync(join(MAIN, 'new.txt'), 'untracked\n')
    // Nothing tracked is modified, so a restore or `checkout .` has nothing to lose.
    assert.equal(run(guard, MAIN, 'git checkout .').denied, false)
    assert.equal(run(guard, MAIN, 'git restore .').denied, false)
    reset()
    writeFileSync(join(MAIN, 'tracked.txt'), 'edited\n')
    // Nothing is untracked, so a clean has nothing to lose.
    assert.equal(run(guard, MAIN, 'git clean -fd').denied, false)
    // A path the command does not name is not its business.
    writeFileSync(join(MAIN, 'other.txt'), 'x\n')
    git(MAIN, 'add', 'other.txt')
    git(MAIN, 'commit', '--quiet', '-m', 'other')
    writeFileSync(join(MAIN, 'other.txt'), 'y\n')
    assert.equal(run(guard, MAIN, 'git checkout -- tracked.txt').denied, true)
    git(MAIN, 'checkout', '--', 'tracked.txt')
    assert.equal(run(guard, MAIN, 'git checkout -- tracked.txt').denied, false)
    git(MAIN, 'reset', '--quiet', '--hard', 'HEAD~1')
  })

  // A reset or a forced checkout rewrites tracked files and leaves untracked
  // ones alone, so a main checkout holding only a stray draft or log is not a
  // loss, and refusing it there would refuse harmless commands all day. The
  // exception is an untracked file the target tracks, which gets overwritten.
  test(`${name}: a reset or forced checkout over untracked files only is allowed, unless the target tracks one`, () => {
    reset()
    writeFileSync(join(MAIN, 'draft.md'), 'a PR body\n')
    for (const command of [
      'git reset --hard',
      'git reset --hard HEAD',
      'git checkout -f',
      'git switch -f',
      'git switch --discard-changes',
      'git checkout -f side',
    ]) {
      assert.equal(run(guard, MAIN, command).denied, false, command)
    }
    // `side` gains a tracked `draft.md`; checking it out or resetting to it
    // would overwrite the untracked one in main.
    git(LINKED, 'config', 'user.name', 'test')
    git(LINKED, 'config', 'user.email', 'test@example.invalid')
    writeFileSync(join(LINKED, 'draft.md'), 'side\n')
    git(LINKED, 'add', 'draft.md')
    git(LINKED, 'commit', '--quiet', '-m', 'draft on side')
    try {
      for (const command of ['git reset --hard side', 'git checkout -f side', 'git switch -f side']) {
        const { denied, reason } = run(guard, MAIN, command)
        assert.equal(denied, true, command)
        assert.match(reason, /\?\? draft\.md/)
      }
      assert.equal(run(guard, MAIN, 'git clean -fd').denied, true)
    } finally {
      git(LINKED, 'reset', '--quiet', '--hard', 'HEAD~1')
    }
  })

  test(`${name}: \`git clean -x\` counts ignored files, and a plain clean does not`, () => {
    reset()
    mkdirSync(join(MAIN, 'node_modules'))
    writeFileSync(join(MAIN, 'node_modules', 'x.js'), '1\n')
    assert.equal(run(guard, MAIN, 'git clean -fd').denied, false)
    assert.equal(run(guard, MAIN, 'git clean -fdx').denied, true)
  })

  test(`${name}: what does not destroy anything is left alone`, () => {
    reset()
    dirty(MAIN)
    for (const command of [
      'git status',
      'git reset',
      'git reset --soft HEAD~1',
      'git checkout side',
      'git checkout -b feature',
      'git switch side',
      'git restore --staged tracked.txt',
      'git clean -n -f',
      'git clean -fn',
      'git stash push -u -m keep',
      'git worktree remove ../linked',
      'git commit -m "git reset --hard"',
      'gh issue comment 1 --body "run git reset --hard and git clean -fdx"',
    ]) {
      assert.equal(run(guard, MAIN, command).denied, false, command)
    }
  })

  // #182's case exactly: the only work was one new file.
  test(`${name}: \`git worktree remove --force\` on a worktree holding only an untracked file is refused, and names it`, () => {
    reset()
    writeFileSync(join(LINKED, 'zz-repro.test.ts'), 'new\n')
    for (const [cwd, command] of [
      [MAIN, 'git worktree remove --force ../linked'],
      [MAIN, `git worktree remove --force ${slash(LINKED)}`],
      [MAIN, 'git worktree remove -f ../linked'],
      [LINKED, `git worktree remove --force ${slash(LINKED)}`],
    ]) {
      const { denied, reason } = run(guard, cwd, command)
      assert.equal(denied, true, command)
      assert.match(reason, /\?\? zz-repro\.test\.ts/)
      assert.match(reason, /add -A/)
    }
  })

  test(`${name}: \`git worktree remove --force\` is allowed once only ignored files are left`, () => {
    reset()
    mkdirSync(join(LINKED, 'node_modules'))
    writeFileSync(join(LINKED, 'node_modules', 'x.js'), '1\n')
    assert.equal(run(guard, MAIN, 'git worktree remove --force ../linked').denied, false)
    reset()
    assert.equal(run(guard, MAIN, 'git worktree remove --force ../linked').denied, false)
  })

  test(`${name}: the stash is judged on the stash, in every worktree`, () => {
    reset()
    for (const cwd of [MAIN, LINKED]) {
      assert.equal(run(guard, cwd, 'git stash drop').denied, false)
      assert.equal(run(guard, cwd, 'git stash clear').denied, false)
    }
    writeFileSync(join(MAIN, 'tracked.txt'), 'somebody else\n')
    git(MAIN, 'stash', 'push', '--quiet', '-m', 'owner edits')
    for (const cwd of [MAIN, LINKED]) {
      const drop = run(guard, cwd, 'git stash drop')
      assert.equal(drop.denied, true)
      assert.match(drop.reason, /stash@\{0\}: On main: owner edits/)
      assert.equal(run(guard, cwd, 'git stash clear').denied, true)
      assert.equal(run(guard, cwd, 'git stash drop stash@{0}').denied, false)
    }
  })

  test(`${name}: \`git -C\` names the tree, and a tree it cannot read is refused`, () => {
    reset()
    dirty(MAIN)
    assert.equal(run(guard, LINKED, `git -C ${slash(MAIN)} reset --hard`).denied, true)
    assert.equal(run(guard, LINKED, 'git -C ../main reset --hard').denied, true)
    assert.equal(run(guard, MAIN, `git -C ${slash(LINKED)} reset --hard`).denied, false)
    assert.equal(run(guard, MAIN, 'git -C "$w" reset --hard').denied, true)
    assert.equal(run(guard, MAIN, 'git -C "$(git rev-parse --show-toplevel)" reset --hard').denied, true)
    assert.equal(run(guard, LINKED, `git --work-tree=${slash(MAIN)} reset --hard`).denied, true)
    assert.equal(run(guard, MAIN, 'git worktree remove --force "$w"').denied, true)
    // A path named through a variable only the shell knows could be any path.
    assert.equal(run(guard, MAIN, 'git checkout -- $f').denied, true)
  })

  // The hook inherits the harness's environment, as the shell does, so a path
  // built from one of those variables is read. `$LOCALAPPDATA/Temp/...` is how
  // an orchestrator here named a scratch worktree it then removed.
  test(`${name}: a path through an inherited variable is expanded, in each shell's spelling`, () => {
    reset()
    process.env.B_FAC_TEST_LINKED = LINKED
    try {
      for (const command of [
        'git worktree remove --force "$B_FAC_TEST_LINKED"',
        'git worktree remove --force ${B_FAC_TEST_LINKED}',
        'git worktree remove --force $env:B_FAC_TEST_LINKED',
      ]) {
        assert.equal(run(guard, MAIN, command).denied, false, `${command}, clean`)
      }
      writeFileSync(join(LINKED, 'zz-repro.test.ts'), 'new\n')
      assert.match(run(guard, MAIN, 'git worktree remove --force "$B_FAC_TEST_LINKED"').reason, /zz-repro/)
    } finally {
      delete process.env.B_FAC_TEST_LINKED
    }
  })

  test(`${name}: the rule follows a command into a nested shell`, () => {
    reset()
    dirty(MAIN)
    assert.equal(run(guard, MAIN, 'bash -c "git reset --hard"').denied, true)
    assert.equal(run(guard, MAIN, 'pwsh -Command "git clean -fd"').denied, true)
    assert.equal(run(guard, MAIN, 'git status && git reset --hard').denied, true)
  })

  test(`${name}: the override is a \`-c\` on git's own line, and nothing else overrides`, () => {
    reset()
    dirty(MAIN)
    assert.equal(run(guard, MAIN, 'git -c guard.destructive=ok reset --hard').denied, false)
    assert.equal(run(guard, MAIN, 'git -c Guard.Destructive=OK clean -fd').denied, false)
    assert.equal(run(guard, MAIN, 'GUARD_DESTRUCTIVE_OK=1 git reset --hard').denied, true)
    assert.equal(run(guard, MAIN, 'git -c guard.destructive=yes reset --hard').denied, true)
  })

  // NOT COVERED, pinned so that changing it is a decision. A PreToolUse hook
  // runs before its command, so the `cd` has not happened: the rule judges the
  // clean worktree the line starts in and allows a reset that lands on the dirty
  // main checkout. The refusal it gives elsewhere points at `git -C` instead.
  test(`${name}: a \`cd\` earlier on the line is not followed`, () => {
    reset()
    dirty(MAIN)
    assert.equal(run(guard, LINKED, 'cd ../main && git reset --hard').denied, false)
    assert.match(run(guard, MAIN, 'git reset --hard').reason, /git -C <path>/)
  })
}
