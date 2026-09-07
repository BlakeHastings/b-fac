// The observer hook, and the store underneath it.
//
// THE ALLOW CASES CARRY MORE WEIGHT THAN THE RECORD CASES
// references/enforcement.md's rule for a guard applies harder to an observer: a
// gap loses an event, a false positive breaks somebody's session. This ships
// inside a plugin, so it is loaded for every session of every person who
// installs it, including people doing something entirely unrelated. Most of the
// tests below are therefore about it exiting 0, printing nothing, and never
// emitting a permission decision, rather than about what it records.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../hooks/observe.mjs', import.meta.url))
const CLI = fileURLToPath(new URL('../cli/factory.mjs', import.meta.url))

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'factory-observe-'))
  const project = join(dir, 'project')
  mkdirSync(project, { recursive: true })
  return {
    dir,
    project,
    env: { ...process.env, FACTORY_HOME: join(dir, 'home'), CLAUDE_PROJECT_DIR: project },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function fire(box, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: box.env,
    encoding: 'utf8',
  })
}

function cli(box, args) {
  return spawnSync(process.execPath, [CLI, ...args], { env: box.env, encoding: 'utf8' })
}

function events(box) {
  const out = cli(box, ['status'])
  const match = out.stdout.match(/Store:\s+(.*)/)
  const file = join(match[1].trim(), 'events.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

test('an unregistered project records nothing and costs one file read', () => {
  const box = sandbox()
  try {
    const result = fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '', 'silence is what keeps it out of the conversation')
    assert.deepEqual(events(box), [])
  } finally {
    box.cleanup()
  }
})

test('after factory on, lifecycle events are recorded', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1', start_reason: 'startup' })
    fire(box, {
      hook_event_name: 'SubagentStart',
      session_id: 's1',
      agent_id: 'a1',
      agent_type: 'general-purpose',
      subagent_instructions: 'Work issue #41.',
    })
    fire(box, { hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a1' })

    const kinds = events(box).map((e) => e.kind)
    assert.deepEqual(kinds, ['session.start', 'agent.start', 'agent.stop'])
    assert.equal(events(box)[1].brief, 'Work issue #41.')
  } finally {
    box.cleanup()
  }
})

test('a Stop records only the two mandated lines, never the message body', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, {
      hook_event_name: 'Stop',
      session_id: 's1',
      last_assistant_message: [
        'CONFIDENTIAL-CLIENT-PROSE that must not reach a user-level log.',
        'Next: #41.',
        'Blocked on: the retention window. Owner. Asked in #52.',
      ].join('\n'),
    })
    const [turn] = events(box)
    const serialised = JSON.stringify(turn)
    assert.equal(turn.kind, 'turn.end')
    assert.equal(turn.next, '#41.')
    assert.equal(turn.blockers[0].askedIn, '52')
    assert.ok(
      !serialised.includes('CONFIDENTIAL-CLIENT-PROSE'),
      'recording assistant prose would put a host repo’s material in a user-level log',
    )
  } finally {
    box.cleanup()
  }
})

// Every one of these once produced a crash somewhere in the chain during
// development. A hook that throws is a hook that could take a tool call with it,
// which is the one outcome this file exists to make impossible.
test('malformed input never produces a non-zero exit or any output', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    const inputs = [
      '',
      'not json at all',
      '{',
      'null',
      '[]',
      '{"hook_event_name":"Unknown"}',
      '{"hook_event_name":"SessionStart"}',
      '{"hook_event_name":"Stop","last_assistant_message":null}',
      '{"hook_event_name":"SubagentStart","agent_id":null}',
    ]
    for (const input of inputs) {
      const result = spawnSync(process.execPath, [HOOK], {
        input,
        env: box.env,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, `exit 0 for: ${input}`)
      assert.equal(result.stdout, '', `no stdout for: ${input}`)
    }
  } finally {
    box.cleanup()
  }
})

test('the hook never emits a permission decision, on any event', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    for (const event of ['SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'Stop']) {
      const result = fire(box, { hook_event_name: event, session_id: 's1' })
      assert.equal(result.status, 0)
      assert.ok(
        !result.stdout.includes('permissionDecision'),
        `${event} must not carry a verdict; this observes, it does not gate`,
      )
    }
  } finally {
    box.cleanup()
  }
})

