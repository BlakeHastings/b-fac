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
// Nor does it cover a command that runs another command, or `gh` reached under
// another name. Every line below was run against this guard and allowed
// through, and `gh pr merge` with no argument merges the current branch's pull
// request, so each of them is a working merge:
//
//   sudo gh pr merge      env gh pr merge       command gh pr merge
//   nohup gh pr merge     xargs gh pr merge     time -p gh pr merge
//   \gh pr merge          /usr/bin/gh pr merge
//
// They are left open on purpose. The threat model is an agent that forgot, or
// that talked itself into it, not one that is hiding, and nobody reaches for
// `sudo` to land a pull request by accident. The set of programs that can
// launch another program has no edge, so closing six of them buys a longer
// list rather than a closed hole, and it buys that at the cost of this
// section's accuracy, which is the part of the file worth the most.
//
// Shell *syntax* an ordinary command can contain is a different matter: it is
// a closed set, and covering it is what issues #90 and #97 did: the reserved
// words and grouping that introduce a command, and the `VAR=value` prefix that
// binds a variable for one. See LEADING_WORDS and ASSIGNMENT. The `time -p`
// line above is the seam between the two, one flag past the reserved word that
// is handled, and skipping it would mean keeping a table of someone else's
// flags.
//
// `env gh pr merge` staying open while `GH_TOKEN=x gh pr merge` closes is that
// same line drawn once more, not an inconsistency: `env` is a program that runs
// another program and the set of those has no edge, while an assignment prefix
// is a shell form with a grammar.
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

// BEGIN command reader
//
// Everything between this marker and END is one reader carried in three files:
// this one, the guest gate in `assets/guard-guest-writes.mjs`, and the guard
// this repository ships to other people in `assets/guard-merge.mjs`. All three
// have to answer the same question the same way. ADR 0029 refuses a shared
// module and #93 holds the duplication; `scripts/command-reader.test.mjs` runs
// every copy over one corpus so a drift is a red test rather than a lucky
// reading.

// Characters that end one command and begin another when they are not inside
// quotes. A closing `)` is handled separately, because ending the command is
// only half of what it does: when a `$(` opened one, it also restores the
// quote that `$(` interrupted.
const OPERATORS = new Set(['&', '|', ';', '\n', '\r', '(', '`'])

const ESCAPABLE = new Set([...OPERATORS, ')', '"', "'", '\\', '$', ' ', '\t'])

