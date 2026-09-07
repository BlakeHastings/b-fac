// The event log, and the switch that decides whether anything is written to it.
//
// APPEND-ONLY JSONL, AND THE TWO REASONS IT IS NOT A DATABASE
// Writers are separate OS processes that never coordinate: one hook process per
// event, plus whatever the CLI is doing, plus a running `factory ui`. A single
// `appendFileSync` of one line opened O_APPEND is the cheapest thing that is
// safe under that, and it needs no daemon to be running for a write to land.
// The second reason is that the log is the record: a corrupt line loses one
// event rather than the history, and a reader that skips unparseable lines
// degrades instead of failing. `read()` below does exactly that.
//
// THE SWITCH IS DATA THE HOOK READS, NOT WIRING THE HARNESS SNAPSHOTS
// references/enforcement.md measured the asymmetry this depends on. A hook
// ENTRY in settings is snapshotted when the process starts, so installing or
// removing one reaches nothing already running. The SCRIPT that entry names is
// read off disk every time the hook fires, so what the script decides is live
// everywhere within one event.
//
// That is the only reason `/factory on` can work at all. The hook is installed
// permanently by the plugin and asks this file, on every fire, whether it
// should be doing anything. Turning the factory on flips a file, and a session
// that has been running for two days picks it up on its next event.
//
// WHY THE SWITCH IS PER PROJECT AND NOT PER SESSION
// Measured, not chosen. Claude Code exports no session id to a Bash tool call:
// hooks receive `session_id` in their JSON payload, and a command the agent
// runs receives CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA and
// CLAUDE_EFFORT, none of which identify the session. So a CLI cannot enable
// "this session", because it cannot name it.
//
// What it can name is the project, and that turns out to be the useful unit
// anyway: the ask was that an unrelated session somewhere else is untouched,
// and a per-project switch delivers that exactly. Sessions stay distinguishable
// because every event carries the `session` the hook read from its payload, so
// the front end separates them even though the switch does not.
//
// The asymmetry that buys back the rest: enabling is per project because that
// is all the CLI can address, and MUTING is per session, because by then the
// ids exist in the log and a user can point at one.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { ensureDir, paths } from './paths.mjs'

// One event must fit in a single atomic append. POSIX guarantees that for a
// write under PIPE_BUF only on pipes, not on files, so this is a practical
// bound rather than a proof: a long agent brief is truncated so that two
// concurrent hooks cannot produce a line that neither wrote.
const MAX_FIELD = 2000
const MAX_LINE = 8000

// Bound the log so an observer left on for a month cannot fill a disk. The
// front end shows recent activity and open needs, and neither wants a million
// lines. Trimming keeps the tail because the tail is what the UI reads.
const MAX_EVENTS = 20000
const TRIM_TO = 15000

function clamp(value) {
  if (typeof value !== 'string') return value
  return value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}…` : value
}

function clampDeep(value) {
  if (Array.isArray(value)) return value.slice(0, 50).map(clampDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clampDeep(v)]))
  }
  return clamp(value)
}

export function readProject(root) {
  const p = paths(root)
  if (!existsSync(p.project)) return { root: p.root, enabled: false, muted: [] }
  try {
    const parsed = JSON.parse(readFileSync(p.project, 'utf8'))
    return { root: p.root, enabled: false, muted: [], ...parsed }
  } catch {
    // A hand-edited or half-written file must not take the CLI down with it.
    return { root: p.root, enabled: false, muted: [] }
  }
}

// Write to a sibling and rename, because the observer rewrites this file on
// every hook fire and several hooks can be in flight at once. A plain
// writeFileSync truncates first, so a reader arriving in that window gets an
// empty or half-written file and `readProject` falls back to "off" — which
// would read as somebody having switched the factory off mid-run. rename is
// atomic enough on both platforms to close that window, and Node's renameSync
// replaces an existing destination on Windows as well as POSIX.
//
// It does NOT close the read-modify-write race: two hooks that both read, then
// both write, lose one update. That is deliberate rather than overlooked. The
// field they contend over is `lastSeen`, where a lost update is rewritten by
// the next event a moment later, and the field where losing one would matter,
// `muted`, is only ever written by a human running a command. Locking would
// cost every hook fire a lock file to buy nothing measurable.
export function writeProject(state, root) {
  const p = paths(root)
  ensureDir(dirname(p.project))
  const staging = `${p.project}.${process.pid}.tmp`
  writeFileSync(staging, `${JSON.stringify(state, null, 2)}\n`)
  try {
    renameSync(staging, p.project)
  } catch {
    rmSync(staging, { force: true })
    throw new Error(`could not replace ${p.project}`)
  }
  return state
}

export function isEnabled(root, session) {
  const state = readProject(root)
  if (!state.enabled) return false
  if (session && Array.isArray(state.muted) && state.muted.includes(session)) return false
  return true
}

// Every write goes through here, so every write is bounded and every write
// carries a timestamp and an id the front end can key on.
export function append(event, root) {
  const p = paths(root)
  ensureDir(dirname(p.events))
  const record = { id: randomUUID(), ts: new Date().toISOString(), ...clampDeep(event) }
  let line = JSON.stringify(record)
  if (line.length > MAX_LINE) {
    // Something got past the field clamp. Drop the payload rather than the
    // event: knowing an agent started is worth more than its brief.
    line = JSON.stringify({ id: record.id, ts: record.ts, kind: record.kind, truncated: true })
  }
  appendFileSync(p.events, `${line}\n`)
  return record
}

export function read(root, { limit } = {}) {
  const p = paths(root)
  if (!existsSync(p.events)) return []
  let text
  try {
    text = readFileSync(p.events, 'utf8')
  } catch {
    return []
  }
  const lines = text.split('\n').filter((line) => line.trim())
  const slice = limit ? lines.slice(-limit) : lines
  const events = []
  for (const line of slice) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object' && parsed.kind) events.push(parsed)
    } catch {
      // A torn line from two racing appends. Skip it; do not fail the read.
    }
  }
  return events
}

// Called opportunistically rather than on a timer, because there is no daemon
// to hold a timer. The cost is one read and one write, paid rarely.
export function trim(root) {
  const p = paths(root)
  if (!existsSync(p.events)) return 0
  const lines = readFileSync(p.events, 'utf8').split('\n').filter((line) => line.trim())
  if (lines.length <= MAX_EVENTS) return 0
  const kept = lines.slice(-TRIM_TO)
  writeFileSync(p.events, `${kept.join('\n')}\n`)
  return lines.length - kept.length
}

export function ensureProjectDir(root) {
  const p = paths(root)
  mkdirSync(p.dir, { recursive: true })
  return p.dir
}

export const _test = { MAX_FIELD, MAX_LINE, MAX_EVENTS, clampDeep }
