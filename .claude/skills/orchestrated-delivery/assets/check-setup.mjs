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
// off, and this repository already spends its one tolerable permanently-red
// line on layer 3 under ADR 0001.
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

const read = (rel) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8')
  } catch {
    return null
  }
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
const MACHINE_RECORD = '.factory/machine.md'
const GUEST_GATE = '.factory/guard-guest-writes.mjs'
const LOCAL_SETTINGS = '.claude/settings.local.json'
const REPO_SETTINGS = '.claude/settings.json'

// SETUP: where layer 2's guard was copied to, if not `scripts/`. Both gates
// answer `--probe`, so this is also the file the report tells you to ask, and
// `guard-merge-asset.test.mjs` pins that: it reads this constant, builds the
// line printed below, and asserts the shipped guard refuses it.
const MERGE_GUARD = 'scripts/guard-merge.mjs'

function writeBoundary() {
  const record = read(MACHINE_RECORD)
  if (record === null) return { mode: UNRECORDED, why: `${MACHINE_RECORD} does not exist` }

  const declared = /^Write boundary:\s*(\S+)/m.exec(record)?.[1].toLowerCase()
  if (declared === OWNED || declared === GUEST) {
    return { mode: declared, record }
  }
  // A record that exists and does not answer is the same state as no record,
  // reported differently, because the two want different fixes.
  return {
    mode: UNRECORDED,
    record,
    why:
      declared === undefined
        ? `${MACHINE_RECORD} exists and has no "Write boundary:" line`
        : `${MACHINE_RECORD} says "Write boundary: ${declared}", which is neither owned nor guest`,
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

// The same line `guard-guest-writes.mjs --install` and `discover-checks.mjs`
// append, spelled a third time for the reason ADR 0029 gives: an asset is
// copied into a host repo on its own, and a two-file asset is a setup step that
// gets half done. `.gitignore` is tracked, and editing a tracked ignore file to
// hide your own scratch state is itself a change to the repository.
const EXCLUDE_LINE = `/${dirname(MACHINE_RECORD)}/`

// What an owned record says, which is nearly all reason and one fact. There is
// no owned equivalent of the guest record's backlog line or probe command: in
// owned mode the backlog and the check command are repo facts, true for anyone
// who clones, and they belong in a committed `AGENTS.md`. The boundary is the
// only machine fact owned mode has, so this file is thin on purpose, and its
// worth is that it exists rather than what it holds.
const OWNED_RECORD = `# Machine facts

Not committed, and not committable. ADR 0021 splits the initialisation answers
by who they are about: repo facts are true for anyone who clones and belong in
\`AGENTS.md\`, and machine facts are about *this* operator on *this* checkout.
This file is the second kind, kept out of the tree through
\`.git/info/exclude\`, so nobody else who clones this repository inherits it.

Write boundary: owned

The factory may write outward from here: create the repository, seed a backlog,
push branches, open and merge pull requests, configure CI, apply a ruleset.

That is the whole of the answer, and the file is short because owned mode has
one machine fact and no gate to hold it. The guest record names a gate to probe
at this point. What there is to ask here is the owned enforcement stack, which
answers a different question: what may land, rather than what may be written
outward.

    check-setup.mjs               the layers, and whether each one is wired
    node ${MERGE_GUARD} --probe   whether the one that refuses a merge loaded

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

// `.git/info/exclude` lives in the common directory, so a linked worktree and
// its main checkout share one. That is the right scope: the boundary is a fact
// about this operator and this repository, not about which branch is out.
function excludeFile() {
  const common = resolve(ROOT, git(['rev-parse', '--path-format=absolute', '--git-common-dir']))
  return join(common, 'info', 'exclude')
}

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
      `${MACHINE_RECORD} already exists, so the question has been answered here.`,
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
  if (read(GUEST_GATE) !== null) {
    refuse([
      `${GUEST_GATE} is installed here, and installing that gate is the guest`,
      'declaration (ADR 0029). Recording this repository as owned would leave a control',
      'in place that the record says is unnecessary, which is the disagreement layer G',
      'reports rather than a state to write on purpose.',
      '',
      'If this repository really is yours, remove the gate and its wiring first.',
    ])
  }

  let exclude
  let before
  try {
    exclude = excludeFile()
    before = untracked()
  } catch {
    refuse([
      '`git` did not answer, so there is no way to put this file out of the tree.',
      `Writing ${MACHINE_RECORD} without excluding it leaves the operator's own scratch`,
      "state showing in `git status` as somebody's changes, and ADR 0021 keeps machine",
      'facts out of the tree. Run this from inside a git repository, with git on PATH.',
    ])
  }

  const done = []
  const existing = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (existing.split(/\r?\n/).some((line) => line.trim() === EXCLUDE_LINE)) {
    done.push(`found ${EXCLUDE_LINE} already in .git/info/exclude`)
  } else {
    mkdirSync(dirname(exclude), { recursive: true })
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
    writeFileSync(exclude, `${existing}${separator}${EXCLUDE_LINE}\n`)
    done.push(`excluded ${EXCLUDE_LINE} through .git/info/exclude`)
  }

  // The exclusion first, then the file, so the record is never visible to the
  // repository even for the moment in between.
  mkdirSync(join(ROOT, dirname(MACHINE_RECORD)), { recursive: true })
  writeFileSync(join(ROOT, MACHINE_RECORD), OWNED_RECORD)
  done.push(`wrote ${MACHINE_RECORD}, saying "Write boundary: owned"`)

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
    console.error('\nThat is the half of the promise this command exists to keep. The exclusion')
    console.error('did not take, and the record is visible to anyone running `git status` here.')
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
function preToolUseHooks(needle) {
  const wired = []
  for (const file of [REPO_SETTINGS, LOCAL_SETTINGS]) {
    const text = read(file)
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
    fix: `Copy guard-merge.mjs to scripts/ and add the PreToolUse block from references/enforcement.md to .claude/settings.json. Restart the session afterwards: settings are read at startup. Then \`node ${MERGE_GUARD} --probe\`, which the guard refuses when it is loaded.`,
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
        if (runner.text.includes('pull_request')) {
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
      const copied = read(GUEST_GATE) !== null
      if (mode === OWNED) {
        return [
          `not reported: ${MACHINE_RECORD} records this repository as owned, so the factory`,
          'may write outward and there is no boundary for a gate to hold. Every command it',
          'refuses is the workflow here. ADR 0029',
          ...(copied
            ? [`but ${GUEST_GATE} exists anyway, in a repository recorded as owned. One of`,
               'those two facts is wrong and the file is the likelier one']
            : []),
        ]
      }
      return [
        'not reported: nobody has recorded a write boundary, so the layers above were',
        'reported instead. If this repository is not yours, do not install those: record',
        'the boundary and install this gate, and the four above stay off for good.',
        ...(copied
          ? [`Note that ${GUEST_GATE} is already here, which is what guest mode looks like`,
             `with its record deleted. --install rewrites ${MACHINE_RECORD} without touching`,
             'anything else']
          : []),
      ]
    },
    fix: 'Run `node <this skill>/assets/guard-guest-writes.mjs --install` from the repo root, then restart the harness: settings are read at startup.',
    run() {
      if (read(GUEST_GATE) === null) {
        return {
          status: MISSING,
          findings: [
            `${MACHINE_RECORD} records this repository as guest and ${GUEST_GATE} is absent,`,
            "so nothing refuses a push, a pull request, or a comment on the host's tracker.",
            'This is the state where the boundary is a paragraph and not a control',
          ],
        }
      }

      // Copied and unwired is MISSING here for the same reason it is on layer 2:
      // a control nothing invokes is an instruction plus a file.
      const { wired, unparseable } = preToolUseHooks('guard-guest-writes')
      if (unparseable) {
        return { status: MISSING, findings: [`${unparseable} is not valid JSON, so no hook loads`] }
      }
      if (wired.length === 0) {
        return {
          status: MISSING,
          findings: [
            `${GUEST_GATE} is here and no PreToolUse hook runs it, so nothing loads it.`,
            '--install copies and wires in one step, so this is a half-done install or a',
            'settings file that was edited afterwards',
          ],
        }
      }

      const findings = wiringProblems(wired[wired.length - 1])

      // The boundary enforcing itself by breaking itself. Both halves of the
      // gate's promise are checkable and neither is visible in a file listing.
      const seen = visibleToTheHostRepo(['.factory', LOCAL_SETTINGS, REPO_SETTINGS])
      if (seen === null) {
        findings.push('note: `git` did not answer, so the "nothing tracked changed" half is unchecked')
      } else {
        const committed = seen.tracked.filter((p) => p.startsWith('.factory/') || p === LOCAL_SETTINGS)
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

      // Advisory, deliberately: the gate is correctly installed either way, and
      // --install writes this placeholder itself, so counting it would make a
      // clean install exit non-zero on its first run.
      if (/^Backlog:\s*\(/m.test(BOUNDARY.record ?? '')) {
        findings.push(
          `note: the Backlog line in ${MACHINE_RECORD} is still the template's instruction` +
            ' rather than a tool name, so nothing says where the factory\'s own issues live',
        )
      }

      return { status: findings.some((f) => !f.startsWith('note:')) ? PARTIAL : OK, findings }
    },
  },
]

console.log(`Enforcement layers in ${ROOT}`)
if (BOUNDARY.mode === UNRECORDED) {
  console.log('Write boundary: NOT RECORDED')
  console.log(`             ${BOUNDARY.why}, so nobody has said whether this factory may`)
  console.log('             write outward. ADR 0021 has that asked out loud at initialisation, so')
  console.log('             this repository skipped the question rather than answered it. That is a')
  console.log('             finding and not an error: the layers below are reported as if owned.')
} else {
  console.log(`Write boundary: ${BOUNDARY.mode}, recorded in ${MACHINE_RECORD}`)
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
const PROBE_TARGET = CHECKLIST === GUEST ? GUEST_GATE : MERGE_GUARD
const PROBE = [
  'Wired is not loaded. Settings are read once at process start, so ask the gate',
  'itself and put its answer beside this output:',
  '',
  `    node ${PROBE_TARGET} --probe`,
  '',
  'Being refused is the answer you want.',
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
const UNRECORDED_REMINDER = [
  'Nobody has recorded the write boundary here. Record it before the loop starts.',
  'It is a machine fact either way, about this operator on this checkout, so it is',
  `never committed: one line in ${MACHINE_RECORD}, kept out of the tree through`,
  '.git/info/exclude. Whichever answer is true here, one command writes it:',
  '',
  '    node <skill>/assets/guard-guest-writes.mjs --install',
  '        not your repository: the gate, and the record as part of installing it',
  `    node ${SELF} --record-owned`,
  '        yours: the record, and nothing else',
]

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
  console.error(`${until} nothing refuses an outward write into a repository that is not`)
  console.error('yours: a push, a pull request, a comment on their tracker, a `bd init` that')
  console.error('commits nineteen files. Install the gate, restart the harness, then run the')
  console.error('probe and paste both outputs into your first status update.')
} else {
  console.error(`${until} nothing here mechanically stops an agent landing code, and`)
  console.error('nothing tells you afterwards that one did. Install them from the skill\'s')
  console.error('assets/ directory, then run this again and paste both outputs into your first')
  console.error('status update, so the difference is on the record rather than assumed.')
}
// Only when there is something to probe. A remedy that cannot run is the thing
// ADR 0029 says gets a gate switched off, and `node` on an absent file fails in
// a way that reads as the gate being broken rather than absent.
if (read(PROBE_TARGET) !== null) for (const line of ['', ...PROBE]) console.error(line)
if (BOUNDARY.mode === UNRECORDED) for (const line of ['', ...UNRECORDED_REMINDER]) console.error(line)
process.exit(1)
