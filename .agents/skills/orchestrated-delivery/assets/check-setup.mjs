// Which enforcement layers this repo actually has, and which it only has
// instructions about.
//
// WHAT THIS PREVENTS
// The layers in references/enforcement.md get installed by copying files and
// wiring two of them up, and none of that is self-verifying. A repo with
// guard-merge.mjs sitting in scripts/ and no hook entry in settings.json looks
// exactly like a repo that is protected, right up until an agent merges. In one
// project the setup was never done at all: 20 merges went through raw
// `gh pr merge`, one of them landing a PR whose main check was still pending.
// The setup section had been read at turn one. Reading it is not doing it.
//
// So setup ends with printed output instead of with a table having been read.
// Run this before installing anything and every layer that applies reports
// MISSING; install, run it again, and paste both. It exits non-zero until each
// of those is present AND wired, because wiring is the half that gets skipped.
// Re-run it after any change to the hook settings or to CI job names, where the
// same layers go quiet without going away.
//
// WHICH LAYERS APPLY IS A QUESTION ABOUT THE WRITE BOUNDARY
// ADR 0021 splits the factory in two by what it may write to, and the layers
// are not the same set on both sides. The four numbered below are owned mode's,
// and every one of them is a change to a repository you are allowed to change.
// Guest mode has one control instead, `guard-guest-writes.mjs`, installed into
// untracked local files, and installing any of the other four into somebody
// else's repository is the thing guest mode exists in order not to do.
//
// So this reports the layers that apply to the mode it is in, and explains an
// absent layer by the mode rather than listing it as a failure. A permanently
// red line is the same failure as a guard that cries wolf: both get switched
// off, and a line that is red on every run carries no information about the run
// you are looking at. That argument is about any report, not about the
// repository this file happens to ship from.
//
// There are three states rather than two: owned, guest, and nobody having said.
// The third is a finding rather than an error. ADR 0021 has the question asked
// out loud at initialisation, so a repository where nobody wrote the answer down
// skipped the step. That is worth printing, and it is not a reason to fail a
// setup that is otherwise complete.
//
// This also writes the owned answer, with `--record-owned`, because until #100
// nothing could: the guest record is written by installing the gate, and owned
// has no gate to install. See that section below for why the reader of a fact
// is a defensible place to keep its writer.
//
//   node <skill>/assets/check-setup.mjs   # from the repo root, before anything
//   node scripts/check-setup.mjs          # after, once it has been copied in
//   node scripts/check-setup.mjs --root=/path/to/repo
//   node scripts/check-setup.mjs --record-owned   # answer ADR 0021's question
//
// Requires Node 18 or later, and `git` for two comparisons it skips without.
// No network, no `gh`, no Python. If `node` itself is missing, that is this
// check's first finding without it having to run, because layers 1 to 3 ship as
// Node scripts. The LAYERS table below is the same checklist by eye, for a repo
// where you cannot run it.
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const OK = 'ok'
const PARTIAL = 'PARTIAL'
const MISSING = 'MISSING'

// The repo root comes from the working directory, never from this file's own
// location. That is what lets the first run happen from inside the installed
// skill, before a single asset has been copied anywhere.
const rootArg = process.argv.find((arg) => arg.startsWith('--root='))
let ROOT = resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd())
for (;;) {
  if (existsSync(join(ROOT, '.git'))) break
  const up = dirname(ROOT)
  if (up === ROOT) {
    console.error('Not inside a git repository, so there is no repo to report on.')
    console.error('Run this from the root of the repo you are setting up, or pass --root=.')
    process.exit(1)
  }
  ROOT = up
}

const readAt = (root, rel) => {
  try {
    return readFileSync(join(root, rel), 'utf8')
  } catch {
    return null
  }
}

const read = (rel) => readAt(ROOT, rel)

// ---------------------------------------------------------------------------
// One repository is not one directory
//
// A linked worktree has its own working-tree root and shares the git common
// directory with the main checkout, so a fact about the *repository* has to be
// read from the second or it is invisible from every checkout but one. #122
// found this the hard way: run from a worktree of a repository recorded as
// guest, this script read no machine record, reported the boundary unrecorded,
// reported the four owned layers MISSING and told the operator to install a
// merge wrapper and a CI workflow into somebody else's repository.
//
// `git rev-parse --git-common-dir` answers identically from every checkout,
// which `--show-toplevel` and `--git-dir` do not. That is why the gate and the
// record moved there in ADR 0037, and why this reads them from there.
// ---------------------------------------------------------------------------
function gitCommonDir() {
  try {
    return resolve(ROOT, git(['rev-parse', '--path-format=absolute', '--git-common-dir']))
  } catch {
    return null
  }
}

const COMMON = gitCommonDir()
const readCommon = (rel) => (COMMON === null ? null : readAt(COMMON, rel))

// Relative when the file is under the checkout you are standing in, absolute
// when it is not. From a worktree that difference is the point: a path leading
// out of this directory is the visible form of "this fact is the repository's,
// not this checkout's".
const show = (abs) => {
  const path = relative(ROOT, abs).replace(/\\/g, '/')
  return path !== '' && !path.startsWith('..') ? path : abs
}

// ---------------------------------------------------------------------------
// The write boundary
//
// `guard-guest-writes.mjs`, the asset sitting next to this one, refuses to read
// the mode off disk at all. These two files are not disagreeing, and the next
// person to notice should not have to decide which of them is the mistake.
//
// **A report is not a hook.** That gate is a `PreToolUse` hook: it runs *before*
// the command it is judging, so a `cd` in that command has not happened yet and
// anything it reads from the filesystem may describe a repository the command
// will never touch. ADR 0029 has the measurement: the merge guard's
// branch-dependent clause answered `allow` inside a worktree on a command the
// main checkout denied. That is a property of the mechanism rather than a
// shortcoming of that gate.
//
// This script has no command in front of it to be wrong about. It runs where
// you are standing, against the root it printed, and it names the file every
// fact came from. Reading the machine record here is sound in the way it is not
// there.
//
// What stays true in both files: the mode is never inferred from the repository
// and specifically never from a git remote. A work repository is on GitHub too,
// and a remote says the factory *can* write outward, which was never the
// question. Absent is reported as absent.
// ---------------------------------------------------------------------------
const OWNED = 'owned'
const GUEST = 'guest'
const UNRECORDED = 'unrecorded'

// The paths `guard-guest-writes.mjs --install` writes. Spelled out again here
// rather than shared, for the reason ADR 0029 gives for its command reader
// existing twice: an asset is copied into a host repo on its own, and a
// two-file asset is a setup step that gets half done.
//
// The first two are relative to the git common directory and the last two to
// the checkout, because that is what each of them is a fact about. ADR 0037.
const MACHINE_RECORD = 'factory/machine.md'
const GUEST_GATE = 'factory/guard-guest-writes.mjs'
const LOCAL_SETTINGS = '.claude/settings.local.json'
const REPO_SETTINGS = '.claude/settings.json'

