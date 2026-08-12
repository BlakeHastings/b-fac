// PreToolUse gate: in guest mode the factory writes the working tree and its
// own local store, and nothing else.
//
// WHAT THIS PREVENTS
// ADR 0021 defines guest mode as a write boundary rather than as a list of
// features switched off, because "no external writes happened" is a claim
// something can check and "the agent was careful" never was. Until this file
// existed nothing checked it: the boundary was a paragraph in SKILL.md, and an
// agent that pushed a branch, opened a pull request or commented on the host's
// tracker was doing something the skill forbids and nothing prevented, noticed
// or reported.
//
// It denies, before the command runs: a push to a remote, every `gh` verb that
// is not a read, a `gh api` call carrying a write method or a payload, a
// `git config --global` or `--system` write to the operator's home directory,
// and the two beads commands that write tracked files into a host repo.
//
// WHAT THIS DOES NOT COVER
// Any process the harness did not load it into at startup, and everything that
// process spawns for as long as it lives. A human at a terminal. Reads and
// writes made by the harness's own file tools rather than by a shell, which in
// guest mode are inside the boundary anyway. Any outward write that does not
// arrive through `git`, `gh` or `bd`: `curl`, `glab`, `az repos`, `npm
// publish`, `docker push`, `scp`, an editor's own forge integration. And, as
// with every guard here, anything the command line does not say: a push
// assembled from a variable, a base64 `-EncodedCommand`, or a script file the
// command merely names.
//
// The gap is the point rather than an embarrassment. **The one thing this gate
// refuses is exactly the one step guest mode reserves for the owner**, and a
// hook cannot see the owner's own terminal. Publish is theirs, taken
// deliberately, outside the agent session. There is nothing to add here for it.
//
// HOW IT READS A COMMAND
// It asks what each command in the line *invokes*, never what the line's text
// contains. That distinction is not theoretical: the merge guard beside this
// one shipped without it and, within seconds of firing for the first time,
// denied a `gh issue comment` whose body quoted the blocked command inside a
// markdown table. In guest mode the same failure is likelier, not less likely,
// because the local store's review records describe what the factory did not do.
//
// It reads the command text and nothing else. No branch, no working directory,
// no mode file on disk. A PreToolUse hook runs *before* the command, so a `cd`
// in that command has not happened yet and anything read from the filesystem
// may not describe where the command will land. The mode is declared by
// installing this file, not by a fact it goes and looks up:
//
//   node <this skill>/assets/guard-guest-writes.mjs --install
//
// which writes nothing outside the repository it is run in, and nothing tracked
// inside it. See --install below, and references/enforcement.md.
//
//   node <path>/guard-guest-writes.mjs --probe     # refused when it is loaded
//   node <path>/guard-guest-writes.mjs --install   # install into this repo
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Where the guard and the machine facts live in a repository that is not yours.
// One excluded directory: ADR 0021 keeps machine facts out of the tree through
// `.git/info/exclude` rather than `.gitignore`, because editing a tracked
// ignore file to hide your own scratch state is itself a change to somebody
// else's repository.
const HOME = '.factory'
const GUARD = `${HOME}/guard-guest-writes.mjs`
const RECORD = `${HOME}/machine.md`
const SETTINGS = '.claude/settings.local.json'

// Every shell-capable tool the harness offers. A PreToolUse matcher selects on
// tool NAME, so one that names a single tool is walked straight past by the
// second one: a real session ran `git push origin main` through a PowerShell
// tool against a `"matcher": "Bash"` hook and was not denied.
const MATCHER = 'Bash|PowerShell'

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

// ---------------------------------------------------------------------------
// Reading a command line
//
// Ported wholesale from the merge guard. Both readers answer the same question
// — what does this line invoke — and both were written against the same false
// positive. Two copies is a real cost and it is named in ADR 0029: an asset is
// copied into a host repo on its own, and a two-file asset is a setup step that
// gets half done, which is the failure `check-setup.mjs` exists to catch.
// ---------------------------------------------------------------------------

// Characters that end one command and begin another when they are not inside
// quotes. A closing `)` is handled separately, since it only ends a command
// when a `$(` opened one.
const OPERATORS = new Set(['&', '|', ';', '\n', '\r', '(', '`'])

const ESCAPABLE = new Set([...OPERATORS, ')', '"', "'", '\\', '$', ' ', '\t'])

