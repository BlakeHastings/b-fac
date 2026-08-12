// PreToolUse guard: nothing reaches the default branch except through the
// sanctioned path.
//
// SETUP
// One knob: DEFAULT_BRANCH, below. Set it to this repository's default branch
// if it is not `main`. `check-setup.mjs` compares the two and reports a
// mismatch, because a guard protecting a branch that does not exist is a guard
// that protects nothing while looking installed.
//
// WHAT THIS PREVENTS
// Branch protection needs a paid plan on a private repo, so GitHub will happily
// accept a merge with CI red, or a direct push to the default branch that skips
// review entirely. Agents run unattended, and "I was told not to" is not a
// control. This is the control.
//
// It denies, before the command runs: `gh pr merge`, a merge through `gh api`,
// and a `git push` whose own arguments name the default branch as the
// destination. The permitted route is `node scripts/merge-pr.mjs <n>`, which
// verifies every required check is green and then squash-merges. That command
// does not match anything below, and the `gh api` call it makes internally is a
// child process rather than a Bash tool call, so the guard does not see it.
// Making the safe path the only working path beats asking nicely.
//
// WHAT THIS DOES NOT COVER
// Any session the harness did not load it into at startup, and everything that
// process spawns for as long as it lives. Any human at a terminal. CI. A net,
// not a guarantee, and one whose absence is silent — which is why layer 3, the
// provenance audit, ships beside it.
//
// It also reads only what the command line says: a merge assembled from a
// variable, a base64 `-EncodedCommand`, or a script file the command merely
// names is invisible to it, and no amount of pattern work changes that.
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
// `sudo` to land a pull request by accident. The set of programs that can launch
// another program has no edge, so closing six of them buys a longer list rather
// than a closed hole, and it buys that at the cost of this section's accuracy,
// which is the part of the file worth the most.
//
// Shell *syntax* an ordinary command can contain is a different matter: it is a
// closed set, and it is covered. See LEADING_WORDS and ASSIGNMENT.
//
// One push form is open and named rather than half-closed: `git push --all` and
// `git push --mirror` write every branch, including this one, and neither says
// so on the command line in a way this guard reads. Layer 3 is what catches it.
//
// THE BRANCH-DEPENDENT RULES ARE GONE, DELIBERATELY
// Earlier copies of this file shelled out to `git rev-parse --abbrev-ref HEAD`
// and denied a bare `git push` or any `git merge` when the answer was the
// default branch. That clause is removed, and the reason is a property of the
// mechanism rather than of any one repository: **a PreToolUse hook runs before
// its command**, so a `cd` in that command has not happened yet, and the
// directory the hook reads may not be the one the command lands in. Measured, in
// the repository that ships this: run from inside a git worktree, that clause
// answered `allow` on a command the main checkout denied. Same script, opposite
// verdict, decided by which copy of the tree the hook happened to look at.
//
// A rule that is right or wrong depending on something it cannot see is worse
// than an absent one, because it is trusted. What is left reads only the command
// line, so it gives the same answer everywhere.
//
// The cost is real and it is named above: a bare `git push` while standing on
// the default branch is not refused here. Layer 3 detects it, and detection is
// what makes prevention honest. See references/enforcement.md.
//
// HOW IT READS A COMMAND
// It asks what each command in the line *invokes*, never what the line's text
// contains. Scanning the text is a defect this guard shipped with: within
// seconds of firing for the first time it denied a `gh issue comment` whose body
// quoted the blocked command inside a markdown table. Nothing was being merged.
// Recording that the guard worked was the first thing it refused to allow.
//
// A gap lets a merge through; a false positive gets the guard switched off, and
// the second is the likelier failure. Weigh them that way when you edit this.

// The one thing to edit. `check-setup.mjs` reads this line by name.
const DEFAULT_BRANCH = 'main'

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
// this asset, `assets/guard-guest-writes.mjs`, and the skill repository's own
// `scripts/guard-merge.mjs`. All three have to answer the same question the same
// way. ADR 0029 refuses a shared module — what a repository is handed has to be
// one file, and a two-file asset is a setup step that gets half done — so
// `scripts/command-reader.test.mjs` runs every copy over one corpus instead, and
// a drift is a red test rather than a lucky reading.
//
// Editing this region in your own checkout is fine and it is yours to do. Edit
// it in the skill and it has to land in all three at once.

// Characters that end one command and begin another when they are not inside
// quotes. A closing `)` is handled separately, because ending the command is
// only half of what it does: when a `$(` opened one, it also restores the
// quote that `$(` interrupted.
const OPERATORS = new Set(['&', '|', ';', '\n', '\r', '(', '`'])

const ESCAPABLE = new Set([...OPERATORS, ')', '"', "'", '\\', '$', ' ', '\t'])

// Split a command line into the commands it will actually run, each one
// tokenised.
//
// Quotes come off the tokens, because `gh pr "merge" 42` has to read the same
// as the bare form. Quotes still decide *structure*, though: an operator
// inside a quoted argument is that argument's text, not the start of a new
// command. Keeping both of those true at once is the whole of the fix — the old
// guard stripped quotes into a flat line and then matched patterns against it,
// so a markdown table cell reading `| gh pr merge 42 |` was indistinguishable
// from an actual merge.
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
    // A `)` ends a command whether or not this parser saw the thing that
    // opened one. Requiring an open `$(` made every other closing bracket fall
    // through to ordinary text, where it glued itself to the preceding token:
    // `(cd repo && gh pr merge)` presented a command named `merge)` and walked
    // past the rule. Restoring the interrupted quote stays conditional, because
    // only `$(` interrupts one.
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
// another program. Without this the segment presents a command named
// `GH_TOKEN=x` and every rule looks straight past it, so
// `GH_TOKEN=x gh pr merge 42` merges.
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