// Where an install from before #122 put the first two. Reported, never removed:
// `guard-guest-writes.mjs` says the same thing next to its own copy of these
// constants, and ADR 0037 decided it there. The operator can see both and
// decide, and a guess that deletes somebody's file in a repository that is not
// ours is the wrong way round.
//
// These are relative to the checkout, not to the common directory, and that is
// the whole finding: `.factory/` is in the working tree, so it is per-checkout
// and a linked worktree cannot see the main checkout's copy.
const LEGACY_FACTORY = '.factory'
const LEGACY_RECORD = `${LEGACY_FACTORY}/machine.md`
const LEGACY_GATE = `${LEGACY_FACTORY}/guard-guest-writes.mjs`

const RECORD_AT = COMMON === null ? `<git common dir>/${MACHINE_RECORD}` : show(join(COMMON, MACHINE_RECORD))
const GATE_AT = COMMON === null ? `<git common dir>/${GUEST_GATE}` : show(join(COMMON, GUEST_GATE))

// SETUP: where layer 2's guard was copied to, if not `scripts/`. This is also
// the file the report tells you to ask whether it is loaded, and
// `guard-merge-asset.test.mjs` pins that: it stands up a repository holding the
// shipped guard, reads the line this script prints, and asserts the guard
// refuses it.
const MERGE_GUARD = 'scripts/guard-merge.mjs'

// ---------------------------------------------------------------------------
// The probe line belongs to the gate that is installed, not to this file
//
// This printed `node scripts/guard-merge.mjs --probe` unconditionally, which is
// the shipped gate's probe and is the right answer for almost every repository
// installing this skill. It is not right for a repository whose gate is a
// version of the asset that recognises something else, and the repository that
// ships this file is one: ADR 0033 keeps its guard deliberately different, and
// its probe is a second script, `check-guard-live.mjs`, run without a flag.
//
// A fixed string there is refused by nothing in such a repository. It is
// allowed through, runs a hook script with no payload on stdin, does nothing,
// and exits 0, which is exactly what an absent gate looks like. A liveness
// probe reading "not loaded" while the gate is loaded is the single failure the
// probe exists to rule out, and here it was prescribed by the report and copied
// into the machine record by `--record-owned`.
//
// **The fix belongs here rather than in anybody's gate.** Teaching a gate to
// answer a second probe line is two things to keep true in two places, and
// probe recognition is already the subtlest rule either gate has.
//
// So this reads the rule out of the gate in front of it. Which line a gate
// answers to is a property of that gate, and both shipped gates state it in one
// function, in a shape stable enough to grep. That is the same technique this file
// already uses on `DEFAULT_BRANCH`, `REQUIRED` and `BASELINE`, and pinned the
// same way by a test beside each gate.
//
// When the gate names itself, the probe is the gate plus its flag. When it names
// another file, that file is a sibling: `commandName` compares base names, so a
// path next to the gate is a path the rule matches.
//
// A gate whose rule cannot be read falls back to the shipped form. That is the
// old behaviour and it is wrong in exactly the same way, so it is worth saying
// what it costs: a gate with no readable probe rule is one this report cannot
// describe, and every gate this skill ships has one. Reporting a finding
// instead was considered and refused: it would put a permanent PARTIAL on
// layer 2 for anyone running a guard from before probes existed, which is the
// permanently-red line the header above argues against.
const probeRule = (source) => {
  const body = /function isLivenessProbe\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(source ?? '')?.[1]
  if (body === undefined) return null
  const script = /commandName\(\s*script\s*\)\s*===\s*['"]([^'"]+)['"]/.exec(body)?.[1]
  if (script === undefined) return null
  return { script, flag: /tokens\.includes\(\s*['"](--[\w-]+)['"]\s*\)/.exec(body)?.[1] ?? null }
}

// The command to type, for a gate at `path` whose source is `source`. `path` is
// printed back unchanged when the gate is its own probe, so a gate reached
// through an absolute path keeps it.
function probeCommand(path, source) {
  const rule = probeRule(source)
  if (rule === null) return `node "${path}" --probe`
  const at = path.replace(/\\/g, '/').lastIndexOf('/')
  const target = rule.script === path.slice(at + 1) ? path : `${path.slice(0, at + 1)}${rule.script}`
  return `node "${target}"${rule.flag === null ? '' : ` ${rule.flag}`}`
}

const MERGE_PROBE = probeCommand(MERGE_GUARD, read(MERGE_GUARD))

// The one line a reader and a writer of the machine record have to agree about,
// asked in one place so they cannot drift apart. `undefined` means the file has
// no such line at all, which is a different finding from a line saying something
// unusable.
const declaredIn = (record) => /^Write boundary:\s*(\S+)/m.exec(record)?.[1].toLowerCase()

// The paragraph for a boundary nobody answered. `found` is what this run saw, as
// however many lines it takes to say; everything after it is the same sentence
// every time. Kept whole here rather than concatenated at the console: the legacy
// branch below has a different thing to say, and splicing its clause into the
// middle of this one produced a run-on that told an operator nobody had answered,
// about a file that had (#131).
const nobodyAnswered = (...found) => [
  ...found.slice(0, -1),
  `${found[found.length - 1]}, so nobody has said whether this`,
  'factory may write outward. ADR 0021 has that asked out loud at initialisation, so',
  'this repository skipped the question rather than answered it. That is a finding and',
  'not an error: the layers below are reported as if owned.',
]

// Why a legacy record is not the repository's answer even when it is a perfectly
// good one. This is ADR 0037 in four lines, and it is the reason this branch
// reports NOT RECORDED rather than adopting what it just read: a per-checkout
// answer gives one repository as many answers as it has checkouts, which is the
// state that ADR ended.
const PER_CHECKOUT = [
  `${LEGACY_FACTORY}/ is in the working tree, so that answer is this checkout's and no`,
  'other checkout of this repository can read it. ADR 0037 moved the record inside the',
  'git common directory, which every checkout shares, and it has to be written there',
  'before it is the repository that has answered rather than this directory.',
]

// A record left where installs before #122 put it. **What it says decides the
// remedy**, which is the defect #131 measured: this branch used to name
// `guard-guest-writes.mjs --install` whatever it found, and in a repository
// recorded owned that command installs a gate refusing every push, and every
// command it refuses is the workflow there. So the answer is read out, and
// `unrecordedRemedy()` below prints the one command that writes it.
function legacyBoundary(legacy) {
  const said = declaredIn(legacy)
  if (said !== OWNED && said !== GUEST) {
    return {
      mode: UNRECORDED,
      legacy: null,
      why: nobodyAnswered(
        `${LEGACY_RECORD} is here from an install before #122 and answers neither`,
        `owned nor guest, and ${RECORD_AT} does not exist`,
      ),
    }
  }
  return {
    mode: UNRECORDED,
    legacy: said,
    why: [
      `${LEGACY_RECORD} is here from an install before #122, it says`,
      `"Write boundary: ${said}", and ${RECORD_AT} does not exist.`,
      ...PER_CHECKOUT,
      ...(said === OWNED
        ? [
            'The layers below are reported as if owned, which is what an unrecorded boundary',
            'has always done here, and the remedy under them writes this same answer where the',
            'whole repository can read it.',
          ]
        : [
            'The layers below are reported as if owned, which is what an unrecorded boundary',
            'has always done here. This record says guest, so do not install them: every one',
            'is a change to a repository somebody has written down that they are a guest in.',
          ]),
    ],
  }
}

function writeBoundary() {
  const record = readCommon(MACHINE_RECORD)
  if (record === null) {
    const legacy = read(LEGACY_RECORD)
    if (legacy !== null) return legacyBoundary(legacy)
    return { mode: UNRECORDED, why: nobodyAnswered(`${RECORD_AT} does not exist`) }
  }

  const declared = declaredIn(record)
  if (declared === OWNED || declared === GUEST) {
    return { mode: declared, record }
  }
  // A record that exists and does not answer is the same state as no record,
  // reported differently, because the two want different fixes.
  return {
    mode: UNRECORDED,
    record,
    why: nobodyAnswered(
      declared === undefined
        ? `${RECORD_AT} exists and has no "Write boundary:" line`
        : `${RECORD_AT} says "Write boundary: ${declared}", which is neither owned nor guest`,
    ),
  }
}

const BOUNDARY = writeBoundary()

// Unrecorded is reported against the owned checklist. That is a choice and it
// is made out loud rather than quietly: it is what this script has always
// checked, and the summary tells anyone in a repository that is not theirs to
// install the guest gate instead of the four layers it just listed.
const CHECKLIST = BOUNDARY.mode === GUEST ? GUEST : OWNED

// Every workflow file as one string. Substring questions only: "does any
// workflow mention this name" is answerable without a YAML parser, and this
// script takes no dependencies.
function workflows() {
  const dir = join(ROOT, '.github', 'workflows')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ file: `.github/workflows/${f}`, text: read(`.github/workflows/${f}`) ?? '' }))
}