// What a `$(...)` leaves behind in the argument it interrupted, so that the
// argument survives as one token. `node "$(cat pointer)/check-guard-live.mjs"`
// reads as `node` `$()/check-guard-live.mjs`, and `commandName` still resolves
// the script. Ending the outer command at the `$(` instead put `node` in one
// segment and the script name in the next, where no rule needing both could
// ever see them, and ADR 0037 made substitution the documented way to find a
// path (#135).
//
// The text is the source's own with the command taken out, so a line that
// really does contain `$()` reads the same either way and no token is invented
// that a shell would not have produced.
const SUBSTITUTION = '$()'

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
  // One frame per open bracket. A `$(` frame carries the whole of the argument
  // it interrupted — the quote, the tokens so far and the half-built token — so
  // the closing bracket can put all three back. A `(` frame carries nothing and
  // exists only so that its own `)` does not close somebody else's.
  const open = []
  // How many `$(` are open, so each segment records whether it is a command the
  // line runs or a command a substitution runs to produce an argument.
  let inSubstitution = 0

  const endToken = () => {
    if (token !== '') tokens.push(token)
    token = ''
  }
  const endSegment = () => {
    endToken()
    if (tokens.length > 0) segments.push({ tokens, substituted: inSubstitution > 0 })
    tokens = []
  }
  const closeSubstitution = (frame) => {
    tokens = frame.tokens
    token = frame.token + SUBSTITUTION
    quote = frame.quote
    inSubstitution -= 1
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
      // A `$(...)` can expand to nothing, and then the word is only the text in
      // front of it. So the word so far is emitted as a reading of its own and
      // the joined reading follows, and a rule denies if either one is a merge.
      // Without this, `gh pr merge$(true)` stopped being a merge the moment the
      // placeholder joined `merge` to it — a narrowing, where this change is
      // meant to widen. With no text in front of it there is no such word: the
      // vanishing reading is a bare command name carrying no arguments, which
      // no rule in any of these three files decides on, and dropping it is what
      // leaves `node "$(...)/check-guard-live.mjs"` reading as one command.
      //
      // The vanishing reading reaches only as far as the `$(`, so a rule that
      // turns on a token *after* one is not covered by it: `--probe` in
      // `node guard.mjs$(x) --probe` sits past the split, and did before this
      // change too. Gluing a substitution into the middle of a word is hiding
      // rather than forgetting, and NOT COVERED draws that line already.
      if (token !== '') {
        segments.push({ tokens: [...tokens, token], substituted: inSubstitution > 0 })
      }
      open.push({ substitution: true, quote, tokens, token })
      tokens = []
      token = ''
      quote = null
      inSubstitution += 1
      i += 1
      continue
    }
    // A `)` ends a command whether or not this parser saw the thing that
    // opened one. Requiring an open `$(` made every other closing bracket fall
    // through to ordinary text, where it glued itself to the preceding token:
    // `(cd repo && gh pr merge)` presented a command named `merge)` and walked
    // past the rule (#90). What is restored afterwards stays conditional,
    // because only `$(` interrupts an argument; a subshell's bracket pops its
    // own frame and puts nothing back.
    if (char === ')' && quote === null) {
      endSegment()
      const frame = open.pop()
      if (frame !== undefined && frame.substitution) closeSubstitution(frame)
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
      // A subshell's `(` is still an operator that ends a command. The frame it
      // pushes is a placeholder, so that the `)` closing it does not pop the
      // frame of a `$(` further out and splice a substitution's result into the
      // wrong argument.
      if (char === '(') open.push({ substitution: false, quote: null, tokens: [], token: '' })
      endSegment()
      continue
    }
    if (char === ' ' || char === '\t') {
      endToken()
      continue
    }
    token += char
  }

  const unterminated = quote ?? open.find((frame) => frame.quote !== null)?.quote ?? null
  endSegment()
  // A `$(` that is never closed would otherwise leave the command it interrupted
  // inside its frame and out of the segments entirely, so `gh pr merge $(cat`
  // would stop reading as a merge. Unwinding restores each level in turn.
  while (open.length > 0) {
    const frame = open.pop()
    if (!frame.substitution) continue
    closeSubstitution(frame)
    endSegment()
  }
  return { segments, unterminated }
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

// Words that stand in front of a command without being one, so the command is
// whatever follows them. `if gh pr checks 42; then gh pr merge 42; fi` is an
// agent doing ordinary work rather than an agent hiding, and the guard has to
// see the merge inside it.
//
// The set is closed because every word in it is a shell reserved word that
// takes no arguments of its own, which is what makes stripping them blindly
// safe. Wrapper *commands* are the opposite on both counts and are named under
// NOT COVERED instead. `time` is the one that sits on the seam: it is a bash
// reserved word and also a real binary on some systems. It is here because
// both readings run the merge, so there is no wrong answer to get, and because
// timing a command is something an agent does on purpose rather than to hide.
//
// Matching is by whole token, so a brace that is part of a word is not one of
// these: `gh api repos/{owner}/{repo}/pulls/1/merge` still reads as one token
// and is still denied, and `mkdir -p docs/{process,architecture}` keeps its
// brace too.
const LEADING_WORDS = new Set(['{', '!', 'then', 'else', 'elif', 'do', 'time'])

// A variable binding stands in front of a command the same way, and it is the
// same kind of thing: shell syntax with a grammar, not a program that launches
// another program. Until #97 the segment presented a command named `GH_TOKEN=x`
// and every rule looked straight past it, the liveness probe's included. So
// `GH_TOKEN=x node scripts/check-guard-live.mjs` ran, reported the guard inert,
// and did it in a session where the guard was live. A false "inert" is worse
// than silence, because it arrives with the authority of a measurement.
//
// The name must be a valid shell identifier, which is what tells an assignment
// from an argument that merely contains `=`. `--field key=value` and a Windows
// path are not assignments; neither is `=x`, which a shell reads as a command
// name and fails to find, so stripping it would invent a command that never
// ran. Only a leading token is examined, so `git commit -m "FOO=1"` is untouched.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

function withoutLeadingWords(tokens) {
  let at = 0
  while (at < tokens.length && (LEADING_WORDS.has(tokens[at]) || ASSIGNMENT.test(tokens[at]))) {
    at += 1
  }
  return tokens.slice(at)
}

