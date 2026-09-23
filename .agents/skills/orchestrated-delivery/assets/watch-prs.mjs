#!/usr/bin/env node
// Watch every open pull request the operator authored, and print one line per
// thing that happened to one of them that somebody has to act on.
//
// WHAT THIS PREVENTS
// A pull request that waits on the factory while the factory waits on the
// owner. A reviewer requests changes, a check goes red, a branch falls behind,
// and nothing in the loop learns of it until the owner comes back and says "go
// look at the pull requests again". The feedback was on the forge the whole
// time; nobody asked. `references/watching.md` has the response half, which is
// the part that matters: each line here is meant to restart the loop on that
// pull request, not to be read and acknowledged.
//
// HOW IT IS MEANT TO RUN
// As the command of Claude Code's Monitor tool, where every stdout line becomes
// a notification that wakes the session. Monitor kills a command after thirty
// minutes at most, so this exits by itself before then (`--for`, default 28)
// and its last line is the command that re-arms it. That line is an event too,
// which is the point: an expiry the orchestrator is told about in the same
// channel as the feedback is one it cannot miss for lack of looking.
//
//   node watch-prs.mjs                     # poll every 60s for 28 minutes
//   node watch-prs.mjs --once              # one poll, print, exit. For a cron,
//                                          # a /loop, or a harness with no Monitor
//   node watch-prs.mjs --repo=o/r --repo=o/s --author=login --interval=90
//
// WHAT COUNTS AS FEEDBACK, WHICH IS DECIDED BY WHO WROTE IT
// The factory posts as the operator's own GitHub login, and so does the
// operator. Measured on a real repository: the orchestrator's review records,
// its replies and the owner's rulings all carried one login, while change
// requests came from a teammate's reviews and CI posted plans as a bot. So:
//
//   - anything authored by a login other than the operator's is feedback;
//   - a bot's *comment* is not (plans, coverage, release notes), but a bot's
//     *review* is, because a review is a request by construction;
//   - the operator's own words are ignored, since most of them are the
//     factory's own replies and reacting to those is a loop. The owner reaches
//     the factory from the same login by starting a comment with `/factory`.
//
// That last rule is the loop guard. Nothing the factory posts can wake it
// again, whatever it says, unless it deliberately opens with the directive.
//
// NOTHING IS LOST BETWEEN SESSIONS
// What has been reported lives in the git common directory, beside the machine
// record (ADR 0037), so a new session and every worktree share one answer. A
// pull request seen for the first time is baselined, and anything a reviewer
// wrote after the operator's last word or last push is reported as `(before
// watch)`. That is the reprompt this exists to remove: feedback that arrived
// while nothing was watching is not treated as history.
//
// A line is printed before the state that records it is saved. A kill between
// the two repeats a line on the next run; the other order would drop one.
//
// ONE WATCHER PER REPOSITORY
// Two sessions sharing the state file would split the events between them, and
// each would believe it had seen everything. The file names its holder, and a
// second watcher refuses while that holder's process is alive and its
// heartbeat is recent. `--take-over` is for a holder you know is gone.
//
// WHAT THIS DOES NOT SEE
//   - An edit to a comment already reported. Identity is the comment id.
//   - A review still pending on GitHub. The API returns nothing until the
//     reviewer submits it, which is the reviewer's choice and correct.
//   - Which account pushed a new head. `pushed` means the commit is not in this
//     machine's object store, so a push from this machine by anyone is silent,
//     and a push from the web editor or another machine is reported.
//
// It only reads. Every call is `gh pr list`, `gh pr view` or a `gh api` GET,
// so guest mode's gate allows all of it, and a webhook, which would be a write
// to somebody else's repository, is not needed. ADR 0059.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DIRECTIVE = '/factory'

// A check conclusion that means the pull request cannot land as it stands.
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

export function classifyChecks(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return { state: 'none', failing: [] }
  const failing = []
  let pending = false
  for (const check of rollup) {
    const name = check.name ?? check.context ?? '?'
    if (check.__typename === 'StatusContext' || check.state !== undefined) {
      if (FAILED.has(check.state)) failing.push(name)
      else if (check.state !== 'SUCCESS') pending = true
      continue
    }
    if (check.status !== 'COMPLETED') pending = true
    else if (FAILED.has(check.conclusion)) failing.push(name)
  }
  // Red is reported while other checks are still running: a failure is final
  // for this head, and waiting for the slowest check only delays the fix.
  if (failing.length > 0) return { state: 'failing', failing }
  return { state: pending ? 'pending' : 'passing', failing }
}