// ---------------------------------------------------------------------------
// A workflow's triggers, which are not the same thing as its text
//
// The question below is whether layer 3's workflow *also* runs on a pull
// request. It used to be asked of the whole file, comments included, and that
// is backwards in the case that matters: the more carefully a workflow explains
// why it avoids a trigger, the more certainly it is accused of using it. The
// repository this file ships from spent a wiring attempt on exactly that, and
// then carried a comment telling the next reader not to spell the word, which
// is a comment doing a check's job (#152, #160).
//
// **A false positive is the expensive direction here.** A setup report that
// accuses a correct installation is the failure that gets the report switched
// off, which is the whole argument this file's header makes about permanently
// red lines. A residual false negative in an exotic shape costs one unreported
// advisory note. The two are not close, and that asymmetry is what picks the
// rule below.
//
// A YAML parser would settle it and there is not one: no dependencies, one
// file, and a parser written here would be a second thing to be wrong about.
// So this narrows the *region* instead of narrowing the pattern. It takes the
// top-level `on:` key and the indented lines under it, strips comments, and
// asks the question of what is left.
//
// Narrowing the pattern instead, to a line beginning with optional indentation
// and the trigger name, was the other candidate and is rejected. It fixes the
// reported case and breaks `on: [push, pull_request]`, which is a form real
// workflows are written in, so it trades a false positive for a false negative
// in a common shape. The asymmetry above licenses an exotic residual, not a
// routine one.
//
// What is left wrong, said out loud: a trigger named inside a multi-line string
// inside the `on:` block reads as a trigger, and a `#` inside a quoted scalar
// there truncates the line. Both are absurd in an `on:` block, and both fail
// toward saying less rather than more.
//
// `null` means no top-level `on:` key was found at all, and the caller asks
// nothing rather than falling back to the whole file. Falling back would
// reinstate the defect in precisely the file too odd to read.
const uncommented = (line) => line.replace(/(^|\s)#.*$/, '$1')

function triggerBlock(text) {
  const lines = text.split('\n')
  const at = lines.findIndex((line) => /^(?:on|"on"|'on'):/.test(line))
  if (at === -1) return null
  const block = [uncommented(lines[at]).replace(/^(?:on|"on"|'on'):/, '')]
  for (const line of lines.slice(at + 1)) {
    if (/^\S/.test(line)) break
    block.push(uncommented(line))
  }
  return block.join('\n')
}

// `pull_request_target` is named as well, because it is the same trigger for
// this purpose and `\b` will not find it inside the longer word.
const PULL_REQUEST_TRIGGER = /(?:^|[^\w-])pull_request(?:_target)?(?![\w-])/
const triggersOnPullRequest = (text) => {
  const block = triggerBlock(text)
  return block !== null && PULL_REQUEST_TRIGGER.test(block)
}

// What the scripts' DEFAULT_BRANCH constants are supposed to equal. A guard
// that protects `main` in a repo whose default branch is `develop` denies
// nothing and reports no error, which is the worst shape a control can take.
//
// `origin/HEAD` is the authority and is unset in most clones, so the fallback
// infers from which conventional branch exists on the remote and says that it
// inferred. Guessing silently would be the same failure this script is about.
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function defaultBranch() {
  try {
    return { name: git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '') }
  } catch {
    /* unset locally, which is the normal case. */
  }
  const candidates = ['main', 'master', 'develop', 'trunk'].filter((name) => {
    try {
      git(['rev-parse', '--verify', `refs/remotes/origin/${name}`])
      return true
    } catch {
      return false
    }
  })
  return candidates.length === 1 ? { name: candidates[0], inferred: true } : null
}

