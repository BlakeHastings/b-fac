// The three write-boundary states, and the exit code each one earns.
//
// This file exists because of what happened to `check-vocabulary.mjs`: it
// reported green across twelve files while the entire payload sat outside its
// view. **A check that scans nothing passes**, and a mode-aware check has four
// new ways to scan nothing: skip the wrong layers, skip them all, read the
// mode as guest when it is not, or count nothing toward the exit code. So every
// case below asserts a failure as well as a pass, and the guest cases assert
// which layers were *not* reported as well as which were.
//
// The other half of the pairing is `guard-guest-writes.test.mjs`, which proves
// the gate refuses and allows the right commands. This one only proves that the
// report can see the gate, tell the mode, and be wrong out loud.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS = fileURLToPath(new URL('../.agents/skills/orchestrated-delivery/assets/', import.meta.url))
const CHECK = join(ASSETS, 'check-setup.mjs')
const GATE = join(ASSETS, 'guard-guest-writes.mjs')

// The exit code is measured here rather than inferred. This repository has
// mis-measured one three times by letting a pipe swallow it, so the child's
// status is read off the process and nothing else.
// `CLAUDE_CONFIG_DIR` relocates the operator's settings directory, and every
// case here sets it. The report reads `~/.claude/settings.json` now, because
// that is where the registration that reaches a worktree lives, and a test suite
// whose answer depends on whoever is running it is not a test suite.
function run(script, args, root, configDir = join(root, '.no-such-config')) {
  try {
    const stdout = execFileSync('node', [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    })
    return { code: 0, out: stdout }
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` }
  }
}

const check = (root, configDir) => run(CHECK, [], root, configDir)
const recordOwned = (root, script = CHECK) => run(script, ['--record-owned'], root)

// Where the gate and the machine record live, relative to a main checkout: the
// git common directory of a main checkout is its own `.git`. ADR 0037.
const FACTORY = '.git/factory'

const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

// A host repository with one tracked file, so that "nothing changed" is a
// comparison against a repo with contents rather than against an empty one.
function hostRepo() {
  const root = mkdtempSync(join(tmpdir(), 'check-setup-'))
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'agent@example.test'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'agent'], { cwd: root })
  // Whether the host repo can see the gate's scratch state is the promise these
  // tests check, and the developer running them may have `.claude/` in their own
  // global ignore file — this machine does. Pinning an empty one is what makes
  // the answer the repository's rather than the operator's.
  writeFileSync(join(root, '.git/empty-excludes'), '')
  execFileSync('git', ['config', 'core.excludesFile', join(root, '.git/empty-excludes')], { cwd: root })
  write(root, 'README.md', '# host\n')
  execFileSync('git', ['add', 'README.md'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'host repo'], { cwd: root })
  return root
}

const install = (root) => execFileSync('node', [GATE, '--install'], { cwd: root, encoding: 'utf8' })

// All four owned layers, present, wired and edited, in the smallest form each
// one accepts. Stand-ins rather than the real assets on purpose: what is under
// test here is which layers get reported, not the layer rules, which have not
// changed.
function installOwnedLayers(root) {
  write(root, 'docs/process/working-an-issue.md', 'Run npm run check, then open the PR.\n')
  write(root, 'docs/process/review.md', 'Three lenses: functionality, code, architecture.\n')
  write(root, '.github/pull_request_template.md', '## Functionality\n## Code\n## Architecture\n')
  write(root, '.github/workflows/ci.yml', 'name: Checks\njobs:\n  audit:\n    run: node scripts/check-main-provenance.mjs\n')
  write(root, 'scripts/merge-pr.mjs', "const REQUIRED = ['Checks']\n")
  write(root, 'scripts/guard-merge.mjs', "const DEFAULT_BRANCH = 'main'\n")
  write(root, 'scripts/check-main-provenance.mjs', "const BASELINE = 'a1b2c3d'\n")
  write(
    root,
    '.claude/settings.json',
    `${JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash|PowerShell',
              hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs"' }],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  )
}

const withRepo = (body) => {
  const root = hostRepo()
  try {
    body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// The row for one layer, from the first line to the blank one, so an assertion
// about layer 2 cannot accidentally be satisfied by layer 3's text.
function row(out, label) {
  const lines = out.split('\n')
  const at = lines.findIndex((line) => line.includes(`] ${label}.`))
  assert.notEqual(at, -1, `no row for layer ${label} in:\n${out}`)
  const end = lines.indexOf('', at)
  return lines.slice(at, end === -1 ? undefined : end).join('\n')
}

const statusOf = (out, label) => /\[ (\S+)\s*\]/.exec(row(out, label))[1]

// ---------------------------------------------------------------------------
// Guest: recorded, and the gate installed the way the skill says to install it
// ---------------------------------------------------------------------------

test('a guest repo with the gate installed exits 0, and reports no owned layer', () => {
  withRepo((root) => {
    install(root)
    const { code, out } = check(root)

    assert.equal(code, 0, `a correctly installed guest repo must exit 0:\n${out}`)
    assert.match(out, /Write boundary: guest, recorded in \.git\/factory\/machine\.md/)
    assert.equal(statusOf(out, 'G'), 'ok')
    for (const layer of ['0', '1', '2', '3']) {
      assert.equal(statusOf(out, layer), 'n/a', `layer ${layer} was reported in guest mode`)
    }
    // A permanently red line and a guard that cries wolf are the same failure,
    // so the absent layers have to read as explained rather than as missing.
    assert.doesNotMatch(out, /MISSING/, 'guest mode reported an owned layer as missing')
    // Wired is not loaded, and this script cannot tell the difference. Saying
    // so is the whole of ADR 0027.
    assert.match(out, /--probe/, 'it reports a gate as ok without naming the probe')
  })
})

test('the gate reports absent when the record says guest and nothing was installed', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, 'Write boundary: guest\n\nBacklog: beads, driven by `bd`\n')
    const { code, out } = check(root)

    assert.equal(code, 1, 'the state this check exists to catch exited 0')
    assert.equal(statusOf(out, 'G'), 'MISSING')
    assert.match(out, /guard-guest-writes\.mjs is absent/)
    // The remedy has to be one that runs. `node` on a file that is not there
    // fails in a way that reads as the gate being broken.
    assert.doesNotMatch(out, /guard-guest-writes\.mjs" --probe/)
    assert.match(out, /--install/)
  })
})

test('copied and unwired is absent, not partial, exactly as on layer 2', () => {
  withRepo((root) => {
    install(root)
    write(root, '.claude/settings.local.json', '{}\n')
    const { code, out } = check(root)

    assert.equal(code, 1, 'a gate no hook runs was accepted')
    assert.equal(statusOf(out, 'G'), 'MISSING')
    assert.match(out, /no PreToolUse hook runs it/)
  })
})

test('a single-tool matcher is a finding, because the second shell tool walks past it', () => {
  withRepo((root) => {
    install(root)
    const path = join(root, '.claude/settings.local.json')
    const settings = JSON.parse(readFileSync(path, 'utf8'))
    settings.hooks.PreToolUse[0].matcher = 'Bash'
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
    const { code, out } = check(root)

    assert.equal(code, 1)
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(out, /names one tool/)
  })
})

// ---------------------------------------------------------------------------
// The gate's own promise, which is the half a file listing cannot see
// ---------------------------------------------------------------------------

test('the wiring committed into the host repo is a finding, however well it works', () => {
  withRepo((root) => {
    install(root)
    // The gate and the record are inside `.git/` now and cannot be committed at
    // all, which is the point of ADR 0037. The wiring is the one file still in
    // the working tree, so it is the one that can still break the promise.
    execFileSync('git', ['add', '--force', '.claude/settings.local.json'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'oops'], { cwd: root })
    const { code, out } = check(root)

    assert.equal(code, 1, 'the boundary broke itself and the report was green')
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(out, /is tracked in this repository/)
  })
})

// The half of ADR 0021's mechanism that stops being load-bearing. An exclude
// line can be lost, reverted or never applied; a directory git does not look
// into cannot be seen however the exclude file is edited.
test('nothing the gate installs can be seen by the host repo even with the exclude blank', () => {
  withRepo((root) => {
    install(root)
    rmSync(join(root, '.claude'), { recursive: true, force: true })
    writeFileSync(join(root, '.git/info/exclude'), '')

    assert.equal(porcelain(root), '', 'the gate or the record showed up in git status')
    assert.equal(existsSync(join(root, `${FACTORY}/guard-guest-writes.mjs`)), true)
    assert.equal(existsSync(join(root, `${FACTORY}/machine.md`)), true)
  })
})

test("scratch state the host's git status can see is a finding", () => {
  withRepo((root) => {
    install(root)
    // What an install looks like with the exclude half undone, which is also
    // what a second checkout of the same repo would see.
    writeFileSync(join(root, '.git/info/exclude'), '')
    const { code, out } = check(root)

    assert.equal(code, 1)
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(out, /git status here shows/)
  })
})

test('wiring the gate through the tracked settings file is a finding', () => {
  withRepo((root) => {
    install(root)
    write(root, '.claude/settings.local.json', '{}\n')
    write(
      root,
      '.claude/settings.json',
      `${JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash|PowerShell',
                hooks: [{ type: 'command', command: 'node .factory/guard-guest-writes.mjs' }],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    )
    execFileSync('git', ['add', '.claude/settings.json'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'wire it the wrong way'], { cwd: root })
    const { code, out } = check(root)

    assert.equal(code, 1, "editing somebody else's tracked file passed")
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(out, /which is tracked here/)
  })
})

test('the unedited Backlog placeholder is a note, so a fresh install still exits 0', () => {
  withRepo((root) => {
    install(root)
    const fresh = check(root)
    assert.match(fresh.out, /note: the Backlog line/, '--install writes a placeholder nobody flags')
    assert.equal(fresh.code, 0, 'a note moved the exit code, which makes the first run red')

    const record = join(root, `${FACTORY}/machine.md`)
    writeFileSync(record, readFileSync(record, 'utf8').replace(/^Backlog:.*$/m, 'Backlog: beads'))
    assert.doesNotMatch(check(root).out, /note: the Backlog line/, 'the note survives being answered')
  })
})

// ---------------------------------------------------------------------------
// Owned, and the third state
// ---------------------------------------------------------------------------

test('a recorded owned repo reports the four layers and excuses the gate', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, 'Write boundary: owned\n')
    installOwnedLayers(root)
    const { code, out } = check(root)

    assert.equal(code, 0, `every owned layer is installed here:\n${out}`)
    assert.match(out, /Write boundary: owned, recorded in/)
    for (const layer of ['0', '1', '2', '3']) assert.equal(statusOf(out, layer), 'ok')
    assert.equal(statusOf(out, 'G'), 'n/a')
    assert.match(row(out, 'G'), /records this repository as owned/)
  })
})

test('an owned repo with a guest gate lying around is told the two disagree', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, 'Write boundary: owned\n')
    installOwnedLayers(root)
    write(root, `${FACTORY}/guard-guest-writes.mjs`, '// left behind\n')
    const { out } = check(root)

    assert.equal(statusOf(out, 'G'), 'n/a', 'a gate in an owned repo must not become a required layer')
    assert.match(row(out, 'G'), /One of\s+those two facts is wrong/)
  })
})

test('an unrecorded repo says so, is reported as owned, and the finding is not an error', () => {
  withRepo((root) => {
    installOwnedLayers(root)
    const { code, out } = check(root)

    // The point of the whole state, and #100 changed the reason without
    // changing the answer. It used to be that an owned repo could never be
    // anything but unrecorded; `--record-owned` ends that. What survives is
    // that the record is untracked by definition, so any checkout that is not
    // the operator's own has none and can never have one: a fresh CI clone
    // most of all. Failing on it would be red by construction there, which is
    // the second permanently red line ADR 0030 refuses. ADR 0039.
    assert.equal(code, 0, 'an unrecorded boundary was treated as a failure')
    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /machine\.md does not exist/)
    for (const layer of ['0', '1', '2', '3']) assert.equal(statusOf(out, layer), 'ok')
    assert.equal(statusOf(out, 'G'), 'n/a')
    assert.match(out, /Record it before the loop starts/)
    // The advice a guest repo must not follow, said before it is followed.
    assert.match(row(out, 'G'), /If this repository is not yours, do not install those/)
  })
})

test('an unrecorded repo missing an owned layer still fails on the layer', () => {
  withRepo((root) => {
    installOwnedLayers(root)
    rmSync(join(root, 'scripts/guard-merge.mjs'))
    const { code, out } = check(root)

    assert.equal(code, 1)
    assert.equal(statusOf(out, '2'), 'MISSING')
    assert.match(out, /Write boundary: NOT RECORDED/)
  })
})

// A record that exists and does not answer is the same state as no record, and
// the two want different fixes, so it says which one it found.
test('a record with no boundary line is unrecorded, and names the file', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, '# Machine facts\n\nBacklog: beads\n')
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /exists and has no "Write boundary:" line/)
  })
})

test('a boundary that is neither owned nor guest is unrecorded, and is quoted back', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, 'Write boundary: readonly\n')
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /which is neither owned nor guest/)
    assert.match(out, /"Write boundary: readonly"/)
  })
})

// ---------------------------------------------------------------------------
// --record-owned, the writer for the answer that had none
//
// Every case here asserts the state the writer did NOT reach as well as the one
// it did, because a writer has the same way of scanning nothing that a check
// has: write a record the reader cannot parse, write it and leave it visible to
// the host repo, write it over an answer somebody else gave, or not write at
// all and exit 0 anyway.
// ---------------------------------------------------------------------------

const porcelain = (root) =>
  execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' })

const excludeText = (root) => readFileSync(join(root, '.git/info/exclude'), 'utf8')

test('the owned answer can be recorded, and the reader accepts what the writer wrote', () => {
  withRepo((root) => {
    const written = recordOwned(root)
    assert.equal(written.code, 0, `recording the owned answer failed:\n${written.out}`)

    // The half that matters. The writer and the reader are in one file so they
    // cannot disagree about the shape of the line, and this is what says so.
    const { out } = check(root)
    assert.match(out, /Write boundary: owned, recorded in \.git\/factory\/machine\.md/)
    assert.doesNotMatch(out, /NOT RECORDED/, 'the record was written in a shape the reader ignores')
    assert.equal(statusOf(out, 'G'), 'n/a')
    assert.match(row(out, 'G'), /records this repository as owned/)
  })
})

test('recording the owned answer adds nothing the host repo can see, and no ignore rule', () => {
  withRepo((root) => {
    const before = porcelain(root)
    const excludeBefore = excludeText(root)
    assert.equal(recordOwned(root).code, 0)

    assert.equal(porcelain(root), before, 'the record is visible in git status')
    assert.match(readFileSync(join(root, `${FACTORY}/machine.md`), 'utf8'), /^Write boundary: owned$/m)
    // ADR 0037: the record is inside the git common directory, so there is
    // nothing to hide and nothing of anybody's to edit in order to hide it.
    assert.equal(excludeText(root), excludeBefore, 'it edited .git/info/exclude for no reason')
    assert.doesNotMatch(excludeText(root), /factory/, 'it added an exclude line it does not need')
  })
})

test('recording the owned answer installs nothing, because owned mode has no gate', () => {
  withRepo((root) => {
    assert.equal(recordOwned(root).code, 0)

    assert.equal(existsSync(join(root, '.claude/settings.local.json')), false, 'it wired a hook')
    assert.equal(existsSync(join(root, `${FACTORY}/guard-guest-writes.mjs`)), false, 'it copied a gate')

    installOwnedLayers(root)
    const { code, out } = check(root)
    assert.equal(code, 0, `a recorded owned repo with every layer installed must exit 0:\n${out}`)
    assert.equal(statusOf(out, 'G'), 'n/a', 'the gate became a layer in a repository that is ours')
  })
})

test('it refuses to overwrite an answer somebody already gave', () => {
  withRepo((root) => {
    write(root, `${FACTORY}/machine.md`, 'Write boundary: guest\n\nBacklog: beads\n')
    const { code, out } = recordOwned(root)

    assert.equal(code, 1, 'an existing answer was overwritten')
    assert.match(out, /already exists/)
    assert.match(out, /It says: Write boundary: guest/)
    assert.match(readFileSync(join(root, `${FACTORY}/machine.md`), 'utf8'), /^Write boundary: guest$/m)
  })
})

test('it refuses to record owned where the guest gate is installed', () => {
  withRepo((root) => {
    install(root)
    // The one state where writing `owned` would be wrong rather than merely
    // premature: a gate somebody installed, with its record deleted.
    rmSync(join(root, `${FACTORY}/machine.md`))
    const { code, out } = recordOwned(root)

    assert.equal(code, 1, 'a repository with the guest gate installed was recorded as owned')
    assert.match(out, /installing that gate is the guest/)
    assert.equal(existsSync(join(root, `${FACTORY}/machine.md`)), false, 'it wrote the record anyway')
  })
})

test('it refuses rather than writing a record where no checkout can be sure of finding it', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-setup-'))
  try {
    // A `.git` that stops the root search without being a repository git can
    // answer for. There is then no common directory to resolve, so there is
    // nowhere to put a record every checkout of the repository reads, and a
    // per-checkout record is the thing ADR 0037 exists to stop.
    mkdirSync(join(root, '.git'))
    const { code, out } = recordOwned(root)

    assert.equal(code, 1)
    assert.match(out, /`git` did not answer/)
    assert.equal(existsSync(join(root, `${FACTORY}/machine.md`)), false, 'it wrote the record anyway')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// The finding this whole issue was about. An unrecorded repository is told to
// record the boundary, and until #100 the only command it could name wrote
// `guest`. A remedy that cannot be run is what ADR 0029 says gets a layer
// switched off.
test('the unrecorded report names a command that writes each of the two answers', () => {
  withRepo((root) => {
    installOwnedLayers(root)
    const { code, out } = check(root)

    assert.equal(code, 0, 'an unrecorded boundary was treated as a failure')
    assert.match(out, /guard-guest-writes\.mjs --install/, 'the guest answer has no named writer')
    assert.match(out, /check-setup\.mjs --record-owned/, 'the owned answer has no named writer')
  })
})

test('a copied-in check-setup names itself by the path you would type', () => {
  withRepo((root) => {
    // The remedy has to be copy-pasteable from where it is printed, and the
    // installed case is `scripts/`, not the skill's asset directory.
    mkdirSync(join(root, 'scripts'), { recursive: true })
    const copied = join(root, 'scripts/check-setup.mjs')
    copyFileSync(CHECK, copied)

    assert.match(run(copied, [], root).out, /node scripts\/check-setup\.mjs --record-owned/)
    assert.match(recordOwned(root, copied).out, /node scripts\/check-setup\.mjs/)
  })
})

// ---------------------------------------------------------------------------
// A repository is not one directory
//
// #122, found by the owner on a real work repository in the first guest run and
// by nothing here. Every case below is run from a **linked worktree**, because
// that is where the subagents that push branches and open pull requests stand,
// and before this the report could not see a single thing about the repository
// from there.
// ---------------------------------------------------------------------------

function worktreeOf(root, name = 'wt') {
  const path = join(root, '..', `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  execFileSync('git', ['worktree', 'add', '--quiet', path, '-b', name], { cwd: root })
  return path
}

// The operator's settings directory, with the machine-wide block in it. Written
// here rather than by the installer for the reason the installer refuses to:
// putting a file in somebody's home directory is theirs to do.
function userConfig(root, scope) {
  const dir = join(root, '.git', 'fake-home')
  mkdirSync(dir, { recursive: true })
  const command =
    `node "${join(root, '.git/factory/guard-guest-writes.mjs').replace(/\\/g, '/')}"` +
    (scope === null ? '' : ` --scope "${scope.replace(/\\/g, '/')}"`)
  writeFileSync(
    join(dir, 'settings.json'),
    `${JSON.stringify(
      { hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command }] }] } },
      null,
      2,
    )}\n`,
  )
  return dir
}

test('the write boundary is read from a worktree, so the owned checklist is not offered', () => {
  withRepo((root) => {
    install(root)
    const worktree = worktreeOf(root)

    const { code, out } = check(worktree)

    // Before #122 this printed NOT RECORDED, reported layers 0 to 3 MISSING and
    // told the operator to install a merge wrapper, a guard and a CI workflow
    // into a repository they are a guest in.
    assert.match(out, /Write boundary: guest, recorded in/, 'the mode is invisible from a worktree')
    assert.match(out, /This is a linked worktree/)
    for (const layer of ['0', '1', '2', '3']) {
      assert.equal(statusOf(out, layer), 'n/a', `layer ${layer} was offered to a guest worktree`)
    }
    assert.doesNotMatch(out, /MISSING/, 'a worktree was told to install owned layers')
    // Wired in the main checkout only, which does not reach this session.
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.equal(code, 1)
    assert.match(row(out, 'G'), /have no wiring/)
    assert.match(row(out, 'G'), new RegExp(worktree.replace(/[\\/]/g, '.')))
  })
})

test('a per-checkout wiring is reported as covering only the checkouts that have one', () => {
  withRepo((root) => {
    install(root)
    const worktree = worktreeOf(root)
    assert.equal(check(root).code, 1, 'a repo with an unwired worktree reported green from the main checkout')
    assert.match(row(check(root).out, 'G'), /have no wiring/)

    // Installing into the worktree as well is the sound-but-manual answer, and
    // the report has to go green when somebody actually does it.
    execFileSync('node', [GATE, '--install'], { cwd: worktree, encoding: 'utf8' })
    const after = check(root)
    assert.equal(after.code, 0, `every checkout is wired now:\n${after.out}`)
    assert.equal(statusOf(after.out, 'G'), 'ok')
    assert.match(row(after.out, 'G'), /wired separately in each/)
  })
})

test('the machine-wide block covers every checkout, and the report says which', () => {
  withRepo((root) => {
    install(root)
    const worktree = worktreeOf(root)
    const config = userConfig(root, join(root, '.git'))

    for (const [where, at] of [['the main checkout', root], ['the worktree', worktree]]) {
      const { code, out } = check(at, config)
      assert.equal(code, 0, `the machine-wide block should cover ${where}:\n${out}`)
      assert.equal(statusOf(out, 'G'), 'ok')
      assert.match(row(out, 'G'), /registered machine-wide/)
      assert.match(row(out, 'G'), /2 checkout\(s\)/)
      assert.doesNotMatch(row(out, 'G'), /have no wiring/)
    }
  })
})

test('a machine-wide block scoped to a different repository does not count', () => {
  withRepo((root) => {
    install(root)
    const worktree = worktreeOf(root)
    const config = userConfig(root, join(root, '..', 'somebody-elses', '.git'))

    const { code, out } = check(worktree, config)
    assert.equal(code, 1, 'a hook scoped elsewhere was counted as covering this repository')
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(row(out, 'G'), /have no wiring/)
  })
})

test('a machine-wide block with no scope is the false positive ADR 0029 refused', () => {
  withRepo((root) => {
    install(root)
    const config = userConfig(root, null)

    const { code, out } = check(root, config)
    assert.equal(code, 1, 'a gate that refuses outward writes in every repo on the machine passed')
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(row(out, 'G'), /every repository on this machine/)
    assert.match(row(out, 'G'), /Add --scope/)
  })
})

test('--record-owned cannot write owned from a worktree of a repository recorded guest', () => {
  withRepo((root) => {
    install(root)
    const worktree = worktreeOf(root)

    const { code, out } = run(CHECK, ['--record-owned'], worktree)

    // Both of this command's refusals used to read the checkout, so from a
    // worktree neither could see anything and it wrote the opposite answer into
    // a second file. The repository then held two records disagreeing, which is
    // precisely what ADR 0039 built the refusals to prevent.
    assert.equal(code, 1, 'a worktree recorded the repository as owned over an installed gate')
    assert.match(out, /already exists|installing that gate is the guest/)
    assert.equal(existsSync(join(worktree, '.factory/machine.md')), false)
    assert.match(readFileSync(join(root, `${FACTORY}/machine.md`), 'utf8'), /^Write boundary: guest$/m)
  })
})

// The mode is a fact about the operator's authority, and no amount of
// repository inspection contains it. A work repository is on GitHub too.
test('a remote does not make a repo owned, and neither does an installed gate', () => {
  withRepo((root) => {
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/someone/theirs.git'], { cwd: root })
    install(root)
    rmSync(join(root, `${FACTORY}/machine.md`))
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/, 'the mode was inferred from the repository')
    assert.equal(statusOf(out, 'G'), 'n/a')
    assert.match(row(out, 'G'), /which is what guest mode looks like/)
  })
})
