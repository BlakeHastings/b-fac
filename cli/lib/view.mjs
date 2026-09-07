// Folds the event log into the three answers the front end exists to give:
// what needs me, what is running, what just happened.
//
// DECLARED AND DERIVED NEEDS ARE NOT THE SAME THING AND ARE NOT MERGED AWAY
// A need reaches this file by two routes with different trust and different
// lifetimes, and flattening them would throw away the only cross-check the
// design has.
//
//   declared  The agent ran `factory ask`. It carries a severity, what it
//             blocks and who can answer, because a human wrote those. It is
//             durable: it stays open until something resolves it, so a question
//             asked before a compaction is still on the page afterwards.
//
//   derived   The Stop hook parsed `Blocked on:` out of a turn. It is the
//             current claim rather than a record, so it lives only as long as
//             the agent keeps restating it, which is exactly the semantics the
//             format already has: the skill requires both lines every turn, so
//             a blocker that stops being printed has stopped being a blocker.
//
// The useful reading is the disagreement. A declared need nobody is restating
// means the loop has forgotten a question it filed. A derived blocker with no
// declaration means the agent skipped the CLI, which is layer 0 failing exactly
// where it was predicted to. Both are visible because both are kept.
import { createHash } from 'node:crypto'
import { blockerKey } from './turn.mjs'

const LIVE_SESSION_MS = 1000 * 60 * 60 * 12

// A derived need's id is built from its question, and the question is a
// sentence. Interpolating it produced ids with spaces in them, which cannot be
// passed to `factory resolve` as a single argument without quoting, so the CLI
// saw a truncated id and answered "no such need" instead of the refusal it has
// written for exactly this case. Every id this file mints has to survive being
// copied off a page and typed at a shell.
function shortHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8)
}

function age(iso, now) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.max(0, now - then)
}

export function fold(events, { now = Date.now() } = {}) {
  const sessions = new Map()
  const agents = new Map()
  const declared = new Map()
  const resolved = new Set()
  const lastTurn = new Map()

  for (const event of events) {
    const session = event.session || null
    if (session && !sessions.has(session)) {
      sessions.set(session, {
        id: session,
        started: event.ts,
        lastSeen: event.ts,
        cwd: event.cwd || null,
        ended: null,
      })
    }
    const record = session ? sessions.get(session) : null
    if (record) record.lastSeen = event.ts

    switch (event.kind) {
      case 'session.start':
        if (record) {
          record.started = event.ts
          record.cwd = event.cwd || record.cwd
          record.reason = event.reason || null
          record.ended = null
        }
        break

      case 'session.end':
        if (record) record.ended = event.ts
        break

      case 'agent.start':
        if (event.agent_id) {
          agents.set(event.agent_id, {
            id: event.agent_id,
            type: event.agent_type || 'agent',
            session,
            started: event.ts,
            brief: event.brief || null,
            stopped: null,
          })
        }
        break

      case 'agent.stop': {
        const agent = event.agent_id && agents.get(event.agent_id)
        if (agent) {
          agent.stopped = event.ts
          agent.summary = event.summary || null
        }
        break
      }

      case 'turn.end':
        if (session) lastTurn.set(session, event)
        break

      case 'need.open':
        if (event.needId) {
          declared.set(event.needId, {
            id: event.needId,
            source: 'declared',
            severity: event.severity || 'blocks-work',
            question: event.question || '(no question recorded)',
            blocks: Array.isArray(event.blocks) ? event.blocks : [],
            answerer: event.answerer || null,
            askedIn: event.askedIn || null,
            session,
            opened: event.ts,
            resolved: null,
            answer: null,
          })
        }
        break

      case 'need.resolve':
        if (event.needId) {
          resolved.add(event.needId)
          const need = declared.get(event.needId)
          if (need) {
            need.resolved = event.ts
            need.answer = event.answer || null
            need.resolvedBy = event.by || null
          }
        }
        break

      default:
        break
    }
  }

  // A session whose process died leaves no session.end, so staleness is what
  // closes it rather than an event that never arrives. Same reasoning as the
  // research finding that a subagent killed by a full context fires no
  // SubagentStop: absence has to be inferred from silence somewhere.
  for (const session of sessions.values()) {
    const idle = age(session.lastSeen, now)
    session.idleMs = idle
    session.live = !session.ended && idle !== null && idle < LIVE_SESSION_MS
  }

  const openDeclared = [...declared.values()].filter((need) => !resolved.has(need.id))
  const declaredKeys = new Map(openDeclared.map((need) => [blockerKey({ question: need.question }), need]))

  const derived = []
  for (const [session, turn] of lastTurn) {
    const record = sessions.get(session)
    if (record && !record.live) continue
    for (const blocker of turn.blockers || []) {
      const key = blockerKey(blocker)
      const match = declaredKeys.get(key)
      if (match) {
        match.restated = turn.ts
        continue
      }
      derived.push({
        id: `derived-${String(session).slice(0, 8)}-${shortHash(key)}`,
        source: 'derived',
        severity: 'blocks-work',
        severityInferred: true,
        question: blocker.question,
        blocks: blocker.blocks || [],
        answerer: blocker.answerer,
        askedIn: blocker.askedIn,
        meanwhile: blocker.meanwhile,
        session,
        opened: turn.ts,
        resolved: null,
      })
    }
  }

  const needs = [...openDeclared, ...derived]
    .map((need) => ({ ...need, ageMs: age(need.opened, now) }))
    .sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0))

  const running = [...agents.values()]
    .filter((agent) => !agent.stopped)
    .filter((agent) => {
      const record = agent.session ? sessions.get(agent.session) : null
      return !record || record.live
    })
    .map((agent) => ({ ...agent, ageMs: age(agent.started, now) }))
    .sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0))

  const turns = [...lastTurn.entries()].map(([session, turn]) => ({
    session,
    ts: turn.ts,
    next: turn.next,
    nextIsNothing: !!turn.nextIsNothing,
    missingLines: [
      turn.present?.next ? null : 'Next:',
      turn.present?.blocked ? null : 'Blocked on:',
    ].filter(Boolean),
  }))

  return {
    generated: new Date(now).toISOString(),
    needs,
    running,
    sessions: [...sessions.values()].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')),
    turns,
    recent: events.slice(-80).reverse(),
    counts: {
      needs: needs.length,
      declared: needs.filter((n) => n.source === 'declared').length,
      derived: needs.filter((n) => n.source === 'derived').length,
      running: running.length,
      sessionsLive: [...sessions.values()].filter((s) => s.live).length,
    },
  }
}

export function formatAge(ms) {
  if (ms === null || ms === undefined) return '?'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