// The guest gate's own promise is that `git status --porcelain -uall` in the
// host repo is byte-for-byte what it was before it was installed. That is
// checkable from here, and it is the half a directory listing cannot see: a
// gate installed by committing it, or wired by editing somebody's tracked
// settings file, works exactly as well as one that was not and has already
// broken the boundary it is there to hold.
function visibleToTheHostRepo(paths) {
  try {
    return {
      tracked: git(['ls-files', '--', ...paths]).split('\n').filter(Boolean),
      // `??` is git's mark for an untracked file it can see, which is precisely
      // what `.git/info/exclude` was supposed to stop it seeing.
      unignored: git(['status', '--porcelain', '-uall', '--', ...paths])
        .split('\n')
        .filter((line) => line.startsWith('??'))
        .map((line) => line.slice(3)),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// --record-owned, which is the answer this repository could not produce
//
// ADR 0021 calls the write boundary a machine fact **either way**, and has the
// question asked out loud at initialisation. Only one thing ever wrote that
// fact, `guard-guest-writes.mjs --install`, and it only ever writes `guest`,
// because installing the gate *is* the guest declaration (ADR 0029). So the two
// states a repository reached on its own were guest and unrecorded, and an
// owned repository printed NOT RECORDED for ever while being told to write a
// line nothing could write. ADR 0029's own rule about remedies applies to a
// report as well as to a gate: a wall with a signpost pointing nowhere is how a
// layer gets switched off.
//
// The cost is worse than a wasted paragraph, and it is the reason this exists
// rather than the output simply being softened. NOT RECORDED means two things
// at once: **nobody asked**, which is the state ADR 0021's asymmetry is built
// to catch, and **asked, answered owned, nowhere to put it**, which is fine. A
// state every owned repository is permanently in carries no signal. Softening
// the text instead would have made silence mean owned, and silence meaning
// owned is the one inference ADR 0021 forbids: "no record" is a fact about the
// repository in exactly the way "no gate installed" is, and a work repository
// with nothing set up yet looks precisely like an owned one.
//
// **The writer lives beside the reader**, which is the same argument ADR 0027
// makes for the probe and the rule being one file. The one thing the two halves
// must agree on is the shape of the `Write boundary:` line, and here they cannot
// disagree. Guest keeps its own writer, because there the record is a byproduct
// of installing the gate, and a guest record written without the gate is a
// declaration with nothing behind it.
//
// **It writes the record and excludes it, and does nothing else.** No gate, no
// hook, no settings file: owned mode has no boundary to hold. A misfire in a
// repository that is not yours therefore writes one untracked file that makes
// this report say `owned`, which is already the checklist it reports when
// nobody has recorded anything, and it cannot touch the gate, which never reads
// the mode.
// ---------------------------------------------------------------------------

// The two commands below line up in a column, and the left one is now as long
// as whichever probe this repository's gate answers to, so the width is measured
// rather than typed. #153 read the record before it read anything else, which is
// what a machine record is for, so a ragged one is worse here than in output
// nobody keeps.
const RECORD_COLUMN = Math.max('check-setup.mjs'.length, MERGE_PROBE.length) + 3

// What an owned record says, which is nearly all reason and one fact. There is
// no owned equivalent of the guest record's backlog line or probe command: in
// owned mode the backlog and the check command are repo facts, true for anyone
// who clones, and they belong in a committed `AGENTS.md`. The boundary is the
// only machine fact owned mode has, so this file is thin on purpose, and its
// worth is that it exists rather than what it holds.
const OWNED_RECORD = `# Machine facts

Not committed, and not committable. ADR 0021 splits the initialisation answers
by who they are about: repo facts are true for anyone who clones and belong in
\`AGENTS.md\`, and machine facts are about *this* operator on *this*
repository. This file is the second kind, and it is inside the git common
directory rather than in the working tree, so nobody who clones this repository
inherits it, no ignore rule has to hold it out of anybody's \`git status\`, and
every linked worktree reads the same copy. ADR 0037.

Write boundary: owned

The factory may write outward from here: create the repository, seed a backlog,
push branches, open and merge pull requests, configure CI, apply a ruleset.

That is the whole of the answer, and the file is short because owned mode has
one machine fact and no gate to hold it. The guest record names a gate to probe
at this point. What there is to ask here is the owned enforcement stack, which
answers a different question: what may land, rather than what may be written
outward.

    ${'check-setup.mjs'.padEnd(RECORD_COLUMN)}the layers, and whether each one is wired
    ${MERGE_PROBE.padEnd(RECORD_COLUMN)}whether the one that refuses a merge loaded

Written by \`check-setup.mjs --record-owned\`, which refuses to overwrite it. If
the answer here changes, delete this file and record the new one.
`

// The path to print in a command the reader is meant to run. Relative to the
// repo root when this script is inside it, which is the copied-into-`scripts/`
// case, and absolute when it is still being run out of the skill.
const SELF = (() => {
  const path = process.argv[1] ?? ''
  const rel = relative(ROOT, path).replace(/\\/g, '/')
  return rel !== '' && !rel.startsWith('..') ? rel : path
})()

const untracked = () => git(['status', '--porcelain', '-uall']).split('\n').filter(Boolean)

function recordOwned() {
  const refuse = (lines) => {
    for (const line of lines) console.error(line)
    console.error('')
    console.error('Nothing was written.')
    process.exit(1)
  }

  // An answer already here is not this command's to overwrite, whether it
  // answers or not. Somebody wrote it, and the fix for a wrong one is to look
  // at it rather than to have it replaced from underneath.
  if (BOUNDARY.record !== undefined) {
    const line = /^Write boundary:.*$/m.exec(BOUNDARY.record)?.[0] ?? 'no "Write boundary:" line'
    refuse([
      `${RECORD_AT} already exists, so the question has been answered here.`,
      `It says: ${line}`,
      '',
      'Delete the file if the answer has changed, and record the new one. Replacing',
      'it from underneath is how an operator stops believing what it says.',
    ])
  }

  // The one case where writing `owned` would be actively wrong: the gate is
  // installed and its record was deleted, which layer G already reports as what
  // guest mode looks like with its record gone. Refusing here is not inferring
  // the mode from the repository. It is declining to write a fact that
  // contradicts a control somebody deliberately installed.
  //
  // Both refusals read the common directory, and until #122 they read the
  // checkout. In a linked worktree of a repository recorded as guest neither one
  // could see anything, so this wrote `Write boundary: owned` into the worktree
  // and the repository then held two records contradicting each other —
  // manufacturing, from a worktree, exactly the disagreement ADR 0039 built
  // these refusals to prevent.
  if (readCommon(GUEST_GATE) !== null) {
    refuse([
      `${GATE_AT} is installed here, and installing that gate is the guest`,
      'declaration (ADR 0029). Recording this repository as owned would leave a control',
      'in place that the record says is unnecessary, which is the disagreement layer G',
      'reports rather than a state to write on purpose.',
      '',
      'If this repository really is yours, remove the gate and its wiring first.',
    ])
  }

  // The same refusal against the paths installs used before #122, which both of
  // the checks above read straight past. Measured while fixing #131: in a
  // repository whose `.factory/` held a guest gate and a record saying guest,
  // this wrote `Write boundary: owned` into the common directory and exited 0,
  // leaving the repository holding two records contradicting each other. That is
  // the state ADR 0039 built these refusals to prevent and ADR 0037 found being
  // manufactured from a worktree, and it is the same blindness #131 reported in
  // the reader: this file knew the legacy location existed and never read what
  // was in it.
  //
  // **The record half is asymmetric on purpose.** A legacy record saying `owned`
  // is not refused, because the report now sends exactly that case here: writing
  // the answer it already gives, somewhere every checkout can read it, is the
  // whole remedy. What is refused is writing an answer that contradicts one
  // somebody declared.
  const legacyGate = read(LEGACY_GATE) !== null
  const legacyRecord = read(LEGACY_RECORD)
  if (legacyGate || (legacyRecord !== null && declaredIn(legacyRecord) === GUEST)) {
    refuse([
      `${legacyGate ? LEGACY_GATE : LEGACY_RECORD} is here from an install before #122 and`,
      'declares this repository a guest. Recording it as owned would leave the repository',
      'holding two records that contradict each other, and the older one is the harder to',
      'notice, because nothing reads it any more.',
      '',
      'A legacy record answering owned is a different case and is not refused: writing',
      'that same answer where every checkout can read it is what the report asks for.',
      '',
      `If this repository really is yours, remove ${LEGACY_FACTORY}/ and any wiring that`,
      'names it first, and then this has nothing to contradict.',
    ])
  }

  let before
  if (COMMON === null) {
    refuse([
      '`git` did not answer, so the git common directory cannot be resolved and there is',
      'nowhere to put this record that every checkout of this repository can read.',
      'ADR 0037 keeps machine facts there rather than in a working tree, precisely so',
      'that a worktree is not a second opinion. Run this from inside a git repository,',
      'with git on PATH.',
    ])
  }
  try {
    before = untracked()
  } catch {
    refuse([
      '`git status` did not answer, so the promise this command makes — that the host',
      'repository sees nothing new — cannot be checked, and an unchecked promise about',
      "somebody else's repository is not one worth making.",
    ])
  }

  const done = []

  // No exclude line, and none needed: the record goes inside `.git/`, which git
  // does not look into. What ADR 0021 asked `.git/info/exclude` to achieve is
  // now structural. A repository installed before #122 keeps its `/.factory/`
  // line; nothing here adds one.
  mkdirSync(join(COMMON, dirname(MACHINE_RECORD)), { recursive: true })
  writeFileSync(join(COMMON, MACHINE_RECORD), OWNED_RECORD)
  done.push(`wrote ${show(join(COMMON, MACHINE_RECORD))}, saying "Write boundary: owned"`)
  done.push('no ignore rule was needed: it is inside the git common directory, which git')
  done.push('  does not look into, and which every linked worktree shares')

  console.log(`Recorded the write boundary in ${ROOT}\n`)
  for (const line of done) console.log(`  - ${line}`)

  // The guest gate promises a host repo's `git status` is byte-for-byte what it
  // was, and asks you to check rather than believe it. This has the same
  // promise and can check its own, so it does. Lines that *vanished* are the
  // exclusion catching scratch state that was already showing, which is a
  // repair rather than a violation, so only additions count.
  const added = untracked().filter((line) => !before.includes(line))
  if (added.length > 0) {
    console.error('\nBut this repository can now see files it could not before:\n')
    for (const line of added) console.error(`  ${line}`)
    console.error('\nThat is the half of the promise this command exists to keep, and it should not')
    console.error('be reachable now that the record lives inside the git common directory. Something')
    console.error('other than this command put those there.')
    process.exit(1)
  }
  console.log('\n`git status --porcelain -uall` gained nothing, which was checked here rather')
  console.log('than claimed. Nothing tracked changed and nothing outside this repository was')
  console.log('written.')

  console.log('\nThis installed nothing: owned mode has no gate, and the answer is the whole')
  console.log('point. NOT RECORDED now means nobody asked, which is what it is for. Run the')
  console.log('report to read it back:\n')
  console.log(`    node ${SELF}`)
  process.exit(0)
}

if (process.argv.includes('--record-owned')) recordOwned()

// A copied-but-unedited placeholder, in the two forms the assets ship: the
// SETUP constants in the scripts, and bracketed phrases in the process docs.
// The bracket pattern skips markdown links, which are the false positive that
// would get this check switched off.
const UNEDITED_CONSTANT = /REPLACE_WITH_[A-Z_]+/g
const UNEDITED_PROSE = /\[[a-z][^\]\n]{2,80}\](?![([])/g

function leftovers(text, pattern) {
  return [...new Set((text ?? '').match(pattern) ?? [])]
}

// Every PreToolUse entry whose command names `needle`, and the settings file it
// was found in. Both gates ask this same question of the same two files, and
// the answer to "is it wired" is where each of them separates a copied control
// from an installed one.
function preToolUseHooks(needle, root = ROOT) {
  const wired = []
  for (const file of [REPO_SETTINGS, LOCAL_SETTINGS]) {
    const text = readAt(root, file)
    if (text === null) continue
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return { wired, unparseable: file }
    }
    for (const entry of parsed?.hooks?.PreToolUse ?? []) {
      if ((entry.hooks ?? []).some((h) => (h.command ?? '').includes(needle))) wired.push({ file, entry })
    }
  }
  return { wired }
}

// ---------------------------------------------------------------------------
// Which sessions the guest gate is registered for
//
// Measured on Claude Code 2.1.228, because reading the docs would not have
// answered it: **the harness reads project settings from the directory the
// session started in and from nowhere else.** Not the parent, not the
// repository, not `.git/`. A hook in one checkout's `.claude/settings*.json`
// therefore covers sessions started in that directory and no others, and a
// linked worktree — where every subagent that pushes a branch or opens a pull
// request is standing — registers nothing at all.
//
// So "is the gate wired" has two answers and this reports both. The second one
// lives in the operator's home directory, outside the repository, which ADR
// 0012 already established a check here may read: the question has an answer
// that is not in the repository, and reporting only the half that is would be
// the same lie #122 found.
// ---------------------------------------------------------------------------
const userSettingsFile = () =>
  join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json')

function samePath(a, b) {
  const normalise = (path) => resolve(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32'
    ? normalise(a).toLowerCase() === normalise(b).toLowerCase()
    : normalise(a) === normalise(b)
}

function machineWideHooks() {
  const file = userSettingsFile()
  const text = (() => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return null
    }
  })()
  if (text === null) return { file, found: [] }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { file, unparseable: true, found: [] }
  }

  const found = []
  for (const entry of parsed?.hooks?.PreToolUse ?? []) {
    for (const hook of entry.hooks ?? []) {
      const command = hook.command ?? ''
      if (!command.includes('guard-guest-writes')) continue
      // The installer writes the scope quoted and absolute. An unquoted one is
      // somebody's hand edit and still worth reading.
      const scope = /--scope\s+(?:"([^"]+)"|(\S+))/.exec(command)
      found.push({ entry, scope: scope ? (scope[1] ?? scope[2]) : null })
    }
  }
  return { file, found }
}

