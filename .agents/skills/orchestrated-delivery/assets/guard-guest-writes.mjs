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
// WHERE IT HAS TO BE REGISTERED, WHICH IS THE HALF THAT WAS WRONG
// Measured on Claude Code 2.1.228, because the first real guest run found this
// and no test did: **the harness reads project settings from the directory the
// session started in and from nowhere else.** Not the parent directory, not the
// repository, not `.git/`. A session started in a linked worktree therefore
// registers no hook from the main checkout, and the sibling and nested worktree
// cases behave identically. `$CLAUDE_PROJECT_DIR` is that same starting
// directory, so in a worktree session it is the worktree.
//
// The subagents that push branches, open pull requests and comment on the
// host's tracker are exactly the sessions that start in worktrees, so until #122
// the boundary reached every session except the ones doing the writing.
//
// So there are two registrations and they cover different sessions:
//
//   .claude/settings.local.json in one checkout   sessions started in that
//                                                 directory, and nothing else
//   ~/.claude/settings.json, with --scope         every session on this machine
//                                                 whose repository is the one
//                                                 named, worktrees included
//
// `--install` writes the first and **prints** the second. Installing under
// somebody's home directory is theirs to do (ADR 0029, and it still holds), and
// printing a block is not installing it. `--scope` is what makes the second one
// safe to accept: see below.
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
// Nor does it cover a command that runs another command. Every line below was
// run against this file and allowed through, so each one is a working outward
// write from inside guest mode:
//
//   sudo git push origin HEAD       ALLOWED    nohup git push origin HEAD    ALLOWED
//   env gh pr create --fill         ALLOWED    xargs git push origin HEAD    ALLOWED
//   command git push origin HEAD    ALLOWED    time -p git push origin HEAD  ALLOWED
//
// They are open on purpose. The set of programs that can launch another program
// has no edge, so closing six of them buys a longer list rather than a closed
// hole, and it buys that at the cost of this section's accuracy, which is the
// part of the file worth the most. What makes that defensible in somebody
// else's repository is the threat model: an agent that forgot, or that talked
// itself into it, not one that is hiding. Nobody reaches for `sudo` to push a
// branch by accident. `time -p` is the seam, one flag past the reserved word
// that *is* handled, and closing it would mean keeping a table of someone
// else's flags.
//
// One more, measured the same way and open for its own reason:
//
//   bash -c "bash -c \"bash -c 'git push origin HEAD'\""  ALLOWED
//
// That is the two-shell recursion limit in `judge`, not a reading failure.
//
// One more that only exists once the gate is registered machine-wide with
// `--scope`, and it is the price of that scope rather than an oversight:
//
//   (from a repository that is not the scoped one) cd guest-repo && git push   ALLOWED
//
// The scope is decided from where the session is standing, and a `cd` in the
// command has not happened yet. That is the same seam as `sudo` and `env`
// above, drawn in a different place, and it fails toward allowing rather than
// toward a false positive on purpose: see --scope below.
//
// Shell syntax an ordinary command *can* contain is otherwise covered: the
// reserved words and grouping that introduce a command, and the `VAR=value`
// prefix that binds a variable for one. See LEADING_WORDS and ASSIGNMENT.
// `env git push origin HEAD` staying open above while `GIT_TRACE=1 git push`
// is now denied is the same line drawn twice rather than an inconsistency:
// `env` is a program that runs another program, and the set of those has no
// edge, while an assignment prefix is a shell form with a grammar.
//
// Where this gate is stronger than the merge guard, measured rather than
// assumed: `\git push`, `/usr/bin/gh pr create` and `git.exe push` are all
// DENIED here and allowed there, because every rule below asks `commandName`
// instead of comparing the raw token. That is why this list was measured
// against this file's own rules rather than copied from the merge guard's.
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
// **Every verdict is read out of the command text and nothing else.** No
// branch, no working directory, no mode file on disk. A PreToolUse hook runs
// *before* the command, so a `cd` in that command has not happened yet and
// anything read from the filesystem may not describe where the command will
// land. The mode is declared by installing this file, not by a fact it goes and
// looks up:
//
//   node <this skill>/assets/guard-guest-writes.mjs --install
//
// which writes nothing outside the repository it is run in, and nothing into
// its working tree at all. See --install below, and references/enforcement.md.
//
// `--scope` is the one thing that is not a verdict, and the distinction is the
// whole argument for it. It does not decide *what a command means*; it decides
// *whether this gate is about this repository at all*, which is a fact about
// the session rather than about the command. The clause ADR 0029 killed was the
// merge guard's `git rev-parse --abbrev-ref HEAD`, and what made it unsound was
// that its answer **differed between checkouts of one repository**: a worktree
// allowed a command the main checkout denied. `--git-common-dir` is the git
// fact with the opposite property, measured from a main checkout and from a
// sibling and a nested linked worktree of it:
//
//   --show-toplevel     three different answers
//   --git-dir           three different answers
//   --git-common-dir    one answer, byte for byte
//
// That is the property a scope needs and the one that clause lacked. The mode
// is still declared by the wiring: the scope is a literal written into the hook
// when the operator installed it, not a mode read off disk.
//
//   node <path>/guard-guest-writes.mjs --probe       # refused when it is loaded
//   node <path>/guard-guest-writes.mjs --install     # install into this repo
//   node <path>/guard-guest-writes.mjs --user-hook   # print the machine-wide block
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Where the guard and the machine facts live in a repository that is not yours:
// **inside the git common directory**, which every linked worktree of a
// repository shares with the main checkout.
//
// ADR 0021 put them in `.factory/` at the working-tree root and kept them out
// of the tree with `.git/info/exclude`, on the grounds that editing a tracked
// ignore file to hide your own scratch state is itself a change to somebody
// else's repository. That reasoning was right and the location was one step
// short of it. A working-tree root is per *checkout*, so a linked worktree had
// none of this — and `info/exclude` was already being resolved through
// `--git-common-dir` right here, for exactly the reason that applies to all
// three files. The reasoning was in the file and had been applied to one file
// out of three.
//
// So there is nothing in the working tree to exclude any more, and "nothing
// tracked changed" stops resting on an exclude line taking effect: git cannot
// see inside `.git/` at all. Only the hook wiring is still written into a
// checkout, because that is the one file the harness reads from there.
const HOME = 'factory'
const GUARD = `${HOME}/guard-guest-writes.mjs`
const RECORD = `${HOME}/machine.md`
const SETTINGS = '.claude/settings.local.json'