function read(line) {
  const first = parse(line, null)
  // An apostrophe in ordinary text opens a quote that never closes, and every
  // operator after it would read as that argument's contents — including a
  // real chained merge. A quote with no partner is text, so read it that way.
  const parsed = first.unterminated === null ? first : parse(line, first.unterminated)
  // Stripping can empty a segment, since `time` on its own is a whole command
  // and so is `FOO=1`, and every rule below reads the first token.
  return parsed.segments
    .map(({ tokens, substituted }) => ({ tokens: withoutLeadingWords(tokens), substituted }))
    .filter((segment) => segment.tokens.length > 0)
}

// Every command the line runs, a substitution's included. This is what a rule
// asks, because `$(gh pr merge 42)` merges.
const segmentsOf = (line) => read(line).map((segment) => segment.tokens)

// Only the commands the line itself runs. A `$(...)` that produces an argument
// is part of the command it sits in rather than a second command beside it, and
// the two views differ exactly where that distinction is the question being
// asked. `probeIsTheWholeCall` is the only caller so far; #119 brings the other
// two guards' probe wording here.
const outerSegmentsOf = (line) =>
  read(line)
    .filter((segment) => !segment.substituted)
    .map((segment) => segment.tokens)

// END command reader

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

// How many shells deep the walk follows a payload. Two readers of the command
// line now start from the top, and they have to agree on where the bottom is or
// the probe's wording answers about a different line than the verdict did.
const SHELL_DEPTH = 2

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

// WHY THE PROBE'S REFUSAL COMES IN TWO WORDINGS
//
// This is the one denial in the file that reads as success, because being
// refused is the answer the probe exists to produce. On a line that is only the
// probe, that is exactly right. On a line with anything else on it, it is a
// trap: `PreToolUse` refuses the whole tool call before any of it runs, so
// `git pull --ff-only && node scripts/check-guard-live.mjs` pulls nothing and
// then prints the answer you were hoping for. #82 recorded an orchestrator
// losing a `gh issue comment` that way, and its own comment records the next
// orchestrator losing a `git pull` the same way *after reading the warning*,
// believing for several minutes that they were on a commit they were not.
//
// #82 offered narrowing the rule so it fires only when the probe is the sole
// command in the line. Narrowing the *verdict* that way is unsound. It would
// make `node scripts/check-guard-live.mjs && true` run the probe in a session
// where this guard is loaded, and the probe would print "inert". That is the
// same false measurement `GH_TOKEN=x node ...` produced before #97 and
// `npm run` produced before #110, arriving a third time by a third route. A false
// "inert" is worse than silence: it has the authority of a measurement and
// invites the reader to go looking for another way to merge. The probe must
// never run in a process that would have refused it, whatever else is on the
// line, so the verdict is unconditional.
//
// What was actually wrong was the message, which ended "Nothing is wrong" and
// so told the reader to move on at the exact moment something was. The
// narrowing is therefore on the wording: alone, it still says nothing is wrong,
// because nothing is; in company, it says what was lost. That leaves an error to
// notice, which is the thing docs alone could not supply. The warning existed,
// it was read, and it did not work.
const PROBE_ALONE =
  'The guard is loaded in this process. This probe was refused before it ran,\n' +
  'and being refused is the answer it exists to produce. Nothing is wrong.\n\n' +
  'A status update can now say the guard is loaded rather than configured.\n' +
  'See docs/process/orchestrating.md.'

const PROBE_IN_COMPANY =
  'The guard is loaded in this process, and nothing else on that line ran.\n\n' +
  'A PreToolUse hook refuses the whole tool call before any of it executes, so\n' +
  'every command chained to this probe was thrown away with it. The refusal is\n' +
  'also the answer the probe exists to produce, which is how this denial reads\n' +
  'as success while being half a failure. Do not record the other commands as\n' +
  'having happened; nothing has changed on disk.\n\n' +
  'Run them on their own, then ask the guard on its own:\n\n' +
  '  node scripts/check-guard-live.mjs'