// Split a command line into the commands it will actually run, each one
// tokenised. Quotes come off the tokens, because `git "push"` has to read the
// same as the bare form, but they still decide *structure*: an operator inside
// a quoted argument is that argument's text, not a new command.
//
// `literalQuote` demotes one quote character to ordinary text. See the caller.
function parse(line, literalQuote) {
  const segments = []
  let tokens = []
  let token = ''
  let quote = null
  let heredoc = null
  // The quote context each open `$(` interrupted, so that the text after the
  // closing bracket goes back to being that argument's contents.
  const resume = []

  const endToken = () => {
    if (token !== '') tokens.push(token)
    token = ''
  }
  const endSegment = () => {
    endToken()
    if (tokens.length > 0) segments.push(tokens)
    tokens = []
  }

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const opensSubstitution = char === '$' && line[i + 1] === '('

    // `$(...)` runs its contents as a command, inside double quotes as well, so
    // it interrupts the argument it sits in. A backtick is not treated the same
    // way even though a shell would expand it: markdown writes code spans with
    // backticks, and a review record quoting a blocked command is precisely the
    // false positive this reader exists to have stopped producing.
    if (opensSubstitution && quote !== "'") {
      endSegment()
      resume.push(quote)
      quote = null
      i += 1
      continue
    }
    // `(` already ends a command, so `)` has to end one as well. Restoring the
    // interrupted quote is only right when a `$(` opened the bracket; a closing
    // bracket with nothing open is a subshell's, and the merge guard beside
    // this one gets that case wrong. `(cd repo && git push)` tokenises there as
    // `git` `push)`, and a rule looking for `push` does not see it.
    if (char === ')' && quote === null) {
      endSegment()
      if (resume.length > 0) quote = resume.pop()
      continue
    }

    if (quote !== null) {
      if (quote === '"' && char === '\\' && '"\\$`'.includes(line[i + 1])) {
        token += line[i + 1]
        i += 1
      } else if (char === quote) {
        quote = null
      } else {
        token += char
      }
      continue
    }

    // A heredoc body is data the shell hands to a command, not commands. It is
    // also how an agent writes a long `--body`, which makes it the second most
    // likely place for a blocked command to appear as prose.
    if (char === '<' && line[i + 1] === '<') {
      const delimiter = heredocDelimiter(line, i + 2)
      if (delimiter !== null) {
        heredoc = delimiter.word
        i = delimiter.end - 1
        continue
      }
    }

    if (char === '\n' && heredoc !== null) {
      endSegment()
      i = endOfHeredoc(line, i + 1, heredoc) - 1
      heredoc = null
      continue
    }

    // A backslash escapes the next character only when that character is one
    // the shell would otherwise act on. Escaping everything mangles the Windows
    // paths this hook sees constantly.
    if (char === '\\' && ESCAPABLE.has(line[i + 1])) {
      token += line[i + 1]
      i += 1
      continue
    }
    if ((char === '"' || char === "'") && char !== literalQuote) {
      quote = char
      continue
    }
    if (OPERATORS.has(char)) {
      endSegment()
      continue
    }
    if (char === ' ' || char === '\t') {
      endToken()
      continue
    }
    token += char
  }

  endSegment()
  return { segments, unterminated: quote ?? resume.find((open) => open !== null) ?? null }
}

// The word after `<<` or `<<-`, with any quoting removed. Null when what
// follows is not a heredoc.
function heredocDelimiter(line, from) {
  let i = from
  if (line[i] === '-') i += 1
  while (line[i] === ' ' || line[i] === '\t') i += 1

  let word = ''
  let quote = null
  while (i < line.length && (quote !== null || !/[\s;&|<>()]/.test(line[i]))) {
    const char = line[i]
    if (quote === null && (char === '"' || char === "'")) quote = char
    else if (char === quote) quote = null
    else word += char
    i += 1
  }
  return word === '' ? null : { word, end: i }
}

// The index of the newline that ends the terminator line, or the end of the
// string when the heredoc is never closed.
function endOfHeredoc(line, from, delimiter) {
  let i = from
  for (;;) {
    const eol = line.indexOf('\n', i)
    const text = line.slice(i, eol === -1 ? line.length : eol)
    if (text.trim() === delimiter || eol === -1) return eol === -1 ? line.length : eol
    i = eol + 1
  }
}

