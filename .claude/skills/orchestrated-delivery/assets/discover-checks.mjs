// What the local gate runs, in a repository the factory did not create.
//
// THE LIMIT COMES FIRST, BECAUSE IT IS THE POINT
// A local gate runs a *subset* of a company's pipeline, and never its
// environment. Their runners have infrastructure, secrets, services and a
// network this laptop does not. What this buys is fewer round trips. It is not
// a promise the pull request will pass, and anything that reads like one is
// worse than nothing, because "green locally, red in their pipeline" then looks
// like a defect in the change rather than the expected difference it is.
// ADR 0021 records it as a consequence rather than a bug.
//
// WHY THIS EXISTS
// Guest mode has no remote check rollup to read, so ADR 0021's table says its
// gate is "the host's own check command, run locally". Nothing established what
// that command *is*. In a repository the factory built, the answer is a line
// somebody wrote in `AGENTS.md`. In somebody else's, it has to be found.
//
// DISCOVERY IS EVIDENCE, NOT INFERENCE
// Manifests, task runners and pipeline files are all evidence and none of them
// is authoritative. A target named `check` may run a formatter and no tests. A
// `test` script may shell out to a runner nobody on this machine has. So the
// output of this is **a proposal a human confirms**, and the confirmation is
// not a nod: it is `--run`, which executes the commands and records them only
// if they exited 0. A check the factory invented and never executed is worse
// than no check, because it produces confident red or confident green about the
// wrong thing.
//
// WHY A SCRIPT HERE, WHEN ADR 0022 REFUSED TO BUILD CONVENTION DETECTION
// Because this answer is executable and that one is not. Whether a repository
// "believes in" decision records has no ground truth to check a detector
// against, so a detector there is a guess wearing a uniform. Whether
// `npm run check` is this repository's check entry point is settled by running
// it. ADR 0032 is the argument; the executable half is what makes the
// difference, and it is why this file spends more lines running commands than
// recognising files.
//
// THE PIPELINE FILES ARE READ AND NEVER PROPOSED
// Reading CI config is the most tempting source and the most misleading: it
// describes what runs in an environment you do not have. A job needing a
// database or a cloud credential is discovered easily, looks runnable, and
// fails for reasons that have nothing to do with the change. So the workflow
// commands are printed under their own heading, as description, and no code
// path can promote one into the proposal.
//
//   node <skill>/assets/discover-checks.mjs             # propose, write nothing
//   node <skill>/assets/discover-checks.mjs --run       # run the proposal, then record
//   node <skill>/assets/discover-checks.mjs --run --command="pnpm verify"
//   node <skill>/assets/discover-checks.mjs --root=/path/to/repo
//
// Exit 0 means there is a proposal, or (with --run) that it was executed and
// every command exited 0. Exit 1 means it could not decide and has printed the
// question to ask, or that something it ran failed.
//
// Requires Node 18 or later and `git`. No network, no `gh`, no dependencies.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'

const LIMIT = [
  'A local gate runs a subset of their pipeline and never their environment.',
  'Their runners have infrastructure, secrets and services this machine does not.',
  'This buys fewer round trips. It is not a promise the pull request will pass.',
]

const runRequested = process.argv.includes('--run')
const overrides = process.argv
  .filter((arg) => arg.startsWith('--command='))
  .map((arg) => arg.slice('--command='.length).trim())
  .filter(Boolean)