function segmentsOf(line) {
  const first = parse(line, null)
  // An apostrophe in ordinary text opens a quote that never closes, and every
  // operator after it would read as that argument's contents — including a
  // real chained merge. A quote with no partner is text, so read it that way.
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

const USE_WRAPPER =
  'Push your branch, open the PR, report back, and stop. The orchestrator\n' +
  'reviews and merges with:\n\n' +
  '  node scripts/merge-pr.mjs <pr-number>\n\n' +
  'It refuses unless every required check is green, and always squash merges.\n' +
  'See docs/process/working-an-issue.md.'

// `gh` takes its global flags before the subcommand and no positional argument
// there, so skipping the flags lands on the subcommand path. Returns null when
// this segment does not invoke `gh` at all.
//
// Reading tokens 1 and 2 instead is a hole rather than a shortcut:
// `gh --repo o/r pr merge 42` is a working merge with a flag in the way.
const GH_FLAGS_WITH_VALUE = new Set(['--repo', '-R', '--hostname'])

function ghArguments(tokens) {
  if (commandName(tokens[0]) !== 'gh') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GH_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

// `git` takes its own flags before the subcommand, and several of them swallow
// the next token. Returns the arguments from the subcommand onward, or null
// when this segment does not invoke git.
const GIT_FLAGS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path'])

function gitArguments(tokens) {
  if (commandName(tokens[0]) !== 'git') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GIT_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

// `gh api` takes exactly one endpoint, and everything else it is handed is
// payload — including `-f body=...`, which routinely contains the word merge
// and a URL. So the rule reads the endpoint and nothing else.
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

// Where a refspec lands. `src:dst` writes `dst`, a bare ref writes the same name
// at the far end, `:dst` deletes `dst`, and a leading `+` is force and says
// nothing about where it goes.
function pushDestination(refspec) {
  const colon = refspec.lastIndexOf(':')
  const destination = colon === -1 ? refspec : refspec.slice(colon + 1)
  return destination.replace(/^\+/, '').replace(/^refs\/heads\//, '')
}

// Only the push's own arguments, which the reader has already separated from
// the rest of the line. Reading the whole line instead is a real defect this
// guard shipped with: a commit message that merely mentioned the branch, in the
// same line as a push to a feature branch, was read as a push to the default
// branch and denied.
//
// The first positional names the remote, so `git push main` is a push to a
// remote called `main` and not a push *to* `main`. Everything after it is a
// refspec. A flag's value can be mistaken for one — `git push -o main origin
// feature` reads `origin` and `feature` — and that direction is the safe one:
// it allows, and the alternative is the table of someone else's flags this file
// declines to keep everywhere else.
function pushesToDefaultBranch(args) {
  const positional = args.filter((token) => !token.startsWith('-'))
  return positional.slice(1).some((refspec) => pushDestination(refspec) === DEFAULT_BRANCH)
}

// A dry run contacts the remote and changes nothing, so there is nothing for a
// rule about landing code to act on. `assets/guard-guest-writes.mjs` beside this
// one has always allowed it and says so in its refusal; this rule shipped for
// one review without it, and two guards disagreeing about the same command for
// no reason either can state is how a reader stops trusting both.
//
// `-n` is matched as a whole token, and that is safe rather than assumed:
// `git push -h` lists exactly one `-n`, `--dry-run`, so the token cannot mean
// anything else here. What it does not catch is a bundled cluster — git's
// option parser accepts `git push -nq`, which is a dry run whose token is
// `-nq`. That stays denied, which is the harmless direction, and widening the
// match to any cluster containing `n` would be the harmful one: `-on` is
// `-o n`, a push option named `n`, and reading it as a dry run would allow a
// real push to the default branch.
const isDryRun = (args) => args.includes('--dry-run') || args.includes('-n')

function judge(line, depth) {
  for (const tokens of segmentsOf(line)) {
    const gh = ghArguments(tokens)
    if (gh !== null && gh[0] === 'pr' && gh[1] === 'merge') {
      deny(
        'Blocked: `gh pr merge` bypasses the green-checks requirement, and agents do\n' +
          `not land pull requests.\n\n${USE_WRAPPER}`,
      )
    }
    if (gh !== null && gh[0] === 'api' && isMergeEndpoint(apiEndpoint(gh.slice(1)) ?? '')) {
      deny(`Blocked: merging through \`gh api\` is still merging.\n\n${USE_WRAPPER}`)
    }

    const git = gitArguments(tokens)
    if (
      git !== null &&
      git[0] === 'push' &&
      !isDryRun(git) &&
      pushesToDefaultBranch(git.slice(1))
    ) {
      deny(
        `Blocked: pushing to ${DEFAULT_BRANCH} skips review and CI entirely.\n\n` +
          `Push your feature branch instead:  git push -u origin HEAD\n\n` +
          '`git push --dry-run` is allowed: it contacts the remote and changes\n' +
          `nothing. So is \`-n\`.\n\n${USE_WRAPPER}`,
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
