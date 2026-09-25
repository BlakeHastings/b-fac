// Hooks about one file: the handoff the orchestrator keeps topped up, and what
// happens to it as the context window fills and is compacted.
//
// SETUP
// Three knobs, below: HANDOFF, DEFAULT_BRANCH, and the two staleness numbers.
// Wire every event to this same file; it decides which one it is from the
// payload. The block, and the two environment variables that choose where
// compaction happens, are in references/continuity.md.
//
// THE SEQUENCE, WHEN ALL OF IT IS WIRED (ADR 0060)
//   PostToolUse         reads how full the context is from the transcript and,
//                       once per climb, tells the orchestrator to top the
//                       handoff up now, calmly, because compaction is coming.
//   PreCompact (auto)   refuses nothing, and prints what the summariser must
//                       keep: whose session this is and where the handoff is.
//   SessionStart        prints the handoff back, with the resume instruction
//                       the owner used to type by hand.
// The threshold itself is not in this file. It is the harness's own setting,
// CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, and this file reads it rather than keeping a
// second copy that could disagree.
//
// WHAT THIS PREVENTS
// A compaction is the one event that destroys the orchestrator's working memory
// without failing. The summariser keeps the gist and loses the specifics, and
// the specifics — which agent is on which issue, what the owner said an hour
// ago, which assumption a brief was written under — are exactly what nobody can
// reconstruct from the repository afterwards. The loop then continues,
// confidently, on a version of the state that is smoothed over.
//
// So: the handoff is a file, the file survives compaction losslessly, and
// SessionStart puts it back into the resumed context.
//
// THE HOOK CANNOT WRITE THE HANDOFF, AND THAT DECIDES THE DESIGN
// A hook is a shell command. It has stdout, stderr and an exit code. It cannot
// call a tool, run a slash command, or make the model do anything. Only the
// conversation can write prose, so a hook's whole vocabulary here is *refuse*
// and *inject*. This file does one of each.
//
// THE ASYMMETRY IS THE LOAD-BEARING PART: `manual` MAY BE REFUSED, `auto` MAY
// NOT
// A `PreCompact` hook that exits 2 blocks the compaction. Measured on Claude
// Code 2.1.228, both triggers, and the two answers are not the same:
//
//   manual  Refused, and the harness prints this hook's stderr. The
//           orchestrator writes the handoff and runs /compact again. A gate
//           whose only cost is doing the thing it asked for.
//
//   auto    Refused too — and there is no way out. The session keeps growing,
//           the next request comes back "Prompt is too long", and the hook goes
//           on firing and on refusing. Measured: eleven fills into a 100K
//           window, every turn after the eleventh failed identically, and the
//           hook logged a refusal for each one. The gate cannot be satisfied
//           from inside, because the model cannot be reached to satisfy it.
//
// So the `auto` path in this file exits 0 unconditionally. Not as a fallback,
// and not as a weaker setting: a gate that can wedge the thing it protects is
// worse than no gate, and this one wedges it silently at the exact moment the
// session is most valuable.
//
// The escape, if you ever get there: a manual /compact still works on a wedged
// session, so long as the manual rule allows it. Measured. That is another
// reason the two triggers must never share a verdict.
//
// AND `auto` IS ALSO HOW A SUBAGENT COMPACTS
// A subagent's context compacts independently of yours, `PreCompact` fires for
// it with `trigger: "auto"`, and **the payload does not say it is a subagent**:
// no `agent_id`, no `agent_type`, nothing this hook could read to tell whose
// context it is looking at. `SubagentStart` carries both fields; `PreCompact`
// carries neither.
//
// Measured, with the auto rule set to exit 2: a `general-purpose` subagent
// reading twelve files died with `Agent terminated early due to an API error:
// Prompt is too long`, while the parent session was untouched and reported the
// error. (A subagent can die of that with nothing refusing anything, when one
// tool result crosses the ceiling in a single step and the compaction fires too
// late to help. Refusing is sufficient to kill one, not necessary.)
//
// So a blocking `auto` rule does not merely risk wedging the orchestrator. It
// kills long-running implementation agents, in a repository whose hook settings
// are tracked and therefore reach every worktree. Nothing in this file can
// distinguish that case, which is the second independent reason the rule below
// is unconditional rather than careful.
//
// AND THE FAR SIDE REACHES THEM, WHICH IS WHY THE INJECTED BLOCK IS ADDRESSED
// A subagent's compaction fires `SessionStart` with `source: "compact"` like
// any other, and the stdout lands in *that subagent's* resumed context.
// Measured: three subagent compactions, three injections 0.3s later, in a
// session whose own context never compacted, and the marker came back in the
// agent's report. #124's survey recorded the opposite; ADR 0042 has why, and it
// comes down to a compaction that died before it completed.
//
// So this file talks to an implementation agent every time one compacts in a
// repository where it is wired, and it cannot tell that is who it is talking
// to. See the block above `sessionStart` below.
//
// WHAT THIS DOES NOT COVER
// **Telling you that an agent compacted.** Nothing reaches the orchestrator: no
// event, nothing in your transcript, nothing on the Task result. It is on the
// record afterwards, in the agent's own transcript rather than yours, and
// `references/continuity.md` has the command. Keep briefs self-contained, put
// their durable half in the issue so a compacted agent can re-read it, and keep
// dispatches short enough not to find out.
//
// **A handoff nobody wrote.** This file checks a file's age and refuses one
// command over it. Whether the words in it are worth carrying is not a thing a
// hook can see, and the failure this whole mechanism is aimed at — a handoff
// written under pressure that is confidently wrong — looks perfectly fresh from
// here.
//
// **Merges you have not fetched.** The count below reads the local default
// branch, so it is a floor and never a ceiling: work that landed and has not
// been pulled is invisible, and the handoff is staler than this says.
//
// **An age in a checkout git cannot be asked about.** Where there is no
// repository to question, a file's own timestamp is the only clock and it is
// not a sound one — see the block above `writtenAt`. Both hooks then say they
// cannot tell, refuse nothing, and inject the handoff with that said in place
// of a number.
//
// **Whether it is loaded.** See --probe.