// The repo root comes from the working directory, never from this file's own
// location, so the first run can happen from inside the installed skill before
// anything has been copied anywhere. Same reasoning as `check-setup.mjs`.
const rootArg = process.argv.find((arg) => arg.startsWith('--root='))
let ROOT = resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd())
for (;;) {
  if (existsSync(join(ROOT, '.git'))) break
  const up = dirname(ROOT)
  if (up === ROOT) {
    console.error('Not inside a git repository, so there is no repository to discover.')
    console.error('Run this from the root of the repo you are working in, or pass --root=.')
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

const has = (rel) => existsSync(join(ROOT, rel))

function rootEntries() {
  try {
    return readdirSync(ROOT, { withFileTypes: true })
  } catch {
    return []
  }
}

// Is the executable this command needs on PATH? Answered by scanning PATH
// rather than by spawning, so it is cheap, and so a test can make the answer
// deterministic by handing the child a PATH it controls. On Windows the same
// name is `git.exe` or `npm.cmd`, so PATHEXT decides what counts as a hit.
const PATH_DIRS = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
const PATH_EXT =
  process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean) : ['']
const found = new Map()
function onPath(name) {
  if (found.has(name)) return found.get(name)
  const answer = PATH_DIRS.some((dir) =>
    [''].concat(PATH_EXT).some((ext) => {
      try {
        return statSync(join(dir, name + ext)).isFile()
      } catch {
        return false
      }
    }),
  )
  found.set(name, answer)
  return answer
}

// ---------------------------------------------------------------------------
// Tier 1: the repository's own task runner
//
// Ranked first because of ADR 0022 and issue #66. If the repo has a task
// runner, the entry point is one of its targets: putting a wrapper beside it is
// imposing a convention on a repository that already has one. That is a
// judgment about which command is *native here*, and it is a separate question
// from whether the command works, which only `--run` answers.
// ---------------------------------------------------------------------------

// A target whose name stands for the whole gate, versus one that covers a
// single aspect of it. An aggregate makes the entry point one line; without
// one, the entry point is the aspects that exist, in this order.
//
// `all` is deliberately absent. In a Makefile it is the default *build* target
// and runs no tests, so treating it as an aggregate would propose the weakest
// command in the file over the strongest.
const AGGREGATE = ['check', 'ci', 'verify', 'validate', 'precommit', 'pre-commit']
const ASPECT = ['lint', 'typecheck', 'types', 'test', 'tests', 'build']

const targetRank = (name) => {
  const i = AGGREGATE.indexOf(name)
  if (i !== -1) return { kind: 'aggregate', order: i }
  const j = ASPECT.indexOf(name)
  return j === -1 ? null : { kind: 'aspect', order: j }
}

// Given every target a runner offers, the ones that look like a gate: the best
// aggregate if there is one, otherwise every aspect present, in ASPECT order.
function entryTargets(names) {
  const ranked = names.map((name) => ({ name, rank: targetRank(name) })).filter((t) => t.rank !== null)
  const aggregates = ranked.filter((t) => t.rank.kind === 'aggregate').sort((a, b) => a.rank.order - b.rank.order)
  if (aggregates.length > 0) return [aggregates[0].name]
  return ranked.sort((a, b) => a.rank.order - b.rank.order).map((t) => t.name)
}

// Make target names. `:=` is an assignment and `.PHONY` is a directive, so
// neither is a target you can call. A name containing `$` is a template.
function makeTargets(text) {
  return [...text.matchAll(/^([A-Za-z0-9][\w./-]*)\s*::?(?!=)/gm)].map((m) => m[1])
}

function justRecipes(text) {
  return [...text.matchAll(/^([a-z0-9][\w-]*)(?:\s+[^:\n=]*)?:(?!=)/gm)].map((m) => m[1])
}

// Two-space keys under `tasks:`, which is Taskfile's shape. A regex rather than
// a YAML parser: this script takes no dependencies, and a mis-read target is
// caught by the human confirming and then by `--run` refusing to record.
function taskfileTasks(text) {
  const body = text.split(/^tasks:\s*$/m)[1]
  return body === undefined ? [] : [...body.matchAll(/^ {2}([A-Za-z0-9][\w:-]*):/gm)].map((m) => m[1])
}

// Which of npm's four front ends this repository actually uses. The lockfile is
// the artifact; `packageManager` in package.json is the document about it.
function nodeRunner() {
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  if (has('bun.lockb') || has('bun.lock')) return 'bun'
  return 'npm'
}

function taskRunners() {
  const runners = []

  // `covers` is which ecosystem a runner speaks for. `make`, `just` and `task`
  // are general wrappers: a Makefile beside a Cargo.toml is how a Rust project
  // gives its own commands names, and there is no second ecosystem in that. A
  // `package.json` speaks for Node and nothing else, so a Python manifest
  // beside one is a second body of code its scripts never touch.
  const make = ['Makefile', 'makefile', 'GNUmakefile'].find(has)
  if (make) {
    runners.push({
      runner: 'make',
      source: make,
      tool: 'make',
      covers: null,
      targets: makeTargets(read(make) ?? ''),
      call: (t) => `make ${t}`,
    })
  }

  const just = ['justfile', 'Justfile', '.justfile'].find(has)
  if (just) {
    runners.push({
      runner: 'just',
      source: just,
      tool: 'just',
      covers: null,
      targets: justRecipes(read(just) ?? ''),
      call: (t) => `just ${t}`,
    })
  }

  const taskfile = ['Taskfile.yml', 'Taskfile.yaml'].find(has)
  if (taskfile) {
    runners.push({
      runner: 'task',
      source: taskfile,
      tool: 'task',
      covers: null,
      targets: taskfileTasks(read(taskfile) ?? ''),
      call: (t) => `task ${t}`,
    })
  }

  const manifest = read('package.json')
  if (manifest !== null) {
    let scripts = {}
    try {
      scripts = JSON.parse(manifest).scripts ?? {}
    } catch {
      /* An unparseable manifest is evidence of nothing, and saying so is the
         `notes` line below rather than a crash. */
    }
    const runner = nodeRunner()
    runners.push({
      runner,
      source: 'package.json',
      tool: runner,
      covers: 'node',
      targets: Object.keys(scripts),
      body: (t) => scripts[t],
      call: (t) => `${runner} run ${t}`,
    })
  }

  return runners
}

// ---------------------------------------------------------------------------
// Tier 2: the ecosystem manifest
//
// Second because it is true of the ecosystem rather than of this repository. It
// is what somebody who had never seen this repo would type, which is a weaker
// claim than what the people who work here actually type, and a fine fallback
// where they wrote nothing down.
// ---------------------------------------------------------------------------
function ecosystems() {
  const out = []
  const push = (name, source, tool, commands) => out.push({ name, source, tool, commands })

  if (has('Cargo.toml')) push('rust', 'Cargo.toml', 'cargo', ['cargo test'])
  if (has('go.mod')) push('go', 'go.mod', 'go', ['go vet ./...', 'go test ./...'])

  const solution = rootEntries().find((e) => e.isFile() && /\.sln$/i.test(e.name))
  const project = rootEntries().find((e) => e.isFile() && /\.(cs|fs|vb)proj$/i.test(e.name))
  const dotnetTarget = solution?.name ?? project?.name
  if (dotnetTarget) {
    push('dotnet', dotnetTarget, 'dotnet', [`dotnet build "${dotnetTarget}"`, `dotnet test "${dotnetTarget}"`])
  }

  const pyproject = read('pyproject.toml')
  if (pyproject !== null || has('setup.py')) {
    // `uv run` and `poetry run` are how the tests get the project's own
    // environment. Without a lockfile there is no telling which interpreter is
    // meant, and bare `pytest` against the ambient one is the honest guess.
    const prefix = has('uv.lock') ? 'uv run ' : has('poetry.lock') ? 'poetry run ' : ''
    const tool = prefix === '' ? 'pytest' : prefix.split(' ')[0]
    const commands = []
    if (/\[tool\.ruff/.test(pyproject ?? '')) commands.push(`${prefix}ruff check .`)
    commands.push(`${prefix}pytest`)
    push('python', pyproject === null ? 'setup.py' : 'pyproject.toml', tool, commands)
  }
  if (has('tox.ini')) push('python-tox', 'tox.ini', 'tox', ['tox'])
  if (has('noxfile.py')) push('python-nox', 'noxfile.py', 'nox', ['nox'])

  if (has('pom.xml')) push('maven', 'pom.xml', 'mvn', ['mvn -B verify'])
  const gradle = ['build.gradle', 'build.gradle.kts'].find(has)
  if (gradle) {
    const wrapper = has('gradlew')
    push('gradle', gradle, wrapper ? 'sh' : 'gradle', [`${wrapper ? './gradlew' : 'gradle'} check`])
  }
  if (has('Gemfile') && has('Rakefile')) push('ruby', 'Gemfile', 'bundle', ['bundle exec rake'])

  return out
}

// ---------------------------------------------------------------------------
// Tier 3: the pipeline, described and never proposed
// ---------------------------------------------------------------------------
const PIPELINE_FILES = ['.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.circleci/config.yml', '.travis.yml']

function pipelines() {
  const files = []
  const dir = join(ROOT, '.github', 'workflows')
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
      files.push(`.github/workflows/${name}`)
    }
  }
  for (const name of PIPELINE_FILES) if (has(name)) files.push(name)

  return files.map((file) => {
    const text = read(file) ?? ''
    // Single-line `run:` steps only. A block scalar is a shell script with its
    // own control flow, and quoting one back as a command you could type would
    // be exactly the false confidence this tier exists to avoid.
    const steps = [...text.matchAll(/^\s*(?:- )?run:[ \t]+(?![|>])(.+)$/gm)]
      .map((m) => m[1].trim())
      // Unquote only a matched pair. Stripping a lone trailing quote turns
      // `rm -f "$HOME/.ssh/key"` into something that would not parse, which
      // reads as a discovery bug rather than as the quoting it is.
      .map((line) => (/^(['"]).*\1$/s.test(line) ? line.slice(1, -1) : line))
      .filter((line) => line.length > 0)
    return { file, steps: [...new Set(steps)] }
  })
}

// Documents describing the build are listed and never parsed. ADR 0022: read
// artifacts, not the documents describing them, because a contribution guide
// that has drifted from the log is the normal state of a contribution guide.
// They are still the first place a human should look before answering.
const DOCS = ['CONTRIBUTING.md', 'CONTRIBUTING.rst', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/development.md']

// ---------------------------------------------------------------------------
// Choosing, and refusing to choose
// ---------------------------------------------------------------------------
const RUNNERS = taskRunners()
const ECOSYSTEMS = ecosystems()
const PIPELINES = pipelines()
const PRESENT_DOCS = DOCS.filter(has)

// A runner counts as answering only if it names a target that looks like a
// gate. A `package.json` whose scripts are `start` and `dev` is a task runner
// that has nothing to say about checking, and treating it as the answer would
// propose `npm run start` as a gate.
const ANSWERING = RUNNERS.map((r) => ({ ...r, entry: entryTargets(r.targets) })).filter((r) => r.entry.length > 0)

function choose() {
  if (ANSWERING.length > 1) {
    return {
      ask: `${ANSWERING.map((r) => r.source).join(' and ')} both define check-shaped targets`,
      question:
        `This repository has ${ANSWERING.length} task runners that each name a check target ` +
        `(${ANSWERING.map((r) => `\`${r.call(r.entry[0])}\``).join(', ')}). Which one do you actually ` +
        'run before you open a pull request, or is it both?',
    }
  }

  if (ANSWERING.length === 1) {
    const r = ANSWERING[0]

    // A runner that speaks for one ecosystem, beside a manifest for another,
    // is not the entry point for this repository: it is the entry point for
    // half of it. Proposing it would be confident green about code it never
    // touched, which is the specific damage a wrong check does.
    if (r.covers !== null && ECOSYSTEMS.length > 0) {
      return {
        ask: `${r.source} covers ${r.covers} only, and ${ECOSYSTEMS.map((e) => e.source).join(' and ')} ${ECOSYSTEMS.length === 1 ? 'is' : 'are'} beside it`,
        question:
          `\`${r.call(r.entry[0])}\` is the check-shaped target in ${r.source}, and it covers the ` +
          `${r.covers} half of this repository. ${ECOSYSTEMS.map((e) => `${e.source} (${e.name})`).join(' and ')} ` +
          `${ECOSYSTEMS.length === 1 ? 'is a second body of code' : 'are further bodies of code'} it never runs. ` +
          'Does a change like this one need both, or only one? If only one, which?',
      }
    }

    const plural = r.entry.length === 1
    return {
      tier: 1,
      why: `${r.source} defines ${plural ? 'a check-shaped target' : 'check-shaped targets'}: ${r.entry.join(', ')}`,
      tool: r.tool,
      commands: r.entry.map((t) => r.call(t)),
      bodies: r.entry.map((t) => (r.body ? r.body(t) : null)),
    }
  }

  if (ECOSYSTEMS.length > 1) {
    return {
      ask: `${ECOSYSTEMS.map((e) => e.source).join(' and ')} are ${ECOSYSTEMS.length} ecosystems in one repository, and no task runner picks between them`,
      question:
        `This repository is ${ECOSYSTEMS.map((e) => e.name).join(' and ')} ` +
        `(${ECOSYSTEMS.map((e) => e.source).join(', ')}) and has no task runner naming a check target. ` +
        'Does a change like this one need all of them run, or only one? If only one, which?',
    }
  }

  if (ECOSYSTEMS.length === 1) {
    const e = ECOSYSTEMS[0]
    return {
      tier: 2,
      why: `${e.source} makes this a ${e.name} repository, and no task runner names a check target`,
      tool: e.tool,
      commands: e.commands,
      bodies: e.commands.map(() => null),
    }
  }

  const runnersWithoutEntry = RUNNERS.filter((r) => entryTargets(r.targets).length === 0)
  return {
    ask:
      runnersWithoutEntry.length > 0
        ? `${runnersWithoutEntry.map((r) => r.source).join(' and ')} exists and names no check-shaped target`
        : 'no task runner and no ecosystem manifest in the root',
    question:
      runnersWithoutEntry.length > 0
        ? `${runnersWithoutEntry.map((r) => r.source).join(' and ')} defines ` +
          `${runnersWithoutEntry.flatMap((r) => r.targets).join(', ') || 'nothing'}, none of which reads as a check. ` +
          'What do you run locally before you open a pull request here?'
        : 'I could find no manifest and no task runner in the root of this repository, so I have ' +
          'nothing to propose. What do you run locally before you open a pull request here?',
  }
}

const PROPOSAL = choose()

// A proposal whose tool is not installed is not a proposal. This is the state
// where a wrong check does most of its damage: the command is right, it cannot
// run here, and any wrapper around it reports a failure that says nothing about
// the change.
if (!PROPOSAL.ask && !onPath(PROPOSAL.tool)) {
  PROPOSAL.ask = `\`${PROPOSAL.tool}\` is not on PATH on this machine`
  PROPOSAL.question =
    `The check entry point here looks like \`${PROPOSAL.commands.join('` and `')}\`, and \`${PROPOSAL.tool}\` ` +
    'is not installed on this machine, so I cannot confirm it by running it. Should I install it, or is ' +
    'there another command you use locally?'
  PROPOSAL.unrunnable = PROPOSAL.commands
  delete PROPOSAL.commands
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const say = (line = '') => console.log(line)

say(`Check entry point in ${ROOT}`)
for (const line of LIMIT) say(`  ${line}`)
say()

say('Evidence')
if (RUNNERS.length === 0 && ECOSYSTEMS.length === 0) say('  no task runner and no ecosystem manifest in the root')
for (const r of RUNNERS) {
  const entry = entryTargets(r.targets)
  say(`  [ runner   ] ${r.source} (${r.runner}), ${r.targets.length} targets`)
  say(`               check-shaped: ${entry.length > 0 ? entry.join(', ') : 'none'}`)
  if (!onPath(r.tool)) say(`               \`${r.tool}\` is not on PATH here`)
}
for (const e of ECOSYSTEMS) {
  say(`  [ manifest ] ${e.source} (${e.name}), conventionally ${e.commands.join(' then ')}`)
  if (!onPath(e.tool)) say(`               \`${e.tool}\` is not on PATH here`)
}
say()

if (PIPELINES.length > 0) {
  say('Described by the pipeline, and deliberately not proposed')
  say('  A pipeline file says what runs in an environment you do not have. A job needing a')
  say('  database or a cloud credential is discovered easily, looks runnable, and fails for')
  say('  reasons that have nothing to do with your change. Read these; do not adopt one.')
  // Capped in both directions. A deployment repo can carry a dozen pipelines,
  // and a listing long enough to scroll past is a listing nobody reads, which
  // would quietly undo the point of printing it at all.
  for (const p of PIPELINES.slice(0, 6)) {
    say(`  ${p.file}`)
    for (const step of p.steps.slice(0, 6)) say(`      ${step}`)
    if (p.steps.length > 6) say(`      ... and ${p.steps.length - 6} more`)
    if (p.steps.length === 0) say('      (no single-line run: steps; the work is in block scalars or actions)')
  }
  if (PIPELINES.length > 6) say(`  ... and ${PIPELINES.length - 6} more pipeline files`)
  say()
}

if (PRESENT_DOCS.length > 0) {
  say(`Not read: ${PRESENT_DOCS.join(', ')}`)
  say('  A document describing the build is the half that goes stale (ADR 0022), so nothing')
  say('  here parses one. They are still the first place to look before you ask.')
  say()
}

if (PROPOSAL.ask) {
  say('CANNOT DECIDE. Ask, do not guess.')
  say(`  What stopped it: ${PROPOSAL.ask}.`)
  if (PROPOSAL.unrunnable) say(`  What it would have proposed: ${PROPOSAL.unrunnable.join(' && ')}`)
  say('  The question, in one line:')
  say()
  for (const line of wrap(PROPOSAL.question, 84)) say(`      ${line}`)
  say()
  say('  Then confirm the answer by running it, which is the only thing that records it:')
  say()
  say('      node <this skill>/assets/discover-checks.mjs --run --command="<their command>"')
  say()
  say('  A wrong check is worse than no check: it produces confident red or confident green')
  say('  about the wrong thing. Escalating is the correct outcome here, not a failure of it.')
  if (!runRequested) process.exit(1)
}

if (!PROPOSAL.ask) {
  say(`PROPOSED, from tier ${PROPOSAL.tier} evidence. Not confirmed until it has been run.`)
  say(`  Because: ${PROPOSAL.why}.`)
  for (const [i, command] of PROPOSAL.commands.entries()) {
    say(`      ${command}`)
    if (PROPOSAL.bodies[i]) say(`          which is: ${PROPOSAL.bodies[i]}`)
  }
  say()
  say('  A target named `check` is evidence, not a guarantee: it may run a formatter and no')
  say('  tests, and a script may shell out to a runner this machine does not have. Confirm')
  say('  it with the owner, then prove it:')
  say()
  say('      node <this skill>/assets/discover-checks.mjs --run')
  say()
}

if (!runRequested) process.exit(PROPOSAL.ask ? 1 : 0)

// ---------------------------------------------------------------------------
// --run: the only thing that turns a proposal into an entry point
// ---------------------------------------------------------------------------
const TO_RUN = overrides.length > 0 ? overrides : PROPOSAL.commands

if (!TO_RUN || TO_RUN.length === 0) {
  console.error('Nothing to run: there is no proposal, and --command= was not given.')
  console.error('Ask the question above, then pass the answer with --command=.')
  process.exit(1)
}

say(`Running ${TO_RUN.length} command${TO_RUN.length === 1 ? '' : 's'} in ${ROOT}.`)
say(`  ${overrides.length > 0 ? 'Given with --command=, not proposed.' : 'The proposal above, unedited.'}`)
say('  Their output follows, unfiltered, because a summary of a check is not a check.')
say()

// `shell: true` on a command string assembled from the repository's own
// manifest. That is the point of the exercise rather than a hazard to guard
// against: the alternative to running what this repo says it runs is proposing
// something nobody has executed.
const results = []
for (const command of TO_RUN) {
  say(`--- ${command}`)
  const started = Date.now()
  const child = spawnSync(command, { cwd: ROOT, shell: true, stdio: ['ignore', 'inherit', 'inherit'] })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const code = child.error ? null : child.status
  results.push({ command, code, seconds })
  say(`--- ${command} exited ${code === null ? `without starting: ${child.error?.message}` : code} in ${seconds}s`)
  say()
}

say('Ran')
for (const r of results) say(`  [ ${String(r.code ?? 'no start').padEnd(8)} ] ${r.command}   ${r.seconds}s`)
say()

const failed = results.filter((r) => r.code !== 0)
if (failed.length > 0) {
  console.error(`${failed.length} of ${results.length} exited non-zero, so nothing has been recorded.`)
  console.error('')
  console.error('Two things this can mean, and they want opposite fixes:')
  console.error('  - the command is wrong, in which case ask rather than record it, or')
  console.error("  - the command is right and the host repository's checks are already red")
  console.error('    before you changed anything. That is a question for the owner too: a gate')
  console.error('    whose baseline is red cannot tell your failure from the one already there.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// The record
//
// A repo fact by ADR 0021's split, and still written to an untracked file. In a
// repository you are a guest in there is no committable place to put one, and
// adding `checks.sh` beside somebody's Makefile is imposing a convention on a
// repository that has one (ADR 0022, issue #66). So the entry point is a
// recorded line rather than a file added to their tree, and `.factory/` is
// where the machine record already lives.
// ---------------------------------------------------------------------------
const HOME = '.factory'
const RECORD = `${HOME}/checks.md`

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

// Spelled out here rather than imported from `guard-guest-writes.mjs`, for the
// reason ADR 0029 gives for its command reader existing twice: an asset is
// copied into a host repo on its own, and a two-file asset is a setup step that
// gets half done. The gate excludes the whole of `.factory/`, so when it ran
// first there is nothing left to do here and this says so.
function excludeFactory() {
  const common = resolve(ROOT, git(['rev-parse', '--path-format=absolute', '--git-common-dir']))
  const path = join(common, 'info', 'exclude')
  const line = `/${HOME}/`
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (existing.split(/\r?\n/).some((l) => l.trim() === line)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${existing}${existing === '' || existing.endsWith('\n') ? '' : '\n'}${line}\n`)
  return true
}

const porcelain = () => {
  try {
    return git(['status', '--porcelain', '-uall'])
  } catch {
    return null
  }
}

const before = porcelain()
const excluded = excludeFactory()

const when = new Date().toISOString()
const body = `# The check entry point in this repository

Discovered by \`discover-checks.mjs\` and confirmed by running it. Nothing is
recorded here that was not executed: ADR 0032.

Check entry point:

${TO_RUN.map((c) => `    ${c}`).join('\n')}

${overrides.length > 0 ? 'Given by hand with --command=.' : `Proposed from tier ${PROPOSAL.tier} evidence: ${PROPOSAL.why}.`}

Ran ${when}, from ${ROOT}:

${results.map((r) => `    ${r.command}   exit ${r.code}   ${r.seconds}s`).join('\n')}

## What this is not

${LIMIT.join('\n')}

Re-run \`discover-checks.mjs --run\` after the host repository changes how it
builds. This file records one execution on one machine at one moment, and it
goes stale the way any measurement does.

## Not committed, and not committable

This is untracked, through \`.git/info/exclude\` rather than \`.gitignore\`,
because editing a tracked ignore file is itself a change to a repository you are
a guest in. ADR 0021.
`

mkdirSync(join(ROOT, HOME), { recursive: true })
writeFileSync(join(ROOT, RECORD), body)

const after = porcelain()
say(`Recorded in ${RECORD}.`)
if (excluded) say(`  Added /${HOME}/ to .git/info/exclude.`)
else say(`  /${HOME}/ was already in .git/info/exclude.`)

// The same promise the guest gate makes, checked here rather than asserted. A
// record that shows up as somebody's uncommitted change has already broken the
// boundary it was written under.
if (before === null || after === null) {
  say('  note: `git` did not answer, so "nothing the host repo can see changed" is unchecked.')
} else if (before === after) {
  say('  `git status --porcelain -uall` is byte-for-byte what it was before this ran.')
} else {
  console.error('')
  console.error('This run changed what the host repository can see:')
  for (const line of after.split('\n').filter((l) => !before.split('\n').includes(l))) console.error(`  ${line}`)
  console.error('That is the boundary breaking itself. Fix .git/info/exclude before you continue.')
  process.exit(1)
}

say()
for (const line of LIMIT) say(line)
process.exit(0)

// Wrapping the escalation question, so the one line a human has to read is not
// four hundred characters wide in a terminal.
function wrap(text, width) {
  const lines = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    if (current === '') current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}
