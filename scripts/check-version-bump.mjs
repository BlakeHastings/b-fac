// Fails when the shipped payload changed but `plugin.json`'s version did not.
//
// WHAT THIS PREVENTS
// `plugin.json` carries the only version number an installer ever sees. Claude
// Code reads it and nothing else. Verified: putting a different `version` on
// the marketplace entry makes `claude plugin validate --strict` say "At install
// time, plugin.json wins ... the entry version is silently ignored". So a
// payload change that leaves that number alone ships to everyone who already
// has the plugin as no change at all: `claude plugin update` compares versions,
// sees the same one, and does nothing.
//
// This is not hypothetical here. Three pull requests rewrote the skill's
// content in a single day and the version stayed at 0.1.0 through all three.
// An instruction to "remember to bump" is exactly the kind of thing this repo
// has already found does not hold, so it is a check instead.
//
// THE BASE MATTERS MORE THAN THE COMPARISON
// The question is "did the version move across this branch", which needs the
// merge base with the default branch. `HEAD~1` would answer a different
// question and answer it wrong: every squash-merged branch has a single-commit
// history relative to main, so a HEAD~1 comparison passes for free and catches
// nothing. Three-dot `git diff base...HEAD` is diff-from-the-merge-base, which
// is the one that holds. It needs real history, so CI checks out with
// `fetch-depth: 0`; a shallow clone makes this check unable to see and it says
// so rather than passing.
//
// WHAT "NOW" MEANS HERE, AND WHY check-collisions.mjs DISAGREES
// This check reads commits, because the question is what a merge would ship,
// and an uncommitted edit ships nothing. check-collisions.mjs reads the
// filesystem, because an ADR number collides the moment the file exists. The
// two therefore mean different things by "now", on purpose.
//
// The cost of that is a green here that answers a question you did not ask:
// working-an-issue.md says to run `npm run check` before committing, and with
// an uncommitted payload edit this passed, because from git's point of view
// nothing had changed. A reviewer read that green as "no bump needed" and
// briefly believed they had found a hole in the check rather than in their
// measurement. So when the working tree holds payload edits this check cannot
// see, it says so. It does not fail on them: editing with uncommitted changes
// is the normal state of working, and a check that reds during ordinary
// editing gets switched off.
//
//   node scripts/check-version-bump.mjs             # against origin/main
//   node scripts/check-version-bump.mjs --base=main # against something else
import { execFileSync } from 'node:child_process'

