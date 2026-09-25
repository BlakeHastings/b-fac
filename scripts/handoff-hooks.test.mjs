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
// The last section is about this repository rather than the asset: #128, and
// enforcement.md's rule that a control nothing invokes is an instruction.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/handoff-hooks.mjs', import.meta.url),
)

const HANDOFF = 'docs/process/handoff.md'
const HOUR = 3_600_000

// The two variables that choose where compaction happens are removed from
// every run and put back only by the cases about them. This repository's own
// settings set them, so a suite run from inside a session here inherits them,
// and a case that passed only because of the shell it ran in is not a case.
const THRESHOLD_VARS = ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE']
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !THRESHOLD_VARS.includes(key)),
)

// The exit code comes off the process rather than out of the output. A hook's
// exit code is the whole of its verdict, and this repository has mis-measured
// one by letting a pipe swallow it.
function run(cwd, payload, args = [], env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [HOOKS, ...args], {
      cwd,
      env: { ...baseEnv, ...env },
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
// not. `handoffAgeHours` dates the handoff into the past, which is how a case
// isolates the clock it is testing from the other one.
//
// `track` decides *which* clock the case is about, and it matters more than it
// looks. Untracked is guest mode, where the handoff lives outside the worktree
// (ADR 0037), and it is also a first draft nobody has committed: the file's own
// timestamp is the only write there has been. Tracked is owned mode, where a
// later checkout rewrites the file with today's timestamp and mtime stops
// meaning anything at all — which is the whole of #145.
function repo({
  handoffAgeHours = 0,
  handoff = 'the handoff body',
  commits = 0,
  track = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'handoff-hooks-'))
  git(root, ['init', '--quiet', '--initial-branch=main'])
  git(root, ['config', 'user.email', 'agent@example.test'])
  git(root, ['config', 'user.name', 'agent'])
  git(root, ['config', 'core.autocrlf', 'false'])

  // Dated three days before the handoff, whenever that was, so it never falls
  // inside the window the commit count opens.
  const old = new Date(Date.now() - (handoffAgeHours + 72) * HOUR).toISOString()
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
    const when = Date.now() - handoffAgeHours * HOUR

    if (track) {
      const at = new Date(when).toISOString()
      git(root, ['add', '--', HANDOFF])
      git(root, ['commit', '--quiet', '-m', 'write the handoff'], {
        GIT_AUTHOR_DATE: at,
        GIT_COMMITTER_DATE: at,
      })
    }

    utimesSync(path, when / 1000, when / 1000)
  }

  // Committed after the handoff's timestamp by construction, since they are
  // made now and the handoff was backdated. Named one at a time rather than
  // `add -A` so that an untracked handoff stays untracked: sweeping it in here
  // would make every case above secretly a `track: true` case.
  for (let n = 0; n < commits; n += 1) {
    writeFileSync(join(root, `change-${n}.txt`), `${n}\n`)
    git(root, ['add', '--', `change-${n}.txt`])
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

test('SessionStart tells the orchestrator to resume, in both shapes', () => {
  // The sentence the owner typed after every /compact. With the threshold set
  // the compaction happens mid-turn with nobody there to type it, so the block
  // has to say it, and has to say it whether or not there is a file to print.
  const withFile = repo({ handoffAgeHours: 2 })
  const without = repo({ handoff: null })

  for (const root of [withFile, without]) {
    const result = run(root, sessionStart(root))
    assert.match(result.out, /load it again/)
    assert.match(result.out, /docs\/process\/orchestrating\.md/)
    assert.match(result.out, /open pull requests/)
    assert.match(result.out, /Continue the loop/)
  }
})

test('a handoff too long to inject whole is pointed at, not cut short', () => {
  // Measured on 2.1.282: over 10,000 characters, the harness swaps a hook's
  // output for a path and a 2KB preview. A handoff cut there lost its second
  // half without saying so, which is worse than not printing it.
  const body = ['HANDOFF-BEGIN', ...Array.from({ length: 800 }, (_, n) => `line ${n} of a long handoff`), 'THE-END']
  const root = repo({ handoff: body.join('\n'), handoffAgeHours: 2 })
  const result = run(root, sessionStart(root))

  assert.equal(result.code, 0)
  assert.ok(result.out.length < 10_000, `injected ${result.out.length} characters, over the cap`)
  assert.doesNotMatch(result.out, /THE-END/)
  assert.match(result.out, /over the harness's 10000 character cap/)
  assert.ok(result.out.includes(join(root, HANDOFF)), 'the reader is told where the file is')

  // What the reader must act on is still there, because it never depended on
  // the handoff fitting.
  assert.match(result.out, /IF YOU WERE DISPATCHED AS AN IMPLEMENTATION AGENT/)
  assert.match(result.out, /Continue the loop/)
})

test('a handoff that fits is still printed whole, however close to the cap', () => {
  const body = ['HANDOFF-BEGIN', ...Array.from({ length: 200 }, (_, n) => `line ${n} of a long handoff`), 'THE-END']
  const root = repo({ handoff: body.join('\n'), handoffAgeHours: 2 })
  const result = run(root, sessionStart(root))

  assert.ok(result.out.includes(body.join('\n')), 'the body is injected unaltered')
  assert.ok(result.out.length < 10_000)
})

// --- the summariser ---------------------------------------------------------

test('an automatic compaction is told what to keep, and is still not refused', () => {
  const root = repo({ handoffAgeHours: 500, commits: 20 })
  const result = run(root, preCompact(root, 'auto'))

  assert.equal(result.code, 0)
  assert.equal(result.err, '')
  // Both readers, because nothing in this payload says whose context it is.
  assert.match(result.out, /orchestrated-delivery/)
  assert.match(result.out, /docs\/process\/handoff\.md/)
  assert.match(result.out, /implementation\s+agent/)
})

// --- the warning before the threshold ----------------------------------------
//
// ADR 0060. PostToolUse reads context in use from the transcript's last
// main-thread assistant entry and warns once per climb past the band, which is
// ten points under the compaction percentage.

const WATCHED = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000', CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '85' }
const EFFECTIVE = 80_000 // 100K less the 20K the harness keeps back

const assistant = (tokens, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    message: {
      id: `msg-${tokens}`,
      usage: {
        input_tokens: 3,
        cache_read_input_tokens: tokens - 3,
        cache_creation_input_tokens: 0,
        output_tokens: 40,
      },
    },
    ...extra,
  })

function transcript(lines) {
  const path = join(mkdtempSync(join(tmpdir(), 'handoff-hooks-transcript-')), 'session.jsonl')
  writeFileSync(path, lines.map((line) => `${line}\n`).join(''))
  return path
}

const postToolUse = (path, session, extra = {}) => ({
  hook_event_name: 'PostToolUse',
  session_id: session,
  transcript_path: path,
  cwd: tmpdir(),
  tool_name: 'Read',
  ...extra,
})

// What the harness would add to the context, or '' for nothing.
const injected = (result) =>
  result.out === '' ? '' : JSON.parse(result.out).hookSpecificOutput.additionalContext

const at = (percent) => Math.round((EFFECTIVE * percent) / 100)

test('the warning fires once on crossing the band, and not again on the same climb', () => {
  const session = randomUUID()
  const path = transcript([assistant(at(40))])
  const call = () => injected(run(tmpdir(), postToolUse(path, session), [], WATCHED))

  assert.equal(call(), '', 'warned at 40%, under the band')

  appendFileSync(path, `${assistant(at(76))}\n`)
  const warning = call()
  assert.match(warning, /Context is at 76%/)
  assert.match(warning, /set for 85%/)
  assert.match(warning, /Top the handoff/)

  appendFileSync(path, `${assistant(at(80))}\n`)
  assert.equal(call(), '', 'warned twice on one climb')
})

test('a compaction resets the band, so the next climb is warned again', () => {
  const session = randomUUID()
  const path = transcript([assistant(at(78))])
  const call = () => injected(run(tmpdir(), postToolUse(path, session), [], WATCHED))

  assert.match(call(), /Context is at 78%/)

  // A boundary after the last usage means the context was just replaced, and
  // what was in use before it is no longer the answer.
  appendFileSync(
    path,
    `${JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: at(86), postTokens: 9_000 } })}\n`,
  )
  assert.equal(call(), '')

  appendFileSync(path, `${assistant(at(30))}\n${assistant(at(77))}\n`)
  assert.match(call(), /Context is at 77%/)
})

test('a subagent is never warned, however full its context', () => {
  // A subagent's handoff is its issue. Telling an implementation agent to top
  // up the orchestrator's handoff is the wrong-reader failure of ADR 0042.
  const session = randomUUID()
  const path = transcript([assistant(at(95))])
  const result = run(
    tmpdir(),
    postToolUse(path, session, { agent_id: 'a1b2c3', agent_type: 'general-purpose' }),
    [],
    WATCHED,
  )

  assert.equal(result.code, 0)
  assert.equal(result.out, '')

  // And it left nothing behind to suppress the orchestrator's own warning.
  assert.match(injected(run(tmpdir(), postToolUse(path, session), [], WATCHED)), /Context is at 95%/)
})

test('an unknown window is said once, and no percentage is guessed', () => {
  const session = randomUUID()
  const path = transcript([assistant(900_000)])
  const first = injected(run(tmpdir(), postToolUse(path, session)))

  assert.match(first, /not being watched/)
  assert.match(first, /CLAUDE_CODE_AUTO_COMPACT_WINDOW/)
  assert.doesNotMatch(first, /\d+%/)
  assert.equal(injected(run(tmpdir(), postToolUse(path, session))), '', 'said twice in one session')

  // One of the two is not enough: the window without the percentage says
  // nothing about where compaction is.
  const half = injected(
    run(tmpdir(), postToolUse(path, randomUUID()), [], {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000',
    }),
  )
  assert.match(half, /not being watched/)
})

test('a transcript that cannot be read warns nothing', () => {
  const missing = join(tmpdir(), `no-such-${randomUUID()}.jsonl`)
  const result = run(tmpdir(), postToolUse(missing, randomUUID()), [], WATCHED)
  assert.equal(result.code, 0)
  assert.equal(result.out, '')
})

test('the last usage is found behind a tool result bigger than the first read', () => {
  // The transcript is read from the end in widening steps, so a single large
  // tool result after the last assistant entry must not hide it.
  const session = randomUUID()
  const huge = JSON.stringify({ type: 'user', message: { content: 'z'.repeat(300_000) } })
  const path = transcript([assistant(at(10)), assistant(at(79)), huge])
  assert.match(injected(run(tmpdir(), postToolUse(path, session), [], WATCHED)), /Context is at 79%/)
})

// --- which clock dates the handoff ------------------------------------------
//
// #145. A checkout writes the committed bytes out with today's timestamp, so
// `git worktree add`, `git clone` and any branch switch reset mtime on a file
// nobody has touched. Measured against the asset before this section existed,
// on a twelve-day-old handoff: the checkout said "288h old, 5 commits on main
// since" and a worktree cut from it said "under an hour old, 0 commits on main
// since" about the same bytes. Both numbers went fresh together, because the
// count was taken since that same mtime, so there was no second opinion in it.
//
// These use a real `git worktree add` and a real `git clone`, because what is
// under test is what those two commands do to a file. A fixture that only
// imitates them can pass against an asset that is still wrong, which is the
// failure this repository has now shipped twice in one week.

test('a worktree cut today does not make an old handoff read as new', () => {
  const root = repo({ handoffAgeHours: 288, commits: 5, track: true })
  const worktree = `${root}-worktree`
  git(root, ['worktree', 'add', '--quiet', '--detach', worktree, 'main'])

  // The premise, asserted rather than assumed. If the checkout left mtime alone
  // there is no defect here to catch and a green below would mean nothing.
  assert.ok(
    statSync(join(worktree, HANDOFF)).mtimeMs > Date.now() - HOUR,
    'the checkout did not reset mtime, so this case has nothing to measure',
  )

  const inWorktree = run(worktree, sessionStart(worktree))
  const inCheckout = run(root, sessionStart(root))

  // The worktree first, because that is the claim: two checkouts of the same
  // bytes must give the same answer, and the one that used to say "under an
  // hour old, 0 commits on main since" is this one.
  assert.match(inWorktree.out, /288h old, 5 commits on main since/)
  assert.match(inCheckout.out, /288h old, 5 commits on main since/)
})

test('a clone made today does not make an old handoff read as new', () => {
  // The worse of the two, because it is what everybody installing this gets:
  // every file in a fresh clone carries today's timestamp, so a handoff
  // committed months ago reads as written minutes ago.
  const root = repo({ handoffAgeHours: 288, commits: 5, track: true })
  const clone = `${root}-clone`
  git(root, ['clone', '--quiet', root, clone])

  const result = run(clone, preCompact(clone, 'manual'))
  assert.equal(result.code, 2, 'a 288h old handoff was not stale in a fresh clone')
  assert.match(result.err, /288h old, 5 commits on main since/)
})

test('an uncommitted top-up is dated by the file and not by its last commit', () => {
  // Why this asks git which clock applies rather than replacing one with the
  // other. A last-commit clock does not reset, and it is wrong in the opposite
  // direction here: the loop's instruction is to top the handoff up
  // continuously, so a handoff whose newest words are not committed yet is the
  // normal state and not the edge case.
  //
  // No commits after it, so the wall clock is the only thing that could be
  // refusing and the case is about that clock alone.
  const root = repo({ handoffAgeHours: 288, track: true })
  writeFileSync(join(root, HANDOFF), 'topped up a moment ago, not committed')

  const result = run(root, sessionStart(root))
  assert.match(result.out, /under an hour old/)
  assert.equal(run(root, preCompact(root, 'manual')).code, 0)
})

test('a handoff git does not track is dated by the file', () => {
  // An uncommitted first draft, and also guest mode, where HANDOFF is an
  // absolute path into the git common directory (ADR 0037) that no checkout of
  // the host repository ever writes. git knows nothing about the file, and that
  // is the answer rather than a failure to get one.
  const root = repo({ handoffAgeHours: 30 })
  const result = run(root, preCompact(root, 'manual'))

  assert.equal(result.code, 2)
  assert.match(result.err, /30h old/)
})

test('an age nothing can measure is reported as unmeasured, never as fresh', () => {
  // No repository, so nothing can say whether the timestamp on this file was a
  // write or a checkout. Reading it as fresh is the one answer that must not
  // come out, because it arrives with the authority of a measurement (ADR 0027)
  // and the reader it reaches has just lost the context to doubt it.
  const root = mkdtempSync(join(tmpdir(), 'handoff-hooks-unmeasured-'))
  mkdirSync(join(root, dirname(HANDOFF)), { recursive: true })
  writeFileSync(join(root, HANDOFF), 'THE-BODY')
  const when = (Date.now() - 500 * HOUR) / 1000
  utimesSync(join(root, HANDOFF), when, when)

  const injected = run(root, sessionStart(root))
  assert.match(injected.out, /nothing here can measure/)
  assert.match(injected.out, /possibly very old/)
  assert.doesNotMatch(injected.out, /\d+h old/)
  assert.ok(injected.out.includes('THE-BODY'), 'the handoff is still carried across')

  // Cannot tell never refuses, which is the rule the rest of this file exists
  // to hold: a gate that fires on a measurement it could not take is the wedge
  // arriving by accident.
  assert.equal(run(root, preCompact(root, 'manual')).code, 0)

  const probed = run(root, null, ['--probe'])
  assert.equal(probed.code, 0)
  assert.match(probed.out, /CANNOT TELL/)
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

// --- the wiring in this repository ------------------------------------------
//
// Everything above is about the asset other repositories install. The rest are
// about this one, which shipped the asset uninstalled for two weeks (#128)
// while publishing enforcement.md's rule that a control nothing invokes is an
// instruction. They are cheap because the failure is silent: an unwired
// SessionStart hook and a wired one that never has anything to say look
// identical from inside a session.

const SETTINGS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.claude/settings.json', import.meta.url)), 'utf8'),
)
const sessionStartEntries = (SETTINGS.hooks?.SessionStart ?? []).filter((entry) =>
  (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('handoff-hooks.mjs')),
)

test('the compaction hooks are wired here, not only published', () => {
  assert.equal(sessionStartEntries.length > 0, true, 'nothing invokes handoff-hooks.mjs')
})

test('SessionStart is wired to compact and to nothing else', () => {
  // `startup` and `resume` are the cases where the file is on disk and can be
  // read, so injecting it there buys nothing and costs a block of text that
  // opens "The context was just compacted" in a session where it did not.
  for (const entry of sessionStartEntries) {
    const matches = (source) => new RegExp(`^(${entry.matcher})$`).test(source)
    assert.equal(matches('compact'), true, 'the compaction case is not matched')
    for (const source of ['startup', 'resume', 'clear']) {
      assert.equal(matches(source), false, `${source} is matched, so the block fires uncompacted`)
    }
  }
})

const wiredTo = (event) =>
  (SETTINGS.hooks?.[event] ?? []).filter((entry) =>
    (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('handoff-hooks.mjs')),
  )

test('the threshold is set here, and set to the owner’s number', () => {
  // ADR 0060. Measured on 2.1.282: an `env` entry in project settings reaches
  // both the harness's compaction threshold and the hooks' environment, so
  // this one block decides where compaction happens and what the warning
  // measures against.
  assert.equal(SETTINGS.env?.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, '85')
  assert.match(SETTINGS.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? '', /^\d+$/)
})

test('the warning is wired to every tool call', () => {
  const entries = wiredTo('PostToolUse')
  assert.equal(entries.length > 0, true, 'nothing wires the PostToolUse warning')
  for (const entry of entries) {
    assert.ok(entry.matcher === undefined || entry.matcher === '*', `matcher ${entry.matcher} skips tools`)
  }
})

test('PreCompact is wired to auto only, so nothing here refuses a manual compaction', () => {
  // Refusing a manual /compact is #141's question and is not decided by
  // wiring. The auto entry exists only to hand the summariser its
  // instructions, and the asset never refuses on that path.
  const entries = wiredTo('PreCompact')
  assert.equal(entries.length > 0, true, 'PreCompact auto is not wired')
  for (const entry of entries) {
    const matches = (trigger) => new RegExp(`^(${entry.matcher})$`).test(trigger)
    assert.equal(matches('auto'), true)
    assert.equal(matches('manual'), false, 'manual is wired, which is #141 decided by accident')
  }
})

// ADR 0040 says this asset is copied to `scripts/` and wired by hand, like
// `guard-merge.mjs`. Unlike that one it is copied unchanged, so the cheapest
// true thing to assert is that it stays that way: this repository is the place
// the hooks are exercised daily, and that is only evidence about the published
// asset while the two files are the same file. The remedy when this fails is a
// copy, and the question it asks first is which of the two moved.
test('the copy this repository runs is the asset it ships', () => {
  const lf = (text) => text.replace(/\r\n/g, '\n')
  const installed = fileURLToPath(new URL('./handoff-hooks.mjs', import.meta.url))
  assert.equal(
    lf(readFileSync(installed, 'utf8')),
    lf(readFileSync(HOOKS, 'utf8')),
    'scripts/handoff-hooks.mjs has drifted from the asset, so this repo runs something else',
  )
})
