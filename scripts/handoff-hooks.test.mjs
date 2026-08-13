// What the compaction hooks refuse, what they let through, and what they carry.
//
// WHAT THIS PREVENTS
// One case here is worth more than the rest of the suite put together: an
// automatic compaction is never refused. Measured, a refused auto-compact
// cannot be satisfied — the session fails every subsequent request with
// "Prompt is too long" and the hook goes on refusing — and the same rule fires
// for a subagent's context, where refusing it kills the agent outright. Both
// failures are silent-ish and expensive, and the whole reason this asset is
// shaped the way it is. If someone ever "tightens" that line, this suite goes
// red rather than the next long session.
//
// The allow direction is otherwise the one nobody writes, so it is most of what
// is below: an absent handoff, a current one, and a repository with no git in
// it all have to pass through without refusing anything.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/handoff-hooks.mjs', import.meta.url),
)

const HANDOFF = 'docs/process/handoff.md'
const HOUR = 3_600_000

// The exit code comes off the process rather than out of the output. A hook's
// exit code is the whole of its verdict, and this repository has mis-measured
// one by letting a pipe swallow it.
function run(cwd, payload, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [HOOKS, ...args], {
      cwd,
      input: payload === null ? '' : JSON.stringify(payload),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { code: 0, out: stdout, err: '' }
  } catch (error) {
    return { code: error.status, out: error.stdout ?? '', err: error.stderr ?? '' }
  }
}

const git = (cwd, args, env = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })

// A repository with a default branch and one commit, so "no commits since the
// handoff" is measured against a branch that exists rather than one that does
// not. `commitsAgoHours` dates that first commit into the past, which is how a
// case isolates the clock it is testing from the other one.
function repo({ handoffAgeHours = 0, handoff = 'the handoff body', commits = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'handoff-hooks-'))
  git(root, ['init', '--quiet', '--initial-branch=main'])
  git(root, ['config', 'user.email', 'agent@example.test'])
  git(root, ['config', 'user.name', 'agent'])
  git(root, ['config', 'core.autocrlf', 'false'])

  // Dated three days back so it never counts as "since" a handoff written
  // hours ago, whatever the case does next.
  const old = new Date(Date.now() - 72 * HOUR).toISOString()
  writeFileSync(join(root, 'README.md'), 'seed\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '--quiet', '-m', 'seed'], {
    GIT_AUTHOR_DATE: old,
    GIT_COMMITTER_DATE: old,
  })

  if (handoff !== null) {
    mkdirSync(join(root, dirname(HANDOFF)), { recursive: true })
    const path = join(root, HANDOFF)
    writeFileSync(path, handoff)
    const when = (Date.now() - handoffAgeHours * HOUR) / 1000
    utimesSync(path, when, when)
  }

  // Committed after the handoff's timestamp by construction, since they are
  // made now and the handoff was backdated.
  for (let n = 0; n < commits; n += 1) {
    writeFileSync(join(root, `change-${n}.txt`), `${n}\n`)
    git(root, ['add', '-A'])
    git(root, ['commit', '--quiet', '-m', `change ${n}`])
  }

  return root
}

const preCompact = (cwd, trigger) => ({
  hook_event_name: 'PreCompact',
  trigger,
  cwd,
  custom_instructions: null,
})

const sessionStart = (cwd) => ({ hook_event_name: 'SessionStart', source: 'compact', cwd })

// --- the refusal ------------------------------------------------------------

test('a manual compaction is refused when the handoff has aged out', () => {
  const root = repo({ handoffAgeHours: 20 })
  const result = run(root, preCompact(root, 'manual'))

  assert.equal(result.code, 2)
  assert.match(result.err, /Blocked/)
  assert.match(result.err, /20h old/)
  assert.match(result.err, /run \/compact again/)
})

test('a manual compaction is refused when enough has merged underneath it', () => {
  // One hour old, so the wall clock is nowhere near its threshold and the
  // commit count is the only thing that can be refusing.
  const root = repo({ handoffAgeHours: 1, commits: 5 })
  const result = run(root, preCompact(root, 'manual'))

  assert.equal(result.code, 2)
  assert.match(result.err, /5 commits on main since/)
})

test('the refusal says that automatic compaction is not blocked', () => {
  const root = repo({ handoffAgeHours: 20 })
  const result = run(root, preCompact(root, 'manual'))

  // The message is the whole interface at the moment someone decides whether
  // to trust the gate, and the first thing a refused caller wonders is whether
  // they are about to be refused for ever.
  assert.match(result.err, /Automatic compaction is never blocked/)
})

// --- the allow direction, which is the one that matters here ----------------