// Where an install from before #122 put the same two files. Reported rather
// than migrated: the operator can see both and decide, and a guess that deletes
// somebody's file in a repository that is not ours is the wrong way round.
const LEGACY_HOME = '.factory'

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

// BEGIN command reader
//
// Everything between this marker and END is one reader carried in three files:
// this one, `assets/guard-merge.mjs` beside it, and the skill repository's own
// `scripts/guard-merge.mjs`. All three have to answer the same question the same
// way. ADR 0029 refuses a shared module and #93 holds the duplication;
// `scripts/command-reader.test.mjs` runs every copy over one corpus so a drift
// is a red test rather than a lucky reading.

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

// Words that stand in front of a command without being one, so the command is
// whatever follows them. `if gh pr checks 42; then git push origin HEAD; fi` is
// an agent being careful rather than an agent hiding, and `for b in a b; do git
// push origin $b; done` is how two branches get pushed. The gate has to see the
// push inside both.
//
// The set is closed because every word in it is a shell reserved word that
// takes no arguments of its own, which is what makes stripping them blindly
// safe. Wrapper *commands* are the opposite on both counts and are named under
// NOT COVERED instead. `time` sits on the seam: it is a bash reserved word and
// also a real binary on some systems, and it is here because both readings run
// the command, so there is no wrong answer to get.
//
// Matching is by whole token, so a brace that is part of a word is not one of
// these: `gh api repos/{owner}/{repo}/issues` is still one token and still
// reads as `gh api`, and `mkdir -p docs/{process,architecture}` keeps its brace.
//
// Stripping cuts both ways here in a way it did not in the merge guard, whose
// two rules only ever deny. This gate denies `gh` by default, so a reserved
// word in front of a *read* used to be allowed for the wrong reason — the
// segment simply did not start with `gh`. After stripping, `then gh issue view
// 42` reaches the `gh` rules and has to be allowed by GH_READS on its merits.
// Those are the cases the tests weigh most, because a false positive in a
// repository the operator does not own is the failure that gets guest mode
// abandoned.
const LEADING_WORDS = new Set(['{', '!', 'then', 'else', 'elif', 'do', 'time'])

