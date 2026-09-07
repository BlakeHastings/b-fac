// The CLI, the fold that feeds the front end, and the server that serves it.
//
// THE PROBE IS THE TEST THAT MATTERS MOST HERE
// An observability layer fails silently by construction: an empty page reads as
// a quiet factory, not as a broken observer. references/enforcement.md priced
// that exact failure once already, when a merge guard sat inert for two days
// and nothing anywhere said so. So `factory status` must distinguish "nobody
// asked" from "asked, and it has never once fired", and the two tests below are
// the reason that distinction exists.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fold, formatAge } from '../cli/lib/view.mjs'
import { serve } from '../cli/lib/serve.mjs'

const CLI = fileURLToPath(new URL('../cli/factory.mjs', import.meta.url))
const HOOK = fileURLToPath(new URL('../hooks/observe.mjs', import.meta.url))

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'factory-cli-'))
  const project = join(dir, 'project')
  mkdirSync(project, { recursive: true })
  return {
    dir,
    project,
    env: { ...process.env, FACTORY_HOME: join(dir, 'home'), CLAUDE_PROJECT_DIR: project },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

const cli = (box, args) =>
  spawnSync(process.execPath, [CLI, ...args], { env: box.env, encoding: 'utf8' })

const fire = (box, payload) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: box.env,
    encoding: 'utf8',
  })

test('a fresh project reports off, with nothing recorded and no alarm', () => {
  const box = sandbox()
  try {
    const out = cli(box, ['status'])
    assert.equal(out.status, 0)
    assert.match(out.stdout, /Recording: off/)
    assert.match(out.stdout, /0 event\(s\) recorded/)
    assert.ok(
      !out.stdout.includes('never fired'),
      'off is not a fault; only enabled-and-never-seen is',
    )
  } finally {
    box.cleanup()
  }
})

test('enabled and never observed is called out, because that is the silent failure', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    const out = cli(box, ['status'])
    assert.match(out.stdout, /Recording: on/)
    assert.match(out.stdout, /never fired for this project/)
    assert.match(out.stdout, /snapshotted when a session starts/)
  } finally {
    box.cleanup()
  }
})

test('one real event clears the alarm and the stamp is what clears it', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    const out = cli(box, ['status'])
    assert.ok(!out.stdout.includes('never fired'))
    assert.match(out.stdout, /Last event: .* ago \(SessionStart\)/)
  } finally {
    box.cleanup()
  }
})

test('ask files a need and hands back an id that resolve accepts', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    const asked = cli(box, ['ask', 'which retention window applies?', '--blocks', '41,#43', '--owner'])
    assert.equal(asked.status, 0)
    const id = asked.stdout.match(/^(n-[0-9a-f]{6})/m)[1]
    assert.match(asked.stdout, /Blocks: #41, #43/)

    const listed = cli(box, ['needs'])
    assert.match(listed.stdout, /which retention window applies\?/)
    assert.match(listed.stdout, /for owner/)

    assert.equal(cli(box, ['resolve', id]).status, 0)
    assert.match(cli(box, ['needs']).stdout, /Nothing is waiting/)
  } finally {
    box.cleanup()
  }
})

test('an unknown severity is refused by name rather than silently defaulted', () => {
  const box = sandbox()
  try {
    const out = cli(box, ['ask', 'a question', '--severity', 'urgent'])
    assert.equal(out.status, 1)
    assert.match(out.stderr, /Unknown severity "urgent"/)
    assert.match(out.stderr, /blocking, blocks-work, fyi/)
  } finally {
    box.cleanup()
  }
})

test('ask records with the observer off, and says why the page will look bare', () => {
  const box = sandbox()
  try {
    const out = cli(box, ['ask', 'a deliberate question'])
    assert.equal(out.status, 0)
    assert.match(out.stdout, /not being observed/)
    assert.match(cli(box, ['needs']).stdout, /a deliberate question/)
  } finally {
    box.cleanup()
  }
})

test('a derived need cannot be resolved, and the refusal says what to do instead', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, {
      hook_event_name: 'Stop',
      session_id: 's1',
      last_assistant_message: 'Next: #1.\nBlocked on: an unfiled question. Owner.',
    })
    const listed = cli(box, ['needs'])
    const id = listed.stdout.match(/^(derived-\S+)/m)[1]
    assert.ok(!/\s/.test(id), 'an id has to survive being typed at a shell as one argument')

    const out = cli(box, ['resolve', id])
    assert.equal(out.status, 1)
    assert.match(out.stderr, /parsed out of a "Blocked on:" line/)
    assert.match(out.stderr, /factory ask/)
  } finally {
    box.cleanup()
  }
})

test('status names the case where every need was parsed and none was filed', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, {
      hook_event_name: 'Stop',
      session_id: 's1',
      last_assistant_message: 'Next: #1.\nBlocked on: an unfiled question. Owner.',
    })
    assert.match(cli(box, ['status']).stdout, /parsed out of a "Blocked on:" line rather than filed/)
  } finally {
    box.cleanup()
  }
})

test('an unknown command fails loudly and prints the usage', () => {
  const box = sandbox()
  try {
    const out = cli(box, ['frobnicate'])
    assert.equal(out.status, 1)
    assert.match(out.stderr, /Unknown command "frobnicate"/)
    assert.match(out.stderr, /factory ask/)
  } finally {
    box.cleanup()
  }
})

test('help exits clean and explains severity in terms of what the loop can do', () => {
  const box = sandbox()
  try {
    const out = cli(box, ['help'])
    assert.equal(out.status, 0)
    assert.match(out.stdout, /Nothing can proceed/)
    assert.match(out.stdout, /holds up nothing/)
  } finally {
    box.cleanup()
  }
})

