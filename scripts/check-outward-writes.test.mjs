// What the publish-time report can see, what it must refuse to claim, and the
// exit code each state earns.
//
// **A check that scans nothing passes**, and this one has more ways to do that
// than most: read no reflog, read the wrong reflog, read a fetch as a push,
// read a push as a fetch, let a marker hide what is below it, or read a
// repository through the one checkout that cannot see the answer. Every case
// below therefore asserts a failure as well as a pass, and the attribution
// cases assert both directions of the one discrimination the whole design rests
// on: a push made here reads differently from a push made by somebody else.
//
// Real repositories with real remotes throughout. A fabricated reflog would
// test this file's idea of what git writes rather than what git writes, and the
// only reason the design works at all is a measurement of the latter.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS = fileURLToPath(new URL('../.agents/skills/orchestrated-delivery/assets/', import.meta.url))
const CHECK = join(ASSETS, 'check-outward-writes.mjs')
const GATE = join(ASSETS, 'guard-guest-writes.mjs')

// The exit code is read off the child process. This repository has lost one to
// a pipeline five times, and the difference between 1 and 2 here is the whole
// difference between "you pushed" and "I could not look".
function run(root, args = []) {
  try {
    return { code: 0, out: execFileSync('node', [CHECK, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` }
  }
}

const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

// A bare repository standing in for the forge, and a clone of it that has one
// commit and has pushed nothing. No network anywhere in this file.
function hosted() {
  const dir = mkdtempSync(join(tmpdir(), 'outward-'))
  const remote = join(dir, 'host.git')
  const root = join(dir, 'repo')
  execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', remote])
  execFileSync('git', ['clone', '--quiet', remote, root])
  git(root, 'config', 'user.email', 'agent@example.test')
  git(root, 'config', 'user.name', 'agent')
  git(root, 'checkout', '--quiet', '-B', 'main')
  writeFileSync(join(root, 'README.md'), '# host\n')
  git(root, 'add', 'README.md')
  git(root, 'commit', '--quiet', '-m', 'initial')
  return { dir, remote, root }
}

const record = (root, mode) => {
  mkdirSync(join(root, '.git/factory'), { recursive: true })
  writeFileSync(join(root, '.git/factory/machine.md'), `# Machine facts\n\nWrite boundary: ${mode}\n`)
}

const cleanup = (repo) => rmSync(repo.dir, { recursive: true, force: true })

// ---------------------------------------------------------------------------
// The one discrimination everything else rests on
// ---------------------------------------------------------------------------

test('a push from this repository is found, and named', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 1)
    assert.match(out, /\[ FOUND/)
    assert.match(out, /refs\/remotes\/origin\/main/)
    assert.match(out, /This repository is a guest and it pushed/)
  } finally {
    cleanup(repo)
  }
})

test('somebody else pushing and us fetching is not read as a push of ours', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    // A second clone is a different developer. Ours only ever fetches.
    const other = join(repo.dir, 'colleague')
    execFileSync('git', ['clone', '--quiet', repo.remote, other])
    git(other, 'config', 'user.email', 'other@example.test')
    git(other, 'config', 'user.name', 'other')
    writeFileSync(join(other, 'theirs.md'), 'theirs\n')
    git(other, 'add', 'theirs.md')
    git(other, 'commit', '--quiet', '-m', 'theirs')
    git(other, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main')
    git(repo.root, 'fetch', '--quiet', 'origin')

    // The remote-tracking ref moved and there is a reflog entry for it. The
    // whole question is whether this file reads that entry as ours.
    assert.match(git(repo.root, 'reflog', 'show', '--format=%gs', 'refs/remotes/origin/main'), /fetch/)

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /\[ CLEAR/)
    assert.match(out, /no remote-tracking ref in this repository records a push/)
  } finally {
    cleanup(repo)
  }
})

test('a --dry-run push is not a push', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'push', '--dry-run', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /\[ CLEAR/)
  } finally {
    cleanup(repo)
  }
})