// Every checkout of this repository, main and linked. `git worktree list` is a
// read and answers the same from any of them.
function checkouts() {
  try {
    return git(['worktree', 'list', '--porcelain'])
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => resolve(line.slice('worktree '.length).trim()))
  } catch {
    return [ROOT]
  }
}

// A matcher selects on tool NAME. A harness offering a second shell tool walks
// straight past a matcher naming one, which a real session proved by pushing to
// the default branch through one. An `if` clause uses permission-rule syntax,
// which also names a single tool, so it reopens the hole the matcher closed.
function wiringProblems({ file, entry }) {
  const problems = []
  const matcher = entry.matcher ?? ''
  if (!matcher.includes('|')) {
    problems.push(
      `${file} matches "${matcher}", which names one tool. A second shell tool` +
        ' in the same harness is not guarded. Name them all, separated by |',
    )
  }
  if ('if' in entry) {
    problems.push(
      `${file} narrows the matcher with an "if" clause, which uses permission-rule` +
        ' syntax naming a single tool and reopens the hole the matcher just closed',
    )
  }
  return problems
}

// Skipped in guest mode, where nothing compares a DEFAULT_BRANCH constant
// because none of the layers holding one may be installed.
const BRANCH = CHECKLIST === OWNED ? defaultBranch() : null
const DEFAULT = BRANCH?.name ?? null
const WORKFLOWS = workflows()
const mentions = (needle) => WORKFLOWS.filter((w) => w.text.includes(needle))