// ---------------------------------------------------------------------------
// The knobs
// ---------------------------------------------------------------------------

// Relative to the session's directory. In guest mode this is not committable
// and it does not belong in the host's tree; where it goes instead is the
// question issue #122 is answering, and this line is how that answer arrives.
const HANDOFF = 'docs/process/handoff.md'

const DEFAULT_BRANCH = 'main'

// Two clocks, because a repository can be busy without time passing and the
// other way round. Either one alone makes the handoff stale.
//
// Five merges rather than one: a handoff that has to be rewritten after every
// merge is a handoff nobody writes. The number comes from the failure it is
// calibrated against — the worked example in docs/process/handoff.md was
// written at a calm moment and was wrong about its largest claim within the
// hour, because eight issues closed underneath it.
const STALE_AFTER_MERGES = 5
const STALE_AFTER_HOURS = 8

// ---------------------------------------------------------------------------
// Reading the handoff's age
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

// The payload carries the session's `cwd`, so the path is resolved against a
// measured field rather than against an environment variable that may name a
// different checkout. A hook fired from a worktree and a hook fired from the
// main checkout are two different sessions with two different answers, and
// guessing which is a defect this project has already shipped once.
const resolveHandoff = (cwd) => (isAbsolute(HANDOFF) ? HANDOFF : join(cwd, HANDOFF))

// Everything here runs inside a hook, where an exception is not a useful
// outcome: a crash on a repository with no git, or a shallow clone, or a
// default branch under another name, would be indistinguishable to the reader
// from the hook not being wired. Every failure to measure reports as "cannot
// tell", and "cannot tell" never refuses.
//
// So git is asked through this, which never throws and hands back the exit code
// beside the output. The code carries meaning below and is not merely a
// success flag: `git diff --quiet` says "these bytes differ" by exiting 1, and
// reading that 1 as "git could not be asked" would invert the answer.
function git(cwd, args) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { code: 0, out }
  } catch (error) {
    return { code: typeof error.status === 'number' ? error.status : null, out: '' }
  }
}