test('a reflog message on a remote-tracking ref that is neither is UNCHECKED, not clear', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'push', '--quiet', 'origin', 'main')
    // The failure this guards against is a git that words `update by push`
    // differently: a translation, a rename, a version this was not measured
    // on. Reading an unrecognised message as "not a push" is how this layer
    // would come to scan nothing and report clear.
    const log = join(repo.root, '.git/logs/refs/remotes/origin/main')
    writeFileSync(log, readFileSync(log, 'utf8').replace('update by push', 'aktualisiert durch push'))

    const { code, out } = run(repo.root)
    assert.equal(code, 2)
    assert.match(out, /\[ UNCHECKED/)
    assert.match(out, /aktualisiert durch push/)
    assert.match(out, /could not look/)
  } finally {
    cleanup(repo)
  }
})

test('a push is timed by when it was pushed, not by when the commit was made', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    // The two clocks are the same second in anything written by hand, which is
    // how `%ct`, the *commit's* committer date, passed for the reflog entry's
    // own time until a marker test disagreed with it. A branch committed last
    // year and pushed today has to read as today, or the window silently hides
    // the push it exists to catch.
    writeFileSync(join(repo.root, 'old.md'), 'old\n')
    git(repo.root, 'add', 'old.md')
    execFileSync('git', ['commit', '--quiet', '-m', 'last year'], {
      cwd: repo.root,
      env: { ...process.env, GIT_COMMITTER_DATE: '2025-01-02T03:04:05+00:00', GIT_AUTHOR_DATE: '2025-01-02T03:04:05+00:00' },
    })
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 1)
    assert.doesNotMatch(out, /2025-01-02/)
    assert.match(out, new RegExp(`refs/remotes/origin/main {2}${new Date().toISOString().slice(0, 10)}`))
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// Refusing to claim what it cannot see
// ---------------------------------------------------------------------------

test('reflogs switched off is UNCHECKED and exit 2, never a clean report', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'config', 'core.logAllRefUpdates', 'false')
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    // The ref moved and git wrote nothing, which is the state that would make a
    // naive reader announce that nothing was pushed.
    assert.equal(git(repo.root, 'reflog', 'show', '--format=%gs', 'refs/remotes/origin/main'), '')

    const { code, out } = run(repo.root)
    assert.equal(code, 2)
    assert.match(out, /\[ UNCHECKED/)
    assert.match(out, /core\.logAllRefUpdates is false/)
    assert.doesNotMatch(out, /No push from this repository is on the record/)
  } finally {
    cleanup(repo)
  }
})

