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
// Run this before installing anything and every layer reports MISSING; install,
// run it again, and paste both. It exits non-zero until each layer is present
// AND wired, because wiring is the half that gets skipped. Re-run it after any
// change to the hook settings or to CI job names, where the same layers go
// quiet without going away.
//
//   node <skill>/assets/check-setup.mjs   # from the repo root, before anything
//   node scripts/check-setup.mjs          # after, once it has been copied in
//   node scripts/check-setup.mjs --root=/path/to/repo
//
// Requires Node 18 or later, and `git` for one comparison it skips without.
// No network, no `gh`, no Python. If `node` itself is missing, that is this
// check's first finding without it having to run, because layers 1 to 3 ship as
// Node scripts. The LAYERS table below is the same checklist by eye, for a repo
// where you cannot run it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

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

// A copied-but-unedited placeholder, in the two forms the assets ship: the
// SETUP constants in the scripts, and bracketed phrases in the process docs.
// The bracket pattern skips markdown links, which are the false positive that
// would get this check switched off.
const UNEDITED_CONSTANT = /REPLACE_WITH_[A-Z_]+/g
const UNEDITED_PROSE = /\[[a-z][^\]\n]{2,80}\](?![([])/g

function leftovers(text, pattern) {
  return [...new Set((text ?? '').match(pattern) ?? [])]
}

const BRANCH = defaultBranch()
const DEFAULT = BRANCH?.name ?? null
const WORKFLOWS = workflows()
const mentions = (needle) => WORKFLOWS.filter((w) => w.text.includes(needle))

// Layer numbers match references/enforcement.md, weakest first, so this output
// reads as that chapter rendered against the repo in front of you.
const LAYERS = [
  {
    n: 0,
    name: 'The instruction',
    covers: 'nothing on its own. Here so its absence is visible too',
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
    covers: 'a merge taken with checks red. Does not cover anyone who does not type it',
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
    covers: 'an agent merging its own PR. Does not cover a session that never loaded it, or a human at a terminal',
    fix: 'Copy guard-merge.mjs to scripts/ and add the PreToolUse block from references/enforcement.md to .claude/settings.json. Restart the session afterwards: settings are read at startup.',
    run() {
      const source = read('scripts/guard-merge.mjs')
      if (source === null) return { status: MISSING, findings: ['scripts/guard-merge.mjs is absent'] }

      // Present but unwired is the failure this whole script exists for, so it
      // reports as MISSING rather than PARTIAL. A script nothing invokes is not
      // a weaker layer than an absent one; it is the same layer, plus a file.
      let wired = null
      for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
        const text = read(file)
        if (text === null) continue
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          return { status: MISSING, findings: [`${file} is not valid JSON, so no hook loads`] }
        }
        for (const entry of parsed?.hooks?.PreToolUse ?? []) {
          const runs = (entry.hooks ?? []).some((h) => (h.command ?? '').includes('guard-merge'))
          if (runs) wired = { file, entry }
        }
      }
      if (wired === null) {
        return {
          status: MISSING,
          findings: [
            'the script is in scripts/ and no PreToolUse hook runs it, so nothing loads it.',
            'This is the shape the layer takes when setup was read and not done',
          ],
        }
      }

      const findings = []
      const matcher = wired.entry.matcher ?? ''
      // A PreToolUse matcher selects on tool NAME. A harness offering a second
      // shell tool walks straight past a matcher naming one, which a real
      // session proved by pushing to the default branch through one.
      if (!matcher.includes('|')) {
        findings.push(
          `${wired.file} matches "${matcher}", which names one tool. A second shell tool` +
            ' in the same harness is not guarded. Name them all, separated by |',
        )
      }
      if ('if' in wired.entry) {
        findings.push(
          `${wired.file} narrows the matcher with an "if" clause, which uses permission-rule` +
            ' syntax naming a single tool and reopens the hole the matcher just closed',
        )
      }
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
    covers: 'a commit that reached the default branch outside a PR. Does not cover prevention: it runs after the fact',
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
]

console.log(`Enforcement layers in ${ROOT}`)
console.log(
  DEFAULT
    ? `Default branch: ${DEFAULT}${BRANCH.inferred ? ' (inferred; `git remote set-head origin -a` settles it)' : ''}\n`
    : 'Default branch: unknown, so the DEFAULT_BRANCH constants were not compared\n',
)

let unmet = 0
for (const layer of LAYERS) {
  const { status, findings } = layer.run()
  if (status !== OK) unmet += 1
  console.log(`[ ${status.padEnd(7)} ] ${layer.n}. ${layer.name}`)
  console.log(`             covers ${layer.covers}`)
  for (const finding of findings) console.log(`             ${finding}`)
  // Only an absent layer needs the install line. A PARTIAL one is already
  // installed and its findings say what is left, so repeating "copy the file"
  // there would be the loudest and least useful thing on the screen.
  if (status === MISSING) console.log(`             FIX: ${layer.fix}`)
  console.log('')
}

if (unmet === 0) {
  console.log(`All ${LAYERS.length} layers are present and wired. Any note above is advisory.`)
  process.exit(0)
}

console.error(`${unmet} of ${LAYERS.length} layers are absent, unwired, or still unedited.`)
console.error('Until they are, nothing here mechanically stops an agent landing code, and')
console.error('nothing tells you afterwards that one did. Install them from the skill\'s')
console.error('assets/ directory, then run this again and paste both outputs into your first')
console.error('status update, so the difference is on the record rather than assumed.')
process.exit(1)