export function snippet(body, max = 140) {
  const text = String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function isBotUser(user) {
  if (!user) return false
  return user.type === 'Bot' || /\[bot\]$/.test(user.login ?? '')
}

// Whether a comment is something to act on, and under which name. Returns
// null for anything the loop must not react to.
export function commentKind(comment, { login, includeBots }) {
  const author = comment.user?.login
  if (author === login) {
    return String(comment.body ?? '').trimStart().toLowerCase().startsWith(DIRECTIVE) ? 'directive' : null
  }
  if (!includeBots && isBotUser(comment.user)) return null
  return comment.pull_request_review_id ? 'inline-comment' : 'comment'
}

const REVIEW_KIND = {
  CHANGES_REQUESTED: 'changes-requested',
  APPROVED: 'approved',
  COMMENTED: 'reviewed',
  DISMISSED: 'dismissed',
}

function prNumberOf(comment) {
  const url = comment.issue_url ?? comment.pull_request_url ?? ''
  const match = /\/(\d+)$/.exec(url)
  return match ? Number(match[1]) : null
}

function time(value) {
  const t = Date.parse(value ?? '')
  return Number.isNaN(t) ? 0 : t
}

// One repository, one poll. Everything that talks to the outside world comes
// in through `gh` and `hasCommit`, so the rules can be tested without a forge.
//
// `gh(args)` returns parsed JSON. `prev` is this repository's saved state, or
// undefined the first time it is watched.
export function pollRepo({ gh, hasCommit, repo, login, prev, now, includeBots = false }) {
  const events = []
  const seenBefore = prev?.prs ?? {}
  const next = { lastPoll: new Date(now).toISOString(), prs: {} }
  const ctx = { login, includeBots }

  const open = gh([
    'pr', 'list', '-R', repo, '--author', login, '--state', 'open', '--limit', '100',
    '--json', 'number,title,url,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,reviews',
  ])

  // Repository-wide, since the last poll, with a margin for clock skew and for
  // a comment created just before the previous poll's read. Ids deduplicate
  // what the margin reads twice.
  let issueComments = []
  let inlineComments = []
  if (prev?.lastPoll) {
    const since = new Date(time(prev.lastPoll) - 5 * 60_000).toISOString()
    issueComments = pages(gh(['api', `repos/${repo}/issues/comments?since=${since}&per_page=100`, '--paginate', '--slurp']))
    inlineComments = pages(gh(['api', `repos/${repo}/pulls/comments?since=${since}&per_page=100`, '--paginate', '--slurp']))
  }

  for (const pr of open) {
    const key = String(pr.number)
    const before = seenBefore[key]
    const seen = new Set(before?.seen ?? [])
    const emit = (kind, fields) => events.push({ repo, number: pr.number, kind, ...fields })

    let reviews = pr.reviews ?? []
    let issue = issueComments.filter((c) => prNumberOf(c) === pr.number)
    let inline = inlineComments.filter((c) => prNumberOf(c) === pr.number)
    let catchUpAfter = null

    if (!before) {
      // First sight. Read this pull request's whole conversation once, and
      // treat as pending only what arrived after the operator last spoke or
      // pushed, which is what "nobody has answered this yet" means here.
      issue = pages(gh(['api', `repos/${repo}/issues/${pr.number}/comments?per_page=100`, '--paginate', '--slurp']))
      inline = pages(gh(['api', `repos/${repo}/pulls/${pr.number}/comments?per_page=100`, '--paginate', '--slurp']))
      const head = gh(['api', `repos/${repo}/commits/${pr.headRefOid}`])
      catchUpAfter = Math.max(
        time(head?.commit?.committer?.date),
        ...reviews.filter((r) => r.author?.login === login).map((r) => time(r.submittedAt)),
        ...[...issue, ...inline].filter((c) => c.user?.login === login).map((c) => time(c.created_at)),
      )
    }
    const fresh = (id, at) => {
      if (seen.has(id)) return false
      seen.add(id)
      return catchUpAfter === null || time(at) > catchUpAfter
    }
    const pending = catchUpAfter !== null

    // Reviews first, so the inline comments a review carries fold into it.
    const folded = new Map()
    for (const review of reviews) {
      const id = `r:${review.id}`
      if (!fresh(id, review.submittedAt)) continue
      if (review.author?.login === login) continue
      const kind = REVIEW_KIND[review.state] ?? 'reviewed'
      // A reply in an inline thread arrives as an empty COMMENTED review
      // wrapping one comment. The comment is the event, not the wrapper.
      if (kind === 'reviewed' && !String(review.body ?? '').trim()) continue
      folded.set(review.author?.login, { review, count: 0 })
      // The pull request's own URL: `gh pr list` gives a review its GraphQL
      // node id, which is not the number GitHub's review anchors use.
      emit(kind, { by: review.author?.login, text: snippet(review.body), url: pr.url, pending, review })
    }
    for (const comment of inline) {
      const id = `i:${comment.id}`
      if (!fresh(id, comment.created_at)) continue
      const kind = commentKind(comment, ctx)
      if (!kind) continue
      const holder = kind === 'inline-comment' && folded.get(comment.user?.login)
      if (holder && !comment.in_reply_to_id) {
        holder.count += 1
        continue
      }
      emit(kind, { by: comment.user?.login, text: snippet(comment.body), url: comment.html_url, where: comment.path, pending })
    }
    for (const comment of issue) {
      const id = `c:${comment.id}`
      if (!fresh(id, comment.created_at)) continue
      const kind = commentKind(comment, ctx)
      if (!kind) continue
      emit(kind, { by: comment.user?.login, text: snippet(comment.body), url: comment.html_url, pending })
    }
    for (const event of events) {
      if (event.review) {
        const holder = [...folded.values()].find((h) => h.review === event.review)
        if (holder?.count) event.inline = holder.count
        delete event.review
      }
    }

    // State transitions. Each is reported when it starts, not while it lasts.
    const checks = classifyChecks(pr.statusCheckRollup)
    const sameHead = before?.head === pr.headRefOid
    if (checks.state === 'failing' && !(sameHead && before?.checks === 'failing')) {
      emit('checks-failed', { text: checks.failing.join(', '), url: `${pr.url}/checks` })
    }
    if (checks.state === 'passing' && before && !(sameHead && before.checks === 'passing')) {
      emit('checks-passed', { url: pr.url })
    }
    // UNKNOWN is GitHub still computing, usually just after a push. It carries
    // no news, so the last known answer stands rather than resetting to it.
    const mergeable = pr.mergeable === 'UNKNOWN' ? (before?.mergeable ?? 'UNKNOWN') : pr.mergeable
    if (mergeable === 'CONFLICTING' && before?.mergeable !== 'CONFLICTING') {
      emit('conflict', { url: pr.url })
    }
    const mergeState = pr.mergeStateStatus === 'UNKNOWN' ? (before?.mergeState ?? 'UNKNOWN') : pr.mergeStateStatus
    if (mergeState === 'BEHIND' && before?.mergeState !== 'BEHIND') {
      emit('behind', { url: pr.url })
    }
    if (before && !sameHead && hasCommit && !hasCommit(pr.headRefOid)) {
      emit('pushed', { text: `head is now ${pr.headRefOid.slice(0, 8)}, not a commit made on this machine`, url: `${pr.url}/commits` })
    }

    next.prs[key] = {
      title: pr.title,
      head: pr.headRefOid,
      checks: checks.state,
      mergeable,
      mergeState,
      seen: [...seen],
    }
  }

  // Whatever was open last time and is not now has left the watch.
  const openNumbers = new Set(open.map((pr) => String(pr.number)))
  for (const key of Object.keys(seenBefore)) {
    if (openNumbers.has(key)) continue
    const view = gh(['pr', 'view', key, '-R', repo, '--json', 'state,url'])
    const kind = view?.state === 'MERGED' ? 'merged' : view?.state === 'CLOSED' ? 'closed' : null
    if (kind) events.push({ repo, number: Number(key), kind, text: seenBefore[key].title, url: view.url })
    else if (view?.state === 'OPEN') next.prs[key] = seenBefore[key]
  }
  return { events, next, open: open.map((pr) => pr.number) }
}

function pages(slurped) {
  if (!Array.isArray(slurped)) return []
  return slurped.flatMap((page) => (Array.isArray(page) ? page : [page]))
}

export function formatEvent(event, { multiRepo = false } = {}) {
  const ref = multiRepo ? `${event.repo}#${event.number}` : `#${event.number}`
  const parts = [ref, event.kind]
  if (event.by) parts.push(`by ${event.by}`)
  if (event.pending) parts.push('(before watch)')
  if (event.where) parts.push(`on ${event.where}`)
  if (event.inline) parts.push(`with ${event.inline} inline comment${event.inline === 1 ? '' : 's'}`)
  let line = parts.join(' ')
  if (event.text) line += `: ${JSON.stringify(event.text)}`
  if (event.url) line += ` ${event.url}`
  return line
}

// The holder rule. A holder counts only while its process exists and it has
// written a heartbeat recently; either alone is wrong. A pid is reused, and a
// heartbeat outlives a watcher that Monitor killed seconds ago.
export function holderIsLive(holder, { pid, now, interval, alive }) {
  if (!holder || holder.pid === pid) return false
  if (now - time(holder.beat) > interval * 3 * 1000) return false
  return alive(holder.pid)
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function parseArgs(argv) {
  const options = { repos: [], interval: 60, minutes: 28, once: false, includeBots: false, takeOver: false }
  for (const arg of argv) {
    const [flag, value] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
    if (flag === '--repo') options.repos.push(value)
    else if (flag === '--author') options.author = value
    else if (flag === '--interval') options.interval = Math.max(30, Number(value))
    else if (flag === '--for') options.minutes = Number(value)
    else if (flag === '--state') options.state = value
    else if (flag === '--once') options.once = true
    else if (flag === '--include-bots') options.includeBots = true
    else if (flag === '--take-over') options.takeOver = true
    else if (flag === '--help' || flag === '-h') options.help = true
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!Number.isFinite(options.interval) || !Number.isFinite(options.minutes)) throw new Error('--interval and --for take numbers')
  return options
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

function ghJson(args) {
  const out = run('gh', args).trim()
  return out ? JSON.parse(out) : null
}

function stateFile(explicit) {
  if (explicit) return resolve(explicit)
  const common = run('git', ['rev-parse', '--git-common-dir']).trim()
  return join(isAbsolute(common) ? common : resolve(common), 'factory', 'pr-watch.json')
}

function load(path) {
  if (!existsSync(path)) return { version: 1, repos: {} }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function save(path, state) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporary, path)
}

const USAGE = `usage: watch-prs.mjs [--once] [--repo=owner/name]... [--author=login]
                    [--interval=SECONDS] [--for=MINUTES] [--state=PATH]
                    [--include-bots] [--take-over]

Prints one line per new review, comment, red check, conflict, fall-behind,
foreign push, merge or close on the open pull requests --author opened
(default: the gh account). Run it as a Monitor command; it exits after --for
minutes (default 28) and prints the command that re-arms it.`

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    process.exit(2)
  }
  if (options.help) {
    console.log(USAGE)
    return
  }

  const say = (line) => process.stdout.write(`${line}\n`)
  let path
  try {
    path = stateFile(options.state)
    if (!options.author) options.author = ghJson(['api', 'user']).login
    if (options.repos.length === 0) options.repos.push(ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner)
  } catch (error) {
    say(`watch-error: could not start: ${snippet(error.stderr || error.message, 300)}`)
    process.exit(1)
  }
  const local = options.repos.length === 1 ? localRepo() : null
  const hasCommit = (sha) => {
    try {
      run('git', ['cat-file', '-e', `${sha}^{commit}`])
      return true
    } catch {
      return false
    }
  }

  const initial = load(path)
  if (!options.takeOver && holderIsLive(initial.holder, { pid: process.pid, now: Date.now(), interval: options.interval, alive: processAlive })) {
    say(`watch-refused: process ${initial.holder.pid} is already watching (heartbeat ${initial.holder.beat}). Two watchers would split the events between them. Pass --take-over if that process is gone.`)
    process.exit(1)
  }

  const deadline = Date.now() + options.minutes * 60_000
  const multiRepo = options.repos.length > 1
  let failures = 0
  let lastError = ''
  let first = true
  for (;;) {
    const state = load(path)
    state.holder = { pid: process.pid, beat: new Date().toISOString() }
    const lines = []
    let ok = true
    for (const repo of options.repos) {
      try {
        const result = pollRepo({
          gh: ghJson,
          hasCommit: local === repo ? hasCommit : null,
          repo,
          login: options.author,
          prev: state.repos[repo],
          now: Date.now(),
          includeBots: options.includeBots,
        })
        state.repos[repo] = result.next
        if (first) {
          const list = result.open.map((n) => `#${n}`).join(' ') || 'none yet'
          lines.push(`watching ${result.open.length} open PRs in ${repo} authored by ${options.author}: ${list}`)
        }
        for (const event of result.events) lines.push(formatEvent(event, { multiRepo }))
      } catch (error) {
        ok = false
        const message = snippet(error.stderr || error.message, 300)
        if (message !== lastError) lines.push(`watch-error: ${repo}: ${message}`)
        lastError = message
      }
    }
    first = false
    for (const line of lines) say(line)
    save(path, state)

    failures = ok ? 0 : failures + 1
    if (ok) lastError = ''
    if (failures >= 5) {
      say('watch-ended: five polls in a row failed, so this watch is not seeing anything. Fix the error above and re-arm.')
      release(path)
      process.exit(1)
    }
    if (options.once) {
      release(path)
      return
    }
    if (Date.now() + options.interval * 1000 > deadline) break
    await new Promise((done) => setTimeout(done, options.interval * 1000))
  }
  release(path)
  // Double quotes and no escaping, which both bash and PowerShell read as the
  // same path, backslashes included.
  const quote = (arg) => (/[\s"']/.test(arg) || arg === process.argv[1] ? `"${arg}"` : arg)
  const rearm = ['node', ...process.argv.slice(1).map(quote)].join(' ')
  say(`watch-ended after ${options.minutes}m with everything reported and saved. Re-arm now: ${rearm}`)
}

function release(path) {
  const state = load(path)
  if (state.holder?.pid === process.pid) {
    delete state.holder
    save(path, state)
  }
}

function localRepo() {
  try {
    return ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner
  } catch {
    return null
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
