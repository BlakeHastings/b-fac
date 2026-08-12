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
// CI. A net, not a guarantee. The ruleset is the guarantee. It also reads only
// what the command line says: a merge assembled from a variable, a base64
// `-EncodedCommand`, or a script file the command merely names is invisible to
// it, and no amount of pattern work changes that.
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
//
// HOW IT READS A COMMAND
// It asks what each command in the line *invokes*, never what the line's text
// contains. Scanning the text is a defect this guard shipped with and that
// references/enforcement.md already warned about in the abstract: within
// seconds of the guard firing for the first time it denied a `gh issue comment`
// whose body quoted the blocked command inside a markdown table. Nothing was
// being merged. See docs/architecture/decisions/0001 and issue #58.

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

// Characters that end one command and begin another when they are not inside
// quotes. A closing `)` is handled separately, since it only ends a command
// when a `$(` opened one.
const OPERATORS = new Set(['&', '|', ';', '\n', '\r', '(', '`'])

const ESCAPABLE = new Set([...OPERATORS, ')', '"', "'", '\\', '$', ' ', '\t'])

// Split a command line into the commands it will actually run, each one
// tokenised.
//
// Quotes come off the tokens, because `gh pr "merge" 42` has to read the same
// as the bare form. Quotes still decide *structure*, though: an operator
// inside a quoted argument is that argument's text, not the start of a new
// command. Keeping both of those true at once is the whole of the #58 fix —
// the old guard stripped quotes into a flat line and then matched patterns
// against it, so a markdown table cell reading `| gh pr merge 42 |` was
// indistinguishable from an actual merge.
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

    // `$(...)` runs its contents as a command, and it does so inside double
    // quotes as well, so it interrupts the argument it sits in. A backtick is
    // not treated the same way, even though a shell would expand it: markdown
    // writes code spans with backticks, and a body quoting the blocked command
    // is precisely the false positive this guard exists to have stopped
    // producing. That gap is named under NOT COVERED rather than pretended away.
    if (opensSubstitution && quote !== "'") {
      endSegment()
      resume.push(quote)
      quote = null
      i += 1
      continue
    }
    if (char === ')' && quote === null && resume.length > 0) {
      endSegment()
      quote = resume.pop()
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
    // likely place for the blocked command to appear as prose.
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
    // the shell would otherwise act on. Escaping everything mangles the
    // Windows paths this hook sees constantly, and both shell tools it is
    // wired to run on Windows here.
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

// The word after `<<` or `<<-`, with any quoting removed. Returns null when
// what follows is not a heredoc, which includes `<<` used as anything else.
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
  // operator after it would read as that argument's contents — including a
  // real chained merge. A quote with no partner is text, so read it that way.
  return parse(line, first.unterminated).segments
}

// `gh` takes its global flags before the subcommand and no positional argument
// there, so skipping the flags lands on the subcommand path. Returns null when
// this segment does not invoke `gh` at all.
const GH_FLAGS_WITH_VALUE = new Set(['--repo', '-R', '--hostname'])

function ghArguments(tokens) {
  if (tokens[0] !== 'gh') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GH_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

const commandName = (token) =>
  token
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.exe$/, '')

// This hook is wired to every shell-capable tool the harness offers, and each
// of those shells can invoke the other one, so `pwsh -Command "gh pr merge 42"`
// from a Bash tool call is a real form rather than a contrived one. The
// argument is a command line; read it as one.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd'])
const SHELL_COMMAND_FLAGS = new Set(['-c', '-Command', '-command', '/c', '/C'])

function shellPayload(tokens) {
  if (!SHELLS.has(commandName(tokens[0]))) return null
  const at = tokens.findIndex((token) => SHELL_COMMAND_FLAGS.has(token))
  return at === -1 ? null : (tokens[at + 1] ?? null)
}

// `scripts/check-guard-live.mjs` exists in order to be refused here. Refusing
// it is the only way a session can observe that this guard is loaded: the
// guard is a gate, and a gate that was never loaded is silent in exactly the
// way a gate with nothing to deny is silent. If the probe runs, no hook
// stopped it, and it says so and exits 1.
//
// The rule lives in this file rather than in a hook of its own because only
// this guard can answer whether this guard is live. A second hook would answer
// for itself and leave the inference to the reader, which is the mistake the
// distinction between configured, loaded and firing exists to stop.
function isLivenessProbe(tokens) {
  if (commandName(tokens[0]) !== 'node') return false
  const script = tokens.slice(1).find((token) => !token.startsWith('-'))
  return script !== undefined && commandName(script) === 'check-guard-live.mjs'
}

const USE_WRAPPER =
  'Push your branch, open the PR, report back, and stop. The orchestrator\n' +
  'reviews and merges with:\n\n' +
  '  node scripts/merge-pr.mjs <pr-number>\n\n' +
  'See docs/process/working-an-issue.md.'

// `gh api` takes exactly one endpoint, and everything else it is handed is
// payload — including `-f body=...`, which on this repo routinely contains the
// word merge and a URL. So the rule reads the endpoint and nothing else.
//
// Which token that is has to be worked out without a table of gh's flags,
// because a table of someone else's flags rots silently. The endpoint is the
// first argument that is not a flag, is not the value of one, and looks like a
// path. `--method PUT` is skipped by the second of those and `PUT` by the third.
function apiEndpoint(args) {
  for (let at = 0; at < args.length; at += 1) {
    if (args[at].startsWith('-')) continue
    if (at > 0 && args[at - 1].startsWith('-')) continue
    if (args[at].includes('/')) return args[at]
  }
  return null
}

// A merge endpoint, as a whole path segment, so `branches/merge-queue-test`
// does not trip it.
const isMergeEndpoint = (endpoint) => /\/(merge|merges)(\/|$)/.test(endpoint)

function judge(line, depth) {
  for (const tokens of segmentsOf(line)) {
    const gh = ghArguments(tokens)
    if (gh !== null && gh[0] === 'pr' && gh[1] === 'merge') {
      deny(`Blocked: agents do not land pull requests.\n\n${USE_WRAPPER}`)
    }
    if (gh !== null && gh[0] === 'api' && isMergeEndpoint(apiEndpoint(gh.slice(1)) ?? '')) {
      deny(`Blocked: merging through \`gh api\` is still merging.\n\n${USE_WRAPPER}`)
    }

    if (isLivenessProbe(tokens)) {
      deny(
        'The guard is loaded in this process. This probe was refused before it ran,\n' +
          'and being refused is the answer it exists to produce. Nothing is wrong.\n\n' +
          'A status update can now say the guard is loaded rather than configured.\n' +
          'See docs/process/orchestrating.md.',
      )
    }

    const nested = depth > 0 ? shellPayload(tokens) : null
    if (nested !== null) judge(nested, depth - 1)
  }
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

judge(command, 2)

process.exit(0)
