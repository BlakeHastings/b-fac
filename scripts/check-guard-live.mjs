// Is the PreToolUse guard loaded in THIS process, right now?
//
// WHAT THIS PREVENTS
// A guard that is written into `.claude/settings.json` and not loaded by the
// running process. Hooks are snapshotted at process start, so a session that
// began before the hook existed never has it, and neither does anything it
// spawns for as long as it lives. That is not a brief window: this repo ran
// for two days and roughly fifteen agents that way, believing it had a control
// it did not have, and the guard never fired once. Nothing said so, because
// the guard is a gate, and a gate that never fired leaves nothing behind. A
// check that never ran at least leaves a missing report. This script exists to
// turn the first thing into the second.
//
// `assets/check-setup.mjs` answers a different question: whether the hook is
// *configured*. Configured, loaded and firing are three states, and only the
// last one denies anything.
//
// HOW IT ANSWERS: BY NOT RUNNING
// `scripts/guard-merge.mjs` refuses this script by name. So:
//
//   guard loaded  -> the harness refuses the tool call and prints the guard's
//                    own message saying so. You never see this file's output.
//   guard inert   -> nothing intercepts anything, this runs, and says so.
//
// Absence is the signal, and it is the only signal that cannot lie about the
// state it is reporting on. A heartbeat written by a `SessionStart` hook has
// the same bootstrapping property (no hooks, no heartbeat) but it leaves an
// artifact behind, and an artifact can be stale: read one from a previous
// process and a session with no hooks at all reports healthy. There is no
// artifact here to misread, and no process identity to get right.
// See docs/architecture/decisions/0027.
//
// Run it once, when you take over a session or after changing hook settings.
// It is not a gate on every command, and it cannot run in CI, where there is
// no harness to intercept anything and the answer would always be "inert".
//
//   node scripts/check-guard-live.mjs
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// A script runner re-invokes this through a shell of its own, so the command
// the guard is shown is `npm run ...` and the script name it matches on is
// nowhere in it. The probe would then always run and always report inert, which
// is the one wrong answer that looks like a correct one.
//
// npm is not the only one, which is why the message no longer says so. #110
// measured npm 11.12.1, pnpm 10.34.5, yarn 1.22.22 and yarn 4.18.0 all setting
// `npm_lifecycle_event` on a `run`, so the one variable covers all four and a
// message naming only npm sends three of those readers looking in the wrong
// place.
if (process.env.npm_lifecycle_event) {
  console.error('Run this directly, not through a package script:\n')
  console.error('  node scripts/check-guard-live.mjs\n')
  console.error('npm, pnpm and yarn all hide the script name from the hook, so the probe')
  console.error('cannot be refused and would report "inert" in a session where the guard is')
  console.error('perfectly fine.')
  process.exit(1)
}

// Whether the hook is *written into* settings decides which of two different
// problems this is, and they have different fixes.
function configured() {
  for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
    if (!existsSync(join(ROOT, file))) continue
    let parsed
    try {
      parsed = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
    } catch {
      return { file, broken: true }
    }
    for (const entry of parsed?.hooks?.PreToolUse ?? []) {
      if ((entry.hooks ?? []).some((h) => (h.command ?? '').includes('guard-merge'))) {
        return { file, broken: false }
      }
    }
  }
  return null
}

console.error('Nothing refused this probe, so do not rely on the guard in this process.')
console.error('')
console.error('What was observed: this script ran. A loaded guard refuses it by name, so')
console.error('either no PreToolUse hook is loaded here, or the copy that is loaded predates')
console.error('this probe. Both have the same fix and neither is a state to work in: until')
console.error('you have seen a refusal, an agent in this process can merge its own pull')
console.error('request and nothing will say that it did.')
console.error('')

const wiring = configured()
if (wiring === null) {
  console.error('It is not configured either: no PreToolUse entry in this repo runs')
  console.error('guard-merge.mjs. Wire it up first. references/enforcement.md has the block.')
} else if (wiring.broken) {
  console.error(`${wiring.file} is not valid JSON, so no hook in it loads at all.`)
} else {
  console.error(`It is configured, in ${wiring.file}, and configured is not loaded.`)
  console.error('Settings are read once, when the CLI starts, so a process that began before')
  console.error('the hook did will never have it, and neither will anything it spawns.')
  console.error('Restart the CLI and run this again.')
}
process.exit(1)