test('outside a git repository it exits 2 rather than reporting nothing found', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outward-bare-'))
  try {
    const { code, out } = run(dir)
    assert.equal(code, 2)
    assert.match(out, /Not inside a git repository/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// The mode decides the verdict and never the facts
// ---------------------------------------------------------------------------

test('an owned repository reports the same push and does not call it a finding', () => {
  const repo = hosted()
  try {
    record(repo.root, 'owned')
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /\[ FOUND/)
    assert.match(out, /refs\/remotes\/origin\/main/)
    assert.match(out, /recorded as owned, so a push is the workflow/)
  } finally {
    cleanup(repo)
  }
})

test('an unrecorded boundary prints the push and refuses to accuse', () => {
  const repo = hosted()
  try {
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /\[ FOUND/)
    assert.match(out, /will not accuse a repository nobody has called a/)
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// The marker, and the baseline hazard it inherits
// ---------------------------------------------------------------------------

test('--mark moves the window forward and keeps what is below the line visible', async () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'push', '--quiet', 'origin', 'main')
    assert.equal(run(repo.root).code, 1)

    // Reflog timestamps have one-second resolution, so the marker has to land
    // in a later second than the push for the window to mean anything.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const marked = run(repo.root, ['--mark'])
    assert.equal(marked.code, 0)
    assert.match(marked.out, /1 push\(es\) now sit below the line/)

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /Window: since /)
    // Still printed. `check-main-provenance.mjs` forbids moving a baseline to
    // silence a failure and the same hazard is here, so the marker changes the
    // verdict and never the record.
    assert.match(out, /before the marker, which the marker does not erase/)
    assert.match(out, /refs\/remotes\/origin\/main/)
  } finally {
    cleanup(repo)
  }
})

test('a push after the marker is found again', async () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    run(repo.root, ['--mark'])
    await new Promise((resolve) => setTimeout(resolve, 1100))
    git(repo.root, 'push', '--quiet', 'origin', 'main')

    const { code, out } = run(repo.root)
    assert.equal(code, 1)
    assert.match(out, /\[ FOUND/)
  } finally {
    cleanup(repo)
  }
})

test('a marker with no readable timestamp widens the window instead of hiding everything', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'push', '--quiet', 'origin', 'main')
    writeFileSync(join(repo.root, '.git/factory/last-publish'), 'nothing parseable here\n')

    const { code, out } = run(repo.root)
    assert.equal(code, 1)
    assert.match(out, /has no readable "Marked:" line/)
    assert.match(out, /\[ FOUND/)
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// The gate's refusals, which are the other half of the answer
// ---------------------------------------------------------------------------

test('the gate records what it refused, and the report reads it', () => {
  const repo = hosted()
  try {
    execFileSync('node', [GATE, '--install'], { cwd: repo.root, encoding: 'utf8' })
    const gate = join(repo.root, '.git/factory/guard-guest-writes.mjs')
    for (const command of ['git push origin HEAD', 'gh issue comment 4 --body hi']) {
      execFileSync('node', [gate], { cwd: repo.root, input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' })
    }

    const log = readFileSync(join(repo.root, '.git/factory/refusals.log'), 'utf8')
    assert.match(log, /\tgit push origin\tgit-push\n/)
    assert.match(log, /\tgh issue comment\tgh-write-verb\n/)

    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /the gate refused 2 outward write\(s\)/)
    assert.match(out, /git push origin {2}\(git-push\)/)
  } finally {
    cleanup(repo)
  }
})

test('the probe is refused and is not recorded as an attempted write', () => {
  const repo = hosted()
  try {
    execFileSync('node', [GATE, '--install'], { cwd: repo.root, encoding: 'utf8' })
    const gate = join(repo.root, '.git/factory/guard-guest-writes.mjs')
    const verdict = execFileSync('node', [gate], {
      cwd: repo.root,
      input: JSON.stringify({ tool_input: { command: `node "${gate}" --probe` } }),
      encoding: 'utf8',
    })
    assert.match(verdict, /"permissionDecision":"deny"/)

    // Counting the probe would make "the boundary was tested" true in a session
    // where the only thing tested was the gate.
    const { out } = run(repo.root)
    assert.match(out, /has refused\s+nothing since it was installed/)
  } finally {
    cleanup(repo)
  }
})

test('the refusal log holds the head of the command and not its arguments', () => {
  const repo = hosted()
  try {
    execFileSync('node', [GATE, '--install'], { cwd: repo.root, encoding: 'utf8' })
    const gate = join(repo.root, '.git/factory/guard-guest-writes.mjs')
    execFileSync('node', [gate], {
      cwd: repo.root,
      input: JSON.stringify({
        tool_input: { command: 'GH_TOKEN=ghp_notarealsecretbutlooksliketone gh pr create --body "a very long body"' },
      }),
      encoding: 'utf8',
    })

    const log = readFileSync(join(repo.root, '.git/factory/refusals.log'), 'utf8')
    assert.match(log, /\tgh pr create\t/)
    assert.doesNotMatch(log, /ghp_notarealsecret/)
    assert.doesNotMatch(log, /a very long body/)
  } finally {
    cleanup(repo)
  }
})

test('an unwritable refusal log does not stop the gate refusing', () => {
  const repo = hosted()
  try {
    execFileSync('node', [GATE, '--install'], { cwd: repo.root, encoding: 'utf8' })
    const gate = join(repo.root, '.git/factory/guard-guest-writes.mjs')
    // A directory where the log file has to go. Appending to it throws, and a
    // gate that fails to refuse because it could not write a log would be worse
    // than one that keeps no log.
    mkdirSync(join(repo.root, '.git/factory/refusals.log'), { recursive: true })
    const verdict = execFileSync('node', [gate], {
      cwd: repo.root,
      input: JSON.stringify({ tool_input: { command: 'git push origin HEAD' } }),
      encoding: 'utf8',
    })
    assert.match(verdict, /"permissionDecision":"deny"/)
  } finally {
    cleanup(repo)
  }
})

test('no gate installed reads as no gate, not as a held boundary', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    const { out } = run(repo.root)
    assert.match(out, /is not installed, so nothing was refusing outward writes/)
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// One repository, every checkout
// ---------------------------------------------------------------------------

test('a linked worktree gets the same answer as the main checkout', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    const worktree = join(repo.dir, 'wt')
    git(repo.root, 'worktree', 'add', '--quiet', worktree, '-b', 'side')
    // The push is made from the worktree, which is where subagents stand and
    // where the boundary was invisible before ADR 0037.
    git(worktree, 'push', '--quiet', 'origin', 'side')

    for (const where of [repo.root, worktree]) {
      const { code, out } = run(where)
      assert.equal(code, 1, `from ${where}`)
      assert.match(out, /refs\/remotes\/origin\/side/)
      assert.match(out, /Write boundary: guest/)
    }
    assert.match(run(worktree).out, /This is a linked worktree/)
  } finally {
    cleanup(repo)
  }
})

test('a worktree can mark, and the main checkout sees the marker', async () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    const worktree = join(repo.dir, 'wt')
    git(repo.root, 'worktree', 'add', '--quiet', worktree, '-b', 'side')
    git(repo.root, 'push', '--quiet', 'origin', 'main')
    await new Promise((resolve) => setTimeout(resolve, 1100))

    assert.equal(run(worktree, ['--mark']).code, 0)
    const { code, out } = run(repo.root)
    assert.equal(code, 0)
    assert.match(out, /Window: since /)
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// --remote, which is opt-in and never a verdict
// ---------------------------------------------------------------------------

test('--remote names a branch on the remote and still does not fail the report', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    // Pushed by a route this file cannot see: a URL, so no remote-tracking ref
    // and no reflog entry. Measured behaviour, and the reason --remote exists.
    git(repo.root, 'push', '--quiet', repo.remote, 'HEAD:refs/heads/main')
    assert.equal(git(repo.root, 'for-each-ref', 'refs/remotes'), '')

    const blind = run(repo.root)
    assert.equal(blind.code, 0)
    assert.match(blind.out, /\[ CLEAR/)

    const { code, out } = run(repo.root, ['--remote'])
    assert.equal(code, 0, 'an unattributable observation must never fail this report')
    assert.match(out, /also exist on origin/)
    assert.match(out, /main/)
  } finally {
    cleanup(repo)
  }
})

test('without --remote the report says the remote was not asked', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    assert.match(run(repo.root).out, /not asked\. `--remote`/)
  } finally {
    cleanup(repo)
  }
})

test('--remote with no reachable remote is UNCHECKED rather than an absence of branches', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    git(repo.root, 'remote', 'set-url', 'origin', join(repo.dir, 'gone.git'))

    const { code, out } = run(repo.root, ['--remote'])
    assert.equal(code, 2)
    assert.match(out, /did not answer/)
  } finally {
    cleanup(repo)
  }
})

// ---------------------------------------------------------------------------
// The honest half, which is the part most likely to be quietly dropped
// ---------------------------------------------------------------------------

test('every run says what it cannot see and who has to say the rest', () => {
  const repo = hosted()
  try {
    record(repo.root, 'guest')
    const clean = run(repo.root).out
    git(repo.root, 'push', '--quiet', 'origin', 'main')
    const dirty = run(repo.root).out

    for (const out of [clean, dirty]) {
      assert.match(out, /keeps no local record of what it wrote/)
      assert.match(out, /curl, glab/)
      assert.match(out, /--probe/)
      assert.match(out, /it stays yours to write/)
    }
  } finally {
    cleanup(repo)
  }
})