// WHEN THE HANDOFF WAS WRITTEN, WHICH IS NOT WHAT mtime ANSWERS
// `git worktree add`, `git clone` and any checkout that changes the file write
// the committed bytes out with today's timestamp. Take the age from mtime alone
// and every one of them reports a handoff written moments ago. Measured on a
// twelve-day-old file: the main checkout said "288h old, 5 commits on main
// since" and a worktree cut from it said "under an hour old, 0 commits" about
// the same bytes. Both numbers reset together, because the count below is taken
// *since that same instant*, so there is no second opinion built in. The reader
// most likely to be in a worktree is a dispatched implementation agent, which is
// the reader least equipped to notice.
//
// The answer is not a second clock bolted alongside the first. It is that git
// already knows which of the two applies, and the question is one line long:
// **could a checkout have written these bytes?**
//
//   not tracked here    No. A checkout only writes files git tracks. That is an
//                       untracked file, and it is also the guest-mode handoff,
//                       which lives outside the worktree entirely (ADR 0037) and
//                       which no checkout of this repository ever touches.
//                       mtime is a real write.
//
//   tracked, modified   No. A checkout writes the *committed* bytes and these
//                       are not them, so someone wrote this here, after any
//                       checkout. That is the mid-session top-up the loop asks
//                       for continuously, which makes it the normal state rather
//                       than the exception. mtime is a real write.
//
//   tracked, clean      Yes, and nothing on disk records whether it did. The
//                       bytes are the commit's, so the commit is what dates
//                       them, and mtime is evidence about the last checkout.
//
// This is why `git log -1 --format=%ct` was rejected on the issue and is used
// here anyway. The objection was sound and it is about the uncommitted top-up,
// where last-commit is not last-edit. That is precisely the case this never
// reaches it in.
//
// Nothing to ask, and the answer is that this cannot be measured — not a
// timestamp with a caveat attached, because the whole content of the caveat
// would be that the number may be a checkout's, which is the false confidence
// this exists to remove.
//
// It hands back which witness answered as well as when, because the count below
// needs to know: a commit can be counted from exactly, where a timestamp can
// only open a window.
function writtenAt(cwd, path, stat) {
  const onDisk = { at: stat.mtimeMs, commit: null }

  if (git(cwd, ['rev-parse', '--git-dir']).code !== 0) return null
  if (git(cwd, ['ls-files', '--error-unmatch', '--', path]).code !== 0) return onDisk

  // Anything but a clean verdict is the file, including the 128 from a
  // repository whose HEAD is unborn: with no commit, nothing has ever been
  // checked out over this file either.
  if (git(cwd, ['diff', '--quiet', 'HEAD', '--', path]).code !== 0) return onDisk

  const dated = git(cwd, ['log', '-1', '--format=%ct %H', '--', path]).out.trim()
  const [seconds, commit] = dated.split(' ')
  const at = Number.parseInt(seconds, 10)
  return Number.isFinite(at) && commit ? { at: at * 1000, commit } : null
}

// A commit range where there is a commit, and a date window otherwise. The
// handoff's own commit is not a commit *since* the handoff, and a `--since`
// window opened at that commit's own timestamp includes it — so a handoff
// committed a minute ago would otherwise read as already one merge behind
// itself, and the threshold would be reached a merge early for ever after.
function mergesSince(cwd, written) {
  const range = written.commit
    ? [`${written.commit}..${DEFAULT_BRANCH}`]
    : [`--since=${new Date(written.at).toISOString()}`, DEFAULT_BRANCH]

  const result = git(cwd, ['log', '--first-parent', '--format=%h', ...range, '--'])
  if (result.code !== 0) return null
  return result.out.split('\n').filter((line) => line.trim() !== '').length
}

function readHandoff(cwd) {
  const path = resolveHandoff(cwd)
  let stat
  try {
    stat = statSync(path)
  } catch {
    return { path, present: false }
  }

  const text = () => readFileSync(path, 'utf8')
  const written = writtenAt(cwd, path, stat)

  // Cannot tell, so nothing is claimed and nothing is refused. The two numbers
  // go together deliberately: the count is taken since the same instant, so an
  // unknown instant makes the count unknown rather than zero, and zero is the
  // reading that says "nothing has happened, carry on".
  if (written === null) {
    return { path, present: true, hours: null, merges: null, stale: false, text }
  }

  const hours = (Date.now() - written.at) / 3_600_000
  const merges = mergesSince(cwd, written)
  return {
    path,
    present: true,
    hours,
    merges,
    stale: hours >= STALE_AFTER_HOURS || (merges !== null && merges >= STALE_AFTER_MERGES),
    text,
  }
}

