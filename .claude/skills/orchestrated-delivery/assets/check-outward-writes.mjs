// What evidence this machine holds that the factory wrote outward, and what it
// cannot hold evidence of at all.
//
// WHAT THIS PREVENTS
// ADR 0021 defined guest mode as a write boundary rather than as a temperament
// on one argument: **"guest mode performed no external writes" is a claim
// something can check.** ADR 0029 then gave the boundary a gate, which is
// prevention. Nothing ever checked. The assertion the boundary was chosen for
// had never been available, so at the end of a session the only answer to "did
// this touch anything outside my machine" was "the gate did not refuse
// anything", which is a different claim, and is exactly what a gate that never
// loaded also says.
//
// SKILL.md's fourth constraint is why that matters more than it sounds:
// whatever prevention you have, add detection. The gate's own NOT COVERED list
// is long and honest. A process the harness never loaded it into, a human at a
// terminal, `sudo`, `env`, a command assembled from a variable, and the three
// harnesses where it cannot be installed at all. Prevention is a net.
// **Detection runs on the result, which is the one thing a bypass cannot avoid
// producing**, and a push made by any of those routes writes the same reflog
// entry as a push the gate would have refused.
//
// WHAT IS ACTUALLY CHECKABLE, WHICH IS NARROWER THAN THE SENTENCE IT REPLACES
// `references/first-run.md` ends the publish step with a sentence somebody
// writes by hand: *no branch pushed, no issue opened, no comment posted,
// nothing outside this machine touched.* One clause of that is mechanisable and
// the rest are not, and saying which is which is most of this file's value.
//
//   no branch pushed          CHECKED here, and attributably
//   no issue opened           not checkable locally. `gh` keeps no record
//   no comment posted         not checkable locally, same reason
//   nothing outside touched   not checkable at all, by anything
//
// A report that implied it had verified more than that would be worse than the
// honest sentence it replaced, because it would be quoted at a code review.
//
// HOW THE PUSH ANSWER IS ATTRIBUTABLE, WHICH IS THE PART WORTH THE MOST
// Measured on git 2.44.0, in a scratch repository with a real remote and a real
// linked worktree, rather than assumed:
//
//   we pushed                         refs/remotes/<remote>/<branch> gains a
//                                     reflog entry reading `update by push`
//   somebody else pushed, we fetched  the same ref gains `fetch origin: ...`
//   we cloned                         no refs/remotes reflog entry at all
//   we pushed --dry-run               no ref and no entry
//   we pushed and nothing changed     no entry: git logs effective writes
//
// So the reflog **distinguishes a push made from this repository from a push
// made by a colleague**, which is the question a branch's existence on the
// remote cannot answer. That is why this reads the reflog first and asks the
// remote only when told to.
//
// It is a fact about the *repository*, not about a checkout: reflogs live in
// the git common directory, so a push made from a linked worktree is visible
// from the main checkout and from every other worktree, byte for byte.
// Measured, because ADR 0037 exists precisely because every "does this
// repository have X" question turned out to be about a directory.
//
// WHAT THIS DOES NOT COVER
// In the same register as the gate's own list, because a detection layer that
// overclaims is worse than none.
//
//   - **Anything that is not a git push.** An issue opened, a comment posted, a
//     pull request created on an already-pushed branch, a review submitted:
//     `gh` writes leave nothing behind. Measured, on this machine: gh's state
//     directories hold a config file, a hosts file, a device id, an Actions
//     run-log cache and an HTTP *response* cache, and no command history. A
//     `gh pr create` on a branch with no upstream does push first, so that one
//     shows up as a push and the pull request itself still does not.
//   - **Everything that is not git or gh either.** `curl`, `glab`, `az repos`,
//     `npm publish`, `docker push`, `scp`, an editor's forge integration. The
//     gate cannot refuse these and this cannot see them. Nothing here narrows
//     that gap; it only stops it being invisible in the *push* direction.
//   - **A push whose destination is a URL rather than a named remote.**
//     Measured: `git push https://host/x/y HEAD:refs/heads/z` updates no
//     remote-tracking ref and writes no reflog entry. `--remote` is the partial
//     answer, since the branch is on the remote afterwards either way.
//   - **A push that was undone.** `git push --delete` removes the
//     remote-tracking ref, and deleting a ref deletes its reflog. `git remote
//     rename` replaces every entry with one `remote: renamed` line. Both erase
//     the evidence of the pushes before them. Measured. That is the same threat
//     model the gate states: an agent that forgot, not one that is hiding.
//   - **Anything older than the reflog.** git expires reflog entries, 90 days
//     by default, so "everything the reflog holds" is a window and not history.
//   - **A repository with reflogs switched off.** `core.logAllRefUpdates=false`
//     makes a push update the ref and write nothing. Measured, and reported as
//     UNCHECKED rather than clear, because a check that scans nothing passes.
//   - **Whether the gate was loaded.** That is the probe's question and it
//     cannot be answered from here; see the note this prints under the report.
//
//   node <this skill>/assets/check-outward-writes.mjs            # the report
//   node <this skill>/assets/check-outward-writes.mjs --remote   # ask the remote too
//   node <this skill>/assets/check-outward-writes.mjs --mark     # a publish was authorised
//
// Requires Node 18 or later and `git`. No network unless `--remote` is passed,
// no `gh`, no dependencies.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// Looked and saw nothing; looked and saw something; could not look. The third
// is the one this file exists to keep separate from the first, and it is the
// reason there are three exit codes rather than two.
const CLEAR = 'CLEAR'
const FOUND = 'FOUND'
const UNCHECKED = 'UNCHECKED'
const NOTE = 'note'

