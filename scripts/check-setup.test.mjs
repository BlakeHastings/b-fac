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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS = fileURLToPath(new URL('../.agents/skills/orchestrated-delivery/assets/', import.meta.url))
const CHECK = join(ASSETS, 'check-setup.mjs')
const GATE = join(ASSETS, 'guard-guest-writes.mjs')

// The exit code is measured here rather than inferred. This repository has
// mis-measured one three times by letting a pipe swallow it, so the child's
// status is read off the process and nothing else.
function check(root) {
  try {
    const stdout = execFileSync('node', [CHECK], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out: stdout }
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` }
  }
}

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
    assert.match(out, /Write boundary: guest, recorded in \.factory\/machine\.md/)
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
    write(root, '.factory/machine.md', 'Write boundary: guest\n\nBacklog: beads, driven by `bd`\n')
    const { code, out } = check(root)

    assert.equal(code, 1, 'the state this check exists to catch exited 0')
    assert.equal(statusOf(out, 'G'), 'MISSING')
    assert.match(out, /guard-guest-writes\.mjs is absent/)
    // The remedy has to be one that runs. `node` on a file that is not there
    // fails in a way that reads as the gate being broken.
    assert.doesNotMatch(out, /node \.factory\/guard-guest-writes\.mjs --probe/)
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

test('a gate committed into the host repo is a finding, however well it works', () => {
  withRepo((root) => {
    install(root)
    execFileSync('git', ['add', '--force', '.factory'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'oops'], { cwd: root })
    const { code, out } = check(root)

    assert.equal(code, 1, 'the boundary broke itself and the report was green')
    assert.equal(statusOf(out, 'G'), 'PARTIAL')
    assert.match(out, /is tracked in this repository/)
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

    const record = join(root, '.factory/machine.md')
    writeFileSync(record, readFileSync(record, 'utf8').replace(/^Backlog:.*$/m, 'Backlog: beads'))
    assert.doesNotMatch(check(root).out, /note: the Backlog line/, 'the note survives being answered')
  })
})

// ---------------------------------------------------------------------------
// Owned, and the third state
// ---------------------------------------------------------------------------

test('a recorded owned repo reports the four layers and excuses the gate', () => {
  withRepo((root) => {
    write(root, '.factory/machine.md', 'Write boundary: owned\n')
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
    write(root, '.factory/machine.md', 'Write boundary: owned\n')
    installOwnedLayers(root)
    write(root, '.factory/guard-guest-writes.mjs', '// left behind\n')
    const { out } = check(root)

    assert.equal(statusOf(out, 'G'), 'n/a', 'a gate in an owned repo must not become a required layer')
    assert.match(row(out, 'G'), /One of\s+those two facts is wrong/)
  })
})

test('an unrecorded repo says so, is reported as owned, and the finding is not an error', () => {
  withRepo((root) => {
    installOwnedLayers(root)
    const { code, out } = check(root)

    // The point of the whole state. ADR 0021 keeps machine facts out of the
    // tree, so an owned repo has no committable place to record the boundary
    // and can never be anything but unrecorded. Failing on that would put a
    // second permanently red line in a check that already spends its one.
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
    write(root, '.factory/machine.md', '# Machine facts\n\nBacklog: beads\n')
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /exists and has no "Write boundary:" line/)
  })
})

test('a boundary that is neither owned nor guest is unrecorded, and is quoted back', () => {
  withRepo((root) => {
    write(root, '.factory/machine.md', 'Write boundary: readonly\n')
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/)
    assert.match(out, /which is neither owned nor guest/)
    assert.match(out, /"Write boundary: readonly"/)
  })
})

// The mode is a fact about the operator's authority, and no amount of
// repository inspection contains it. A work repository is on GitHub too.
test('a remote does not make a repo owned, and neither does an installed gate', () => {
  withRepo((root) => {
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/someone/theirs.git'], { cwd: root })
    install(root)
    rmSync(join(root, '.factory/machine.md'))
    const { out } = check(root)

    assert.match(out, /Write boundary: NOT RECORDED/, 'the mode was inferred from the repository')
    assert.equal(statusOf(out, 'G'), 'n/a')
    assert.match(row(out, 'G'), /which is what guest mode looks like/)
  })
})