const age = (state) => {
  if (state.hours === null) {
    return (
      'of an age nothing here can measure: git could not be asked to date its ' +
      'contents, and a file timestamp alone cannot be told apart from a ' +
      'checkout. Treat it as possibly very old'
    )
  }

  const hours = state.hours < 1 ? 'under an hour' : `${Math.round(state.hours)}h`
  const merges =
    state.merges === null
      ? `commits since could not be counted (no ${DEFAULT_BRANCH} here, or no git)`
      : `${state.merges} commit${state.merges === 1 ? '' : 's'} on ${DEFAULT_BRANCH} since`
  return `${hours} old, ${merges}`
}

// ---------------------------------------------------------------------------
// PreCompact: the one refusal
// ---------------------------------------------------------------------------

// What the summariser is asked to keep. PreCompact stdout on an allowed
// compaction is used as instructions to the summariser: measured on 2.1.282, a
// marker printed here came back in `compact_summary` three times out of three.
// That is not documented, so nothing depends on it. The handoff is printed back
// by SessionStart whether or not the summariser listened; this only makes the
// summary it lands next to point the same way.
//
// Addressed to both readers, for the reason the SessionStart block is: an
// automatic compaction fires for a subagent's context too, with nothing in the
// payload to say so, and a summary that turned an implementation agent into
// the orchestrator would be the wrong-reader failure arriving a step earlier.
const KEEP_IN_THE_SUMMARY =
  'When summarising, keep these specifics verbatim rather than their gist.\n' +
  'If this conversation is an orchestrator running the orchestrated-delivery\n' +
  `loop: say so, keep the handoff path (${HANDOFF}), which step of the loop was in\n` +
  'progress, which issues and pull requests were in flight and with which agents,\n' +
  "and anything the owner said in their own words. If it is an implementation\n" +
  'agent working one issue: keep the issue number, the branch, the evidence bar\n' +
  'and the report contract from its brief, and do not describe it as the\n' +
  'orchestrator.\n'

function preCompact(payload) {
  // Unconditional, and the two reasons are at the top of this file. Read them
  // before narrowing this line: both were measured, and one of them kills
  // subagents rather than the session you are sitting in. The write before it
  // cannot refuse anything: a PreCompact hook refuses by exit code, and this
  // one's is 0 on every path that reaches it.
  if (payload.trigger !== 'manual') {
    process.stdout.write(KEEP_IN_THE_SUMMARY)
    process.exit(0)
  }

  const state = readHandoff(payload.cwd ?? process.cwd())

  // The first compaction of a fresh session must not wedge, and there is
  // nothing to be stale about yet.
  if (!state.present || !state.stale) {
    process.stdout.write(KEEP_IN_THE_SUMMARY)
    process.exit(0)
  }

  process.stderr.write(
    `Blocked: ${HANDOFF} is ${age(state)}.\n` +
      '\n' +
      'Compaction keeps the gist and loses the specifics, and the specifics are the\n' +
      'part nobody can reconstruct from the repository afterwards: which agent is on\n' +
      'which issue, what the owner said and when, which assumption a brief was\n' +
      'written under.\n' +
      '\n' +
      'Top the handoff up, then run /compact again. It is a snapshot with a decay\n' +
      'note and not a source of truth — say where the work stopped, what is\n' +
      'dispatched, what is waiting on the owner, and at which commit that was true.\n' +
      '\n' +
      'Only /compact is refused here. Automatic compaction is never blocked, because\n' +
      'a refused auto-compact cannot be satisfied: the session then fails every\n' +
      'request with "Prompt is too long" and this hook goes on refusing it. See\n' +
      'references/continuity.md.\n',
  )
  process.exit(2)
}

// ---------------------------------------------------------------------------
// SessionStart: the far side
// ---------------------------------------------------------------------------