// The fold is where declared and derived stop being the same thing, and the
// whole cross-check depends on it keeping them apart while still noticing they
// describe one question.
test('a filed need restated in a turn is one row, marked restated', () => {
  const now = Date.now()
  const state = fold(
    [
      {
        kind: 'need.open',
        ts: new Date(now - 60000).toISOString(),
        needId: 'n-1',
        question: 'warn or block on an expired licence?',
        severity: 'blocking',
        session: 's1',
      },
      {
        kind: 'turn.end',
        ts: new Date(now - 1000).toISOString(),
        session: 's1',
        present: { next: true, blocked: true },
        blockers: [{ question: 'warn-or-block on an expired licence', blocks: [] }],
      },
    ],
    { now },
  )
  assert.equal(state.needs.length, 1)
  assert.equal(state.needs[0].source, 'declared')
  assert.equal(state.needs[0].severity, 'blocking', 'the filed severity survives the merge')
  assert.ok(state.needs[0].restated)
})

test('a blocker nobody filed shows as derived with its severity marked inferred', () => {
  const now = Date.now()
  const state = fold(
    [
      {
        kind: 'turn.end',
        ts: new Date(now - 1000).toISOString(),
        session: 's1',
        present: { next: true, blocked: true },
        blockers: [{ question: 'an unfiled question', blocks: ['9'] }],
      },
    ],
    { now },
  )
  assert.equal(state.needs.length, 1)
  assert.equal(state.needs[0].source, 'derived')
  assert.equal(state.needs[0].severityInferred, true)
  assert.deepEqual(state.needs[0].blocks, ['9'])
})

test('needs sort oldest first, because waiting time is the number nobody had', () => {
  const now = Date.now()
  const at = (ms) => new Date(now - ms).toISOString()
  const state = fold(
    [
      { kind: 'need.open', ts: at(1000), needId: 'new', question: 'recent' },
      { kind: 'need.open', ts: at(9000000), needId: 'old', question: 'ancient' },
    ],
    { now },
  )
  assert.deepEqual(state.needs.map((n) => n.id), ['old', 'new'])
})

test('an agent with no stop is running, and one with a stop is not', () => {
  const now = Date.now()
  const at = (ms) => new Date(now - ms).toISOString()
  const state = fold(
    [
      { kind: 'session.start', ts: at(5000), session: 's1' },
      { kind: 'agent.start', ts: at(4000), session: 's1', agent_id: 'a1', agent_type: 'general-purpose' },
      { kind: 'agent.start', ts: at(3000), session: 's1', agent_id: 'a2', agent_type: 'Explore' },
      { kind: 'agent.stop', ts: at(1000), session: 's1', agent_id: 'a2' },
    ],
    { now },
  )
  assert.deepEqual(state.running.map((a) => a.id), ['a1'])
  assert.equal(state.counts.running, 1)
})

// A session whose process died leaves no session.end, which is the same shape as
// the measured finding that a subagent killed by a full context fires no
// SubagentStop. Absence has to be inferred from silence somewhere.
test('a long-silent session goes idle and stops holding its agents open', () => {
  const now = Date.now()
  const old = new Date(now - 1000 * 60 * 60 * 20).toISOString()
  const state = fold(
    [
      { kind: 'session.start', ts: old, session: 'dead' },
      { kind: 'agent.start', ts: old, session: 'dead', agent_id: 'a1' },
    ],
    { now },
  )
  assert.equal(state.sessions[0].live, false)
  assert.deepEqual(state.running, [], 'a dead session cannot still be running agents')
})

test('a turn missing a mandated line is recorded as missing it', () => {
  const state = fold([
    {
      kind: 'turn.end',
      ts: new Date().toISOString(),
      session: 's1',
      present: { next: true, blocked: false },
      next: '#41',
      blockers: [],
    },
  ])
  assert.deepEqual(state.turns[0].missingLines, ['Blocked on:'])
})

test('formatAge is readable at every scale and never throws on nothing', () => {
  assert.equal(formatAge(null), '?')
  assert.equal(formatAge(5000), '5s')
  assert.equal(formatAge(1000 * 90), '1m')
  assert.equal(formatAge(1000 * 60 * 90), '1h 30m')
  assert.match(formatAge(1000 * 60 * 60 * 50), /^2d/)
})

test('the server binds loopback, serves the page and answers with state', async () => {
  const box = sandbox()
  const previous = process.env.FACTORY_HOME
  process.env.FACTORY_HOME = box.env.FACTORY_HOME
  let running
  try {
    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    running = await serve({ root: box.project, open: false, log: () => {} })

    assert.match(running.url, /^http:\/\/127\.0\.0\.1:/, 'never anything but loopback')

    const html = await (await fetch(running.url)).text()
    assert.match(html, /<title>Factory<\/title>/)

    const state = await (await fetch(`${running.url}api/state`)).json()
    assert.equal(state.project.enabled, true)
    assert.equal(state.sessions.length, 1)

    const missing = await fetch(`${running.url}nope`)
    assert.equal(missing.status, 404)
  } finally {
    await running?.close()
    if (previous === undefined) delete process.env.FACTORY_HOME
    else process.env.FACTORY_HOME = previous
    box.cleanup()
  }
})

test('a second server steps to the next port instead of refusing', async () => {
  const box = sandbox()
  const previous = process.env.FACTORY_HOME
  process.env.FACTORY_HOME = box.env.FACTORY_HOME
  let first
  let second
  try {
    first = await serve({ root: box.project, open: false, log: () => {} })
    second = await serve({ root: box.project, port: first.port, open: false, log: () => {} })
    assert.notEqual(first.port, second.port)
  } finally {
    await first?.close()
    await second?.close()
    if (previous === undefined) delete process.env.FACTORY_HOME
    else process.env.FACTORY_HOME = previous
    box.cleanup()
  }
})
