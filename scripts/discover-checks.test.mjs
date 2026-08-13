// What discovery proposes, what it refuses to decide, and what it records.
//
// WHAT THIS PREVENTS
// Two failures, and the second is the one that matters.
//
// The first is the ordinary one: a collector stops recognising a shape and the
// proposal quietly changes. Every case below therefore asserts which evidence
// won, not merely that something was printed.
//
// The second is the failure this asset exists to make impossible. A check the
// factory invented and never executed is worse than no check, because it
// produces confident red or confident green about the wrong thing. So the
// recording path is tested from both ends: a command that exits 0 is recorded,
// and a command that exits non-zero leaves nothing behind. That pair is the
// whole design, and a suite that only proved the happy half would let the
// design be deleted without going red.
//
// The commands here are `node -e` and `npm run`, so the suite depends on the
// two tools it is already running under. Where a case needs a tool to be
// *absent*, it hands the child an empty PATH rather than hoping the runner
// lacks `make`, which ubuntu-latest does not.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DISCOVER = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/discover-checks.mjs', import.meta.url),
)

// Where the record lives, relative to a main checkout, whose git common
// directory is its own `.git`. It is there rather than in the working tree
// because every checkout of a repository needs the answer and an agent works in
// a worktree. ADR 0037.
const FACTORY = '.git/factory'

// The exit code is read off the process rather than inferred from the output.
// This repository has mis-measured one three times by letting a pipe swallow it.
//
// `process.execPath` rather than `node`, because the empty-PATH cases below
// give the child a PATH that cannot find one. Spawning by name there fails
// before the script starts, which reads as a discovery result and is not one.
function discover(root, args = [], env = process.env) {
  try {
    const stdout = execFileSync(process.execPath, [DISCOVER, ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
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

// A repository with one commit, so "nothing the host repo can see changed" is a
// comparison against a repo with contents rather than against an empty one.
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'discover-checks-'))
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'agent@example.test'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'agent'], { cwd: root })
  // Otherwise every fixture file emits a line-ending warning into the TAP
  // stream, and a suite whose output is mostly noise stops being read.
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root })
  for (const [rel, text] of Object.entries(files)) write(root, rel, text)
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'host repo'], { cwd: root })
  return root
}

const pkg = (scripts) => `${JSON.stringify({ name: 'host', version: '1.0.0', private: true, scripts }, null, 2)}\n`

// PATH with nothing on it, so a tool probe is deterministic on every platform.
// `node` is already running and is not looked up, so emptying PATH costs the
// script nothing it needs.
const noTools = () => ({ ...process.env, PATH: mkdtempSync(join(tmpdir(), 'empty-path-')) })

const porcelain = (root) =>
  execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' })

// The proposal block only, so an assertion that a command is *not* proposed
// cannot be satisfied by it merely being absent from the evidence listing.
const proposal = (out) => out.slice(out.indexOf('PROPOSED'))

// The escalation question is wrapped to the terminal, so a sentence in it is
// two lines with an indent between them. Asserting on the wrapped form would
// make the wrap width part of the contract, which it is not.
const flat = (out) => out.replace(/\s+/g, ' ')

test('an aggregate script in the repo task runner is the entry point', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(0)"', dev: 'node server.js' }) })
  const { code, out } = discover(root)

  assert.equal(code, 0)
  assert.match(out, /PROPOSED, from tier 1 evidence/)
  assert.match(proposal(out), /npm run check/)
  assert.doesNotMatch(proposal(out), /npm run dev/)
})

test('a task runner with no check-shaped target is a question, not a guess', () => {
  const root = repo({ 'package.json': pkg({ start: 'node server.js', dev: 'node server.js --watch' }) })
  const { code, out } = discover(root)

  assert.equal(code, 1)
  assert.match(out, /CANNOT DECIDE/)
  assert.match(out, /package\.json exists and names no check-shaped target/)
  assert.match(flat(out), /What do you run locally before you open a pull request here\?/)
  assert.doesNotMatch(out, /PROPOSED/)
})

test('nothing at all in the root is a question naming that it found nothing', () => {
  const root = repo({ 'README.md': '# a repository of shell scripts\n' })
  const { code, out } = discover(root)

  assert.equal(code, 1)
  assert.match(out, /no task runner and no ecosystem manifest in the root/)
  assert.match(flat(out), /I could find no manifest and no task runner/)
})

test('a language-specific runner beside a foreign manifest covers half the repo, so it asks', () => {
  const root = repo({
    'package.json': pkg({ test: 'node --test' }),
    'pyproject.toml': '[project]\nname = "host"\n',
  })
  const { code, out } = discover(root)

  assert.equal(code, 1)
  assert.match(out, /package\.json covers node only, and pyproject\.toml is beside it/)
  assert.match(flat(out), /pyproject\.toml \(python\) is a second body of code it never runs/)
  assert.doesNotMatch(out, /PROPOSED/)
})