// What an installer actually receives. The skills are the payload; plugin.json
// is the manifest shipped alongside them, so a change to its description or
// keywords is a change users see too. A version bump is itself a change to that
// file, which is what makes including it self-consistent rather than a trap.
//
// marketplace.json is deliberately absent. It is the catalogue entry, read
// before install and not part of the installed plugin, so editing its blurb is
// not a release.
const PAYLOAD = [/^\.agents\/skills\//, /^\.claude\/skills\//, /^\.claude-plugin\/plugin\.json$/]

const MANIFEST = '.claude-plugin/plugin.json'

const baseArg = process.argv.find((arg) => arg.startsWith('--base='))
const BASE = baseArg ? baseArg.slice('--base='.length) : process.env.VERSION_BUMP_BASE || 'origin/main'

function gitRaw(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function git(args) {
  return gitRaw(args).trim()
}

let mergeBase
try {
  mergeBase = git(['merge-base', BASE, 'HEAD'])
} catch {
  console.error(`Cannot resolve a merge base between ${BASE} and HEAD, so this check`)
  console.error('cannot see what the branch changed. It fails rather than passing,')
  console.error('because a check that scans nothing reports green forever.\n')
  console.error('  In CI: actions/checkout needs fetch-depth: 0.')
  console.error(`  Locally: git fetch origin main, or pass --base=<ref>.`)
  process.exit(1)
}

const changed = git(['diff', '--name-only', `${mergeBase}...HEAD`]).split('\n').filter(Boolean)
const payloadChanges = changed.filter((file) => PAYLOAD.some((pattern) => pattern.test(file)))

// The one thing everything above cannot see. Porcelain paths are relative to
// the repository root, so they compare against PAYLOAD on the same terms as
// the diff. A rename emits its old path as a second NUL-separated token, which
// is not a changed file in its own right.
//
// gitRaw, not git: an unstaged entry begins with a space (" M path"), and
// trimming the output eats that space on the first entry only, shifting one
// path by one character so it silently stops matching PAYLOAD. Caught by
// running it, not by reading it.
function uncommittedPaths() {
  const tokens = gitRaw(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean)
  const paths = []
  for (let i = 0; i < tokens.length; i += 1) {
    paths.push(tokens[i].slice(3))
    if (tokens[i][0] === 'R' || tokens[i][0] === 'C') i += 1
  }
  return paths
}

const uncommittedPayload = uncommittedPaths().filter((file) =>
  PAYLOAD.some((pattern) => pattern.test(file)),
)

// Printed only when there is something to say. A warning on every run is one
// nobody reads by the third day, and then it is not a warning.
function reportUncoveredWorkingTree() {
  if (uncommittedPayload.length === 0) return
  console.warn(
    `\nNot covered by the answer above: ${uncommittedPayload.length} payload file(s) with ` +
      'uncommitted changes.',
  )
  for (const file of uncommittedPayload.slice(0, 10)) console.warn(`  ${file}`)
  if (uncommittedPayload.length > 10) {
    console.warn(`  ...and ${uncommittedPayload.length - 10} more`)
  }
  console.warn(
    `This check compares commits (git diff ${BASE}...HEAD), which is what CI will see.\n` +
      'Commit those files and run it again before you trust its verdict.',
  )
}

if (payloadChanges.length === 0) {
  console.log(
    `No committed payload change against ${BASE} (${changed.length} file(s) changed), ` +
      'so no version bump is required.',
  )
  reportUncoveredWorkingTree()
  process.exit(0)
}

function versionAt(rev) {
  const version = JSON.parse(git(['show', `${rev}:${MANIFEST}`])).version
  if (typeof version !== 'string') {
    console.error(`${MANIFEST} has no string "version" field at ${rev}.`)
    process.exit(1)
  }
  return version
}

// Which files this branch changed is a question about the merge base. What
// version is already published is a question about the tip of the default
// branch, and they are not the same commit once main moves under you. Asking
// the merge base for the version lets a branch inherit someone else's bump and
// call it its own: main goes 0.1.0 to 0.2.0, your untouched-version branch
// merges to 0.2.0, and a merge-base comparison sees 0.1.0 to 0.2.0 and passes.
const before = versionAt(BASE)
const after = versionAt('HEAD')

// Enough semver to order two releases of one plugin: the numeric triple, with a
// prerelease sorting below the release it leads to. Anything richer is a
// dependency we are not taking for a three-field comparison.
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version)
  return match
    ? { triple: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
    : null
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a.triple[i] !== b.triple[i]) return a.triple[i] - b.triple[i]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : 1
}

const fail = (why) => {
  console.error(`${why}\n`)
  console.error(`  ${MANIFEST} on ${BASE}: ${before}`)
  console.error(`  ${MANIFEST} here:      ${after}\n`)
  console.error(`Shipped files this branch changed (${payloadChanges.length}):`)
  for (const file of payloadChanges.slice(0, 10)) console.error(`  ${file}`)
  if (payloadChanges.length > 10) console.error(`  ...and ${payloadChanges.length - 10} more`)
  console.error('\nBump "version" in the same pull request. docs/process/releasing.md says')
  console.error('which digit. If this branch does not really change what installers get,')
  console.error('the fix is to take the payload edit out, not to bump.')
  reportUncoveredWorkingTree()
  process.exit(1)
}

const parsedBefore = parse(before)
const parsedAfter = parse(after)

if (!parsedBefore || !parsedAfter) {
  fail(`A version here is not MAJOR.MINOR.PATCH, so releases cannot be ordered.`)
}

if (compare(parsedAfter, parsedBefore) <= 0) {
  fail(
    before === after
      ? 'The shipped payload changed but the plugin version did not move.'
      : 'The plugin version moved backwards.',
  )
}

console.log(
  `Payload changed in ${payloadChanges.length} committed file(s) and the version moved ` +
    `${before} to ${after}.`,
)
reportUncoveredWorkingTree()