// Layer numbers match references/enforcement.md, weakest first, so this output
// reads as that chapter rendered against the repo in front of you. The guest
// gate keeps that chapter's separate numbering rather than becoming a fifth
// layer here: ADR 0029 makes it a different stack, for a different mode,
// protecting a different thing.
//
// `modes` is which write boundary a layer belongs to, and `skipped` is what the
// output says where it does not. An absent layer explained by the mode is not a
// finding, so it is not counted and it does not move the exit code.
const LAYERS = [
  {
    n: 0,
    name: 'The instruction',
    modes: [OWNED],
    covers: 'nothing on its own. Here so its absence is visible too',
    skipped: () => [
      "not reported: in a repository that is not yours the host's own contribution",
      'docs are the contract, and the review record lives in the local store until',
      'publish. references/first-run.md',
    ],
    fix: 'Copy review.md and working-an-issue.md to docs/process/ and pull_request_template.md to .github/, then edit the bracketed commands.',
    run() {
      // SETUP: adjust these paths if this repo keeps its process docs elsewhere.
      const docs = [
        'docs/process/working-an-issue.md',
        'docs/process/review.md',
        '.github/pull_request_template.md',
      ]
      const absent = docs.filter((d) => read(d) === null)
      if (absent.length > 0) return { status: MISSING, findings: [`absent: ${absent.join(', ')}`] }

      const findings = []
      for (const doc of docs) {
        const stale = leftovers(read(doc), UNEDITED_PROSE)
        if (stale.length > 0) {
          findings.push(`${doc} still has the asset's placeholders: ${stale.slice(0, 3).join(' ')}`)
        }
      }
      return { status: findings.length > 0 ? PARTIAL : OK, findings }
    },
  },
  {
    n: 1,
    name: 'The merge wrapper',
    modes: [OWNED],
    covers: 'a merge taken with checks red. Does not cover anyone who does not type it',
    skipped: () => [
      'not reported: there is no remote check rollup to read, and landing means landing',
      "on your own integration branch. The gate is the host's own check command, run",
      'locally. ADR 0021',
    ],
    fix: 'Copy merge-pr.mjs to scripts/ and set REQUIRED to the check names a real run reports.',
    run() {
      const source = read('scripts/merge-pr.mjs')
      if (source === null) return { status: MISSING, findings: ['scripts/merge-pr.mjs is absent'] }

      const stale = leftovers(source, UNEDITED_CONSTANT)
      if (stale.length > 0) {
        return {
          status: PARTIAL,
          findings: [
            `REQUIRED still holds ${stale.join(', ')}. A name that never appears reads as`,
            '"never ran", so every merge refuses. Set it to the names a real run reports',
          ],
        }
      }

      const findings = []
      const declaration = source.match(/^const REQUIRED = \[([^\]]*)\]/m)?.[1] ?? ''
      const required = [...declaration.matchAll(/['"]([^'"]+)['"]/g)].map((q) => q[1])
      for (const name of required) {
        if (mentions(name).length === 0) {
          findings.push(
            `note: no workflow names the required check "${name}". Fine if it comes from` +
              ' an app outside this repo; a typo here refuses every merge',
          )
        }
      }
      return { status: OK, findings }
    },
  },
  {
    n: 2,
    name: 'The guard hook',
    modes: [OWNED],
    covers: 'an agent merging its own PR. Does not cover a session that never loaded it, or a human at a terminal',
    skipped: () => [
      'not reported: merging is not yours to do in a repository you are a guest in, and',
      'gate G below refuses `gh pr merge` along with every other outward write, by its',
      'general rule rather than as a special case',
    ],
    fix: `Copy guard-merge.mjs to scripts/ and add the PreToolUse block from references/enforcement.md to .claude/settings.json. Restart the session afterwards: settings are read at startup. Then \`${MERGE_PROBE}\`, which the guard refuses when it is loaded.`,
    run() {
      const source = read(MERGE_GUARD)
      if (source === null) return { status: MISSING, findings: [`${MERGE_GUARD} is absent`] }

      // Present but unwired is the failure this whole script exists for, so it
      // reports as MISSING rather than PARTIAL. A script nothing invokes is not
      // a weaker layer than an absent one; it is the same layer, plus a file.
      const { wired, unparseable } = preToolUseHooks('guard-merge')
      if (unparseable) {
        return { status: MISSING, findings: [`${unparseable} is not valid JSON, so no hook loads`] }
      }
      if (wired.length === 0) {
        return {
          status: MISSING,
          findings: [
            'the script is in scripts/ and no PreToolUse hook runs it, so nothing loads it.',
            'This is the shape the layer takes when setup was read and not done',
          ],
        }
      }

      const findings = wiringProblems(wired[wired.length - 1])
      const guards = source.match(/^const DEFAULT_BRANCH = ['"]([^'"]+)['"]/m)?.[1]
      if (DEFAULT && guards && guards !== DEFAULT) {
        findings.push(
          `DEFAULT_BRANCH is "${guards}" and this repo's default branch is "${DEFAULT}",` +
            ' so the guard protects a branch that does not exist',
        )
      }
      return { status: findings.length > 0 ? PARTIAL : OK, findings }
    },
  },
  {
    n: 3,
    name: 'The provenance audit',
    modes: [OWNED],
    covers: 'a commit that reached the default branch outside a PR. Does not cover prevention: it runs after the fact',
    skipped: () => [
      "not reported: a workflow is a change to somebody else's repository, and their CI",
      'runs on the pull request after publish, unchanged. ADR 0021',
    ],
    fix: 'Copy check-main-provenance.mjs to scripts/, set BASELINE to the commit that adds these scripts, and run it from a workflow on push to the default branch.',
    run() {
      const source = read('scripts/check-main-provenance.mjs')
      if (source === null) {
        return {
          status: MISSING,
          findings: [
            'scripts/check-main-provenance.mjs is absent, so every preventive layer above',
            'is silent when it is bypassed',
          ],
        }
      }
      const runners = mentions('check-main-provenance')
      if (runners.length === 0) {
        return { status: MISSING, findings: ['no workflow runs it, so it detects nothing'] }
      }

      const findings = []
      const stale = leftovers(source, UNEDITED_CONSTANT)
      if (stale.length > 0) {
        findings.push(
          `BASELINE still holds ${stale.join(', ')}, so the audit exits before judging` +
            ' anything. Set it to the commit that added these scripts',
        )
      }
      if (DEFAULT) {
        const audits = source.match(/^const DEFAULT_BRANCH = ['"]([^'"]+)['"]/m)?.[1]
        if (audits && audits !== DEFAULT) {
          findings.push(`DEFAULT_BRANCH is "${audits}" and this repo's default branch is "${DEFAULT}"`)
        }
      }
      for (const runner of runners) {
        if (triggersOnPullRequest(runner.text)) {
          findings.push(
            `note: ${runner.file} also triggers on pull_request. Keep this one out of the` +
              ' required checks: a push-only job reads as "never ran" and refuses every merge',
          )
        }
      }
      return { status: findings.length > 0 ? PARTIAL : OK, findings }
    },
  },
  {
    // Lettered, not numbered 4. ADR 0029 makes this a different stack rather
    // than one more rung of the one above: a different mode, and a repository
    // that is not yours rather than a trunk that is.
    n: 'G',
    name: 'The write-boundary gate',
    modes: [GUEST],
    covers:
      'an outward write from a repo that is not yours. Does not cover a process that never loaded it, a human at a terminal, or a write that arrives by some route other than git, gh or bd',
    skipped: (mode) => {
      const copied = readCommon(GUEST_GATE) !== null
      if (mode === OWNED) {
        return [
          `not reported: ${RECORD_AT} records this repository as owned, so the factory`,
          'may write outward and there is no boundary for a gate to hold. Every command it',
          'refuses is the workflow here. ADR 0029',
          ...(copied
            ? [`but ${GATE_AT} exists anyway, in a repository recorded as owned. One of`,
               'those two facts is wrong and the file is the likelier one']
            : []),
        ]
      }
      return [
        'not reported: nobody has recorded a write boundary, so the layers above were',
        'reported instead. If this repository is not yours, do not install those: record',
        'the boundary and install this gate, and the four above stay off for good.',
        ...(copied
          ? [`Note that ${GATE_AT} is already here, which is what guest mode looks like`,
             `with its record deleted. --install rewrites ${RECORD_AT} without touching`,
             'anything else']
          : []),
      ]
    },
    fix: 'Run `node <this skill>/assets/guard-guest-writes.mjs --install` from the repo root, then restart the harness: settings are read at startup. Its output ends with the machine-wide block, which is the half that reaches a worktree.',
    run() {
      if (readCommon(GUEST_GATE) === null) {
        return {
          status: MISSING,
          findings: [
            `${RECORD_AT} records this repository as guest and ${GATE_AT} is absent,`,
            "so nothing refuses a push, a pull request, or a comment on the host's tracker.",
            'This is the state where the boundary is a paragraph and not a control',
          ],
        }
      }

      // Two registrations, covering different sessions, and a report that names
      // only the first is the report #122 found lying in a worktree.
      const { wired, unparseable } = preToolUseHooks('guard-guest-writes')
      const machine = machineWideHooks()
      const scoped = machine.found.filter(
        ({ scope }) => scope !== null && COMMON !== null && samePath(scope, COMMON),
      )
      const unscoped = machine.found.filter(({ scope }) => scope === null)

      if (unparseable) {
        return { status: MISSING, findings: [`${unparseable} is not valid JSON, so no hook loads`] }
      }

      // Which sessions each registration reaches, said out loud, because "the
      // gate is installed" was true for the whole run that produced #122 and
      // covered none of the sessions doing the writing.
      const all = checkouts()
      const covered = all.filter((root) => preToolUseHooks('guard-guest-writes', root).wired.length > 0)
      const bare = all.filter((root) => !covered.includes(root))

      // MISSING is for a gate nothing anywhere invokes, which is layer 2's rule:
      // a control nothing invokes is an instruction plus a file. A gate wired
      // for some checkouts and not others is a different state and wants a
      // different sentence, so it is PARTIAL and the finding names the gap.
      if (covered.length === 0 && scoped.length === 0 && unscoped.length === 0) {
        return {
          status: MISSING,
          findings: [
            `${GATE_AT} is here and no PreToolUse hook runs it, so nothing loads it.`,
            "No checkout of this repository names it and neither does the operator's own",
            'settings. --install copies and wires in one step, so this is a half-done install',
            'or a settings file that was edited afterwards',
          ],
        }
      }

      const findings = []
      for (const entry of [...wired, ...scoped.map((f) => ({ file: machine.file, entry: f.entry }))]) {
        findings.push(...wiringProblems(entry))
      }

      if (scoped.length > 0) {
        findings.push(
          `note: registered machine-wide in ${machine.file}, scoped to this repository, so` +
            ` every session inside any of its ${all.length} checkout(s) is covered`,
        )
      } else if (bare.length > 0) {
        findings.push(
          `the gate is wired per checkout, and ${bare.length} of this repository's ${all.length}` +
            ' have no wiring, so a session started in one registers no hook at all:',
          ...bare.map((root) => `  ${root}`),
          'Those are where subagents run, and pushing a branch and opening a pull request is',
          'what they do. Install the machine-wide block instead, which reaches every checkout',
          'including ones that do not exist yet: `node ' + GATE_AT + ' --user-hook`',
        )
      } else if (all.length > 1) {
        findings.push(
          `note: wired separately in each of this repository's ${all.length} checkouts. A worktree` +
            ' added later registers nothing until somebody installs into it; the machine-wide' +
            ' block does not have that failure mode',
        )
      } else {
        findings.push(
          'note: wired in this checkout only, which is every checkout this repository has today.' +
            ' A worktree added later registers nothing. `node ' + GATE_AT + ' --user-hook`',
        )
      }

      if (unscoped.length > 0) {
        findings.push(
          `${machine.file} runs this gate with no --scope, so it refuses outward writes in` +
            ' every repository on this machine, including the operator\'s own. That is the false' +
            ' positive by construction ADR 0029 refused a user-level hook over. Add --scope',
        )
      }

      // The boundary enforcing itself by breaking itself. Both halves of the
      // gate's promise are checkable and neither is visible in a file listing.
      const seen = visibleToTheHostRepo([LEGACY_FACTORY, LOCAL_SETTINGS, REPO_SETTINGS])
      if (seen === null) {
        findings.push('note: `git` did not answer, so the "nothing tracked changed" half is unchecked')
      } else {
        const committed = seen.tracked.filter(
          (p) => p.startsWith(`${LEGACY_FACTORY}/`) || p === LOCAL_SETTINGS,
        )
        if (committed.length > 0) {
          findings.push(
            `${committed.join(', ')} is tracked in this repository, so installing the gate` +
              ' changed a repo you are a guest in. ADR 0021 keeps machine facts out of the tree',
          )
        }
        if (seen.unignored.length > 0) {
          findings.push(
            `git status here shows ${seen.unignored.join(', ')}, so .git/info/exclude did not` +
              " get the paths and the owner sees the factory's scratch state as their changes",
          )
        }
        for (const { file } of wired) {
          if (seen.tracked.includes(file)) {
            findings.push(
              `the gate is wired in ${file}, which is tracked here. --install writes` +
                ` ${LOCAL_SETTINGS} precisely so that wiring it is not a change to somebody's repo`,
            )
          }
        }
      }

      if (read(LEGACY_RECORD) !== null) {
        findings.push(
          `note: ${LEGACY_FACTORY}/ is still here from an install before #122 and nothing reads` +
            ' it now. Check what is in it, then remove it and its /.factory/ line from' +
            ' .git/info/exclude',
        )
      }

      // Advisory, deliberately: the gate is correctly installed either way, and
      // --install writes this placeholder itself, so counting it would make a
      // clean install exit non-zero on its first run.
      if (/^Backlog:\s*\(/m.test(BOUNDARY.record ?? '')) {
        findings.push(
          `note: the Backlog line in ${RECORD_AT} is still the template's instruction` +
            ' rather than a tool name, so nothing says where the factory\'s own issues live',
        )
      }

      return { status: findings.some((f) => !f.startsWith('note:') && !f.startsWith('  ')) ? PARTIAL : OK, findings }
    },
  },
]