test('a general task runner beside a manifest is the manifest wearing names, so it proposes', () => {
  const root = repo({
    Makefile: 'check:\n\tcargo test\n\nrelease:\n\tcargo build --release\n',
    'Cargo.toml': '[package]\nname = "host"\n',
  })
  // Empty PATH, so `make` is absent by construction and the run stops at the
  // tool probe. Which candidate it *would* have proposed is the assertion, and
  // it is the one that separates tier 1 from tier 2.
  const { code, out } = discover(root, [], noTools())

  assert.equal(code, 1)
  assert.match(out, /`make` is not on PATH on this machine/)
  assert.match(out, /What it would have proposed: make check/)
  assert.doesNotMatch(out, /would have proposed: cargo test/)
})

test('two task runners that both name a check target is an ambiguity it refuses to resolve', () => {
  const root = repo({
    Makefile: 'test:\n\t./run-tests.sh\n',
    'package.json': pkg({ check: 'node -e "process.exit(0)"' }),
  })
  const { code, out } = discover(root)

  assert.equal(code, 1)
  assert.match(out, /Makefile and package\.json both define check-shaped targets/)
  assert.match(out, /Which one do you actually run/)
})

test('a pipeline command is described and can never become the proposal', () => {
  const root = repo({
    'package.json': pkg({ check: 'node -e "process.exit(0)"' }),
    '.github/workflows/ci.yml': 'jobs:\n  deploy:\n    steps:\n      - run: terraform apply -auto-approve\n',
  })
  const { out } = discover(root)

  assert.match(out, /Described by the pipeline, and deliberately not proposed/)
  assert.match(out, /terraform apply -auto-approve/)
  assert.doesNotMatch(proposal(out), /terraform/)
})

test('proposing writes nothing', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(0)"' }) })
  discover(root)

  assert.equal(existsSync(join(root, FACTORY)), false)
  assert.equal(porcelain(root), '')
})

test('--run executes the proposal and records it, and the host repo cannot see the record', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(0)"' }) })
  const before = porcelain(root)
  const { code, out } = discover(root, ['--run'])

  assert.equal(code, 0)
  // The duration is reported, not asserted to be small. Pinning it to a tenth
  // of a second made this test a load meter: it passes alone and fails when the
  // rest of the suite is running beside it.
  assert.match(out, /npm run check {3}\d+\.\ds/)
  assert.match(out, /Recorded in .*factory[\\/]checks\.md/)

  const record = readFileSync(join(root, FACTORY, 'checks.md'), 'utf8')
  assert.match(record, /npm run check/)
  assert.match(record, /exit 0/)

  // No exclude line, and none needed. ADR 0037 puts the record inside the git
  // common directory, which git does not look into, so what ADR 0021 asked an
  // ignore rule to achieve is structural. An ignore rule can be lost.
  assert.doesNotMatch(readFileSync(join(root, '.git/info/exclude'), 'utf8'), /factory/)
  assert.equal(porcelain(root), before)
  assert.match(out, /byte-for-byte what it was before this ran/)
})

// The reason it moved, asserted rather than described. The check entry point is
// a fact about the repository, and an agent works in a worktree.
test('the recorded entry point is readable from a linked worktree', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(0)"' }) })
  assert.equal(discover(root, ['--run']).code, 0)

  const worktree = join(root, '..', `wt-${Math.random().toString(36).slice(2, 8)}`)
  execFileSync('git', ['worktree', 'add', '--quiet', worktree, '-b', 'agent'], { cwd: root })
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: worktree,
      encoding: 'utf8',
    }).trim()
    assert.match(readFileSync(join(common, 'factory/checks.md'), 'utf8'), /npm run check/)
  } finally {
    rmSync(worktree, { recursive: true, force: true })
  }
})

test('a command that fails is not recorded, however plausible it looked', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(3)"' }) })
  const { code, out } = discover(root, ['--run'])

  assert.equal(code, 1)
  assert.match(out, /1 of 1 exited non-zero, so nothing has been recorded/)
  assert.equal(existsSync(join(root, FACTORY, 'checks.md')), false)
})

test('--run with nothing to run refuses rather than inventing something', () => {
  const root = repo({ 'README.md': '# nothing here\n' })
  const { code, out } = discover(root, ['--run'])

  assert.equal(code, 1)
  assert.match(out, /Nothing to run: there is no proposal, and --command= was not given/)
  assert.equal(existsSync(join(root, FACTORY)), false)
})

test('--command= is how an escalated question gets answered, and it still has to run', () => {
  const root = repo({ 'README.md': '# a repository of shell scripts\n' })
  const { code, out } = discover(root, ['--run', '--command=node -e "process.exit(0)"'])

  assert.equal(code, 0)
  assert.match(out, /Given with --command=, not proposed/)
  assert.match(readFileSync(join(root, FACTORY, 'checks.md'), 'utf8'), /Given by hand with --command=/)
})

// The brief for this asset put it plainest: write the limit where someone will
// meet it before they rely on it, not in a footnote. Every path a reader can
// take to a recorded entry point goes past it, and this is what stops that
// being true only on the day it was written.
test('the limit is on every output and in the record', () => {
  const root = repo({ 'package.json': pkg({ check: 'node -e "process.exit(0)"' }) })
  const limit = /runs a subset of their pipeline and never their environment/

  assert.match(discover(root).out, limit)
  assert.match(discover(root, ['--run']).out, limit)
  assert.match(readFileSync(join(root, FACTORY, 'checks.md'), 'utf8'), limit)
  assert.match(discover(repo({ 'README.md': '# nothing\n' }), ['--run']).out, limit)
})
