// What the pull request watcher reports, and, as much, what it refuses to.
//
// WHAT THIS PREVENTS
// Two failures, pulling in opposite directions. A watcher that misses a change
// request is the reprompt this asset exists to remove. A watcher that reports
// the factory's own replies wakes the factory to answer itself, and every
// answer is another event: a loop that spends tokens until somebody notices.
// So the cases below assert silence as often as they assert a line, and the
// loop guard (the operator's own words are not feedback) is tested from both
// sides, including the `/factory` directive that is its one way through.
//
// The forge is a stub keyed on the `gh` arguments, so nothing here needs a
// token or the network. That the real `gh` returns these shapes was measured
// against a live repository when the asset was written; ADR 0059.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const WATCH = fileURLToPath(new URL('../.agents/skills/orchestrated-delivery/assets/watch-prs.mjs', import.meta.url))
const { pollRepo, classifyChecks, formatEvent, holderIsLive, snippet } = await import(`file://${WATCH.replace(/\\/g, '/')}`)

const REPO = 'permits/intake'
const ME = 'operator'
const T0 = Date.parse('2026-09-01T12:00:00Z')
const at = (minutes) => new Date(T0 + minutes * 60_000).toISOString()

function pr(overrides = {}) {
  return {
    number: 41,
    title: 'Keep the parcel number as text',
    url: `https://github.com/${REPO}/pull/41`,
    headRefOid: 'aaaaaaaa1111',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'Checks', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    reviews: [],
    ...overrides,
  }
}

const review = (id, login, state, body, minutes) => ({ id, author: { login }, state, body, submittedAt: at(minutes) })
const comment = (id, login, body, minutes, extra = {}) => ({
  id,
  user: { login, type: extra.type ?? 'User' },
  body,
  created_at: at(minutes),
  html_url: `https://github.com/${REPO}/pull/41#c${id}`,
  issue_url: `https://api.github.com/repos/${REPO}/issues/41`,
  ...extra,
})
const inline = (id, login, body, minutes, extra = {}) => ({
  id,
  user: { login, type: 'User' },
  body,
  created_at: at(minutes),
  html_url: `https://github.com/${REPO}/pull/41#r${id}`,
  pull_request_url: `https://api.github.com/repos/${REPO}/pulls/41`,
  pull_request_review_id: 900,
  path: 'src/parcel.ts',
  ...extra,
})