console.log(`Enforcement layers in ${ROOT}`)
// A repository is not one directory, and which one you are standing in changes
// nothing about the answers below except how the paths are spelled. Printing
// this is how the reader knows that.
if (COMMON !== null && !samePath(COMMON, join(ROOT, '.git'))) {
  console.log(`This is a linked worktree. The repository is ${dirname(COMMON)}`)
}
if (BOUNDARY.mode === UNRECORDED) {
  console.log('Write boundary: NOT RECORDED')
  for (const line of BOUNDARY.why) console.log(`             ${line}`)
} else {
  console.log(`Write boundary: ${BOUNDARY.mode}, recorded in ${RECORD_AT}`)
}
if (CHECKLIST === OWNED) {
  console.log(
    DEFAULT
      ? `Default branch: ${DEFAULT}${BRANCH.inferred ? ' (inferred; `git remote set-head origin -a` settles it)' : ''}`
      : 'Default branch: unknown, so the DEFAULT_BRANCH constants were not compared',
  )
}
console.log('')

let unmet = 0
let reported = 0
for (const layer of LAYERS) {
  const applies = layer.modes.includes(CHECKLIST)
  const { status, findings } = applies ? layer.run() : { status: 'n/a', findings: layer.skipped(BOUNDARY.mode) }
  if (applies) {
    reported += 1
    if (status !== OK) unmet += 1
  }
  console.log(`[ ${status.padEnd(7)} ] ${layer.n}. ${layer.name}`)
  console.log(`             covers ${layer.covers}`)
  for (const finding of findings) console.log(`             ${finding}`)
  // Only an absent layer needs the install line. A PARTIAL one is already
  // installed and its findings say what is left, so repeating "copy the file"
  // there would be the loudest and least useful thing on the screen. A layer
  // the mode excludes needs it least of all: installing it is the mistake.
  if (status === MISSING) console.log(`             FIX: ${layer.fix}`)
  console.log('')
}

