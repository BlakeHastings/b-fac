// The observer. Writes what the factory did; decides nothing and refuses
// nothing.
//
// THE FIRST RULE IS THAT THIS CANNOT BREAK A SESSION
// This ships inside a plugin, so it is installed for everyone who installs the
// plugin, including people using the harness for something entirely unrelated.
// A guard that wedges what it protects is worse than no guard, and an
// *observer* that does it has traded away something it was never protecting.
//
// So: every path exits 0, no path ever writes a permission decision, and the
// whole body is wrapped so that a bug in here costs an event rather than a tool
// call. If you are editing this file and find yourself wanting a non-zero exit,
// the answer is no.
//
// THE SECOND RULE IS THAT IT IS FREE WHEN IT IS OFF
// A session that has not run `/factory on` reads one small JSON file and exits.
// That is the entire cost, and it is paid on session and subagent lifecycle
// events, which are rare.
//
// WHICH IS WHY THERE IS NO PreToolUse WIRING, AND THAT WAS A DELIBERATE LOSS
// Per-tool-call events would show individual commands and would make a hook
// firing or not firing visible, which is the shape of failure that once left
// this repo's merge guard inert for two days with nothing saying so. They would
// also spawn a Node process on every Bash call in every session on the machine.
// The lifecycle events answer the questions actually asked — what is running,
// what needs me, what happened — for a small fraction of the cost, and the
// probe below recovers most of what the loss cost: SessionStart firing at all
// is the evidence that this file is loaded.
//
// WIRED IN hooks/hooks.json. SessionStart, SubagentStart, SubagentStop, Stop
// and SessionEnd. Nothing else.
import { append, isEnabled, readProject, trim, writeProject } from '../cli/lib/store.mjs'
import { paths, projectRoot } from '../cli/lib/paths.mjs'
import { parseTurn } from '../cli/lib/turn.mjs'

// Roughly one trim per two hundred events, without keeping a counter anywhere.
const TRIM_CHANCE = 0.005

function readPayload() {
  return new Promise((resolve) => {
    let raw = ''
    const timer = setTimeout(() => resolve(null), 5000)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(null)
      }
    })
    process.stdin.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

// The project a hook is about. CLAUDE_PROJECT_DIR is documented to stay at the
// original root even when the session enters a worktree, which is what keeps an
// agent's events filed under the run that dispatched it rather than under the
// worktree it is standing in. The payload's `cwd` is recorded but never used as
// the key, precisely because it moves.
function rootFor(payload) {
  if (process.env.CLAUDE_PROJECT_DIR) return projectRoot(process.env.CLAUDE_PROJECT_DIR)
  return projectRoot(payload?.cwd || process.cwd())
}

// The probe, and the reason it is a timestamp rather than a boolean. A session
// started before the plugin was installed has no hook in its snapshot, so this
// file will never run for it, and `/factory on` in that session will look like
// it worked. `factory status` reads this stamp: enabled with a stamp that never
// moves is the two-day inert guard repeating itself in the layer whose whole
// job is visibility.
function stampSeen(root, session, event) {
  const state = readProject(root)
  state.lastSeen = new Date().toISOString()
  state.lastSeenEvent = event
  if (session) {
    state.seenSessions = { ...(state.seenSessions || {}), [session]: state.lastSeen }
  }
  writeProject(state, root)
}

function record(payload) {
  const event = payload?.hook_event_name
  const session = payload?.session_id || null
  const root = rootFor(payload)

  // Read the switch before doing anything else. This is the whole off-path.
  if (!isEnabled(root, session)) return

  stampSeen(root, session, event)

  const base = { session, cwd: payload?.cwd || null }

  switch (event) {
    case 'SessionStart':
      append({ ...base, kind: 'session.start', reason: payload?.start_reason || null }, root)
      break

    case 'SessionEnd':
      append({ ...base, kind: 'session.end', reason: payload?.reason || null }, root)
      break

    case 'SubagentStart':
      append(
        {
          ...base,
          kind: 'agent.start',
          agent_id: payload?.agent_id || null,
          agent_type: payload?.agent_type || null,
          // The brief is the single most useful string on this page, because it
          // is what turns "three agents running" into "three agents running on
          // what". It is clamped by the store rather than here.
          brief: payload?.subagent_instructions || null,
        },
        root,
      )
      break

    case 'SubagentStop':
      append(
        {
          ...base,
          kind: 'agent.stop',
          agent_id: payload?.agent_id || null,
          agent_type: payload?.agent_type || null,
          summary: payload?.last_assistant_message || null,
        },
        root,
      )
      break

    case 'Stop': {
      // The one place this file reads model output, and it reads only the two
      // lines the skill already mandates. Everything else in the message is
      // ignored on purpose: recording assistant prose would put a client's
      // material in a user-level log, which the guest-mode boundary forbids.
      const parsed = parseTurn(payload?.last_assistant_message)
      append(
        {
          ...base,
          kind: 'turn.end',
          present: parsed.present,
          next: parsed.next,
          nextIsNothing: parsed.nextIsNothing,
          blockers: parsed.blockers,
        },
        root,
      )
      break
    }

    default:
      break
  }

  if (Math.random() < TRIM_CHANCE) trim(root)
}

const payload = await readPayload()
try {
  record(payload)
} catch {
  // Deliberately silent. stderr from a hook is shown to the model on some
  // events, and an observer that starts narrating its own failures into the
  // conversation is worse than one that quietly loses an event. `factory
  // status` is where an absent observer is meant to become visible, and it
  // reads the stamp above rather than anything printed here.
}
process.exit(0)