// A forge. `open` is the open list, the rest answer the REST reads.
function forge({ open = [pr()], issue = [], inlines = [], headDate = at(0), views = {} } = {}) {
  const calls = []
  const gh = (args) => {
    calls.push(args.join(' '))
    if (args[0] === 'pr' && args[1] === 'list') return open
    if (args[0] === 'pr' && args[1] === 'view') return views[args[2]] ?? { state: 'OPEN', url: '' }
    const endpoint = args[1]
    if (/\/commits\//.test(endpoint)) return { commit: { committer: { date: headDate } } }
    if (/\/issues\/(\d+\/)?comments/.test(endpoint)) return [issue]
    if (/\/pulls\/(\d+\/)?comments/.test(endpoint)) return [inlines]
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  return { gh, calls }
}

function poll(world, prev, { minutes = 30, hasCommit = () => true, includeBots = false } = {}) {
  return pollRepo({ gh: world.gh, hasCommit, repo: REPO, login: ME, prev, now: T0 + minutes * 60_000, includeBots })
}

// A baseline taken at minute 10 with nothing pending, for the cases that are
// about what happens after the watch is running.
function baseline(open = [pr()]) {
  return poll(forge({ open }), undefined, { minutes: 10 }).next
}

const kinds = (result) => result.events.map((e) => `${e.number} ${e.kind}${e.by ? ` ${e.by}` : ''}`)

test('a quiet pull request baselines silently the first time it is seen', () => {
  const result = poll(forge(), undefined, { minutes: 10 })
  assert.deepEqual(result.events, [])
  assert.deepEqual(result.open, [41])
  assert.equal(result.next.prs['41'].checks, 'passing')
})

test('feedback that arrived before any watch ran is reported, and only what came after the operator last spoke', () => {
  const world = forge({
    open: [pr({ reviews: [review('R1', 'reviewer', 'CHANGES_REQUESTED', 'old, answered', 2), review('R2', 'reviewer', 'CHANGES_REQUESTED', 'still open', 8)] })],
    issue: [comment(1, ME, 'fixed the first round', 5)],
  })
  const result = poll(world, undefined, { minutes: 10 })
  assert.deepEqual(kinds(result), ['41 changes-requested reviewer'])
  assert.equal(result.events[0].pending, true)
  assert.match(formatEvent(result.events[0]), /^#41 changes-requested by reviewer \(before watch\): "still open"/)
})

test('a push after the feedback also counts as the operator answering it', () => {
  const world = forge({ open: [pr({ reviews: [review('R1', 'reviewer', 'CHANGES_REQUESTED', 'x', 4)] })], headDate: at(6) })
  assert.deepEqual(poll(world, undefined, { minutes: 10 }).events, [])
})

test('a change request with inline comments is one event carrying the count', () => {
  const prev = baseline()
  const world = forge({
    open: [pr({ reviews: [review('R9', 'reviewer', 'CHANGES_REQUESTED', 'Two blockers', 20)] })],
    inlines: [inline(1, 'reviewer', 'this drops the zero', 20), inline(2, 'reviewer', 'and this', 20)],
  })
  const result = poll(world, prev)
  assert.deepEqual(kinds(result), ['41 changes-requested reviewer'])
  assert.equal(result.events[0].inline, 2)
  assert.match(formatEvent(result.events[0]), /with 2 inline comments/)
})

test('a reply in a thread is reported as the comment, not as an empty review', () => {
  const prev = baseline()
  const world = forge({
    open: [pr({ reviews: [review('R10', 'reviewer', 'COMMENTED', '', 20)] })],
    inlines: [inline(3, 'reviewer', 'still wrong here', 20, { in_reply_to_id: 1 })],
  })
  const result = poll(world, prev)
  assert.deepEqual(kinds(result), ['41 inline-comment reviewer'])
  assert.equal(result.events[0].where, 'src/parcel.ts')
})

test("the operator's own words never wake the watch, which is the loop guard", () => {
  const prev = baseline()
  const world = forge({
    open: [pr({ reviews: [review('R11', ME, 'COMMENTED', 'Orchestrator review: ship', 20)] })],
    issue: [comment(5, ME, 'Fixed at abc123', 20)],
    inlines: [inline(6, ME, 'done', 20, { in_reply_to_id: 1 })],
  })
  assert.deepEqual(poll(world, prev).events, [])
})

test('the /factory directive is the one way the operator reaches it from the same login', () => {
  const prev = baseline()
  const world = forge({ issue: [comment(7, ME, '/factory  the census also misses MERGE', 20)] })
  assert.deepEqual(kinds(poll(world, prev)), [`41 directive ${ME}`])
})

test("a bot's comment is not feedback unless asked for, and a bot's review always is", () => {
  const prev = baseline()
  const world = forge({
    open: [pr({ reviews: [review('R12', 'review-bot[bot]', 'COMMENTED', 'Possible null here', 20)] })],
    issue: [comment(8, 'github-actions', '### Plan: 2 to add', 20, { type: 'Bot' })],
  })
  assert.deepEqual(kinds(poll(world, prev)), ['41 reviewed review-bot[bot]'])
  assert.deepEqual(kinds(poll(world, prev, { includeBots: true })), ['41 reviewed review-bot[bot]', '41 comment github-actions'])
})

test('a comment read twice through the since margin is reported once', () => {
  const world = forge({ issue: [comment(9, 'reviewer', 'why a string?', 20)] })
  const first = poll(world, baseline())
  assert.deepEqual(kinds(first), ['41 comment reviewer'])
  assert.deepEqual(poll(world, first.next, { minutes: 31 }).events, [])
})

test('a red check is reported when it goes red, not on every poll while it stays red', () => {
  const red = [{ __typename: 'CheckRun', name: 'Checks', status: 'COMPLETED', conclusion: 'FAILURE' }]
  const first = poll(forge({ open: [pr({ statusCheckRollup: red })] }), baseline())
  assert.deepEqual(kinds(first), ['41 checks-failed'])
  assert.equal(first.events[0].text, 'Checks')
  assert.deepEqual(poll(forge({ open: [pr({ statusCheckRollup: red })] }), first.next, { minutes: 31 }).events, [])
})

test('a new head going green after red is reported, since that is the pull request becoming landable', () => {
  const red = [{ __typename: 'CheckRun', name: 'Checks', status: 'COMPLETED', conclusion: 'FAILURE' }]
  const failing = poll(forge({ open: [pr({ statusCheckRollup: red })] }), baseline()).next
  const result = poll(forge({ open: [pr({ headRefOid: 'bbbbbbbb2222' })] }), failing, { minutes: 40 })
  assert.deepEqual(kinds(result), ['41 checks-passed'])
})

test('a red check is reported while others are still running', () => {
  assert.deepEqual(
    classifyChecks([
      { __typename: 'CheckRun', name: 'Plugin', status: 'IN_PROGRESS', conclusion: '' },
      { __typename: 'CheckRun', name: 'Checks', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'StatusContext', context: 'deploy', state: 'PENDING' },
    ]),
    { state: 'failing', failing: ['Checks'] },
  )
  assert.equal(classifyChecks([]).state, 'none')
})

test('a conflict is reported once, and UNKNOWN after a push does not reset it', () => {
  const conflicting = poll(forge({ open: [pr({ mergeable: 'CONFLICTING' })] }), baseline())
  assert.deepEqual(kinds(conflicting), ['41 conflict'])
  const recomputing = poll(forge({ open: [pr({ mergeable: 'UNKNOWN' })] }), conflicting.next, { minutes: 31 })
  assert.deepEqual(recomputing.events, [])
  assert.deepEqual(poll(forge({ open: [pr({ mergeable: 'CONFLICTING' })] }), recomputing.next, { minutes: 32 }).events, [])
})

test('falling behind the default branch is reported', () => {
  assert.deepEqual(kinds(poll(forge({ open: [pr({ mergeStateStatus: 'BEHIND' })] }), baseline())), ['41 behind'])
})

test('a new head is reported only when this machine did not make it', () => {
  // Checks still running on the new head, so its going green is not in play.
  const running = [{ __typename: 'CheckRun', name: 'Checks', status: 'IN_PROGRESS', conclusion: '' }]
  const moved = forge({ open: [pr({ headRefOid: 'cccccccc3333', statusCheckRollup: running })] })
  assert.deepEqual(poll(moved, baseline(), { hasCommit: () => true }).events, [])
  assert.deepEqual(kinds(poll(moved, baseline(), { hasCommit: () => false })), ['41 pushed'])
})

test('a pull request that left the open list is reported as merged or closed and dropped', () => {
  const prev = baseline([pr(), pr({ number: 42, title: 'Second' })])
  const world = forge({ open: [], views: { 41: { state: 'MERGED', url: 'u41' }, 42: { state: 'CLOSED', url: 'u42' } } })
  const result = poll(world, prev)
  assert.deepEqual(kinds(result), ['41 merged', '42 closed'])
  assert.deepEqual(result.next.prs, {})
})

test('a live holder refuses a second watcher, and a dead or stale one does not', () => {
  const now = T0
  const holder = { pid: 111, beat: new Date(now - 30_000).toISOString() }
  const options = { pid: 222, now, interval: 60 }
  assert.equal(holderIsLive(holder, { ...options, alive: () => true }), true)
  assert.equal(holderIsLive(holder, { ...options, alive: () => false }), false)
  assert.equal(holderIsLive({ pid: 111, beat: new Date(now - 10 * 60_000).toISOString() }, { ...options, alive: () => true }), false)
  assert.equal(holderIsLive(holder, { ...options, pid: 111, alive: () => true }), false)
})

test('a snippet is one line, without HTML comments, and bounded', () => {
  assert.equal(snippet('<!-- marker -->\n**Blocking.**\n\n  the zero'), '**Blocking.** the zero')
  assert.equal(snippet('x'.repeat(200)).length, 140)
})

test('the first sight of a pull request reads its whole conversation once, and later polls do not', () => {
  const world = forge()
  poll(world, undefined, { minutes: 10 })
  assert.ok(world.calls.some((c) => c.includes(`repos/${REPO}/issues/41/comments`)))
  const later = forge()
  poll(later, baseline())
  assert.ok(!later.calls.some((c) => c.includes('/issues/41/')))
  assert.ok(later.calls.some((c) => c.includes(`repos/${REPO}/issues/comments?since=`)))
})