// A variable binding stands in front of a command the same way, and it is the
// same kind of thing: shell syntax with a grammar, not a program that launches
// another program. Until #97 the segment presented a command named `GIT_TRACE=1`
// and every rule looked straight past it, this gate's own probe included. So
// `GH_TOKEN=x node .factory/guard-guest-writes.mjs --probe` ran, reported the
// gate inert, and did it in a session where the gate was live. A false "inert"
// is worse than silence, because it arrives with the authority of a measurement.
//
// The name must be a valid shell identifier, which is what tells an assignment
// from an argument that merely contains `=`. `--field key=value` and a Windows
// path are not assignments; neither is `=x`, which a shell reads as a command
// name and fails to find, so stripping it would invent a command that never
// ran. Only a leading token is examined, so `git commit -m "FOO=1"` is untouched.
//
// Stripping cuts both ways here too. `GIT_TRACE=1 gh issue view 42` now reaches
// the `gh` rules and has to be allowed by GH_READS on its merits, where before
// it was allowed because the segment began with a token that was not `gh`.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

function withoutLeadingWords(tokens) {
  let at = 0
  while (at < tokens.length && (LEADING_WORDS.has(tokens[at]) || ASSIGNMENT.test(tokens[at]))) {
    at += 1
  }
  return tokens.slice(at)
}

function segmentsOf(line) {
  const first = parse(line, null)
  // An apostrophe in ordinary text opens a quote that never closes, and every
  // operator after it would read as that argument's contents — including a real
  // chained push. A quote with no partner is text, so read it that way.
  const parsed = first.unterminated === null ? first : parse(line, first.unterminated)
  // Stripping can empty a segment, since `time` on its own is a whole command
  // and so is `FOO=1`, and every rule below reads the first token.
  return parsed.segments.map(withoutLeadingWords).filter((tokens) => tokens.length > 0)
}

// END command reader

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

// Reading the operator's global config is a read, and ADR 0021 says reads are
// unrestricted, so the scope flag alone is the wrong thing to match on. Unlike
// `gh api graphql` above, a git config read *does* announce itself: there is no
// shape in which `--get` or `--list` writes. That is the whole difference
// between the two decisions, and it is why they come out opposite ways.
//
// The classic one-argument form, `git config --global user.email`, prints
// rather than sets and is still refused. Telling it from a write means counting
// positional arguments through flags that take values, and a miscount in the
// permissive direction is a silent write to somebody's home directory. One
// retry with `--get` costs a second and cannot be got wrong, so the message
// below says exactly that instead.
const GIT_CONFIG_SCOPES = new Set(['--global', '--system'])
const GIT_CONFIG_READS = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--get-color',
  '--get-colorbool',
  '--list',
  '-l',
])

function gitConfigReads(args) {
  if (args.some((token) => GIT_CONFIG_READS.has(token))) return true
  // git 2.46 added `git config get|list|set|unset` as subcommands. The scope
  // flag can sit on either side of the verb, so find the first non-flag token.
  const verb = args.slice(1).find((token) => !token.startsWith('-'))
  return verb === 'get' || verb === 'list'
}