// stdout from a SessionStart hook is added to the resumed context, up to 10,000
// characters. Over that, the harness saves it to a file and injects the path
// and a 2KB preview instead. Measured on 2.1.282, 23KB of plain stdout and
// 22.5KB of `additionalContext` alike: the first line arrived, the middle and
// the last did not. (2.1.228 carried 1 MB whole; the cap arrived since.)
//
// A handoff cut at 2KB is the failure this file exists to prevent — it lost
// its second half and the reader cannot tell. So the block is built whole
// first, and if it would not fit, the handoff's text is left out on purpose
// and the reader is told to Read the file, which is where every word of it
// still is. Everything the reader must act on comes before the handoff either
// way, so it is inside the cap in both shapes.
//
// Only the `compact` matcher, deliberately. On `startup` and `resume` the file
// is on disk and can be read; after a compaction the model has a summary that
// does not know the file exists, which is the case where injection is the only
// thing that works.
//
// THE READER MIGHT NOT BE THE ORCHESTRATOR, AND THIS HOOK CANNOT TELL
// This fires after a *subagent's* compaction too, and what it prints lands in
// that subagent's resumed context. Measured: a marker printed here came back in
// the report of an implementation agent that had compacted, in a session whose
// own context never filled. The payload carries `source: "compact"` and no
// `agent_id`, and its `transcript_path` is the parent's file either way, so
// there is nothing here to branch on.
//
// The block is therefore addressed to both readers. Guessing wrong is the
// expensive outcome: an implementation agent handed the orchestrator's handoff
// as though it were its own state will start doing the orchestrator's next
// steps, and it is the reader least able to notice, having just lost its brief.
const WHOEVER_YOU_ARE =
  'This hook cannot tell whose context was compacted, so read this part first.\n' +
  '\n' +
  'IF YOU WERE DISPATCHED AS AN IMPLEMENTATION AGENT: what follows is the\n' +
  "orchestrator's handoff and not your work. Do not act on it, do not merge, and\n" +
  'do not pick up work it describes. What you just lost is your own brief, whose\n' +
  'specifics the summariser drops while keeping its shape, so re-read the issue\n' +
  'you were dispatched against and the files it names before you continue, and\n' +
  'say in your report that your context was compacted.\n' +
  '\n' +
  'IF YOU ARE THE ORCHESTRATOR:\n'

// The ritual the owner typed by hand after every /compact, for weeks, because
// nothing else said it: re-read the handoff, re-read the process, check the
// real state, and carry on without being asked. Every compaction on record in
// those sessions was manual, so this block never once arrived without the
// owner's own sentence beside it. With the threshold set, it now arrives alone,
// mid-turn, and the turn continues — so it has to say "continue" itself.
const RESUME =
  'Then, before acting on anything you remember:\n' +
  '1. If the orchestrated-delivery skill is not in your context, load it again.\n' +
  '2. Re-read docs/process/orchestrating.md and the process docs it points to.\n' +
  '3. Audit the real state: open issues, open pull requests and their checks,\n' +
  '   and which agents are still running. Where it disagrees with the handoff,\n' +
  '   the repository is right.\n' +
  '4. Continue the loop from where the handoff says it stopped. Do not wait to\n' +
  '   be told to; this compaction was planned for.\n'

// The harness's cap on what a hook may inject, in characters (hooks.md). The
// margin is for the line endings and quoting nobody here controls.
const INJECTION_CAP = 10_000
const INJECTION_BUDGET = INJECTION_CAP - 500

