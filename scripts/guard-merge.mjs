// PreToolUse guard: an agent does not land its own pull request.
//
// WHAT THIS PREVENTS
// The ruleset on the default branch already refuses direct pushes, force
// pushes and deletion, with no bypass actors. What it does not refuse is a
// merge: anyone with write access can land a green PR, and agents run with the
// owner's credentials. "Agents do not land code" is a separate constraint from
// "nothing reaches main unreviewed", and only this guard enforces it.
//
// WHAT THIS DOES NOT COVER
// Any session the harness did not load it into, any human at a terminal, and
// CI. A net, not a guarantee. The ruleset is the guarantee.
//
// The permitted route is `node scripts/merge-pr.mjs <n>`. It does not match
// anything below, and the `gh api` call it makes internally is a child process
// rather than a Bash tool call, so this guard never sees it. Making the safe
// path the only working path beats asking nicely.
//
// The push and `git merge` cases from the skill's original are deliberately
// gone. See docs/architecture/decisions/0001. Two reasons, and the second is
// the one that matters: the ruleset makes them unreachable, and they worked by
// shelling out to `git rev-parse` to learn the current branch, which
// references/enforcement.md itself calls unsound — a PreToolUse hook runs
// before the command, so a `cd` in that command has not happened yet and the
// branch it reads may not be the branch the command acts on.

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

let payload = ''
for await (const chunk of process.stdin) payload += chunk

let command = ''
try {
  command = JSON.parse(payload)?.tool_input?.command ?? ''
} catch {
  process.exit(0) // Unparseable payload is not this guard's problem.
}
if (!command.trim()) process.exit(0)

// Strip quotes so `gh pr "merge"` reads the same as the bare form.
const normalized = command.replace(/["']/g, ' ').replace(/\s+/g, ' ')

const USE_WRAPPER =
  'Push your branch, open the PR, report back, and stop. The orchestrator\n' +
  'reviews and merges with:\n\n' +
  '  node scripts/merge-pr.mjs <pr-number>\n\n' +
  'See docs/process/working-an-issue.md.'

if (/\bgh\s+pr\s+merge\b/.test(normalized)) {
  deny(`Blocked: agents do not land pull requests.\n\n${USE_WRAPPER}`)
}

// The REST merge endpoints, reached directly. Matched on the path segment
// rather than anywhere in the line, so a branch called `merges-cleanup` or a
// commit message mentioning a merge does not trip it.
if (/\bgh\s+api\b/.test(normalized) && /\/(merge|merges)(\s|$|\/)/.test(normalized)) {
  deny(`Blocked: merging through \`gh api\` is still merging.\n\n${USE_WRAPPER}`)
}

process.exit(0)