// The probe is the only way a session can tell a loaded gate from an inert one,
// and this script cannot tell them apart either. Say so wherever it reports a
// gate as installed, or "ok" gets read as "protected".
//
// Both modes have a gate and both gates now answer `--probe` as a mode of
// themselves, so the only thing the boundary decides is which file to ask. This
// block was guest-only for as long as it was true that the shipped merge guard
// had no probe, which meant the owned stack could report every layer `ok` with
// no way to ask the one that matters whether it had loaded. That was the exact
// state the two lost days above were spent in.
//
// Which line to type is the gate's own business, so it is read out of the gate
// rather than assumed. See `probeCommand` above for what that costs and what it
// was costing before. The guest side was measured at the same time and is
// unaffected: `guard-guest-writes.mjs` names itself and takes `--probe`, so the
// derived line and the old fixed one are the same string.
const PROBE_SOURCE = CHECKLIST === GUEST ? readCommon(GUEST_GATE) : read(MERGE_GUARD)
const PROBE_EXISTS = PROBE_SOURCE !== null
const PROBE_LINE = CHECKLIST === GUEST ? probeCommand(GATE_AT, PROBE_SOURCE) : MERGE_PROBE
const PROBE = [
  'Wired is not loaded. Settings are read once at process start, so ask the gate',
  'itself and put its answer beside this output:',
  '',
  `    ${PROBE_LINE}`,
  '',
  'Being refused is the answer you want. Ask it from the checkout the work is',
  'actually happening in, because which sessions a hook is registered for is a',
  'separate question from whether it is installed.',
]

// A machine fact whichever way it comes out: ADR 0021 defines it as whether
// *this* operator on *this* checkout may publish outward, which is not true of
// anyone else who clones. So it never goes in a committed file, and the
// AGENTS.md line the skill asks for names the backlog tool rather than this.
//
// Both answers are writable, which they were not until #100. The guest one is
// written by installing the gate, because that installation *is* the
// declaration; the owned one is written here, because owned mode has no gate to
// declare it with. Naming only the first is what made this block ask an owned
// repository for a line nobody could produce, run after run, for ever.
//
// **A legacy record already carries the answer, so it gets one command and not a
// pair.** ADR 0029's rule that a refusal owes a remedy that works has a second
// half #131 measured the cost of: a remedy that runs and does the wrong thing is
// worse than one that cannot run. `--install` in a repository recorded owned
// leaves behind a gate refusing every push, in a repository the operator owns and
// is supposed to push to, and it is the operator who then has to work out that
// the report sent them there. Choosing between two commands is a step that can be
// got wrong, so where the answer is already on disk this does not offer the
// choice.
const GUEST_WRITER = '    node <skill>/assets/guard-guest-writes.mjs --install'
const OWNED_WRITER = `    node ${SELF} --record-owned`

// Following either remedy leaves the old directory behind, because neither
// writer removes it and neither should: ADR 0037 keeps that decision with the
// operator, who can see what is in there.
const LEGACY_LEFTOVERS = [
  '',
  `Afterwards, look at what else is in ${LEGACY_FACTORY}/ and remove it along with its`,
  '/.factory/ line in .git/info/exclude. Nothing reads that directory now.',
]

function unrecordedRemedy() {
  if (BOUNDARY.legacy === OWNED) {
    return [
      `${LEGACY_RECORD} already answers this question, and the answer is owned. Write`,
      'that same answer where every checkout of this repository can read it. It records',
      'and does nothing else: owned mode has no gate, so there is nothing to install.',
      '',
      OWNED_WRITER,
      ...LEGACY_LEFTOVERS,
    ]
  }
  if (BOUNDARY.legacy === GUEST) {
    return [
      `${LEGACY_RECORD} already answers this question, and the answer is guest. Do not`,
      'move that file: in guest mode the record is a byproduct of installing the gate,',
      'and a guest record with no gate behind it is a declaration and not a control.',
      'Re-run the install, which writes the gate, the record and the wiring where every',
      'checkout of this repository reads them:',
      '',
      GUEST_WRITER,
      ...LEGACY_LEFTOVERS,
    ]
  }
  return [
    'Nobody has recorded the write boundary here. Record it before the loop starts.',
    'It is a machine fact either way, about this operator on this repository, so it is',
    `never committed: one line in ${RECORD_AT}, inside the git common`,
    'directory where every checkout reads it and no clone inherits it. Whichever',
    'answer is true here, one command writes it:',
    '',
    GUEST_WRITER,
    '        not your repository: the gate, and the record as part of installing it',
    OWNED_WRITER,
    '        yours: the record, and nothing else',
    ...(BOUNDARY.legacy === undefined ? [] : LEGACY_LEFTOVERS),
  ]
}

const UNRECORDED_REMINDER = unrecordedRemedy()

if (unmet === 0) {
  console.log(
    `Every layer that applies here is present and wired: ${reported} reported, ` +
      `${LAYERS.length - reported} not applicable to this write boundary. Any note above is advisory.`,
  )
  for (const line of ['', ...PROBE]) console.log(line)
  if (BOUNDARY.mode === UNRECORDED) for (const line of ['', ...UNRECORDED_REMINDER]) console.log(line)
  process.exit(0)
}

const subject =
  reported === 1
    ? 'The one layer that applies here is'
    : unmet === 1
      ? `One of the ${reported} layers that apply here is`
      : `${unmet} of the ${reported} layers that apply here are`
const until = unmet === 1 ? 'Until it is,' : 'Until they are,'

console.error(`${subject} absent, unwired, or still unedited.`)
if (CHECKLIST === GUEST) {
  console.error(`${until} some session working this repository refuses no outward write`)
  console.error('into a repository that is not yours: a push, a pull request, a comment on')
  console.error('their tracker, a `bd init` that commits nineteen files. Read the findings')
  console.error('above rather than reinstalling by reflex — "the gate is missing" and "the')
  console.error('gate is not registered for the sessions doing the writing" are different')
  console.error('states and only one of them is fixed by installing it again. Then restart')
  console.error('the harness, run the probe, and paste both outputs into your first status')
  console.error('update.')
} else {
  console.error(`${until} nothing here mechanically stops an agent landing code, and`)
  console.error('nothing tells you afterwards that one did. Install them from the skill\'s')
  console.error('assets/ directory, then run this again and paste both outputs into your first')
  console.error('status update, so the difference is on the record rather than assumed.')
}
// Only when there is something to probe. A remedy that cannot run is the thing
// ADR 0029 says gets a gate switched off, and `node` on an absent file fails in
// a way that reads as the gate being broken rather than absent.
if (PROBE_EXISTS) for (const line of ['', ...PROBE]) console.error(line)
if (BOUNDARY.mode === UNRECORDED) for (const line of ['', ...UNRECORDED_REMINDER]) console.error(line)
process.exit(1)
