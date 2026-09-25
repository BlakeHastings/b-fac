// PreToolUse guard: an agent does not land its own pull request, and does not
// destroy uncommitted work in a tree it cannot tell is its own.
//
// The file's name says only the first. The second rule arrived with #188 and
// went into this file rather than a new one, because a new guard would be a
// fourth copy of the reader. The name undersells it; it is left alone so the
// hook entries that run it keep working. ADR 0069.
//
// WHAT THIS PREVENTS
// The ruleset on the default branch already refuses direct pushes, force
// pushes and deletion, with no bypass actors. What it does not refuse is a
// merge: anyone with write access can land a green PR, and agents run with the
// owner's credentials. "Agents do not land code" is a separate constraint from
// "nothing reaches main unreviewed", and only this guard enforces it.
//
// It also refuses the git commands that throw away uncommitted work, when the
// tree they act on holds some: `git reset --hard`, `git checkout -f` and
// `git switch -f`, `git checkout -- <paths>` and `git checkout .`, `git
// restore` without `--staged`, `git clean -f`, a bare `git stash drop` and
// `git stash clear`, and `git worktree remove --force`. On a clean tree they
// are allowed, and in a linked worktree they are allowed, because a throwaway
// worktree is where this work belongs and a guard that blocks the remedy gets
// switched off. `git worktree remove --force <path>` is judged on `<path>`,
// and the stash on the stash, which every worktree shares. The refusal lists
// what would be lost and how to keep it.
//
// Each command counts only what it destroys. A reset or a forced checkout
// counts tracked changes, and an untracked file only where the commit it moves
// to tracks the same path, because every other untracked file survives it. A
// main checkout holding a stray draft is its normal state, and refusing a
// harmless reset there is how this rule would get switched off. A clean counts
// untracked files; a restore, tracked changes; `worktree remove --force`,
// everything, because it deletes the directory.
//
// The override is `git -c guard.destructive=ok ...`, on the command line where
// a reviewer sees it, and it exists for a person who has read the refusal. **An
// override an agent adds on its own is a finding for review, not a failure of
// this guard.** The guard's job is to make the loss visible before it happens;
// deciding that somebody else's files may go is not an agent's call, and doing
// it in plain sight is what lets a reviewer say so.
//
// WHAT THIS DOES NOT COVER
// Any session the harness did not load it into, any human at a terminal, and
// CI. A net, not a guarantee. The ruleset is the guarantee. It also reads only
// what the command line says: a merge assembled from a variable, a base64
// `-EncodedCommand`, or a script file the command merely names is invisible to
// it, and no amount of pattern work changes that.
//
// Nor does it cover a command that runs another command. Every line below was
// run against this guard and allowed through, and `gh pr merge` with no
// argument merges the current branch's pull request, so each of them is a
// working merge:
//
//   sudo gh pr merge      env gh pr merge       command gh pr merge
//   nohup gh pr merge     xargs gh pr merge     time -p gh pr merge
//
// `gh` spelled with its path is not on that list any more. `\gh pr merge`,
// `/usr/bin/gh pr merge` and `gh.exe pr merge` are refused since #219, because
// `commandName` reads the program a path names and the rules ask it.
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
// The uncommitted-work rule does look at a tree, and the same fact bounds it.
// It reads the directory the harness reports in the payload, moved by any
// `git -C`, and nothing else. That is the argument that removed the branch
// lookup, and it still holds: where this rule allows wrongly, it is silent. It
// is kept anyway because nothing else stands in front of the losses #188
// records, and the plain form of each, no `cd` in front, is the one it reads
// right. For that rule, NOT COVERED:
//
//   - a `cd`, `pushd` or `Set-Location` earlier on the same line. The rule
//     judges the directory the line starts in, and does not guess where a `cd`
//     leads. Its refusal says so and points at `git -C`, which it reads.
//   - the moment between the check and the command. Other writers keep writing:
//     a file that lands after the hook ran is not on the list.
//   - a program that runs git, `env git reset --hard` and the rest of the list
//     above, and a git alias that expands to one of these commands.
//   - `git checkout <path>` without `--` and without `.`: on the command line it
//     is indistinguishable from switching to a branch of that name.
//   - which untracked files a reset or forced checkout overwrites, when its
//     target does not resolve here (`-`, a variable). Every untracked file is
//     counted then, which refuses where it may not have needed to.
//   - a Git Bash path the process cannot open. `/c/...` is read as `C:/...`,
//     but another MSYS mount, `/tmp` among them, names a directory this process
//     cannot find, and the rule allows a directory it cannot find.
//   - files git ignores, except for `git clean -x` and `-X`. `git worktree
//     remove --force` deletes an ignored `.env` without a word from this rule,
//     which is the price of allowing the `node_modules` that makes `--force`
//     necessary in the first place.
//   - other destructive commands: `git rm -f`, `git branch -D`, `git worktree
//     prune` after a directory was deleted by hand, `rm -rf`, and `git clean`
//     with `clean.requireForce` turned off, which needs no `-f`.
//
// A path the rule cannot resolve at all, a variable, a `$(...)`, `--git-dir` or
// `--work-tree`, is refused rather than guessed at, and the refusal says so.
//
// HOW IT READS A COMMAND
// It asks what each command in the line *invokes*, never what the line's text
// contains. Scanning the text is a defect this guard shipped with and that
// references/enforcement.md already warned about in the abstract: within
// seconds of the guard firing for the first time it denied a `gh issue comment`
// whose body quoted the blocked command inside a markdown table. Nothing was
// being merged. See docs/architecture/decisions/0001 and issue #58.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

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
// reader stamp: sha256 f10494400b6c6b94
//
// Everything between this marker and END is one reader carried in three files:
// this one, the guest gate in `assets/guard-guest-writes.mjs`, and the guard
// this repository ships to other people in `assets/guard-merge.mjs`. All three
// have to answer the same question the same way. ADR 0029 refuses a shared
// module and #93 holds the duplication; `scripts/command-reader.test.mjs` runs
// every copy over one corpus so a drift is a red test rather than a lucky
// reading.
//
// The stamp line above is a hash of this region's code, comments and blanks
// left out, and the same test fails when the code changes and the stamp does
// not. It is there for the copies that leave: a host repository's guard is a
// fourth copy that nothing here can read, and comparing its stamp with the
// shipped asset's is the one check its operator can make. Change the reader and
// the test prints the new line; put it in all three.

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