// Whether refusing the probe costs the caller anything else. The question is
// about the whole tool call rather than the segment the probe sits in, because
// the harness refuses tool calls and not segments.
//
// `}` is passed over because it is a compound command's closing syntax and
// never a command. The reader strips the words that *open* one, so that a rule
// can see the command behind them, and leaves the ones that close it, since no
// rule reads those; counting what a line would lose is the first thing here
// that does. `{ node scripts/check-guard-live.mjs; }` is a real form, and how
// #82's comment was measured, and it loses nothing. `fi` and `done` need
// no such allowance: they only ever appear on a line that already carries the
// condition or the list, which is a lost command in its own right.
//
// A `$(...)` that locates the probe is passed over for the same reason, by
// reading only the outer commands: `git rev-parse` in
// `node "$(git rev-parse ... --git-common-dir)/../scripts/check-guard-live.mjs"`
// is how this line names its own script, not a second thing the caller wanted
// done, and telling them to "run them on their own" would send them in a circle
// (#135). A probe *inside* a substitution is the other way round —
// `gh issue comment 1 --body "$(node scripts/check-guard-live.mjs)"` really does
// lose the comment — and that one still gets the longer message, because the
// `gh` segment is outer.
function probeIsTheWholeCall(line, depth) {
  for (const tokens of outerSegmentsOf(line)) {
    if (isLivenessProbe(tokens) || tokens[0] === '}') continue
    const nested = depth > 0 ? shellPayload(tokens) : null
    if (nested !== null && probeIsTheWholeCall(nested, depth - 1)) continue
    return false
  }
  return true
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

// `whole` is the command line the harness was handed, which is the same as
// `line` until the walk steps into a shell payload. The probe's wording is the
// one verdict here that depends on what else the tool call would have run, and
// a nested payload only knows about its own half of it.
function judge(line, depth, whole) {
  for (const tokens of segmentsOf(line)) {
    const gh = ghArguments(tokens)
    if (gh !== null && gh[0] === 'pr' && gh[1] === 'merge') {
      deny(`Blocked: agents do not land pull requests.\n\n${USE_WRAPPER}`)
    }
    if (gh !== null && gh[0] === 'api' && isMergeEndpoint(apiEndpoint(gh.slice(1)) ?? '')) {
      deny(`Blocked: merging through \`gh api\` is still merging.\n\n${USE_WRAPPER}`)
    }

    if (isLivenessProbe(tokens)) {
      deny(probeIsTheWholeCall(whole, SHELL_DEPTH) ? PROBE_ALONE : PROBE_IN_COMPANY)
    }

    const nested = depth > 0 ? shellPayload(tokens) : null
    if (nested !== null) judge(nested, depth - 1, whole)
  }
}

// ---------------------------------------------------------------------------
// `--probe` is not this guard's flag, and silence was the wrong way to say so
//
// The shipped guard in `assets/` answers `--probe` itself, because ADR 0033
// gives it a one-file probe and a repository installing it has no second file.
// This copy does not: ADR 0027 put the probe in `scripts/check-guard-live.mjs`,
// which the rule above refuses by name.
//
// Run here, `node scripts/guard-merge.mjs --probe` therefore fell through to
// the hook body, read nothing off a stdin nobody had written to, and exited 0
// without a word. That is the same silence an unloaded gate produces, arriving
// from the other direction, and it was prescribed by the machine record and by
// `check-setup.mjs` until #160 taught the reporter to name the probe belonging
// to the guard it found (#153).
//
// **This does not make `--probe` a second probe line.** The rule above is
// untouched, and a second name to recognise is exactly what #153 says not to
// build: probe recognition is the subtlest rule in this file and it should have
// one answer. This is the opposite, a signpost rather than a rule. It converts a
// silent exit 0 into a refusal to guess, and it says where the probe actually
// is.
//
// Safe because the hook never sees it. The `PreToolUse` entry runs this file
// with no arguments and writes its payload to stdin, so `--probe` in `argv` is
// a person or an agent at a terminal, every time.
if (process.argv.includes('--probe')) {
  console.error('This guard has no --probe mode. That flag belongs to the version of it')
  console.error('this repository ships to other people, in assets/guard-merge.mjs, which is')
  console.error('its own probe because an installed repository has only the one file.\n')
  console.error('Here the probe is a second script, and being refused is its whole answer:\n')
  console.error('  node scripts/check-guard-live.mjs\n')
  console.error('Run it on its own line. A PreToolUse hook refuses the whole tool call, so')
  console.error('anything chained to the probe is thrown away with it. ADR 0027, ADR 0038.')
  process.exit(1)
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

judge(command, SHELL_DEPTH, command)

process.exit(0)