function sessionStart(payload) {
  const state = readHandoff(payload.cwd ?? process.cwd())

  if (!state.present) {
    process.stdout.write(
      'The context was just compacted.\n' +
        '\n' +
        WHOEVER_YOU_ARE +
        `there is no handoff at ${HANDOFF}, so nothing was carried across besides the\n` +
        'summary you are holding. Re-read the backlog and the log before acting on\n' +
        'anything you think you remember, and write the handoff as part of this pass\n' +
        'so the next compaction costs less than this one did.\n' +
        '\n' +
        RESUME,
    )
    process.exit(0)
  }

  const opening = (where) =>
    'The context was just compacted.\n' +
    '\n' +
    WHOEVER_YOU_ARE +
    `${where}, ${age(state)}.\n` +
    '\n' +
    'It is a snapshot, not a source of truth. Where it disagrees with the\n' +
    'repository the repository is right, and the summary you are holding is lossy\n' +
    'in ways neither of you can see. Top this file up as part of the loop rather\n' +
    'than at the next boundary.\n' +
    '\n' +
    RESUME

  const text = state.text()
  const whole =
    opening(`below is ${HANDOFF} verbatim`) +
    '\n' +
    `----- ${HANDOFF} -----\n` +
    text +
    `\n----- end ${HANDOFF} -----\n`

  if (whole.length <= INJECTION_BUDGET) {
    process.stdout.write(whole)
    process.exit(0)
  }

  // Too long to carry whole, so it is not carried in part either.
  process.stdout.write(
    opening(`${HANDOFF} is ${text.length} characters, which is over the harness's ` +
      `${INJECTION_CAP} character cap on what a hook may inject, so it is not printed here: ` +
      `Read ${state.path} in full, first`) +
      '\n' +
      'A preview would have been cut at 2KB without saying where. A handoff this long is\n' +
      'also carrying more than where the work stopped; move what is durable into the\n' +
      'backlog or a decision record when you next top it up.\n',
  )
  process.exit(0)
}

// ---------------------------------------------------------------------------
// PostToolUse: the warning before the threshold
// ---------------------------------------------------------------------------

// WHY A WARNING, WHEN THE HANDOFF IS SUPPOSED TO BE TOPPED UP ANYWAY
// Because it was not. Ten sessions of the owner's, and every compaction on
// record was one they typed, after first asking for the handoff to be updated.
// "Top it up as part of the loop" is an instruction, and an instruction is not
// a control (ADR 0004). The control is the threshold, which the harness owns.
// This buys the other half: a calm moment, some way before the threshold, at
// which the orchestrator is told the boundary is coming. It is still a prompt,
// and it is still the orchestrator that writes. ADR 0060.
//
// WHERE THE NUMBERS COME FROM
// No hook payload carries context usage or the window size. Measured on
// 2.1.282. So:
//
//   in use   The last main-thread assistant entry in the transcript, whose
//            `message.usage` input, cache-read and cache-creation tokens add up
//            to what was sent. The transcript is written asynchronously, so
//            this can be one call behind. Near a band edge that is a warning a
//            tool call late, which is fine for a warning.
//
//   window   CLAUDE_CODE_AUTO_COMPACT_WINDOW, the harness's own knob. Read,
//            not duplicated: settings `env` entries reach both the harness and
//            this hook (measured), so one line decides both.
//
//   percent  CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, likewise.
//
// A model-family table was the alternative, and it was declined. Transcript
// model ids carry no `[1m]`, and the same model runs at 200K or 1M depending
// on where it is served, so the table would be a guess that reads as a
// measurement. Where the two variables are not set, this says so once and warns
// nothing, because a guessed percentage is the "number with a caveat" the rest
// of this file refuses.
//
// THE PERCENTAGE IS OF THE WINDOW LESS A RESERVE
// The harness keeps 20,000 tokens of the window back for the summary, and the
// override is a percentage of what is left. Measured, not documented: a window
// of 100K, 200K and 1M logged `effectiveWindow` 80000, 180000 and 980000, and
// an override of 60 on 100K compacted with 51K in use, on the tool call that
// took it past 48K rather than 60K. If this moves, the warning
// moves with it by a few points, which is what the band's width absorbs.
const SUMMARY_RESERVE = 20_000

// How far below the compaction point the warning goes. Ten points of the
// effective window: 75% when compaction is at 85%, which is the owner's number.
// A top-up is a few thousand tokens of reading and writing, so on a 1M window
// this is a great deal of room and on the 100K minimum it is still 8,000 tokens.
const WARN_POINTS_BELOW = 10

// The transcript is read from the end, because this runs on every tool call in
// every session and every worktree agent where it is wired, and a transcript
// grows without bound. 64KB almost always holds the last assistant entry; one
// huge tool result can push it further back, so the window widens four times
// before giving up and saying nothing.
const TAIL_START = 64 * 1024
const TAIL_LIMIT = 4 * 1024 * 1024