test('an automatic compaction is never refused, however stale the handoff', () => {
  // Everything wrong at once: aged out, and buried under merges.
  const root = repo({ handoffAgeHours: 500, commits: 20 })
  const result = run(root, preCompact(root, 'auto'))

  assert.equal(result.code, 0)
  assert.equal(result.err, '')
})

test('the first compaction of a session with no handoff is not refused', () => {
  const root = repo({ handoff: null })
  assert.equal(run(root, preCompact(root, 'manual')).code, 0)
})

test('a current handoff is not refused', () => {
  const root = repo({ handoffAgeHours: 1, commits: 2 })
  assert.equal(run(root, preCompact(root, 'manual')).code, 0)
})

test('a repository git cannot read is not refused', () => {
  // No `git init`, so the commit count cannot be taken. Cannot-tell must not
  // become a refusal: a hook that blocks compaction on a checkout it fails to
  // understand is the wedge this asset exists to avoid, arriving by accident.
  const root = mkdtempSync(join(tmpdir(), 'handoff-hooks-bare-'))
  mkdirSync(join(root, dirname(HANDOFF)), { recursive: true })
  writeFileSync(join(root, HANDOFF), 'body')
  const when = (Date.now() - HOUR) / 1000
  utimesSync(join(root, HANDOFF), when, when)

  assert.equal(run(root, preCompact(root, 'manual')).code, 0)
})

test('an unparseable payload is not this hook’s problem', () => {
  const root = repo({ handoffAgeHours: 500 })
  const result = run(root, null)
  assert.equal(result.code, 0)
  assert.equal(result.err, '')
})

// --- the far side -----------------------------------------------------------

test('SessionStart prints the handoff verbatim, whole', () => {
  const body = ['HANDOFF-BEGIN', ...Array.from({ length: 400 }, (_, n) => `line ${n}`), 'THE-END']
  const root = repo({ handoff: body.join('\n'), handoffAgeHours: 2 })
  const result = run(root, sessionStart(root))

  assert.equal(result.code, 0)
  // First and last, because truncation that keeps the opening is the failure
  // that reads as success.
  assert.match(result.out, /HANDOFF-BEGIN/)
  assert.match(result.out, /THE-END/)
  assert.ok(result.out.includes(body.join('\n')), 'the body is injected unaltered')
})

test('SessionStart says so rather than injecting nothing when there is no handoff', () => {
  const root = repo({ handoff: null })
  const result = run(root, sessionStart(root))

  assert.equal(result.code, 0)
  assert.match(result.out, /no handoff/i)
  assert.match(result.out, /Re-read the backlog/)
})

test('SessionStart addresses a dispatched agent, because it may be one reading', () => {
  // This event fires after a subagent's compaction too, and the stdout lands in
  // that subagent's context. Measured, and the payload carries nothing to tell
  // the two readers apart. An implementation agent handed the orchestrator's
  // handoff as its own state starts doing the orchestrator's next steps, so
  // both branches say who the file belongs to before printing any of it.
  const withFile = repo({ handoffAgeHours: 2 })
  const without = repo({ handoff: null })
  const present = run(withFile, sessionStart(withFile))
  const absent = run(without, sessionStart(without))

  for (const result of [present, absent]) {
    assert.match(result.out, /IF YOU WERE DISPATCHED AS AN IMPLEMENTATION AGENT/)
    assert.match(result.out, /re-read the issue\s+you were dispatched against/)
    assert.match(result.out, /IF YOU ARE THE ORCHESTRATOR/)
  }

  // Addressed before the handoff, not after it: the reader who must not act on
  // the file has to be told before they have read it.
  assert.ok(
    present.out.indexOf('IF YOU WERE DISPATCHED') < present.out.indexOf('----- docs/process'),
    'the addressing comes before the file',
  )
})

test('SessionStart carries the decay note, not just the file', () => {
  const root = repo({ handoffAgeHours: 30, commits: 3 })
  const result = run(root, sessionStart(root))

  assert.match(result.out, /30h old/)
  assert.match(result.out, /3 commits on main since/)
  assert.match(result.out, /the repository is right/)
})

// --- the probe --------------------------------------------------------------

test('the probe reports the verdict the rules would give, and says what it cannot answer', () => {
  const stale = run(repo({ handoffAgeHours: 20 }), null, ['--probe'])
  assert.equal(stale.code, 1)
  assert.match(stale.out, /STALE/)

  const current = run(repo({ handoffAgeHours: 1 }), null, ['--probe'])
  assert.equal(current.code, 0)
  assert.match(current.out, /Current/)

  for (const result of [stale, current]) {
    assert.match(result.out, /says nothing about whether the hooks are loaded/)
  }
})

test('the probe does not refuse a repository with no handoff in it', () => {
  const result = run(repo({ handoff: null }), null, ['--probe'])
  assert.equal(result.code, 0)
  assert.match(result.out, /No handoff at/)
})
