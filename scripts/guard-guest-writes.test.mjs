// Both directions, for the asset that holds guest mode's write boundary.
//
// A gap lets an outward write through; a false positive gets the gate switched
// off, and the second is the likelier failure. This repo's own guard shipped
// three false positives in a day, so the allow cases below carry at least as
// much weight as the deny cases — and here there are more of them, because
// guest mode's premise is that reads are unrestricted.
//
// The third direction is the one this file exists for as much as either of
// those: **owned mode is unaffected**. Every command the guest gate refuses is
// run through the owned-mode merge guard and has to come back allowed, because
// a boundary that leaks into the mode it was not written for is a boundary
// nobody will keep installed.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/guard-guest-writes.mjs', import.meta.url),
)
const OWNED_GUARD = fileURLToPath(new URL('./guard-merge.mjs', import.meta.url))

function run(guard, command) {
  const out = execFileSync('node', [guard], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  if (!out.trim()) return { denied: false, reason: '' }
  const decision = JSON.parse(out).hookSpecificOutput
  return { denied: decision.permissionDecision === 'deny', reason: decision.permissionDecisionReason }
}

const DENIED = [
  // A push is the outward write the boundary is named for.
  'git push',
  'git push origin HEAD',
  'git push -u origin backlog/12-eligibility',
  'git push --force origin feature',
  'git -C /work/repo push origin HEAD',
  // Every `gh` verb that is not a read. These are ordinary commands in owned
  // mode, which is exactly why the boundary needs a shape rather than a
  // sentence: nothing about them looks wrong.
  'gh pr create --fill',
  'gh issue create --title "Parcel import loses leading zeros"',
  'gh issue comment 45 --body "picked this up"',
  'gh issue close 45',
  'gh pr review 12 --approve',
  'gh repo create permits/intake --private',
  'gh secret set DEPLOY_KEY',
  'gh workflow run checks.yml',
  'gh label create area:zoning',
  // Installs into the operator's home directory, not into this repo.
  'gh extension install owner/gh-thing',
  // The merge rules the owned guard already holds are inside this boundary too,
  // and arrive here by the general rule rather than by a special case.
  'gh pr merge 42 --squash',
  // `gh api` defaults to GET and becomes a POST the moment it is handed a
  // field, so the method is not always written down. Both forms are the write.
  'gh api --method POST repos/o/r/issues',
  'gh api -X PATCH repos/o/r/issues/3',
  'gh api repos/o/r/issues/3/comments -f body="done"',
  'gh api --method=DELETE repos/o/r/issues/3',
  // The home directory and the machine, which are outside the repository in
  // the most literal sense the boundary has.
  'git config --global user.email agent@example.com',
  'git config --system core.autocrlf true',
  // The two beads commands that write tracked files into a host repo. Both are
  // named in references/beads-backlog.md as things to remember not to run,
  // which is layer 0, which is what this file replaces.
  'bd init',
  'bd init --skip-agents',
  'bd setup claude',
  'bd setup claude --stealth',
  // Every way one command follows another, because reading the head of each
  // command is what stops the whole thing degrading into a text scan.
  'npm run check && git push origin HEAD',
  'cd repo; gh pr create --fill',
  'git status || git push',
  'npm run check\ngit push origin HEAD',
  '(cd repo && git push)',
  'echo "$(gh pr create --fill)"',
  "echo don't && git push origin HEAD",
  // Each shell tool the hook is wired to can invoke the other one.
  'bash -c "git push origin HEAD"',
  'pwsh -Command "gh issue create --title x"',
  // The probe is refused on purpose: being refused is its answer.
  'node .factory/guard-guest-writes.mjs --probe',
  'node C:\\work\\repo\\.factory\\guard-guest-writes.mjs --probe',
]

const ALLOWED = [
  // Reads are unrestricted. Pulling the host's ticket in is the normal case,
  // and a gate that made it awkward would be uninstalled within a day.
  'gh issue view 4102',
  'gh issue list --label area:zoning --limit 0',
  'gh pr view 42 --json statusCheckRollup',
  'gh pr diff 42',
  'gh pr checks 42',
  'gh pr checkout 42',
  'gh repo clone permits/intake',
  'gh run view 991 --log',
  'gh run download 991',
  'gh search issues "leading zero" --repo permits/intake',
  'gh auth status',
  'gh api repos/o/r/issues/3',
  'gh api repos/{owner}/{repo}/issues?state=open',
  // Contacts the remote and changes nothing, which is how you rehearse the
  // publish step without taking it.
  'git push --dry-run origin HEAD',
  // Ordinary local work, all of it inside the boundary.
  'git status --porcelain -uall',
  'git fetch origin',
  'git pull --ff-only',
  'git commit -m "Import the parcel polygons"',
  'git checkout -b backlog/12-eligibility',
  'git config user.email agent@example.com',
  'npm run check',
  'node scripts/merge-pr.mjs 42',
  // The local store. `--stealth` is the whole difference and the gate reads it.
  'bd init --stealth',
  'bd create "Overlay the historic district" -t task -p 2',
  'bd comment permit-scratch-4sr --file review.md',
  'bd list --limit 0',
  // Empty and malformed payloads are not this gate's problem.
  '',
  '   ',

  // The false-positive class that got the merge guard denying a comment about
  // itself within seconds of first firing. In guest mode this is likelier, not
  // less likely: the review record in the local store describes the outward
  // writes the factory did not make.
  'git commit -m "Explain why we cannot push until the owner publishes"',
  'bd comment permit-scratch-4sr --file review.md # says gh pr create is denied',
  'echo "git push origin main"',
  'echo "gh issue create --title x"',
  "bd comment 1 --body \"$(cat <<'EOF'\n| git push | denied |\nEOF\n)\"",
  // Talking about the probe is not running it, and neither is editing it.
  'echo "node .factory/guard-guest-writes.mjs --probe"',
  'cat .factory/guard-guest-writes.mjs',
  'node .factory/guard-guest-writes.mjs --install',
  // Reading a command line means reading it all the way down, or the nested
  // case quietly reintroduces the text scan.
  'bash -c "echo git push origin main"',
  'pwsh -Command "git commit -m \'gh pr create is denied in guest mode\'"',
]

for (const command of DENIED) {
  test(`denies: ${command}`, () => {
    assert.equal(run(GATE, command).denied, true, 'should have been denied')
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command || '(empty)'}`, () => {
    assert.equal(run(GATE, command).denied, false, 'should have been allowed')
  })
}

// The allow direction that matters most, and the one the issue asked for by
// name. In owned mode these are the workflow, not a violation of it, and the
// gate that refuses them is simply not installed. Proving that here rather than
// asserting it means the two modes are held apart by a test rather than by
// whoever remembers which file went where.
const OWNED_MODE_UNAFFECTED = [
  'git push origin HEAD',
  'git push -u origin backlog/12-eligibility',
  'gh pr create --fill',
  'gh issue create --title "Parcel import loses leading zeros"',
  'gh issue comment 45 --body "picked this up"',
  'gh api repos/o/r/issues/3/comments -f body="done"',
  'gh label create area:zoning',
  'bd init --skip-agents',
  'git config --global user.email agent@example.com',
]

for (const command of OWNED_MODE_UNAFFECTED) {
  test(`owned mode is unaffected: ${command}`, () => {
    assert.equal(run(GATE, command).denied, true, 'the guest gate should refuse this')
    assert.equal(run(OWNED_GUARD, command).denied, false, 'the owned guard should not')
  })
}

test('a malformed payload does not deny', () => {
  const out = execFileSync('node', [GATE], { input: 'not json', encoding: 'utf8' })
  assert.equal(out.trim(), '')
})

// ADR 0027's probe and its rule were two files agreeing on a filename, and a
// rename would have turned the answer into a permanent, silent "inert". Here
// they are one file, so the only thing left to assert is that the file really
// does refuse itself.
test('the gate refuses the probe form of its own path', () => {
  assert.equal(run(GATE, `node ${GATE} --probe`).denied, true, 'the gate does not refuse its probe')
})

test('the probe reports inert, loudly, when nothing intercepts it', () => {
  let failed = null
  try {
    execFileSync('node', [GATE, '--probe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    failed = error
  }
  assert.notEqual(failed, null, 'the probe exited 0, so a session cannot tell inert from loaded')
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /NOT loaded/)
})

// --install is the half that decides whether any of the above is reachable, and
// it runs against a repository that is not ours. The assertion that matters is
// the last one: a host repo's `git status` is unchanged afterwards.
function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'guest-mode-'))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  return root
}

function install(root) {
  return execFileSync('node', [GATE, '--install'], { cwd: root, encoding: 'utf8' })
}

const status = (root) =>
  execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' })

test('--install leaves the host repo\'s git status empty', () => {
  const root = scratchRepo()
  try {
    // A tracked file, so the comparison is against a repo with contents rather
    // than against an empty one where anything would look clean.
    writeFileSync(join(root, 'README.md'), '# host\n')
    execFileSync('git', ['add', 'README.md'], { cwd: root })
    const before = status(root)

    install(root)

    assert.equal(existsSync(join(root, '.factory/guard-guest-writes.mjs')), true)
    assert.equal(existsSync(join(root, '.factory/machine.md')), true)
    assert.equal(existsSync(join(root, '.claude/settings.local.json')), true)
    assert.match(readFileSync(join(root, '.factory/machine.md'), 'utf8'), /^Write boundary: guest$/m)
    assert.equal(status(root), before, 'installing changed what the host repo sees')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install wires every shell-capable tool, not just Bash', () => {
  const root = scratchRepo()
  try {
    install(root)
    const settings = JSON.parse(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'))
    const entries = (settings.hooks?.PreToolUse ?? []).filter((entry) =>
      (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('guard-guest-writes')),
    )
    assert.equal(entries.length, 1)
    for (const tool of ['Bash', 'PowerShell']) {
      const covered = entries.some((entry) => new RegExp(`^(${entry.matcher})$`).test(tool))
      assert.equal(covered, true, `${tool} is not matched, so it walks past the gate`)
    }
    // `if` uses permission-rule syntax, which names one tool, so it reopens the
    // hole the matcher just closed.
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) assert.equal(hook.if, undefined)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install merges into local settings that are already there, and repeats safely', () => {
  const root = scratchRepo()
  const path = join(root, '.claude/settings.local.json')
  try {
    mkdirSync(join(root, '.claude'))
    writeFileSync(path, `${JSON.stringify({ env: { TZ: 'UTC' } }, null, 2)}\n`)

    install(root)
    install(root)

    const after = JSON.parse(readFileSync(path, 'utf8'))
    assert.deepEqual(after.env, { TZ: 'UTC' }, 'an existing key was lost')
    const ours = after.hooks.PreToolUse.filter((entry) =>
      (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('guard-guest-writes')),
    )
    assert.equal(ours.length, 1, 'a second install duplicated the hook entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install refuses to touch local settings it cannot parse', () => {
  const root = scratchRepo()
  try {
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, '.claude/settings.local.json'), '{ not json')
    let failed = null
    try {
      install(root)
    } catch (error) {
      failed = error
    }
    assert.notEqual(failed, null, 'it overwrote or ignored a file it could not read')
    assert.equal(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'), '{ not json')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