test('an unwritable store loses the event and not the session', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    // A file where the project directory should be. Every write below fails.
    const dir = cli(box, ['status']).stdout.match(/Store:\s+(.*)/)[1].trim()
    rmSync(dir, { recursive: true, force: true })
    writeFileSync(dir, 'not a directory')

    const result = fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    assert.equal(result.status, 0, 'a broken store must still exit 0')
    assert.equal(result.stdout, '')
  } finally {
    box.cleanup()
  }
})

test('a muted session stops recording while the rest of the project continues', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    cli(box, ['off', '--session', 'noisy'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 'noisy' })
    fire(box, { hook_event_name: 'SessionStart', session_id: 'wanted' })

    const sessions = events(box).map((e) => e.session)
    assert.deepEqual(sessions, ['wanted'])
  } finally {
    box.cleanup()
  }
})

test('factory off stops recording and keeps the log', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    cli(box, ['off'])
    fire(box, { hook_event_name: 'SessionEnd', session_id: 's1' })

    assert.deepEqual(events(box).map((e) => e.kind), ['session.start'])
  } finally {
    box.cleanup()
  }
})

// The switch has to be readable by a process that started before it was
// written, because that is the entire reason it is a file rather than a hook
// entry: enforcement.md measured that a hook ENTRY is snapshotted at process
// start while the SCRIPT it names is re-read on every fire.
test('a hook process started after the switch flips sees the new value', () => {
  const box = sandbox()
  try {
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    assert.deepEqual(events(box), [], 'off before the flip')

    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    assert.equal(events(box).length, 1, 'on immediately after it, with no restart of anything')
  } finally {
    box.cleanup()
  }
})

test('a torn line is skipped rather than failing the whole read', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, { hook_event_name: 'SessionStart', session_id: 's1' })
    const dir = cli(box, ['status']).stdout.match(/Store:\s+(.*)/)[1].trim()
    const file = join(dir, 'events.jsonl')
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"kind":"session.st\n`)

    const status = cli(box, ['status'])
    assert.equal(status.status, 0)
    assert.match(status.stdout, /1 event\(s\) recorded/)
  } finally {
    box.cleanup()
  }
})

// The identity claim the whole store rests on. The factory dispatches agents
// into worktrees; if a worktree keys to a different project then an agent's
// events land somewhere the orchestrator's front end never looks, and the run
// appears as two unrelated projects. ADR 0037 relies on the same property for
// the guest gate's scope check.
test('a worktree and its main checkout resolve to one project', (t) => {
  const box = sandbox()
  try {
    const repo = join(box.dir, 'repo')
    mkdirSync(repo, { recursive: true })
    const git = (args, cwd = repo) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      git(['init', '-b', 'main'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'Test'])
      writeFileSync(join(repo, 'a.txt'), 'a')
      git(['add', '-A'])
      git(['commit', '-m', 'first'])
      git(['worktree', 'add', join(box.dir, 'wt'), '-b', 'feature'])
    } catch (err) {
      t.skip(`git is unavailable or refused: ${err.message}`)
      return
    }

    const keyOf = (cwd) => {
      const env = { ...box.env }
      delete env.CLAUDE_PROJECT_DIR
      const out = spawnSync(process.execPath, [CLI, 'status'], { cwd, env, encoding: 'utf8' })
      return out.stdout.match(/Store:\s+(.*)/)[1].trim()
    }

    assert.equal(
      keyOf(join(box.dir, 'wt')),
      keyOf(repo),
      'an agent in a worktree must file under the run that dispatched it',
    )
  } finally {
    box.cleanup()
  }
})

test('a long brief is clamped rather than written whole', () => {
  const box = sandbox()
  try {
    cli(box, ['on'])
    fire(box, {
      hook_event_name: 'SubagentStart',
      session_id: 's1',
      agent_id: 'a1',
      subagent_instructions: 'x'.repeat(50000),
    })
    const [event] = events(box)
    assert.ok(event.brief.length < 3000, 'one event must fit in a single atomic append')
  } finally {
    box.cleanup()
  }
})
