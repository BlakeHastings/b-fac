#!/usr/bin/env node
// The factory's CLI. Run by the agent and by the person watching it, which is
// the constraint that shapes every command below.
//
// TWO CALLERS, ONE OUTPUT FORMAT
// An agent reads prose, and so does the operator. references/backlog-port.md
// already made this argument against imitating `gh`'s `--json` and templating:
// it is the expensive half and it buys the loop nothing. So every command here
// prints short lines meant to be read, and the only machine-readable surface is
// the log itself, which the front end reads directly.
//
// WHAT IS AND IS NOT A VERB HERE
// ADR 0036 says a spec carries only what an agent cannot derive. The same rule
// picks this command set. A dispatch, a subagent returning, a session starting
// and the two lines at the end of a turn are all visible to a hook, so none of
// them is a command anybody has to remember. What no hook can see is that a
// question is open, how bad it is, and what it holds up. That is `ask`, and it
// is close to the whole reason a CLI exists at all.
//
// AND `ask` WRITES EVEN WHEN THE OBSERVER IS OFF
// The switch governs ambient observation: hooks recording what happened whether
// or not anybody asked. `ask` is a deliberate act, and dropping it because a
// flag was off would lose the one event nobody can reconstruct afterwards. It
// warns instead, because an operator whose UI looks empty deserves to know why.
import { randomBytes } from 'node:crypto'
import { append, isEnabled, read, readProject, writeProject } from './lib/store.mjs'
import { paths, projectRoot } from './lib/paths.mjs'
import { fold, formatAge } from './lib/view.mjs'
import { serve } from './lib/serve.mjs'

const SEVERITIES = ['blocking', 'blocks-work', 'fyi']

const USAGE = `factory — see what the factory is doing

  factory status              Is the observer on, and is it actually firing
  factory on                  Record this project's sessions
  factory off [--session ID]  Stop recording, or mute one session
  factory ui [--port N]       Open the front end
  factory ask "<question>"    File something that needs an answer
  factory needs               List what is waiting, oldest first
  factory resolve <id>        Close a need

  factory ask options
    --severity blocking|blocks-work|fyi   Default blocks-work
    --blocks 41,43                        Work items this holds up
    --answerer owner                      Who can answer it
    --asked-in 52                         Where it was asked at length

  Severity is about what the loop can still do, not about how urgent it feels.
    blocking      Nothing can proceed. Rare, and it should stay rare.
    blocks-work   Names what it holds up while the loop continues elsewhere.
    fyi           Wants an answer eventually and holds up nothing.
`

function flag(argv, name) {
  const long = `--${name}`
  const index = argv.indexOf(long)
  if (index !== -1) return argv[index + 1] ?? ''
  const inline = argv.find((arg) => arg.startsWith(`${long}=`))
  return inline ? inline.slice(long.length + 1) : null
}

function has(argv, name) {
  return argv.includes(`--${name}`)
}

function positional(argv) {
  const out = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1
      continue
    }
    out.push(arg)
  }
  return out
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function needId() {
  return `n-${randomBytes(3).toString('hex')}`
}

function cmdStatus(root) {
  const state = readProject(root)
  const events = read(root)
  const view = fold(events)

  console.log(`Project:  ${root}`)
  console.log(`Store:    ${paths(root).dir}`)
  console.log(`Recording: ${state.enabled ? 'on' : 'off'}`)

  // The probe. `enabled` is a thing somebody typed; `lastSeen` is a thing the
  // hook did. Only the second one is evidence, and the gap between them is the
  // exact failure that left this repo's merge guard inert for two days with
  // nothing anywhere saying so.
  if (state.enabled && !state.lastSeen) {
    console.log('')
    console.log('The observer has never fired for this project.')
    console.log('A hook is snapshotted when a session starts, so a session that began')
    console.log('before the plugin was installed will never run it, however long it')
    console.log('runs. Start a new session, or check that the plugin is installed.')
  } else if (state.lastSeen) {
    const ago = formatAge(Date.now() - Date.parse(state.lastSeen))
    console.log(`Last event: ${ago} ago (${state.lastSeenEvent || 'unknown'})`)
  }

  if (state.muted?.length) console.log(`Muted sessions: ${state.muted.join(', ')}`)
  console.log('')
  console.log(
    `${view.counts.needs} open need(s), ${view.counts.running} agent(s) running, ` +
      `${view.counts.sessionsLive} live session(s), ${events.length} event(s) recorded.`,
  )
  if (view.counts.derived > 0 && view.counts.declared === 0) {
    console.log('')
    console.log('Every open need was parsed out of a "Blocked on:" line rather than filed')
    console.log('with `factory ask`. That works, and it loses severity and blast radius.')
  }
}