// How a `gh api` call reads: its method, and the arguments that are not flags
// or a flag's value. It lives in the reader rather than beside a rule because
// every guard asks it, and the copies that lived beside the rules had drifted
// into two versions that shared one hole (#199): each assumed every flag before
// the endpoint takes a value, so `gh api --silent repos/o/r/pulls/1/merge -X
// PUT` let `--silent` swallow the endpoint, and the merge went through.
//
// The flags that take a value are gh's own, read off `gh api --help` on gh
// 2.101.0. The help's boolean flags are `--allow-escape-sequences`, `-i`/
// `--include`, `--paginate`, `--silent`, `--slurp`, `--verbose` and `--help`,
// and nothing here needs to name them, because anything starting with `-` that
// is not in the table below is taken to stand alone. That is the
// direction to be wrong in, and it is the reason the table names the valued
// flags rather than the boolean ones: a flag gh adds later that takes a value
// leaves its value among the arguments, where the worst it can do is be read as
// a second endpoint, and a rule asking "is any argument a merge endpoint" then
// refuses rather than allows. Guessing which argument is *the* endpoint is the
// thing that failed; gh accepts exactly one, so asking about all of them loses
// nothing on a command gh would run.
//
// The method is gh's too: the last `-X`/`--method` wins, as it does in gh's
// flag parser, gh upper-cases it, and without one a call carrying a field or
// `--input` is a POST. Measured on gh 2.101.0 with `--verbose`: `-X GET -X
// HEAD`, `-XHEAD`, `-X=HEAD` and `-iXHEAD` all send HEAD, and `--` ends the
// flags.
//
// The fields are read because a GraphQL call's verb is in one of them (#210):
// `gh api graphql -f query='mutation{mergePullRequest(...)}'` merges, and its
// endpoint and method look like any other read. gh splits a field at its first
// `=`, and a `-F`/`--field` value starting with `@` is read from that file,
// or from stdin for `@-`, so its text is not on the command line and the
// field's value is null. `-f`/`--raw-field` never reads a file: its `@` is
// text. `--input` sends a file as the whole body, and `input` names it.
const GH_API_VALUE_FLAGS = new Set([
  '--cache',
  '-F',
  '--field',
  '-H',
  '--header',
  '--hostname',
  '--input',
  '-q',
  '--jq',
  '-X',
  '--method',
  '-p',
  '--preview',
  '-f',
  '--raw-field',
  '-t',
  '--template',
])
const GH_API_BODY_FLAGS = new Set(['-F', '--field', '-f', '--raw-field', '--input'])
const GH_API_TYPED_FIELDS = new Set(['-F', '--field'])
const GH_API_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function ghApiCall(args) {
  const positionals = []
  let method = null
  let body = false
  const fields = []
  let input = null
  const take = (flag, value) => {
    if (flag === '-X' || flag === '--method') method = (value ?? '').toUpperCase()
    if (GH_API_BODY_FLAGS.has(flag)) body = true
    if (flag === '--input') {
      input = value ?? ''
    } else if (GH_API_BODY_FLAGS.has(flag)) {
      const text = value ?? ''
      const equals = text.indexOf('=')
      const raw = equals === -1 ? '' : text.slice(equals + 1)
      const fromFile = GH_API_TYPED_FIELDS.has(flag) && raw.startsWith('@')
      fields.push({ key: equals === -1 ? text : text.slice(0, equals), value: fromFile ? null : raw })
    }
  }
  for (let at = 0; at < args.length; at += 1) {
    const token = args[at]
    if (token === '--') {
      positionals.push(...args.slice(at + 1))
      break
    }
    if (token.startsWith('--')) {
      const equals = token.indexOf('=')
      if (equals !== -1) {
        take(token.slice(0, equals), token.slice(equals + 1))
      } else if (GH_API_VALUE_FLAGS.has(token)) {
        take(token, args[at + 1])
        at += 1
      }
      continue
    }
    if (token.startsWith('-') && token.length > 1) {
      // A cluster of short flags. The first one that takes a value takes the
      // rest of the token, or the next token when nothing is left.
      for (let c = 1; c < token.length; c += 1) {
        const flag = `-${token[c]}`
        if (!GH_API_VALUE_FLAGS.has(flag)) continue
        const rest = token.slice(c + 1).replace(/^=/, '')
        if (rest !== '') {
          take(flag, rest)
        } else {
          take(flag, args[at + 1])
          at += 1
        }
        break
      }
      continue
    }
    positionals.push(token)
  }
  const effective = method ?? (body ? 'POST' : 'GET')
  return {
    positionals,
    method: effective,
    writes: !GH_API_READ_METHODS.has(effective),
    fields,
    input,
  }
}