function contextThreshold(env) {
  const window = Number.parseInt(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? '', 10)
  const percent = Number.parseInt(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ?? '', 10)
  if (!Number.isFinite(window) || !Number.isFinite(percent)) return null
  if (percent < 1 || percent > 100) return null

  // The harness clamps the window to 100K..1M rather than rejecting it (a value
  // like "500k" reads as 500 and becomes 100K), so the arithmetic here clamps
  // the same way instead of disagreeing with it.
  const effective = Math.min(Math.max(window, 100_000), 1_000_000) - SUMMARY_RESERVE
  return { effective, compactAt: percent, warnAt: Math.max(percent - WARN_POINTS_BELOW, 1) }
}

// null is "cannot tell", which warns nothing. A compaction boundary found
// before any usage means the context was just replaced, so what was in use
// before it is no longer the answer.
function contextInUse(transcriptPath) {
  let fd
  try {
    fd = openSync(transcriptPath, 'r')
  } catch {
    return null
  }

  try {
    const size = fstatSync(fd).size
    for (let span = TAIL_START; ; span *= 4) {
      const start = Math.max(0, size - span)
      const buffer = Buffer.alloc(size - start)
      readSync(fd, buffer, 0, buffer.length, start)
      const lines = buffer.toString('utf8').split('\n')
      if (start > 0) lines.shift() // cut mid-line

      for (let n = lines.length - 1; n >= 0; n -= 1) {
        const line = lines[n]
        const boundary = line.includes('"compact_boundary"')
        if (!boundary && !line.includes('"usage"')) continue

        let entry
        try {
          entry = JSON.parse(line)
        } catch {
          continue
        }
        if (entry.isSidechain) continue
        if (entry.subtype === 'compact_boundary') return entry.compactMetadata?.postTokens ?? 0

        const usage = entry.type === 'assistant' ? entry.message?.usage : null
        const used =
          (usage?.input_tokens ?? 0) +
          (usage?.cache_read_input_tokens ?? 0) +
          (usage?.cache_creation_input_tokens ?? 0)
        if (used > 0) return used
      }

      if (start === 0 || span >= TAIL_LIMIT) return null
    }
  } finally {
    closeSync(fd)
  }
}

// One small file per session, so the warning is said once per climb rather
// than on every tool call past the line. It is cleared by the context falling
// back below the line, which is what a compaction does, rather than by any
// event: SessionStart fires for subagents' compactions as well, under the same
// session id, and would clear the orchestrator's state at the wrong moment.
const bandFile = (sessionId) =>
  join(tmpdir(), 'b-fac-context', `${String(sessionId).replace(/[^\w-]/g, '_')}.json`)

function readBand(sessionId) {
  try {
    return JSON.parse(readFileSync(bandFile(sessionId), 'utf8'))
  } catch {
    return {}
  }
}

function writeBand(sessionId, band) {
  try {
    mkdirSync(join(tmpdir(), 'b-fac-context'), { recursive: true })
    writeFileSync(bandFile(sessionId), JSON.stringify(band))
  } catch {
    // Unrecorded, the warning may repeat on the next call. That is noise, not
    // a failure, and nothing here is worth crashing a tool call over.
  }
}

const inject = (text) =>
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }),
  )