// `gh api` defaults to GET and turns into a POST the moment it is handed a
// field, so the method is not always written down. Both forms are the write.
const GH_API_WRITE_METHODS = new Set(['post', 'patch', 'put', 'delete'])
const GH_API_PAYLOAD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

// The endpoint is the first argument that is not a flag and is not the value of
// one. Worked out that way rather than from a table of gh's flags, because a
// table of somebody else's flags rots silently. `--method GET` is skipped by
// the first test and `GET` by the second.
function apiEndpoint(args) {
  for (let at = 0; at < args.length; at += 1) {
    if (args[at].startsWith('-')) continue
    if (at > 0 && args[at - 1].startsWith('-')) continue
    return args[at]
  }
  return null
}

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

// A GraphQL query and a GraphQL mutation are the same call: a POST to
// `/graphql` carrying `-f query=`. Nothing on the command line tells them
// apart, and the query text is not always on the command line to read —
// `-F query=@file` and a shell variable both hide it, and one document can
// hold a query and a mutation with `operationName` picking between them. So
// this is refused rather than guessed at, and the refusal has to say so:
// **no word added to GH_READS could ever help here, because there is no verb**,
// and a remedy that cannot work is what gets a gate switched off.
const GRAPHQL = `Blocked: \`gh api graphql\` cannot be classified, so it is refused rather than
guessed at.

A GraphQL query and a GraphQL mutation are the same call — a POST to /graphql
carrying \`-f query=\` — so nothing here says which one this is. The query text
is not reliably readable either: \`-F query=@file\` and a shell variable both
hide it, and one document can carry both with \`operationName\` choosing. This
is not a missing entry in a list. There is no verb to add.

Reads that do have a shape are allowed, so reach for one of those:

  gh api repos/{owner}/{repo}/issues/42        REST, and --paginate works
  gh api repos/{owner}/{repo}/issues --method GET -f state=open
  gh issue view 42 / gh pr view 42 / gh search issues ...

If what you need exists only in GraphQL, it waits for publish with every other
outward write, or the owner runs it at their own terminal. That is the same
escape the boundary gives everything else, and it is deliberate.`

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

// ---------------------------------------------------------------------------
// --scope, which is what makes a machine-wide registration acceptable
//
// ADR 0029 refused a user-level hook for two reasons. The first still holds and
// is about what an installer may do unasked, so `--install` prints the block and
// never writes it. The second was the real objection: a user-level hook follows
// the operator into every other repository on the machine, where every command
// it refuses is a false positive by construction, and this repository has
// written down three times what happens to a guard that cries wolf.
//
// So the block carries the repository it was installed for, and the gate exits
// without judging anything anywhere else. Read the note under HOW IT READS A
// COMMAND for why this is not the filesystem-reading gate ADR 0029 refused: the
// scope is a literal in the wiring, and the one git fact consulted is the only
// one that is identical from every checkout of a repository.
//
// **It fails toward allowing, and that is deliberate.** A scope that cannot be
// resolved — no git, not a repository — means this is not the repository the
// hook was installed for, so the gate stands aside. The other direction would
// have a machine-wide hook denying `git push` in every directory on the machine
// where git happens not to answer, which is the false positive that gets the
// whole thing uninstalled by Tuesday.
const scopeAt = process.argv.indexOf('--scope')
const SCOPE = scopeAt === -1 ? null : (process.argv[scopeAt + 1] ?? null)