// END command reader

// BEGIN shell payload
// shell payload stamp: sha256 ab29fad175b6dc61
//
// A second marked region, held to the same text in all three guards by the same
// test as the reader, with a stamp of its own so that a change here does not
// move the reader's. #201.

// The name a shell runs, whatever path spelled it: `/usr/bin/gh`,
// `C:\Program Files\GitHub CLI\gh.exe`, `gh.CMD`. The basename is compared
// whole once a Windows executable extension is off, so `gh-dash`, `ghq` and
// `/opt/gh/bin/not-gh` stay other programs. Lowercased everywhere: Windows
// ignores the case, and a POSIX program called `GH` is not worth a hole. #219.
const commandName = (token) =>
  token
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/, '')

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

// END shell payload

// BEGIN git arguments
// git arguments stamp: sha256 6d9fbae09aea9c65
//
// A marked region held to one text with the two shipped guards. This file read
// no `git` until #188, and ADR 0068 kept the region out of it for that reason;
// the uncommitted-work rule below reads `git` and the directory `-C` names, so
// the region is here now, with the same code as its other copies.

// `git` takes its own flags before the subcommand, and several of them swallow
// the next token. `gitCall` returns the arguments from the subcommand onward
// together with the flags that decide *where* git acts and how it is
// configured, or null when this segment does not invoke git.
//
// `directories` are the `-C` values in order, which git applies each relative to
// the one before. `configs` are the `-c` values. `elsewhere` says that
// `--git-dir` or `--work-tree` has moved the repository or its tree somewhere
// `-C` does not name, which a rule about a tree cannot follow.
const GIT_FLAGS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path'])

function gitCall(tokens) {
  if (commandName(tokens[0]) !== 'git') return null
  const directories = []
  const configs = []
  let elsewhere = false
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    const flag = tokens[at]
    if (flag === '-C') directories.push(tokens[at + 1] ?? '')
    if (flag === '-c') configs.push(tokens[at + 1] ?? '')
    if (/^--(git-dir|work-tree)(=|$)/.test(flag)) elsewhere = true
    at += GIT_FLAGS_WITH_VALUE.has(flag) ? 2 : 1
  }
  return { args: tokens.slice(at), directories, configs, elsewhere }
}

const gitArguments = (tokens) => gitCall(tokens)?.args ?? null

// END git arguments

// BEGIN gh arguments
// gh arguments stamp: sha256 f8edf97722f2123e
//
// A marked region held to one text with the two shipped guards. Until #219 this
// copy compared the raw token with `'gh'` instead of asking `commandName`, so
// `/usr/bin/gh pr merge 42` and `gh.exe pr merge 42` walked past it while both
// shipped guards refused them. It sat outside the regions on purpose, and that
// is exactly how nothing noticed.

// `gh` takes its global flags before the subcommand and no positional argument
// there, so skipping the flags lands on the subcommand path. Returns null when
// this segment does not invoke `gh` at all.
const GH_FLAGS_WITH_VALUE = new Set(['--repo', '-R', '--hostname'])

function ghArguments(tokens) {
  if (commandName(tokens[0]) !== 'gh') return null
  let at = 1
  while (at < tokens.length && tokens[at].startsWith('-')) {
    at += GH_FLAGS_WITH_VALUE.has(tokens[at]) ? 2 : 1
  }
  return tokens.slice(at)
}

// END gh arguments

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