function cmdOn(root) {
  const state = readProject(root)
  state.enabled = true
  state.enabledAt = new Date().toISOString()
  state.root = root
  writeProject(state, root)
  console.log(`Recording ${root}`)
  if (!state.lastSeen) {
    console.log('')
    console.log('No event has been observed here yet. The hook is read fresh on every')
    console.log('fire, so a session already running will pick this up on its next')
    console.log('subagent or turn boundary. Run `factory status` in a minute to confirm')
    console.log('it actually fired.')
  }
}

function cmdOff(root, argv) {
  const session = flag(argv, 'session')
  const state = readProject(root)
  if (session) {
    const muted = new Set(state.muted || [])
    muted.add(session)
    state.muted = [...muted]
    writeProject(state, root)
    console.log(`Muted session ${session}. Other sessions in this project keep recording.`)
    return
  }
  state.enabled = false
  state.disabledAt = new Date().toISOString()
  writeProject(state, root)
  console.log(`Stopped recording ${root}`)
  console.log('The log is kept. `factory ui` still reads it.')
}

function cmdAsk(root, argv) {
  const question = positional(argv).slice(1).join(' ').trim()
  if (!question) fail('Usage: factory ask "<question>" [--severity ...] [--blocks 41,43]')

  const severity = (flag(argv, 'severity') || 'blocks-work').trim()
  if (!SEVERITIES.includes(severity)) {
    fail(`Unknown severity "${severity}". One of: ${SEVERITIES.join(', ')}`)
  }

  const blocksRaw = flag(argv, 'blocks') || ''
  const blocks = blocksRaw
    .split(',')
    .map((item) => item.trim().replace(/^#/, ''))
    .filter(Boolean)

  const id = needId()
  append(
    {
      kind: 'need.open',
      needId: id,
      severity,
      question,
      blocks,
      answerer: flag(argv, 'answerer') || (has(argv, 'owner') ? 'owner' : null),
      askedIn: (flag(argv, 'asked-in') || '').replace(/^#/, '') || null,
      source: 'declared',
    },
    root,
  )

  console.log(`${id}  ${severity}  ${question}`)
  if (blocks.length) console.log(`Blocks: ${blocks.map((b) => `#${b}`).join(', ')}`)
  if (!isEnabled(root)) {
    console.log('')
    console.log('Recorded, but this project is not being observed, so the front end will')
    console.log('show this need and nothing around it. `factory on` fixes that.')
  }
}

function cmdNeeds(root) {
  const view = fold(read(root))
  if (view.needs.length === 0) {
    console.log('Nothing is waiting on an answer.')
    return
  }
  for (const need of view.needs) {
    const bits = [need.severity]
    if (need.blocks?.length) bits.push(`blocks ${need.blocks.map((b) => `#${b}`).join(',')}`)
    bits.push(need.answerer ? `for ${need.answerer}` : 'nobody named')
    if (need.askedIn) bits.push(`asked in #${need.askedIn}`)
    bits.push(need.source)
    console.log(`${need.id}  waiting ${formatAge(need.ageMs)}  [${bits.join(' · ')}]`)
    console.log(`  ${need.question}`)
  }
}

function cmdResolve(root, argv) {
  const [, id] = positional(argv)
  if (!id) fail('Usage: factory resolve <need-id> [--answer "..."]')

  const view = fold(read(root))
  const need = view.needs.find((item) => item.id === id)
  if (!need) {
    // A derived need has no durable identity to close, which is the honest
    // consequence of it being a restated claim rather than a filed record.
    fail(`No open need with id ${id}. \`factory needs\` lists what is open.`)
  }
  if (need.source === 'derived') {
    fail(
      `${id} was parsed out of a "Blocked on:" line, not filed, so there is nothing\n` +
        'to close: it disappears when the loop stops restating it. File it with\n' +
        '`factory ask` if it should outlive the turn.',
    )
  }

  append({ kind: 'need.resolve', needId: id, answer: flag(argv, 'answer') || null, by: 'operator' }, root)
  console.log(`Resolved ${id}.`)
}

async function cmdUi(root, argv) {
  const portRaw = flag(argv, 'port')
  const port = portRaw ? Number(portRaw) : undefined
  if (portRaw && !Number.isInteger(port)) fail(`--port wants a number, got "${portRaw}"`)
  await serve({ root, port, open: !has(argv, 'no-open') })
}

async function main(argv) {
  const command = argv[0] || 'status'
  if (['help', '--help', '-h'].includes(command)) {
    console.log(USAGE)
    return
  }

  const root = projectRoot()

  switch (command) {
    case 'status':
      cmdStatus(root)
      break
    case 'on':
      cmdOn(root)
      break
    case 'off':
      cmdOff(root, argv)
      break
    case 'ask':
      cmdAsk(root, argv)
      break
    case 'needs':
      cmdNeeds(root)
      break
    case 'resolve':
      cmdResolve(root, argv)
      break
    case 'ui':
      await cmdUi(root, argv)
      break
    default:
      console.error(`Unknown command "${command}".\n`)
      console.error(USAGE)
      process.exit(1)
  }
}

await main(process.argv.slice(2))