function postToolUse(payload) {
  // A subagent's handoff is its issue. Telling an implementation agent to top
  // up the orchestrator's handoff is the wrong-reader failure ADR 0042 exists
  // to prevent, and a subagent's tool calls are the only ones whose payload
  // says whose they are. First, and before any file is opened, because this is
  // every tool call every agent makes.
  if (payload.agent_id) process.exit(0)
  if (!payload.session_id) process.exit(0)

  const threshold = contextThreshold(process.env)
  const band = readBand(payload.session_id)

  if (threshold === null) {
    if (!band.unwatched) {
      writeBand(payload.session_id, { ...band, unwatched: true })
      inject(
        'Context usage is not being watched in this session: CLAUDE_CODE_AUTO_COMPACT_WINDOW ' +
          'and CLAUDE_AUTOCOMPACT_PCT_OVERRIDE are not both set, so there is no threshold to ' +
          'warn ahead of. Top the handoff up as part of the loop. (Said once per session; ' +
          'references/continuity.md has the setting.)',
      )
    }
    process.exit(0)
  }

  const used = contextInUse(payload.transcript_path)
  if (used === null) process.exit(0)

  const percent = Math.floor((used / threshold.effective) * 100)
  if (percent < threshold.warnAt) {
    if (band.warned) writeBand(payload.session_id, { ...band, warned: false })
    process.exit(0)
  }
  if (band.warned) process.exit(0)

  writeBand(payload.session_id, { ...band, warned: true })
  inject(
    `Context is at ${percent}% of the ${threshold.effective}-token auto-compact window, and ` +
      `automatic compaction is set for ${threshold.compactAt}%. Top the handoff ` +
      `(${HANDOFF}) up now, while you can still see the detail it needs: where the work ` +
      'stopped, what is dispatched to whom, what is waiting on the owner, and at which ' +
      'commit that was true. Then carry on with the loop. The compaction will not be ' +
      'refused, and the handoff is printed back into the context after it, with what to ' +
      'do next. This is said once per climb.',
  )
  process.exit(0)
}

// ---------------------------------------------------------------------------
// --probe, and the hook
// ---------------------------------------------------------------------------

// This probe answers a smaller question than the one in guard-merge.mjs, and
// the difference is worth stating rather than glossing.
//
// That probe is refused by the guard, so being refused proves the guard is
// loaded in this process. Nothing here can do that: PreCompact never sees a
// command line, so there is no line for it to refuse, and a compaction is not
// something you can ask for on demand with a stale handoff to hand.
//
// What this prints is the verdict the rules would give right now. That is the
// written state and not the loaded one, and those are different (ADR 0027).
//
// The loaded state has one honest answer and it is free: after any compaction,
// look for the injected block in your own context. It is either in this
// compaction's context or it is not, and unlike a heartbeat file there is
// nothing to be stale — the far side leaves its evidence in the only place that
// cannot be read from a previous process.
//
// No npm guard here, unlike the other probes in this skill. Those refuse to run
// under a package script because a runner hides the file name from a hook that
// matches on it; this one is not matched on anything, so a runner changes
// nothing about its answer.
function probe() {
  const state = readHandoff(process.cwd())

  if (!state.present) {
    console.log(`No handoff at ${state.path}.`)
    console.log('')
    console.log('Nothing is refused: the first compaction of a fresh session must not wedge,')
    console.log('and an absent file is not a stale one. SessionStart would inject a note')
    console.log('saying the summary is all there is.')
  } else if (state.hours === null) {
    console.log(`CANNOT TELL: ${state.path} is ${age(state)}.`)
    console.log('')
    console.log('Nothing is refused, because an age that cannot be measured is not a stale')
    console.log('handoff. Reading it as fresh is the one answer this must not give.')
  } else if (state.stale) {
    console.log(`STALE: ${state.path} is ${age(state)}.`)
    console.log('')
    console.log(`Thresholds: ${STALE_AFTER_MERGES} commits or ${STALE_AFTER_HOURS} hours.`)
    console.log('A manual /compact would be refused. An automatic one would not be.')
  } else {
    console.log(`Current: ${state.path} is ${age(state)}.`)
    console.log('')
    console.log(`Thresholds: ${STALE_AFTER_MERGES} commits or ${STALE_AFTER_HOURS} hours.`)
  }

  console.log('')
  console.log('This is the rules half. It says nothing about whether the hooks are loaded')
  console.log('in this process, which is a separate state and is answered by seeing the')
  console.log('injected handoff block in your context after the next compaction.')
  process.exit(state.present && state.stale ? 1 : 0)
}

if (process.argv.includes('--probe')) {
  probe()
} else {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0) // An unparseable payload is not this hook's problem.
  }

  // One file, wired to every event, deciding from the payload rather than from
  // an argv flag. A flag is a setup step that gets copied wrong, and the wrong
  // half of this file firing on the wrong event is a refusal nobody expects.
  if (payload.hook_event_name === 'PreCompact') preCompact(payload)
  if (payload.hook_event_name === 'SessionStart') sessionStart(payload)
  if (payload.hook_event_name === 'PostToolUse') postToolUse(payload)
  process.exit(0)
}