// BEGIN merge rule
// merge rule stamp: sha256 e41bec80b425dbf6
//
// How a `gh api` call is read as a merge, REST or GraphQL. This repository's
// guard and the one it ships in `assets/guard-merge.mjs` carry it in two copies,
// and `scripts/command-reader.test.mjs` holds them to one text and one stamp,
// as it does the reader. The messages the rule prints are inside, so they stay
// the same too. #201.

// A merge endpoint, as a whole path segment, so `branches/merge-queue-test`
// does not trip it. `merge-async` is the asynchronous form of `pulls/<n>/merge`,
// which GitHub's own GraphQL reference recommends over `mergePullRequest`, and
// until #210 it walked past the segment test because it is a different segment.
const isMergeEndpoint = (endpoint) => /\/(merge|merges|merge-async)(\/|$)/.test(endpoint)

// A `gh api` call that writes, with a merge endpoint anywhere among its
// arguments. `ghApiCall` in the reader says which arguments those are, and
// leaves out the values of `-f body=...`, which on this repo routinely contain
// the word merge and a URL. The method is part of the question because a GET of
// `pulls/<n>/merge` asks whether a pull request is merged, and refusing that
// read is the false positive that gets a guard switched off.
//
// Until #199 this read one token as *the* endpoint, and read it by assuming
// every flag before it takes a value. `gh api --silent repos/o/r/pulls/1/merge
// -X PUT` let `--silent` swallow the endpoint and merged.
function mergesThroughApi(args) {
  const call = ghApiCall(args)
  return call.writes && call.positionals.some(isMergeEndpoint)
}

// The GraphQL mutations that land a pull request or schedule one to land, read
// off GitHub's schema by introspection on 2026-09-25 (#210). `mergePullRequest`
// lands one. `enablePullRequestAutoMerge` and `enqueuePullRequest` land it later
// with nobody present, which is the same act on a delay. `mergeBranch` is
// `repos/<o>/<r>/merges`, refused above, by its other name. Left out on purpose:
// `updatePullRequestBranch` merges the base *into* the pull request's branch,
// `createDeployment`'s `autoMerge` merges the default branch into the ref being
// deployed, and `dequeuePullRequest` and `disablePullRequestAutoMerge` undo.
const MERGE_MUTATIONS = new Set([
  'mergePullRequest',
  'enablePullRequestAutoMerge',
  'enqueuePullRequest',
  'mergeBranch',
])