// Windows answers the same path in more than one spelling, and the two sides of
// this comparison come from different places: one from `git rev-parse`, one
// from a JSON string the operator pasted.
function samePath(a, b) {
  const normalise = (path) => resolve(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32'
    ? normalise(a).toLowerCase() === normalise(b).toLowerCase()
    : normalise(a) === normalise(b)
}

function commonDir(from) {
  return resolve(from, git(from, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
}

function inScope() {
  if (SCOPE === null) return true
  try {
    return samePath(commonDir(process.cwd()), SCOPE)
  } catch {
    return false
  }
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
    if (
      git !== null &&
      git[0] === 'config' &&
      git.some((token) => GIT_CONFIG_SCOPES.has(token)) &&
      !gitConfigReads(git)
    ) {
      deny(
        'Blocked: `--global` and `--system` write outside this repository, into the\n' +
          "operator's home directory and machine configuration.\n\n" +
          'If this was a read, say so and it is allowed: `--get`, `--get-all`,\n' +
          '`--get-regexp`, `--list`, or the `git config get` subcommand. The gate\n' +
          'matches the scope flag rather than counting arguments, so\n' +
          '`git config --global user.email` is refused too even though it prints\n' +
          'rather than sets — a miscount in the other direction is a silent write to\n' +
          'somebody else\'s home directory, and `--get` cannot be got wrong.\n\n' +
          'Repository-local config is inside the boundary. Drop the scope flag.',
      )
    }

    const gh = ghArguments(tokens)
    if (gh !== null && gh.length > 0) {
      const path = gh.filter((token) => !token.startsWith('-')).slice(0, 2)
      if (path[0] === 'api') {
        const args = gh.slice(1)
        // Before the method test, and regardless of it: `--method GET graphql`
        // is the same unclassifiable call wearing a read's clothes.
        if (apiEndpoint(args) === 'graphql') deny(GRAPHQL)
        if (ghApiWrites(args)) {
          deny(
            'Blocked: this `gh api` call carries a write method or a payload, so it is an\n' +
              `outward write however the endpoint reads.\n\n${PUBLISH}\n\n` +
              'If it was a read, say so: drop the fields, or keep them and add\n' +
              '`--method GET`, which puts them in the query string. Both are allowed.',
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
// --install, --user-hook, and --probe
// ---------------------------------------------------------------------------

const machineRecord = (common) => `# Machine facts

Not committed, and not committable. ADR 0021 splits the initialisation answers
by who they are about: repo facts are true for anyone who clones and belong in
\`AGENTS.md\`, and machine facts are about *this* operator on *this*
repository. This file is the second kind, and it is inside the git common
directory rather than in the working tree, so no ignore rule has to hold it out
of anybody's \`git status\` and every linked worktree reads the same copy.

Write boundary: guest

The factory writes the working tree and its own local store, and nothing else.
Every outward write waits for the one publish step the owner asks for.

Backlog: (name the tool that provides the seven verbs here — beads, driven by
\`bd\`, is the default. references/backlog-port.md)

Enforced by \`${join(common, GUARD)}\`. That is a gate, so it is silent when it
is loaded and silent when it is not; ask it, from inside this repository:

    node "${join(common, GUARD)}" --probe

Being refused is the answer you want. Which sessions it is registered for is a
separate question from whether it is installed, and \`check-setup.mjs\` answers
it: a wiring in one checkout's \`${SETTINGS}\` covers sessions started in that
directory only, and the machine-wide block covers every session inside this
repository. ADR 0037.
`

// The block the operator installs themselves, and the only thing that reaches a
// session started in a worktree. Printed, never written: ADR 0029's first
// refusal is about what an installer does unasked and it survives #122 intact.
function userHookBlock(common) {
  return JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: MATCHER,
            hooks: [
              {
                type: 'command',
                command: `node "${join(common, GUARD).replace(/\\/g, '/')}" --scope "${common.replace(/\\/g, '/')}"`,
                timeout: 15,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  )
}

const userSettingsPath = () =>
  join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json')

function printUserHook(common) {
  console.log(`Paste this into ${userSettingsPath()}, merging with whatever is`)
  console.log('already there rather than replacing it:\n')
  for (const line of userHookBlock(common).split('\n')) console.log(`    ${line}`)
  console.log(`
Then restart the harness. This is the registration that reaches a session
started in a linked worktree, and those are the sessions that push branches and
open pull requests.

\`--scope\` is what keeps it out of every other repository on this machine. The
gate asks git for the common directory of wherever the session is standing and
stands aside unless it is the one named above, so a refusal cannot happen in a
repository this was not installed for. ADR 0029 refused a user-level hook partly
because it would follow you everywhere; the scope is the answer to that, and ADR
0037 has the argument and the measurement.

To remove it, delete that block and restart. Installing and removing it are a
deliberate pair, and nothing here will do either for you.`)
}

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
// about this operator and this repository, not about which branch is out. It is
// also where the gate and the machine record now live, for the same reason.
const excludeFile = (common) => join(common, 'info', 'exclude')

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
// The script path is absolute rather than `$CLAUDE_PROJECT_DIR`-relative,
// because that variable is the directory the session started in — measured, and
// in a worktree session it is the worktree, which has no copy of anything. One
// gate in the common directory, named absolutely, is the same file from every
// checkout.
function wireHook(path, common) {
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
    hooks: [
      {
        type: 'command',
        command: `node "${join(common, GUARD).replace(/\\/g, '/')}"`,
        timeout: 15,
      },
    ],
  })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
  return true
}

function install() {
  const root = repoRoot()
  const common = commonDir(root)
  const done = []

  mkdirSync(join(common, HOME), { recursive: true })
  const self = fileURLToPath(import.meta.url)
  const destination = join(common, GUARD)
  if (resolve(self) !== resolve(destination)) {
    copyFileSync(self, destination)
    done.push(`copied the gate to ${destination}`)
  }

  if (existsSync(join(common, RECORD))) {
    done.push(`left ${join(common, RECORD)} alone, because it already exists`)
  } else {
    writeFileSync(join(common, RECORD), machineRecord(common))
    done.push(`wrote ${join(common, RECORD)}, the machine facts ADR 0021 asks for`)
  }

  // Only the wiring is in the working tree now, so only the wiring needs
  // hiding. `/.factory/` is deliberately not appended any more: a repository
  // installed before #122 keeps its line, and a fresh one never gains one.
  const excluded = appendMissingLines(excludeFile(common), [`/${SETTINGS}`])
  done.push(
    excluded.length === 0
      ? `found ${SETTINGS} already in .git/info/exclude`
      : `excluded ${excluded.join(' and ')} through .git/info/exclude`,
  )

  done.push(
    wireHook(join(root, SETTINGS), common)
      ? `wired the gate into ${SETTINGS} for ${MATCHER}`
      : `found the gate already wired in ${SETTINGS}`,
  )

  if (existsSync(join(root, LEGACY_HOME))) {
    done.push(
      `note: ${LEGACY_HOME}/ is still here from an install before #122. Nothing reads it` +
        ' now. Check what is in it, then remove it and its /.factory/ line in' +
        ' .git/info/exclude',
    )
  }

  console.log(`Guest mode installed in ${root}\n`)
  for (const line of done) console.log(`  - ${line}`)
  console.log(`
Nothing outside this repository was written, and nothing was written into its
working tree except the wiring. Confirm that yourself rather than believing it:

    git status --porcelain -uall

Hooks are read once, at process start, so **this session is not protected**.
Restart the harness, then ask the gate whether it is loaded:

    node "${join(common, GUARD)}" --probe

Being refused is the answer you want. If it prints instead, the gate is not in
this process and the fix is another restart, not another install.

WHICH SESSIONS THIS COVERS, WHICH IS NOT ALL OF THEM
The wiring above is in one checkout, and Claude Code reads project settings from
the directory a session starts in and from nowhere else — measured, on 2.1.228,
for a sibling worktree and for one nested inside this checkout. So it covers
sessions started in

    ${root}

and no others. **A linked worktree registers nothing**, and the subagents that
push branches, open pull requests and comment on the host's tracker are exactly
the sessions that start in worktrees. Two ways to close that, and they are not
equally good:

  - Run this install again from inside each worktree. Sound, and it only ever
    covers the worktrees somebody remembered.
  - Install the machine-wide block below once. It reaches every session inside
    this repository, including worktrees that do not exist yet.
`)
  printUserHook(common)
}

function probe() {
  // A script runner re-invokes its script through a shell of its own, so the
  // hook is shown `npm run <name>` and the file name `isLivenessProbe` matches
  // on is nowhere in that line. The probe is therefore never refused, it runs in
  // a session where the gate is loaded and holding, and it calls the write
  // boundary unenforced. ADR 0027 built this probe because a gate's silence is
  // ambiguous; a confident false "inert" is worse than the ambiguity, because
  // the remedy it offers cannot fix a state that is not wrong, and in somebody
  // else's repository the next move after "nothing is enforcing it" is to go
  // looking for another route.
  //
  // One variable, and it is one because it was measured rather than listed. npm
  // 11.12.1, pnpm 10.34.5, yarn 1.22.22 and yarn 4.18.0 all set
  // `npm_lifecycle_event` on a `run`, so the four runners cost nothing extra.
  // The markers they set beside it (`npm_execpath`, `npm_config_user_agent`,
  // `npm_command`, `npm_node_execpath`) add nothing, and one of them subtracts:
  // `pnpm exec node <this file> --probe` sets `npm_config_user_agent` and no
  // `npm_lifecycle_event`, so matching that would refuse to report for the whole
  // life of any pnpm-launched session while closing none of `sudo`, `env`,
  // `nohup` or `npx`, which hide the file name the same way and leave no marker
  // at all. Those stay where the rest of the programs that run programs are,
  // under WHAT THIS DOES NOT COVER.
  if (process.env.npm_lifecycle_event) {
    console.error('Run this directly, not through a package script:\n')
    console.error(`  node ${fileURLToPath(import.meta.url)} --probe\n`)
    console.error('npm, pnpm and yarn all hide the file name from the hook, so the gate cannot')
    console.error('refuse this, and it would then call the write boundary unenforced in a session')
    console.error('where it is holding. In a repository that is not yours, that is the answer')
    console.error('that sends an agent looking for another way out.')
    process.exit(1)
  }

  console.error('The guest-mode gate is NOT loaded in this process.')
  console.error('')
  console.error('This probe exists in order to be refused. It ran, so nothing intercepted it.')
  console.error('Three states produce that, and they want different things done next:')
  console.error('')
  console.error(`  - No hook. Nothing in this session's ${SETTINGS}`)
  console.error('    and nothing machine-wide runs this file. Install one.')
  console.error('  - A hook this process predates. Settings are read once, at process start.')
  console.error('    Restart the harness. Another install fixes nothing.')
  console.error('  - **A session started somewhere the gate is not registered for.** A wiring')
  console.error('    in one checkout covers sessions started in that directory only, and a')
  console.error('    machine-wide block covers the one repository its --scope names. A linked')
  console.error('    worktree is the case that catches people: run this from inside the')
  console.error('    session that is actually doing the work, not from the main checkout.')
  console.error('')
  console.error('Nothing is enforcing the write boundary in this session.')
  process.exit(1)
}

if (process.argv.includes('--install')) {
  install()
} else if (process.argv.includes('--user-hook')) {
  printUserHook(commonDir(repoRoot()))
} else if (process.argv.includes('--probe')) {
  probe()
} else if (!inScope()) {
  // A machine-wide registration standing aside in a repository it was not
  // installed for. Silence is right here: this gate has nothing to say about
  // somebody's own repositories, which is the whole reason ADR 0029 refused a
  // user-level hook without one.
  process.exit(0)
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