function segmentsOf(line) {
  const first = parse(line, null)
  if (first.unterminated === null) return first.segments
  // An apostrophe in ordinary text opens a quote that never closes, and every
  // operator after it would read as that argument's contents — including a real
  // chained push. A quote with no partner is text, so read it that way.
  return parse(line, first.unterminated).segments
}

const commandName = (token) =>
  token
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.exe$/, '')

// This hook is wired to every shell-capable tool the harness offers, and each
// of those shells can invoke the other one, so `pwsh -Command "git push"` from
// a Bash tool call is a real form rather than a contrived one.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd'])
const SHELL_COMMAND_FLAGS = new Set(['-c', '-Command', '-command', '/c', '/C'])

function shellPayload(tokens) {
  if (!SHELLS.has(commandName(tokens[0]))) return null
  const at = tokens.findIndex((token) => SHELL_COMMAND_FLAGS.has(token))
  return at === -1 ? null : (tokens[at + 1] ?? null)
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

const PUBLISH =
  'Guest mode writes the working tree and the local store, and nothing else.\n' +
  'Every outward write waits for the one publish step the owner asks for, and\n' +
  'the owner takes that step themselves, at their own terminal, where no hook\n' +
  'of ours runs. See ADR 0021 and references/first-run.md.'

// `git` takes its own flags before the subcommand, and two of them swallow the
// next token. Returns the arguments from the subcommand onward, or null when
// this segment does not invoke git.
const GIT_FLAGS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path'])

function gitArguments(tokens) {
  if (commandName(tokens[0]) !== 'git') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GIT_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

// `gh` takes its global flags before the subcommand and no positional argument
// there, so skipping the flags lands on the subcommand path.
const GH_FLAGS_WITH_VALUE = new Set(['--repo', '-R', '--hostname'])

function ghArguments(tokens) {
  if (commandName(tokens[0]) !== 'gh') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GH_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

// Reads are unrestricted in guest mode — pulling the host's ticket in is the
// normal case — so `gh` is allowed by its verb and denied by default. Denying
// by default is the direction a boundary has to fail in: a missing verb here is
// one loud refusal that gets a word added to this list, and a missing verb in a
// deny list is a write that already happened.
//
// Only the first two path tokens are consulted. `gh label create view` has to
// read as a create, not as a view that happens to be somebody's label name.
const GH_READS = new Set([
  'view',
  'list',
  'status',
  'diff',
  'checks',
  'browse',
  'search',
  'clone',
  'checkout',
  'download',
  'watch',
  'get',
  'help',
  'version',
])

// `gh api` defaults to GET and turns into a POST the moment it is handed a
// field, so the method is not always written down. Both forms are the write.
const GH_API_WRITE_METHODS = new Set(['post', 'patch', 'put', 'delete'])
const GH_API_PAYLOAD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

function ghApiWrites(args) {
  for (let at = 0; at < args.length; at += 1) {
    const flag = args[at]
    if (GH_API_PAYLOAD_FLAGS.has(flag)) return true
    if (flag.startsWith('--field=') || flag.startsWith('--raw-field=')) return true
    if (flag === '--method' || flag === '-X') {
      return GH_API_WRITE_METHODS.has((args[at + 1] ?? '').toLowerCase())
    }
    if (flag.startsWith('--method=')) {
      return GH_API_WRITE_METHODS.has(flag.slice('--method='.length).toLowerCase())
    }
  }
  return false
}

// `bd init --stealth` writes `.beads/` and appends to `.git/info/exclude` and
// touches nothing tracked, which is ADR 0021's mechanism arrived at
// independently. Bare `bd init` is an integration installer wearing an init's
// name: in a scratch repo it wrote `AGENTS.md`, `CLAUDE.md`, `.gitignore`,
// `.claude/settings.json` and more, then committed all nineteen files itself.
// `bd setup` wrote two tracked files into a host repo *with `--stealth` on the
// command line*. Both are in references/beads-backlog.md as things to remember
// not to run, which is layer 0, which is this file's whole reason to exist.
function beadsWritesTrackedFiles(tokens) {
  if (commandName(tokens[0]) !== 'bd') return null
  const args = tokens.slice(1).filter((token) => !token.startsWith('-'))
  if (args[0] === 'setup') return '`bd setup` writes CLAUDE.md and .claude/settings.json into the\nworking tree, and does it even with --stealth on the command line.'
  if (args[0] === 'init' && !tokens.includes('--stealth')) {
    return '`bd init` without --stealth is an integration installer: it writes AGENTS.md,\nCLAUDE.md, .gitignore and more, and commits them. Use `bd init --stealth`.'
  }
  return null
}

// The probe is this same file, run with --probe. ADR 0027 established that a
// gate is the one kind of layer whose silence is ambiguous — a gate with
// nothing to deny reads exactly like a gate that was never loaded — and that
// the only way a session can observe a gate is to be refused by it. There it
// took two files agreeing on a filename, which the ADR notes a rename would
// silently break. Here the probe and the rule are the same file, so they cannot
// disagree.
function isLivenessProbe(tokens) {
  if (commandName(tokens[0]) !== 'node') return false
  if (!tokens.includes('--probe')) return false
  const script = tokens.slice(1).find((token) => !token.startsWith('-'))
  return script !== undefined && commandName(script) === 'guard-guest-writes.mjs'
}

function judge(line, depth) {
  for (const tokens of segmentsOf(line)) {
    if (isLivenessProbe(tokens)) {
      deny(
        'The guest-mode gate is loaded in this process. This probe was refused before\n' +
          'it ran, and being refused is the answer it exists to produce. Nothing is wrong.\n\n' +
          'A status update can now say the boundary is enforced rather than declared.',
      )
    }

    const git = gitArguments(tokens)
    if (git !== null && git[0] === 'push' && !git.includes('--dry-run') && !git.includes('-n')) {
      deny(
        `Blocked: pushing is an outward write, and this repository is not yours.\n\n${PUBLISH}\n\n` +
          '`git push --dry-run` is allowed: it contacts the remote and changes nothing.',
      )
    }
    if (git !== null && git[0] === 'config' && (git.includes('--global') || git.includes('--system'))) {
      deny(
        'Blocked: `--global` and `--system` write outside this repository, into the\n' +
          "operator's home directory and machine configuration.\n\n" +
          'Repository-local git config is inside the boundary. Drop the flag.',
      )
    }

    const gh = ghArguments(tokens)
    if (gh !== null && gh.length > 0) {
      const path = gh.filter((token) => !token.startsWith('-')).slice(0, 2)
      if (path[0] === 'api') {
        if (ghApiWrites(gh.slice(1))) {
          deny(
            'Blocked: this `gh api` call carries a write method or a payload, so it is an\n' +
              `outward write however the endpoint reads.\n\n${PUBLISH}`,
          )
        }
      } else if (!path.some((token) => GH_READS.has(token))) {
        deny(
          `Blocked: \`gh ${path.join(' ')}\` is not one of the read verbs, so it is treated as\n` +
            `an outward write.\n\n${PUBLISH}\n\n` +
            'If it really only reads, add its verb to GH_READS in this file and say in the\n' +
            'commit why the boundary was not what it looked like.',
        )
      }
    }

    const beads = beadsWritesTrackedFiles(tokens)
    if (beads !== null) {
      deny(
        `Blocked: this writes files into a repository you are a guest in.\n\n${beads}\n\n` +
          'See references/beads-backlog.md.',
      )
    }

    const nested = depth > 0 ? shellPayload(tokens) : null
    if (nested !== null) judge(nested, depth - 1)
  }
}

// ---------------------------------------------------------------------------
// --install, and --probe
// ---------------------------------------------------------------------------

const MACHINE_RECORD = `# Machine facts

Not committed, and not committable. ADR 0021 splits the initialisation answers
by who they are about: repo facts are true for anyone who clones and belong in
\`AGENTS.md\`, and machine facts are about *this* operator on *this* checkout.
This file is the second kind, kept out of the tree through
\`.git/info/exclude\`, because editing a tracked ignore file to hide your own
scratch state is itself a change to a repository you are a guest in.

Write boundary: guest

The factory writes the working tree and its own local store, and nothing else.
Every outward write waits for the one publish step the owner asks for.

Backlog: (name the tool that provides the seven verbs here — beads, driven by
\`bd\`, is the default. references/backlog-port.md)

Enforced by \`${GUARD}\`, wired as a PreToolUse hook in \`${SETTINGS}\`. That is
a gate, so it is silent when it is loaded and silent when it is not; ask it:

    node ${GUARD} --probe

Being refused is the answer you want.
`

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function repoRoot() {
  try {
    return resolve(git(process.cwd(), ['rev-parse', '--show-toplevel']))
  } catch {
    console.error('Not inside a git repository, so there is nothing to be a guest in.')
    console.error('Run this from the root of the repository you are working in.')
    process.exit(1)
  }
}

// The exclude file lives in the common directory, so a linked worktree and its
// main checkout share one. That is the right scope: the boundary is a fact
// about this operator and this repository, not about which branch is out.
function excludeFile(root) {
  const common = resolve(root, git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
  return join(common, 'info', 'exclude')
}

function appendMissingLines(path, lines) {
  mkdirSync(dirname(path), { recursive: true })
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const present = new Set(existing.split(/\r?\n/).map((line) => line.trim()))
  const missing = lines.filter((line) => !present.has(line))
  if (missing.length === 0) return []
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
  writeFileSync(path, `${existing}${separator}${missing.join('\n')}\n`)
  return missing
}

// Merge into whatever is there. A host repo may already have local settings,
// and replacing somebody's file is the class of thing this whole mode exists to
// avoid — `bd setup` clobbering two tracked files is the worked example.
function wireHook(path) {
  let settings = {}
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      console.error(`${SETTINGS} is not valid JSON, so nothing here can safely edit it.`)
      console.error('Fix or move it, then run this again. Nothing has been written.')
      process.exit(1)
    }
  }
  settings.hooks ??= {}
  settings.hooks.PreToolUse ??= []
  const already = settings.hooks.PreToolUse.some((entry) =>
    (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('guard-guest-writes')),
  )
  if (already) return false
  settings.hooks.PreToolUse.push({
    matcher: MATCHER,
    hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/${GUARD}"`, timeout: 15 }],
  })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
  return true
}

function install() {
  const root = repoRoot()
  const done = []

  mkdirSync(join(root, HOME), { recursive: true })
  const self = fileURLToPath(import.meta.url)
  const destination = join(root, GUARD)
  if (resolve(self) !== resolve(destination)) {
    copyFileSync(self, destination)
    done.push(`copied the gate to ${GUARD}`)
  }

  if (existsSync(join(root, RECORD))) {
    done.push(`left ${RECORD} alone, because it already exists`)
  } else {
    writeFileSync(join(root, RECORD), MACHINE_RECORD)
    done.push(`wrote ${RECORD}, the machine facts ADR 0021 asks for`)
  }

  const excluded = appendMissingLines(excludeFile(root), [`/${HOME}/`, `/${SETTINGS}`])
  done.push(
    excluded.length === 0
      ? 'found both paths already in .git/info/exclude'
      : `excluded ${excluded.join(' and ')} through .git/info/exclude`,
  )

  done.push(
    wireHook(join(root, SETTINGS))
      ? `wired the gate into ${SETTINGS} for ${MATCHER}`
      : `found the gate already wired in ${SETTINGS}`,
  )

  console.log(`Guest mode installed in ${root}\n`)
  for (const line of done) console.log(`  - ${line}`)
  console.log(`
Nothing outside this repository was written, and nothing tracked inside it was.
Confirm that yourself rather than believing this line:

    git status --porcelain -uall

Hooks are read once, at process start, so **this session is not protected**.
Restart the harness, then ask the gate whether it is loaded:

    node ${GUARD} --probe

Being refused is the answer you want. If it prints instead, the gate is not in
this process and the fix is another restart, not another install.`)
}

function probe() {
  console.error('The guest-mode gate is NOT loaded in this process.')
  console.error('')
  console.error('This probe exists in order to be refused. It ran, so nothing intercepted it:')
  console.error(`either ${SETTINGS} has no hook running`)
  console.error(`${GUARD}, or this process started before the hook was`)
  console.error('written. Settings are read once, at process start.')
  console.error('')
  console.error('Nothing is enforcing the write boundary in this session. Restart the harness')
  console.error('and ask again.')
  process.exit(1)
}

if (process.argv.includes('--install')) {
  install()
} else if (process.argv.includes('--probe')) {
  probe()
} else {
  let payload = ''
  for await (const chunk of process.stdin) payload += chunk

  let command = ''
  try {
    command = JSON.parse(payload)?.tool_input?.command ?? ''
  } catch {
    process.exit(0) // Unparseable payload is not this gate's problem.
  }
  if (command.trim()) judge(command, 2)
  process.exit(0)
}