// gh sends `graphql` to the GraphQL endpoint, and measured on gh 2.101.0 so do
// `/graphql`, `graphql?x=1` and the full `https://api.github.com/graphql`.
// Case is ignored because the wrong way round costs a refusal and not a merge.
const isGraphqlEndpoint = (endpoint) => /(^|\/)graphql([?#]|$)/i.test(endpoint)

const GRAPHQL_NAME = /[_A-Za-z][_0-9A-Za-z]*/y

// The names a GraphQL document selects, lexed the way GitHub's parser lexes it,
// so a merge mutation's name in a comment, in a string such as an `addComment`
// body or a search, or as an alias (`mergePullRequest: repository(...)`) is not
// a call. Matching the bare word refused those, and a guard that refuses a
// harmless read gets switched off (#58, #102). A name followed by `:` is an
// alias or an argument, and one after `$` is a variable; a field is neither.
//
// Returns null when the text does not lex cleanly: a string left open, or a
// backslash outside one. The second is how PowerShell passes a quote to a
// native command, `\"`, and this reader tokenises the line as bash does, so
// there the strings it would strip are not the strings GitHub sees. The caller
// then matches the bare word, which refuses rather than guesses.
function selectedNames(document) {
  const tokens = []
  let at = 0
  while (at < document.length) {
    const char = document[at]
    if (char === '#') {
      while (at < document.length && document[at] !== '\n' && document[at] !== '\r') at += 1
    } else if (document.startsWith('"""', at)) {
      let end = at + 3
      while (end < document.length && !document.startsWith('"""', end)) {
        end += document.startsWith('\\"""', end) ? 4 : 1
      }
      if (end >= document.length) return null
      at = end + 3
    } else if (char === '"') {
      let end = at + 1
      while (end < document.length && document[end] !== '"') {
        if (document[end] === '\n' || document[end] === '\r') return null
        end += document[end] === '\\' ? 2 : 1
      }
      if (end >= document.length) return null
      at = end + 1
    } else if (char === '\\') {
      return null
    } else {
      GRAPHQL_NAME.lastIndex = at
      const name = GRAPHQL_NAME.exec(document)
      if (name !== null) {
        tokens.push(name[0])
        at += name[0].length
      } else {
        if (!/[\s,]/.test(char)) tokens.push(char)
        at += 1
      }
    }
  }
  return tokens.filter(
    (token, i) => /^[_A-Za-z]/.test(token) && tokens[i - 1] !== '$' && tokens[i + 1] !== ':',
  )
}

function callsMergeMutation(document) {
  const names = selectedNames(document)
  if (names === null) {
    return [...MERGE_MUTATIONS].some((name) => new RegExp(`\\b${name}\\b`).test(document))
  }
  return names.some((name) => MERGE_MUTATIONS.has(name))
}

// What a `gh api` call to GraphQL does about merging: 'merge', 'unreadable', or
// null. The method plays no part, since a query and a mutation are both a POST.
//
// Unreadable is a query the command line does not carry: `-F query=@file`,
// `-F query=@-`, `--input`, or a `$(...)` standing in for it. Those are refused,
// because this guard cannot tell them from a merge. That costs any GraphQL read
// written that way, and #210 measured the cost here before choosing: no script,
// doc or skill file in this repository runs `gh api graphql` at all, so it is
// nothing today. The refusal says how to put the query inline, which is always
// possible and is then read like any other.
function graphqlMerge(args) {
  const call = ghApiCall(args)
  if (!call.positionals.some(isGraphqlEndpoint)) return null
  if (call.input !== null) return 'unreadable'
  for (const field of call.fields) {
    if (field.key !== 'query') continue
    if (field.value === null || field.value.includes(SUBSTITUTION)) return 'unreadable'
    if (callsMergeMutation(field.value)) return 'merge'
  }
  return null
}

const GRAPHQL_MERGE =
  'Blocked: merging through GraphQL is still merging. The query calls one of\n' +
  `${[...MERGE_MUTATIONS].join(', ')}, which land a pull request\n` +
  'now or schedule it to land with nobody present.'

const GRAPHQL_UNREADABLE =
  'Blocked: this `gh api graphql` call reads its query from a file, stdin,\n' +
  '`--input` or a `$(...)`, so the guard cannot see whether it merges, and it\n' +
  'refuses rather than guess.\n\n' +
  'Put the query on the command line and it is read like any other:\n\n' +
  "  gh api graphql -f query='query { viewer { login } }'\n\n" +
  'Variables can still come from `-F name=value`. Only the query has to be\n' +
  `inline, and one that calls none of ${[...MERGE_MUTATIONS].join(', ')}\n` +
  'is allowed.'

// END merge rule

// BEGIN uncommitted work
// uncommitted work stamp: sha256 e4a4b9c7125a7e4b
//
// The second rule, #188 and ADR 0069. Held to one text with its other copy by
// the test that holds the reader, and stamped the same way. What it does not
// cover is listed in the header, as NOT COVERED for this rule.
//
// A force flag exists to get past a refusal, and the refusal was holding
// something. Three times in one session an orchestrator destroyed uncommitted
// work that way: an agent's only file, untracked, under `git worktree remove
// --force`; a backlog item under `git reset --hard`; and the owner's `README.md`
// and ten layout files under a second `git reset --hard`. The orchestrator is
// not the only writer in a main checkout, and nothing it can read says who wrote
// what. So the proxy is a count: a destructive command is refused when the tree
// it would act on holds anything it would destroy, and allowed when it holds
// nothing.
//
// It is allowed in a linked worktree, because doing this work in a throwaway
// worktree is the remedy, and a guard that blocks the remedy gets switched off.
// Two things are exceptions. `git worktree remove --force <path>` is judged on
// `<path>`, the tree it deletes, wherever it runs from. The stash is judged on
// the stash, since every worktree of a repository shares one stack and a linked
// worktree protects nothing on it.

// The override. A `-c` on git's own line rather than an environment prefix,
// because the prefix is not a form PowerShell has, the reader strips it before
// any rule sees the command, and `$env:` would outlive the one command it was
// meant for. git accepts a `-c` it does not know and ignores it.
const DESTRUCTIVE_OK = 'guard.destructive=ok'

// Flags up to `--`, after which everything is a path.
const flagsOf = (args) => {
  const end = args.indexOf('--')
  return (end === -1 ? args : args.slice(0, end)).filter((token) => token.startsWith('-'))
}

// Whether a flag appears, long or inside a cluster of short ones. A cluster
// stops at the first short flag that takes a value, because the rest of the
// token is that value: `git checkout -bfix` names a branch `fix` and forces
// nothing.
function hasFlag(args, long, letter, valued = '') {
  for (const token of flagsOf(args)) {
    if (token === long) return true
    if (token.startsWith('--')) continue
    for (const char of token.slice(1)) {
      if (char === letter) return true
      if (valued.includes(char)) break
    }
  }
  return false
}

// The arguments that are not flags or a flag's value, before `--` and after it.
function operands(args, valued = '', longValued = []) {
  const before = []
  for (let at = 0; at < args.length; at += 1) {
    const token = args[at]
    if (token === '--') return { before, after: args.slice(at + 1) }
    if (token.startsWith('--')) {
      if (longValued.includes(token)) at += 1
    } else if (token.startsWith('-') && token.length > 1) {
      const cluster = token.slice(1)
      const value = [...cluster].findIndex((char) => valued.includes(char))
      if (value === cluster.length - 1) at += 1
    } else {
      before.push(token)
    }
  }
  return { before, after: [] }
}

// What a git command would destroy, or null when it destroys nothing this rule
// is about. `lose` is which entries of `git status` count, because each command
// counts only what it destroys:
//
//   `tracked`    tracked changes. A restore from the index never touches an
//                untracked file.
//   `untracked`  untracked files. A clean never touches a tracked one.
//   `rewrite`    tracked changes, and the untracked files that `target` tracks.
//                A reset or a forced checkout rewrites tracked files and leaves
//                untracked ones alone, except where the commit it moves to has
//                a file at the same path, which it overwrites without a word.
//                Counting every untracked file refused both in a main checkout
//                holding nothing but a stray draft, which is its normal state.
//   `all`        everything, for a worktree whose directory is being deleted.
//
// `paths` narrows the tree to what the command names, so `git checkout -- a.txt`
// is judged on `a.txt` and an unrelated edit elsewhere does not refuse it.
function destructiveAction(args) {
  const [sub, ...rest] = args
  if (sub === 'reset') {
    if (!rest.includes('--hard')) return null
    return { lose: 'rewrite', target: operands(rest).before[0] ?? 'HEAD', paths: [] }
  }
  if (sub === 'checkout') {
    const { before, after } = operands(rest, 'bB', ['--orphan'])
    if (after.length > 0) return { lose: 'tracked', paths: after }
    if (before.includes('.')) return { lose: 'tracked', paths: ['.'] }
    if (!hasFlag(rest, '--force', 'f', 'bB')) return null
    return { lose: 'rewrite', target: before[0] ?? 'HEAD', paths: [] }
  }
  // `git switch` is `checkout -f`'s newer spelling, and leaving it open would
  // make the rule a matter of which verb an agent learned.
  if (sub === 'switch') {
    const force = hasFlag(rest, '--force', 'f', 'cC') || hasFlag(rest, '--discard-changes', null)
    if (!force) return null
    return { lose: 'rewrite', target: operands(rest, 'cC').before[0] ?? 'HEAD', paths: [] }
  }
  if (sub === 'restore') {
    const staged = hasFlag(rest, '--staged', 'S', 's')
    const worktree = hasFlag(rest, '--worktree', 'W', 's')
    if (staged && !worktree) return null
    const { before, after } = operands(rest, 's', ['--source', '--pathspec-from-file'])
    const fromFile = rest.some((token) => token.startsWith('--pathspec-from-file'))
    return { lose: 'tracked', paths: fromFile ? [] : [...before, ...after] }
  }
  if (sub === 'clean') {
    if (!hasFlag(rest, '--force', 'f', 'e')) return null
    if (hasFlag(rest, '--dry-run', 'n', 'e')) return null
    const { before, after } = operands(rest, 'e', ['--exclude'])
    return {
      lose: 'untracked',
      paths: [...before, ...after],
      ignored: hasFlag(rest, null, 'x', 'e') || hasFlag(rest, null, 'X', 'e'),
      directories: hasFlag(rest, null, 'd', 'e'),
    }
  }
  if (sub === 'stash' && rest[0] === 'clear') return { stash: 'all' }
  if (sub === 'stash' && rest[0] === 'drop') {
    // A named entry is the caller's choice. A bare drop takes whatever is on
    // top of a stack every worktree shares, which may be another session's.
    return operands(rest.slice(1)).before.length === 0 ? { stash: 'top' } : null
  }
  if (sub === 'worktree' && rest[0] === 'remove') {
    const remove = rest.slice(1)
    if (!hasFlag(remove, '--force', 'f')) return null
    const { before, after } = operands(remove)
    const target = [...before, ...after][0]
    return target === undefined ? null : { worktree: target }
  }
  return null
}

// A variable the hook inherited from the harness, in any of the three shells'
// spellings, is expanded, because the shell the command runs in inherited the
// same one: `"$LOCALAPPDATA/Temp/..."` is how a scratch worktree gets named.
// One the line sets for itself, `W=...; git -C "$W" ...`, is not in this
// process, and neither is what a `$(...)` or a backtick prints. Those leave the
// token unreadable, and the caller says so rather than guessing.
const VARIABLE = /\$env:([A-Za-z_]\w*)|\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)|%([A-Za-z_]\w*)%/g

function expanded(token) {
  const text = token.replace(VARIABLE, (whole, ...names) => process.env[names.find(Boolean)] ?? whole)
  return /[$`%]/.test(text) ? null : text
}

// A path as written on the command line, as this process can open it, or null
// when only the shell could say what it is. `~` is the home directory, and on
// Windows a Git Bash `/c/...` is `C:/...`. Any other MSYS mount, `/tmp` among
// them, resolves to a directory that does not exist, and is named under NOT
// COVERED.
function localPath(token) {
  const path = expanded(token)
  if (path === null) return null
  if (path === '~' || path.startsWith('~/')) return homedir() + path.slice(1)
  const drive = /^\/([A-Za-z])(\/|$)/.exec(path)
  if (process.platform === 'win32' && drive !== null) return `${drive[1]}:/${path.slice(3)}`
  return path
}

function gitRead(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

// Whether `dir` is inside a linked worktree rather than a main checkout, or
// null when it is not inside a repository at all, where git will refuse the
// command itself and there is nothing for this rule to keep.
function isLinkedWorktree(dir) {
  const out = gitRead(dir, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'])
  if (out === null) return null
  const [gitDir, commonDir] = out.trim().split(/\r?\n/)
  return resolve(gitDir) !== resolve(commonDir)
}

// The paths the commit `target` tracks, from the repository root, or null when
// the target does not read as a commit here: a ref the guard cannot resolve, a
// variable only the shell knows. Then every untracked file counts, which is the
// direction that refuses rather than the one that loses a file.
function trackedAt(dir, target) {
  const out = gitRead(dir, ['ls-tree', '-r', '--name-only', '--full-tree', '-z', '--end-of-options', target])
  return out === null ? null : new Set(out.split('\0').filter(Boolean))
}

// The entries of `git status` the action would destroy, as `{ code, path }`.
function atRisk(dir, action) {
  const untracked = action.lose === 'tracked' ? 'no' : action.lose === 'untracked' && !action.directories ? 'normal' : 'all'
  const args = ['status', '--porcelain=v1', '-z', '--no-renames', `--untracked-files=${untracked}`]
  if (action.ignored) args.push('--ignored=matching')
  const out = gitRead(dir, [...args, '--', ...(action.paths ?? [])])
  if (out === null) return []
  const entries = out
    .split('\0')
    .filter((entry) => entry.length > 3)
    .map((entry) => ({ code: entry.slice(0, 2), path: entry.slice(3) }))
  if (action.lose === 'untracked') {
    return entries.filter(({ code, path }) => {
      // Without `-d`, a clean leaves untracked directories alone.
      if (!action.directories && path.endsWith('/')) return false
      return code === '??' || code === '!!'
    })
  }
  if (action.lose === 'rewrite' && entries.some(({ code }) => code === '??')) {
    const tracked = trackedAt(dir, action.target)
    return entries.filter(({ code, path }) => code !== '??' || tracked === null || tracked.has(path))
  }
  return entries
}

const LISTED = 20

function listing(entries) {
  const lines = entries.slice(0, LISTED).map(({ code, path }) => `  ${code} ${path}`)
  if (entries.length > LISTED) lines.push(`  ... and ${entries.length - LISTED} more`)
  return lines.join('\n')
}

const OVERRIDE_NOTE =
  'If a person has read this and means to go ahead, the override goes on the\n' +
  `command line, where a reviewer will see it: \`git -c ${DESTRUCTIVE_OK} ...\`.\n` +
  'An agent that adds it on its own has decided for whoever wrote those files.\n' +
  'Say so in the report; a reviewer reads it as a finding.'

function treeRefusal(command, dir, entries) {
  return (
    `Blocked: \`${command}\` would destroy uncommitted work in the main\n` +
    `checkout at ${dir}, and nothing on this line says who wrote it:\n\n${listing(entries)}\n\n` +
    'Keep it first. `git diff HEAD` misses every untracked file above; these do not.\n' +
    'The stash is shared by every worktree, so name the entry:\n\n' +
    `  git -C "${dir}" stash push -u -m "kept before ${command}"\n` +
    `  git -C "${dir}" ls-files --others --exclude-standard   # then copy each one\n\n` +
    'Better, do this in a throwaway worktree, which holds nobody else\'s work and\n' +
    'where this guard allows it:  git worktree add ../scratch HEAD\n\n' +
    'That path is where the harness says this command starts. A `cd` earlier on\n' +
    'the same line has not happened when this guard runs, so if the command was\n' +
    'meant for another tree, name it with `git -C <path>`, which the guard reads.\n\n' +
    OVERRIDE_NOTE
  )
}

function worktreeRefusal(target, entries) {
  return (
    `Blocked: \`git worktree remove --force\` would delete ${target}, and it holds\n` +
    `uncommitted work that exists nowhere else:\n\n${listing(entries)}\n\n` +
    'Commit it on that worktree\'s branch, which keeps untracked files too, and\n' +
    'check that every path above is in the commit before removing anything:\n\n' +
    `  git -C "${target}" add -A\n` +
    `  git -C "${target}" commit -m "WIP (unreviewed): kept before removal"\n\n` +
    'Once nothing is listed here, `--force` is allowed, for files git ignores.\n\n' +
    OVERRIDE_NOTE
  )
}

function stashRefusal(command, entries) {
  return (
    `Blocked: \`${command}\` would drop ${entries.length === 1 ? 'this' : 'these'} from a stash stack that every worktree\n` +
    'of this repository shares, so an entry may be another session\'s:\n\n' +
    `${entries.slice(0, LISTED).map((entry) => `  ${entry}`).join('\n')}\n\n` +
    'Drop the one you mean by name, `git stash drop stash@{<n>}`, after reading it\n' +
    'with `git stash show -p --include-untracked stash@{<n>}`.\n\n' +
    OVERRIDE_NOTE
  )
}

function unreadableRefusal(command, where) {
  return (
    `Blocked: \`${command}\` acts on a tree named through ${where}, which this\n` +
    'guard cannot resolve, so it cannot see what the command would destroy and it\n' +
    'refuses rather than guess. Write the path literally.\n\n' +
    OVERRIDE_NOTE
  )
}

// The refusal for one command, or null to allow it. `cwd` is the directory the
// hook was told the command runs in. A `cd` earlier on the same line has not
// happened when a PreToolUse hook runs, so it cannot be followed, and this does
// not try.
function uncommittedWork(tokens, cwd) {
  const call = gitCall(tokens)
  if (call === null) return null
  const action = destructiveAction(call.args)
  if (action === null) return null
  if (call.configs.some((config) => config.toLowerCase() === DESTRUCTIVE_OK)) return null
  const command = `git ${call.args.join(' ')}`
  if (call.elsewhere) return unreadableRefusal(command, '`--git-dir` or `--work-tree`')

  let dir = cwd
  for (const written of call.directories) {
    const path = localPath(written)
    if (path === null) return unreadableRefusal(command, `\`-C ${written}\``)
    dir = resolve(dir, path)
  }
  if (!existsSync(dir)) return null

  if (action.worktree !== undefined) {
    const path = localPath(action.worktree)
    if (path === null) return unreadableRefusal(command, `\`${action.worktree}\``)
    const target = resolve(dir, path)
    if (!existsSync(target) || isLinkedWorktree(target) === null) return null
    const entries = atRisk(target, { lose: 'all' })
    return entries.length === 0 ? null : worktreeRefusal(target, entries)
  }

  const linked = isLinkedWorktree(dir)
  if (linked === null) return null

  if (action.stash !== undefined) {
    const out = gitRead(dir, ['stash', 'list', '--format=%gd: %s'])
    const entries = (out ?? '').split(/\r?\n/).filter((line) => line !== '')
    if (entries.length === 0) return null
    return stashRefusal(command, action.stash === 'top' ? entries.slice(0, 1) : entries)
  }

  if (linked) return null
  // A path the command names through a variable only the shell knows could be
  // any path, so the whole tree is what it might take.
  const paths = action.paths.map(expanded)
  const scope = paths.includes(null) ? { ...action, paths: [] } : { ...action, paths }
  const entries = atRisk(dir, scope)
  return entries.length === 0 ? null : treeRefusal(command, dir, entries)
}

// END uncommitted work

// `whole` is the command line the harness was handed, which is the same as
// `line` until the walk steps into a shell payload. The probe's wording is the
// one verdict here that depends on what else the tool call would have run, and
// a nested payload only knows about its own half of it.
function judge(line, depth, whole, cwd) {
  for (const tokens of segmentsOf(line)) {
    const gh = ghArguments(tokens)
    if (gh !== null && gh[0] === 'pr' && gh[1] === 'merge') {
      deny(`Blocked: agents do not land pull requests.\n\n${USE_WRAPPER}`)
    }
    if (gh !== null && gh[0] === 'api' && mergesThroughApi(gh.slice(1))) {
      deny(`Blocked: merging through \`gh api\` is still merging.\n\n${USE_WRAPPER}`)
    }
    const graphql = gh !== null && gh[0] === 'api' ? graphqlMerge(gh.slice(1)) : null
    if (graphql === 'merge') deny(`${GRAPHQL_MERGE}\n\n${USE_WRAPPER}`)
    if (graphql === 'unreadable') deny(GRAPHQL_UNREADABLE)

    if (isLivenessProbe(tokens)) {
      deny(probeIsTheWholeCall(whole, SHELL_DEPTH) ? PROBE_ALONE : PROBE_IN_COMPANY)
    }

    const loss = uncommittedWork(tokens, cwd)
    if (loss !== null) deny(loss)

    const nested = depth > 0 ? shellPayload(tokens) : null
    if (nested !== null) judge(nested, depth - 1, whole, cwd)
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
// The directory the harness says the command runs in. The payload carries it;
// the hook's own working directory is the fallback, and the same thing when a
// harness runs its hooks where its shell stands.
let cwd = process.cwd()
try {
  const input = JSON.parse(payload)
  command = input?.tool_input?.command ?? ''
  cwd = input?.cwd ?? cwd
} catch {
  process.exit(0) // Unparseable payload is not this guard's problem.
}
if (!command.trim()) process.exit(0)

judge(command, SHELL_DEPTH, command, cwd)

process.exit(0)