const EXIT_CLEAR = 0
const EXIT_FOUND = 1
const EXIT_UNCHECKED = 2

// The root comes from the working directory, never from this file's location,
// so the first run can happen from inside the installed skill before anything
// has been copied anywhere. Same rule as check-setup.mjs.
const rootArg = process.argv.find((arg) => arg.startsWith('--root='))
let ROOT = resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd())
for (;;) {
  // `.git` is a directory in a main checkout and a file in a linked worktree.
  if (existsSync(join(ROOT, '.git'))) break
  const up = dirname(ROOT)
  if (up === ROOT) {
    console.error('Not inside a git repository, so there is nothing to report on.')
    console.error('Run this from the repository the factory has been working in, or pass --root=.')
    process.exit(EXIT_UNCHECKED)
  }
  ROOT = up
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

// One repository is not one directory, and this file is entirely about facts
// that belong to the repository. Reflogs, the machine record, the gate and its
// refusal log all live in the common directory, which every linked worktree
// shares with the main checkout. ADR 0037.
const COMMON = (() => {
  try {
    return resolve(ROOT, git(['rev-parse', '--path-format=absolute', '--git-common-dir']))
  } catch {
    return null
  }
})()

const readCommon = (rel) => {
  if (COMMON === null) return null
  try {
    return readFileSync(join(COMMON, rel), 'utf8')
  } catch {
    return null
  }
}

// Relative when the path is under the checkout you are standing in, absolute
// when it is not. From a worktree that difference is the point.
const show = (abs) => {
  const path = relative(ROOT, abs).replace(/\\/g, '/')
  return path !== '' && !path.startsWith('..') ? path : abs
}

// The same three paths `guard-guest-writes.mjs` spells, plus the two this file
// adds. Written out again rather than shared, for the reason ADR 0029 gives:
// an asset is copied into a host repo on its own, and a two-file asset is a
// setup step that gets half done.
const FACTORY = 'factory'
const MACHINE_RECORD = `${FACTORY}/machine.md`
const GUEST_GATE = `${FACTORY}/guard-guest-writes.mjs`
const REFUSALS = `${FACTORY}/refusals.log`
const MARKER = `${FACTORY}/last-publish`

const at = (rel) => (COMMON === null ? `<git common dir>/${rel}` : show(join(COMMON, rel)))

// ---------------------------------------------------------------------------
// The write boundary decides the verdict, never the facts
//
// ADR 0030 lets a report read the mode where a gate may not, because a report
// has no command in front of it to be wrong about. The facts below are gathered
// the same way whichever answer comes back; the mode decides only whether an
// outward write is a finding or the workflow.
//
// Unrecorded is treated as owned here, which is check-setup.mjs's choice and is
// made for a second reason on top of consistency: this layer's whole worth
// rests on nobody being able to say it cried wolf, and calling a push a
// violation in a repository nobody has said is guest would be exactly that.
// The pushes are still printed. Only the exit code softens.
// ---------------------------------------------------------------------------
const GUEST = 'guest'
const OWNED = 'owned'
const UNRECORDED = 'unrecorded'

const boundary = (() => {
  const record = readCommon(MACHINE_RECORD)
  if (record === null) return { mode: UNRECORDED, why: `${at(MACHINE_RECORD)} does not exist` }
  const declared = /^Write boundary:\s*(\S+)/m.exec(record)?.[1].toLowerCase()
  if (declared === OWNED || declared === GUEST) return { mode: declared }
  return {
    mode: UNRECORDED,
    why:
      declared === undefined
        ? `${at(MACHINE_RECORD)} has no "Write boundary:" line`
        : `${at(MACHINE_RECORD)} says "${declared}", which is neither owned nor guest`,
  }
})()

const JUDGED = boundary.mode === GUEST

// ---------------------------------------------------------------------------
// The window
//
// In guest mode the unbounded question is already bounded, because the answer
// is meant to be zero: every push this repository has ever made is a finding,
// and no marker is needed to say so. What a marker is actually for is the step
// after. The owner authorises one publish, it happens, and without a bookmark
// this report is red for ever afterwards. A permanently red line is the failure
// this repository has written down three times, so `--mark` exists.
//
// **It does not erase what is below it.** `check-main-provenance.mjs` forbids
// moving a baseline forward to silence a failure, and the same hazard is here:
// mark after an unauthorised push and it drops below the line. So pushes before
// the marker are still counted and still printed, as their own row, and `--mark`
// says how many it is about to put below the line before it writes.
// ---------------------------------------------------------------------------
function readMarker() {
  const text = readCommon(MARKER)
  if (text === null) return null
  const stamp = /^Marked:\s*(\S+)/m.exec(text)?.[1]
  const when = stamp === undefined ? NaN : Date.parse(stamp)
  return Number.isNaN(when) ? { broken: true } : { at: when, iso: stamp }
}

const MARK = readMarker()

// ---------------------------------------------------------------------------
// Source 1: pushes, out of the remote-tracking reflogs
//
// One `git log -g --all` rather than a `git reflog show` per ref: measured at
// 32ms against 24ms per spawn on Windows, which is twelve seconds in a work
// repository with five hundred remote branches. Entries are selected by the
// `refs/remotes/` prefix on the reflog selector.
// ---------------------------------------------------------------------------

// Every reflog message git itself writes onto a remote-tracking ref, measured
// rather than listed from memory. Anything outside this set is reported as
// unclassified instead of being assumed harmless: if a git ever localised these
// strings, or added a sixth, silently reading the unknown as "not a push" is
// how this layer would come to scan nothing and pass.
const OURS = 'update by push'
const NOT_OURS = [/^fetch\b/, /^pull\b/, /^clone\b/, /^remote: renamed\b/]

// `--date=unix` is what puts the **reflog entry's** own time into the selector,
// as `refs/remotes/origin/x@{1786636549}`. The obvious `%ct` is the committer
// date of the commit the entry points at, which is a different clock: a branch
// committed on Monday and pushed on Friday reads as Monday, and everything the
// window does becomes wrong in the direction of hiding a push. Caught by a test
// rather than by reading, because the two agree to the second in the case
// anybody writes by hand.
function reflogEntries() {
  let raw
  try {
    raw = git(['log', '-g', '--all', '--date=unix', '--format=%gD%x09%gs'])
  } catch {
    return { unreadable: '`git log -g --all` did not answer, so no reflog could be read' }
  }

  const pushes = []
  const unclassified = []
  for (const line of raw.split('\n')) {
    const selected = /^(refs\/remotes\/\S+)@\{(\d+)\}\t([\s\S]*)$/.exec(line)
    if (selected === null) continue
    const [, ref, seconds, message] = selected
    const when = Number(seconds) * 1000
    if (message === OURS) pushes.push({ ref, when })
    else if (!NOT_OURS.some((pattern) => pattern.test(message))) unclassified.push({ ref, when, message })
  }
  return { pushes, unclassified }
}

// A push writes no reflog entry when reflogs are off, so silence here means
// nothing at all and must not be read as clear. `git reflog show` on a ref with
// no reflog exits 0 and prints nothing, measured, which is why this asks the
// setting instead of asking for the absence.
function reflogsDisabled() {
  try {
    return git(['config', '--get', 'core.logAllRefUpdates']).toLowerCase() === 'false'
  } catch {
    // Unset, which for a repository with a working tree means enabled.
    return false
  }
}

function pushSection() {
  if (COMMON === null) {
    return { status: UNCHECKED, lines: ['`git` did not answer, so no reflog could be read'] }
  }
  if (reflogsDisabled()) {
    return {
      status: UNCHECKED,
      lines: [
        'core.logAllRefUpdates is false in this repository, so a push updates the',
        'remote-tracking ref and records nothing. There is no evidence here either way,',
        'which is not the same as no push. `git config --unset core.logAllRefUpdates`',
        'restores the default, and it only starts recording from that moment on',
      ],
    }
  }

  const { pushes, unclassified, unreadable } = reflogEntries()
  if (unreadable !== undefined) return { status: UNCHECKED, lines: [unreadable] }

  const after = MARK?.at === undefined ? pushes : pushes.filter((push) => push.when > MARK.at)
  const before = pushes.filter((push) => !after.includes(push))

  const lines = []
  if (after.length > 0) {
    lines.push(
      `${after.length} ref(s) on a remote were updated by a push from this repository:`,
      ...describe(after),
    )
  }
  if (before.length > 0) {
    lines.push(
      `${before.length}${after.length > 0 ? ' more' : ''} before the marker, which the marker does not erase:`,
      ...describe(before),
    )
  }
  if (unclassified.length > 0) {
    lines.push(
      `${unclassified.length} reflog entr(ies) on remote-tracking refs are neither a push`,
      'this file recognises nor a fetch, so they are reported rather than assumed:',
      ...unclassified.map((entry) => `  ${entry.ref}  ${stamp(entry.when)}  ${entry.message}`),
    )
  }

  if (after.length > 0) return { status: FOUND, lines }
  if (unclassified.length > 0) return { status: UNCHECKED, lines }
  if (before.length > 0) return { status: CLEAR, lines: [...lines, 'and nothing since.'] }
  return { status: CLEAR, lines: [`no remote-tracking ref in this repository records a push${stillLocal()}`] }
}

const stamp = (when) => new Date(when).toISOString().replace('T', ' ').slice(0, 19)

// Newest first, and capped: a repository that really has been pushing does not
// become more readable at the hundredth line.
function describe(pushes) {
  const sorted = [...pushes].sort((a, b) => b.when - a.when)
  const shown = sorted.slice(0, 20).map((push) => `  ${push.ref}  ${stamp(push.when)}`)
  return sorted.length > 20 ? [...shown, `  ... and ${sorted.length - 20} more`] : shown
}

// The positive complement, and only ever context. `--not --remotes` compares
// against remote-tracking refs, which are as stale as the last fetch, so this
// says where the work is and never whether it stayed there.
function stillLocal() {
  try {
    const commits = git(['log', '--format=%H', '--branches', '--not', '--remotes'])
    const count = commits === '' ? 0 : commits.split('\n').length
    return count === 0 ? '' : `, and ${count} local commit(s) are on no remote-tracking ref`
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Source 2: what the gate refused
//
// The gate knows every outward write it turned down and, until this, wrote none
// of them anywhere. So "no denials" and "the boundary held" read identically,
// and so does "the gate never loaded". This closes two of those three: a
// refusal on the record is proof the gate was live in some session and proof
// the boundary was tested. Zero refusals still means either nothing tried it or
// the gate was never there, and only the probe separates those.
//
// The log has exactly the gate's coverage and no more, because the gate writes
// it. That is the point rather than a shortcoming: it is a byproduct of a
// refusal that already happened, so it adds no hook surface and cannot be wrong
// about anything the gate was not already wrong about.
// ---------------------------------------------------------------------------
function refusalSection() {
  const text = readCommon(REFUSALS)
  const gate = readCommon(GUEST_GATE)
  if (text === null) {
    return {
      status: NOTE,
      lines:
        gate === null
          ? [
              `${at(GUEST_GATE)} is not installed, so nothing was refusing outward writes and`,
              'there is no refusal log. In guest mode that is the finding, and',
              '`check-setup.mjs` is where it is reported as a layer',
            ]
          : [
              `the gate is installed and ${at(REFUSALS)} does not exist, so it has refused`,
              'nothing since it was installed. That is what a held boundary looks like and it is',
              'also what a gate nobody loaded looks like. The probe below is what tells them apart',
            ],
    }
  }

  const entries = []
  for (const line of text.split('\n')) {
    const [timestamp, command, rule] = line.split('\t')
    const when = Date.parse(timestamp)
    if (Number.isNaN(when) || command === undefined) continue
    entries.push({ when, command, rule: rule ?? 'unknown' })
  }
  if (entries.length === 0) {
    return { status: NOTE, lines: [`${at(REFUSALS)} exists and holds no readable entry`] }
  }

  const since = MARK?.at === undefined ? entries : entries.filter((entry) => entry.when > MARK.at)
  const newest = entries.reduce((a, b) => (a.when > b.when ? a : b))
  return {
    status: NOTE,
    lines: [
      `the gate refused ${entries.length} outward write(s), most recently ${stamp(newest.when)}.`,
      'So it was loaded and the boundary was tested, in at least those sessions.',
      ...(since.length === 0
        ? ['None of them fall in this window.']
        : [
            `${since.length} of them fall in this window:`,
            ...[...since]
              .sort((a, b) => b.when - a.when)
              .slice(0, 10)
              .map((entry) => `  ${stamp(entry.when)}  ${entry.command}  (${entry.rule})`),
          ]),
    ],
  }
}

// ---------------------------------------------------------------------------
// Source 3: the remote's own branch list, which is opt-in and never a verdict
//
// This is the one source that catches a push by URL, since the branch is on the
// remote afterwards however it got there. It is also the one that cannot
// attribute anything: a colleague pushing a branch whose name matches one of
// ours produces the identical observation. One false accusation is enough for a
// detection layer to stop being read, so this reports and never fails.
//
// Opt-in because it is a network call with credentials behind it, and a
// publish-time check that hangs on a proxy is a check that gets skipped.
// ---------------------------------------------------------------------------
function remoteSection() {
  if (!process.argv.includes('--remote')) {
    return {
      status: NOTE,
      lines: [
        'not asked. `--remote` runs `git ls-remote` and names the local branches that also',
        'exist on the remote, which is the only source here that can see a push made by URL',
        'or from another clone. It cannot say who made it, so it never fails this report',
      ],
    }
  }

  let locals
  let remotes
  try {
    locals = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean)
  } catch {
    return { status: UNCHECKED, lines: ['`git for-each-ref` did not answer'] }
  }
  try {
    remotes = new Set(
      git(['ls-remote', '--heads', 'origin'])
        .split('\n')
        .map((line) => line.split('\t')[1]?.replace(/^refs\/heads\//, ''))
        .filter(Boolean),
    )
  } catch {
    return {
      status: UNCHECKED,
      lines: [
        '`git ls-remote origin` did not answer. No remote named origin, no network, or no',
        'credentials. An unanswered read is not an absence of branches',
      ],
    }
  }

  const both = locals.filter((name) => remotes.has(name))
  if (both.length === 0) {
    return { status: CLEAR, lines: [`none of this repository's ${locals.length} local branch(es) exist on origin`] }
  }
  return {
    status: NOTE,
    lines: [
      `${both.length} local branch name(s) also exist on origin. Whoever put them there,`,
      'this cannot say, so read it beside the pushes above rather than instead of them:',
      ...both.slice(0, 20).map((name) => `  ${name}`),
    ],
  }
}

// ---------------------------------------------------------------------------
// --mark
// ---------------------------------------------------------------------------
function mark() {
  if (COMMON === null) {
    console.error('`git` did not answer, so the git common directory cannot be resolved and there')
    console.error('is nowhere to put a marker every checkout of this repository can read.')
    process.exit(EXIT_UNCHECKED)
  }
  const { pushes = [] } = reflogEntries()
  const now = new Date()
  const dropping = MARK?.at === undefined ? pushes : pushes.filter((push) => push.when > MARK.at)

  mkdirSync(join(COMMON, FACTORY), { recursive: true })
  writeFileSync(
    join(COMMON, MARKER),
    `# The last publish the owner authorised

Marked: ${now.toISOString()}

\`check-outward-writes.mjs\` judges pushes after this moment and prints the ones
before it separately. It does not hide them: moving a baseline forward to
silence a failure is what \`check-main-provenance.mjs\` forbids, and the same
hazard is here. Delete this file to judge everything the reflog holds again.

Written by \`check-outward-writes.mjs --mark\`.
`,
  )

  console.log(`Marked a publish in ${ROOT}\n`)
  console.log(`  - wrote ${at(MARKER)}, reading ${now.toISOString()}`)
  if (MARK?.iso !== undefined) console.log(`  - replaced the previous marker, ${MARK.iso}`)
  console.log(
    dropping.length === 0
      ? '  - no push was above the old line, so this marker hides nothing'
      : `  - ${dropping.length} push(es) now sit below the line and will be reported separately`,
  )
  console.log('\nThey are still counted and still printed. A marker bookmarks an authorised')
  console.log('publish; it does not agree that everything before it was authorised.')
  process.exit(EXIT_CLEAR)
}

if (process.argv.includes('--mark')) mark()

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------
console.log(`Outward writes from ${ROOT}`)
if (COMMON !== null && resolve(COMMON) !== resolve(join(ROOT, '.git'))) {
  console.log(`This is a linked worktree. The repository is ${dirname(COMMON)}, and every`)
  console.log('fact below is the repository\'s, so it answers the same from any checkout.')
}
console.log(
  boundary.mode === UNRECORDED
    ? `Write boundary: NOT RECORDED, because ${boundary.why}`
    : `Write boundary: ${boundary.mode}, recorded in ${at(MACHINE_RECORD)}`,
)
console.log(
  MARK === null
    ? 'Window: everything the reflog holds, which git expires after 90 days by default'
    : MARK.broken
      ? `Window: everything the reflog holds. ${at(MARKER)} has no readable "Marked:" line`
      : `Window: since ${MARK.iso}, the last publish marked here`,
)
console.log('')

const SECTIONS = [
  { name: 'branch pushed', ...pushSection() },
  { name: 'gate refusals', ...refusalSection() },
  { name: 'the remote', ...remoteSection() },
]

for (const section of SECTIONS) {
  console.log(`[ ${section.status.padEnd(9)} ] ${section.name}`)
  for (const line of section.lines) console.log(`              ${line}`)
  console.log('')
}

// The gate's liveness is the one question this cannot answer for you, and the
// reason is worth stating rather than leaving as a gap. A PreToolUse hook sees
// tool calls, not the child processes a script spawns. `merge-pr.mjs` relies on
// exactly that to make its own `gh api` call. So a probe this report ran on
// your behalf would run unrefused in a session where the gate is holding and
// report it inert. A confident false "inert" is worse than the ambiguity it
// claims to resolve: ADR 0027, and the same reasoning that makes the gate's own
// probe refuse to report when it sees npm around it.
const PROBE = [
  'This says what happened, not whether anything was refusing at the time. Ask the',
  'gate that yourself, as its own tool call, from the checkout the work happened in:',
  '',
  `    node "${at(GUEST_GATE)}" --probe`,
  '',
  'It has to be your tool call and not this script\'s. A hook sees tool calls, not the',
  'child processes a script spawns, so a probe run from in here would always say inert.',
]

const UNSAYABLE = [
  'What no report on this machine can tell you, so it stays yours to write:',
  '',
  '  - whether an issue was opened or a comment posted on the host\'s tracker. `gh`',
  '    keeps no local record of what it wrote. Measured, on this machine',
  '  - whether anything left by a route that is neither git nor gh: curl, glab,',
  '    npm publish, docker push, scp, an editor\'s own forge integration',
  '  - whether a push was made by URL rather than to a named remote, or made and',
  '    then deleted. Both leave no reflog entry. `--remote` sees the first if the',
  '    branch is still there',
  '',
  'So the publish sentence is shorter than it was and it is not gone: say what this',
  'checked, and then say the rest in your own words.',
]

const status = (name) => SECTIONS.find((section) => section.name === name).status
const pushes = status('branch pushed')

if (pushes === FOUND && JUDGED) {
  console.error('This repository is a guest and it pushed. Every outward write was supposed to')
  console.error('wait for the one publish step the owner asks for, so either that step was taken')
  console.error('and nobody marked it with `--mark`, or the boundary did not hold.')
  for (const line of ['', ...PROBE, '', ...UNSAYABLE]) console.error(line)
  process.exit(EXIT_FOUND)
}

if (pushes === FOUND) {
  console.log(
    boundary.mode === OWNED
      ? 'This repository is recorded as owned, so a push is the workflow rather than a'
      : 'Nobody recorded a write boundary here, so this report cannot say whether those',
  )
  console.log(
    boundary.mode === OWNED
      ? 'finding. The pushes are listed above because knowing what left is still worth'
      : 'pushes were allowed, and it will not accuse a repository nobody has called a',
  )
  console.log(
    boundary.mode === OWNED
      ? 'something; nothing here is wrong.'
      : 'guest. Record the boundary and run this again. ADR 0021.',
  )
  for (const line of ['', ...PROBE, '', ...UNSAYABLE]) console.log(line)
  process.exit(EXIT_CLEAR)
}

if (SECTIONS.some((section) => section.status === UNCHECKED)) {
  console.error('At least one source could not be read, so this is not a clean report. It is no')
  console.error('report. Exit code 2 means "could not look", which is deliberately neither the 0')
  console.error('that means nothing was found nor the 1 that means something was.')
  for (const line of ['', ...PROBE, '', ...UNSAYABLE]) console.error(line)
  process.exit(EXIT_UNCHECKED)
}

console.log('No push from this repository is on the record for this window. That is one clause')
console.log('of the publish sentence, measured, and it is the only one that can be.')
for (const line of ['', ...PROBE, '', ...UNSAYABLE]) console.log(line)
process.exit(EXIT_CLEAR)
