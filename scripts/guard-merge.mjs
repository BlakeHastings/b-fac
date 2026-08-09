// PreToolUse guard: nothing reaches `main` except through the sanctioned path.
//
// WHAT THIS PREVENTS
// Branch protection is unavailable on a private repo on this plan, so
// GitHub will happily accept a merge with CI red, or a direct push to main that
// skips review entirely. Agents run unattended, and "I was told not to" is not a
// control. This is the control.
//
// It reads the Bash command Claude Code is about to run and denies the ones that
// can land code on main. The permitted route is `node scripts/merge-pr.mjs <n>`,
// which verifies every required check is green and then squash-merges. That
// command does not match anything below, and the `gh api` call it makes
// internally is a child process rather than a Bash tool call, so the guard does
// not see it. Making the safe path the only working path beats asking nicely.
import { execSync } from 'node:child_process'

const DEFAULT_BRANCH = 'main'

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

// Strip quotes so `git push "origin" "main"` reads the same as the bare form.
const normalized = command.replace(/["']/g, ' ').replace(/\s+/g, ' ')

const USE_WRAPPER =
  'Use the sanctioned path instead:\n\n' +
  '  node scripts/merge-pr.mjs <pr-number>\n\n' +
  'It refuses to merge unless every required check is green, and always squash\n' +
  'merges. See docs/process/working-an-issue.md.'

if (/\bgh\s+pr\s+merge\b/.test(normalized)) {
  deny(`Blocked: \`gh pr merge\` bypasses the green-checks requirement.\n\n${USE_WRAPPER}`)
}

// The REST merge endpoints, reached directly.
if (/\bgh\s+api\b/.test(normalized) && /\/(merge|merges)\b/.test(normalized)) {
  deny(`Blocked: merging through \`gh api\` skips the check verification.\n\n${USE_WRAPPER}`)
}

// Only the push's own arguments, stopping at the next command in a chain.
//
// Reading the whole command instead is a real defect this guard shipped with:
// a commit message that merely mentions the branch, in the same line as a push
// to a feature branch, was read as a push to `main` and denied. It blocked a
// legitimate push whose message happened to explain something about `main`.
// A guard that cries wolf gets worked around, which is worse than one gap.
const pushArguments = normalized.match(/\bgit\s+push\b([^&|;]*)/)?.[1] ?? null

if (pushArguments !== null) {
  const target = new RegExp(
    `(^|\\s)(${DEFAULT_BRANCH}|HEAD:${DEFAULT_BRANCH}|:${DEFAULT_BRANCH})(\\s|$)`,
  )
  if (target.test(pushArguments)) {
    deny(
      `Blocked: pushing directly to ${DEFAULT_BRANCH} skips review and CI entirely.\n\n` +
        `Push your feature branch and open a PR. ${USE_WRAPPER}`,
    )
  }

  // `git push origin some-feature-branch` is fine even while standing on main,
  // which is normal when tidying up after a merge. Only a push with no explicit
  // destination inherits the current branch and is therefore risky.
  const positional = pushArguments
    .split(' ')
    .filter((token) => token && !token.startsWith('-'))
  // [remote, refspec]: a refspec means the destination is explicit, and the
  // check above already rejected it if that destination was the default branch.
  if (positional.length >= 2) process.exit(0)
}

// Syncing the default branch to what is already on the remote.
//
// `git merge --ff-only origin/main` is how you catch local `main` up after a
// pull request merges, and it cannot introduce anything: a fast-forward moves
// the branch to a commit the remote already has, which by definition went
// through a pull request. Denying it made the guard obstruct the one git
// operation this workflow performs most, and a guard that obstructs routine
// work gets worked around, which costs more than the gap it was protecting.
//
// Narrow on purpose. `--ff-only` alone is not enough, because a fast-forward
// from a *local* branch would land unreviewed commits; the ref has to name a
// remote. Anything else on the default branch still falls through below.
const fastForwardFromRemote =
  /\bgit\s+merge\b/.test(normalized) &&
  /--ff-only\b/.test(normalized) &&
  /\b[\w.-]+\/[\w.\/-]+\b/.test(normalized.replace(/\bgit\s+merge\b/, ''))

if (fastForwardFromRemote) process.exit(0)

// A bare `git push` or a `git merge` is only dangerous depending on the branch
// you are standing on, which the command text does not tell us.
if (/\bgit\s+(push|merge)\b/.test(normalized)) {
  let branch = ''
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    process.exit(0) // Not a git repo, or git unavailable. Not our call to make.
  }

  if (branch === DEFAULT_BRANCH) {
    deny(
      `Blocked: you are on ${DEFAULT_BRANCH}, so this would put code on the default\n` +
        `branch without a pull request.\n\n` +
        `Create a branch first:  git checkout -b <area>/<issue>-<slug>\n\n${USE_WRAPPER}`,
    )
  }
}

process.exit(0)
