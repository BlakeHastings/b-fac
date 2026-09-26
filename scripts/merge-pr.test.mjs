// Both copies of the merge wrapper, driven through every refusal with a stubbed
// `gh`, in the deny and the allow direction.
//
// Until #200 neither copy had a test. The copy in `scripts/` runs here behind a
// ruleset that refuses a bad merge first, so a wrong answer from it cost
// nothing and nobody saw one. The copy in `assets/` is what a repository with
// no branch protection installs as the thing between a stale green and its
// main, and it failed open: when it could not tell whether a branch was behind,
// it merged. That is #102's lesson a second time, about the wrapper rather
// than the guard: nothing here noticed, because nothing here looked.
//
// One suite runs against both, because ADR 0063 says the shared body is one
// body. A behaviour change made to one copy and not the other fails here. What
// each copy does alone is at the bottom: the shipped placeholders for the
// asset, the release line for this repository's copy.
//
// `gh` is a stub throughout: no token, no network, no pull request. These
// tests run in the `Checks` job.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { run as runScripts } from './merge-pr.mjs'
import { run as runAsset } from '../.agents/skills/orchestrated-delivery/assets/merge-pr.mjs'

// The asset ships placeholder check names, so the shared suite hands it the
// names this repository's copy holds. The placeholders are tested on their own
// below.
const COPIES = [
  { name: 'scripts/merge-pr.mjs', run: runScripts, options: {} },
  { name: 'assets/merge-pr.mjs', run: runAsset, options: { required: ['Checks', 'Plugin'] } },
]

const SHA = '61c9b23fa405a2c3f677ffa921d9bb32a4b3786f'

function pr(overrides = {}) {
  return {
    number: 42,
    title: 'Permit fee schedule',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: '',
    baseRefName: 'main',
    headRefName: 'permits/42-fee-schedule',
    headRefOid: SHA,
    isCrossRepository: false,
    statusCheckRollup: [
      { name: 'Checks', conclusion: 'SUCCESS' },
      { name: 'Plugin', conclusion: 'SUCCESS' },
    ],
    ...overrides,
  }
}

const ghError = (stderr) => Object.assign(new Error('Command failed: gh'), { stderr })

// What `gh api repos/{owner}/{repo}/rules/branches/main` answered for this
// repository on 2026-09-25, verbatim apart from the line breaks. Four rules from
// one ruleset; only `required_status_checks` names checks, and the wrapper reads
// `parameters.required_status_checks[].context` from it.
const RULESET_SOURCE = { ruleset_source_type: 'Repository', ruleset_source: 'BlakeHastings/b-fac', ruleset_id: 20608052 }
const THIS_REPOSITORY_RULES = [
  { type: 'deletion', ...RULESET_SOURCE },
  { type: 'non_fast_forward', ...RULESET_SOURCE },
  {
    type: 'pull_request',
    parameters: {
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: false,
      required_reviewers: [],
      require_code_owner_review: false,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
      require_extra_approval_for_unattributed_changes: true,
      allowed_merge_methods: ['squash'],
    },
    ...RULESET_SOURCE,
  },
  {
    type: 'required_status_checks',
    parameters: {
      strict_required_status_checks_policy: true,
      do_not_enforce_on_create: false,
      required_status_checks: [{ context: 'Checks' }, { context: 'Plugin' }],
    },
    ...RULESET_SOURCE,
  },
]

const requiring = (...contexts) => [
  {
    type: 'required_status_checks',
    parameters: { required_status_checks: contexts.map((context) => ({ context })) },
    ...RULESET_SOURCE,
  },
]

// A `gh` that answers each call the wrapper makes by what the call is, and
// records every call so a test can say what was and was not attempted. `prs` is
// a sequence for the UNKNOWN polling; the last answer repeats. `rules` is the
// ruleset answer: a value is sent as JSON, a string as the raw text, an Error
// is thrown.
function fakeGh({
  prs = [pr()],
  rules = THIS_REPOSITORY_RULES,
  behind = '0',
  merge = null,
  deleted = null,
  versions = ['1.0.0', '1.0.0'],
} = {}) {
  const calls = []
  const sent = []
  let views = 0
  let reads = 0
  const gh = (args) => {
    calls.push(args)
    if (args[0] === 'pr' && args[1] === 'view') {
      const answer = prs[Math.min(views, prs.length - 1)]
      views += 1
      if (answer instanceof Error) throw answer
      return JSON.stringify(answer)
    }
    const path = args.find((arg) => arg.startsWith('repos/')) ?? ''
    if (path.includes('/rules/branches/')) {
      if (rules instanceof Error) throw rules
      return typeof rules === 'string' ? rules : JSON.stringify(rules)
    }
    if (path.includes('/compare/')) {
      if (behind instanceof Error) throw behind
      return `${behind}\n`
    }
    if (path.includes('/contents/')) {
      const version = versions[Math.min(reads, versions.length - 1)]
      reads += 1
      if (version === null) throw ghError('gh: Not Found (HTTP 404)')
      return JSON.stringify({ version })
    }
    if (path.endsWith('/merge')) {
      // The wrapper sends the merge's fields in a file it deletes as soon as
      // the call returns, so the file is read here, while it still exists.
      const input = args[args.indexOf('--input') + 1]
      sent.push(args.includes('--input') ? JSON.parse(readFileSync(input, 'utf8')) : null)
      if (merge) throw merge
      return '{"merged":true}'
    }
    if (args.includes('DELETE')) {
      if (deleted) throw deleted
      return ''
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`)
  }
  return { gh, calls, sent }
}

const merged = (calls) => calls.some((args) => args.includes('PUT'))
const deletes = (calls) => calls.filter((args) => args.includes('DELETE'))
const compares = (calls) => calls.filter((args) => args.some((arg) => arg.includes('/compare/')))

async function drive(copy, gh, extra = {}) {
  const out = []
  const push = (line) => out.push(String(line))
  let slept = 0
  const code = await copy.run({
    prNumber: '42',
    gh,
    sleep: async () => {
      slept += 1
    },
    log: push,
    warn: push,
    error: push,
    ...copy.options,
    ...extra,
  })
  return { code, text: out.join('\n'), slept }
}

for (const copy of COPIES) {
  // THE ALLOW DIRECTION
  // A wrapper that refuses ordinary work gets worked around, which is worse
  // than having none, so the plain green case has to land.
  test(`${copy.name}: green, current and clean squash merges and deletes the branch`, async () => {
    const { gh, calls, sent } = fakeGh()
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].merge_method, 'squash')
    assert.deepEqual(deletes(calls)[0].at(-1), 'repos/{owner}/{repo}/git/refs/heads/permits/42-fee-schedule')
    assert.match(text, /All 2 required check\(s\) green/)
  })

  // THE TRAILER
  // What the provenance audit reads to tell a merge through this script from a
  // merge around it. ADR 0071. A message replaces GitHub's default wholesale,
  // so the title, the body and the commits' co-authors have to be carried over
  // by hand, and these say they were.
  test(`${copy.name}: the squash carries Landed-by, after the PR's own title and body`, async () => {
    const body = 'Closes #189\r\n\r\nThe permit fee schedule, recomputed.\r\n'
    const commits = [
      { messageHeadline: 'Recompute fees', messageBody: 'Details.\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>' },
      { messageHeadline: 'Fix a rounding', messageBody: 'co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>\nCo-authored-by: A Clerk <clerk@example.org>' },
      { messageHeadline: 'Tidy', messageBody: '' },
    ]
    const { gh, sent } = fakeGh({ prs: [pr({ body, commits })] })
    assert.equal((await drive(copy, gh)).code, 0)
    assert.equal(sent[0].commit_title, 'Permit fee schedule (#42)')
    assert.equal(
      sent[0].commit_message,
      'Closes #189\n\nThe permit fee schedule, recomputed.\n\n' +
        'Landed-by: merge-pr.mjs\n' +
        'Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>\n' +
        'Co-authored-by: A Clerk <clerk@example.org>\n',
    )
  })

  test(`${copy.name}: an empty PR body still lands the trailer, alone`, async () => {
    const { gh, sent } = fakeGh({ prs: [pr({ body: '' })] })
    assert.equal((await drive(copy, gh)).code, 0)
    assert.equal(sent[0].commit_message, 'Landed-by: merge-pr.mjs\n')
  })

  test(`${copy.name}: a rerun is judged on its latest result, not its first`, async () => {
    const rollup = [
      { name: 'Checks', conclusion: 'FAILURE' },
      { name: 'Plugin', conclusion: 'SUCCESS' },
      { name: 'Checks', conclusion: 'SUCCESS' },
    ]
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })] })
    assert.equal((await drive(copy, gh)).code, 0)
    assert.ok(merged(calls))
  })

  test(`${copy.name}: UNSTABLE proceeds, because the required set is the contract`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'UNSTABLE' })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.ok(merged(calls))
    assert.match(text, /UNSTABLE/)
  })

  test(`${copy.name}: UNKNOWN is waited out, and merges once GitHub answers`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'UNKNOWN' }), pr()] })
    const { code, slept } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.equal(slept, 1)
    assert.ok(merged(calls))
  })

  test(`${copy.name}: UNKNOWN that never settles proceeds on the rollup and says so`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'UNKNOWN' })] })
    const { code, text, slept } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.equal(slept, 6)
    assert.ok(merged(calls))
    assert.match(text, /still UNKNOWN after 15s/)
    assert.match(text, /not behind main/)
  })

  // THE DENY DIRECTION
  test(`${copy.name}: a red required check refuses and names it`, async () => {
    const rollup = [
      { name: 'Checks', conclusion: 'FAILURE' },
      { name: 'Plugin', conclusion: 'SUCCESS' },
    ]
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /Checks: FAILURE/)
    assert.ok(!merged(calls))
  })

  test(`${copy.name}: a required check that never ran refuses`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: [{ name: 'Checks', conclusion: 'SUCCESS' }] })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /Plugin: never ran/)
    assert.ok(!merged(calls))
  })

  test(`${copy.name}: a pending check refuses rather than racing it`, async () => {
    const rollup = [
      { name: 'Checks', conclusion: 'SUCCESS' },
      { name: 'Plugin', status: 'IN_PROGRESS', conclusion: '' },
    ]
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /Plugin: PENDING/)
    assert.ok(!merged(calls))
  })

  for (const [why, overrides, expected] of [
    ['a closed PR', { state: 'CLOSED' }, /state is CLOSED/],
    ['a draft', { isDraft: true }, /it is a draft/],
    ['a conflict', { mergeable: 'CONFLICTING' }, /conflicts with main/],
    ['a DIRTY merge state', { mergeStateStatus: 'DIRTY' }, /conflicts with main/],
  ]) {
    test(`${copy.name}: ${why} refuses`, async () => {
      const { gh, calls } = fakeGh({ prs: [pr(overrides)] })
      const { code, text } = await drive(copy, gh)
      assert.equal(code, 1)
      assert.match(text, expected)
      assert.ok(!merged(calls))
    })
  }

  test(`${copy.name}: a PR that cannot be read refuses`, async () => {
    const { gh, calls } = fakeGh({ prs: [ghError('GraphQL: Could not resolve to a PullRequest')] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /Could not read PR #42: GraphQL/)
    assert.ok(!merged(calls))
  })

  // THE STALE GREEN
  test(`${copy.name}: BEHIND refuses, names the 405 it prevents, and says whose rebase it is`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'BEHIND' })], behind: '3' })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /behind\n\s+main by 3 commit\(s\)/)
    assert.match(text, /HTTP 405/)
    assert.match(text, /Rebases are theirs/)
    assert.ok(!merged(calls))
  })

  // The case only this line catches where no ruleset exists: GitHub calls the
  // branch CLEAN because nothing tells it to care, and the commits say it is behind.
  test(`${copy.name}: a CLEAN branch the commits say is behind is refused`, async () => {
    const { gh, calls } = fakeGh({ behind: '2' })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /main by 2 commit\(s\), so that green is stale/)
    assert.doesNotMatch(text, /HTTP 405/)
    assert.ok(!merged(calls))
  })

  // THE FAIL-OPEN THIS ISSUE WAS OPENED FOR
  // A lookup that fails used to read as "not behind". It now refuses and hands
  // over the call it made.
  test(`${copy.name}: a compare that fails is refused, not waved through`, async () => {
    const { gh, calls } = fakeGh({ behind: ghError('gh: Not Found (HTTP 404)') })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /could not tell whether\n\s+the branch is behind main/)
    assert.match(text, /HTTP 404/)
    assert.match(text, new RegExp(`gh api repos/\\{owner\\}/\\{repo\\}/compare/main\\.\\.\\.${SHA} --jq \\.behind_by`))
    assert.ok(!merged(calls))
  })

  // `Number('')` is 0, so an empty answer used to read as "not behind" and slip
  // through the NaN test that was meant to catch garbage.
  for (const answer of ['', 'null', 'Not Found']) {
    test(`${copy.name}: a compare answering ${JSON.stringify(answer)} is not a count and refuses`, async () => {
      const { gh, calls } = fakeGh({ behind: answer })
      const { code, text } = await drive(copy, gh)
      assert.equal(code, 1)
      assert.match(text, /not a count/)
      assert.ok(!merged(calls))
    })
  }

  // THE FORK PATH
  // A fork's branch name is a 404 in this repository; the head commit is not.
  // Measured on cli/cli#14519 before this was written.
  test(`${copy.name}: the compare asks by head SHA, so a fork's branch does not blind it`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ isCrossRepository: true, headRefName: 'main' })] })
    assert.equal((await drive(copy, gh)).code, 0)
    const [call] = compares(calls)
    assert.ok(call.includes(`repos/{owner}/{repo}/compare/main...${SHA}`))
  })

  // A fork PR opened from the fork's own `main` names `main` as its head. The
  // DELETE that tidies up after a merge would have deleted this repository's.
  test(`${copy.name}: a fork's head branch is never deleted here, even when it is called main`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ isCrossRepository: true, headRefName: 'main' })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.ok(merged(calls))
    assert.deepEqual(deletes(calls), [])
    assert.match(text, /it is the fork's to delete/)
  })

  // BLOCKED IS NOT BEHIND
  test(`${copy.name}: BLOCKED refuses without prescribing a rebase that fixes nothing`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED' })] })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /REVIEW_REQUIRED/)
    assert.match(text, /not behind main, so staleness is not the cause/)
    assert.match(text, /BLOCKED is not BEHIND/)
    assert.ok(!merged(calls))
  })

  // AFTER THE MERGE CALL
  test(`${copy.name}: a 405 from GitHub is translated, and nothing is deleted`, async () => {
    const merge = ghError('gh: 2 of 2 required status checks are expected. (HTTP 405)')
    const { gh, calls } = fakeGh({ merge })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /That is the stale-branch case/)
    assert.deepEqual(deletes(calls), [])
  })

  test(`${copy.name}: a branch that cannot be deleted does not turn a merge into a failure`, async () => {
    const { gh } = fakeGh({ deleted: ghError('gh: Reference does not exist (HTTP 422)') })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 0)
    assert.match(text, /already gone or could not be deleted/)
  })

  // THE SWITCH, OFF
  // Off is a choice a repository makes, so off has to mean off in both ways
  // the switch refuses: behind, and blind.
  test(`${copy.name}: with REFUSE_WHEN_BEHIND off, a behind branch GitHub calls CLEAN merges`, async () => {
    const { gh, calls } = fakeGh({ behind: '2' })
    assert.equal((await drive(copy, gh, { refuseWhenBehind: false })).code, 0)
    assert.ok(merged(calls))
  })

  test(`${copy.name}: with REFUSE_WHEN_BEHIND off, a failed compare warns and merges`, async () => {
    const { gh, calls } = fakeGh({
      prs: [pr({ mergeStateStatus: 'UNKNOWN' })],
      behind: ghError('gh: Not Found (HTTP 404)'),
    })
    const { code, text } = await drive(copy, gh, { refuseWhenBehind: false })
    assert.equal(code, 0)
    assert.match(text, /Could not compare the head against main either: gh: Not Found/)
    assert.ok(merged(calls))
  })

  test(`${copy.name}: with REFUSE_WHEN_BEHIND off, BEHIND still refuses`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ mergeStateStatus: 'BEHIND' })], behind: '1' })
    assert.equal((await drive(copy, gh, { refuseWhenBehind: false })).code, 1)
    assert.ok(!merged(calls))
  })

  // WHICH CHECKS ARE REQUIRED, ADR 0065
  // The ruleset names them. REQUIRED is read only when it cannot, and an empty
  // list is never the answer.
  test(`${copy.name}: the ruleset's required checks are the ones judged, not REQUIRED`, async () => {
    const { gh, calls } = fakeGh()
    const { code, text } = await drive(copy, gh, { required: ['Stale name nobody runs'] })
    assert.equal(code, 0)
    assert.ok(merged(calls))
    assert.match(text, /Required checks, from the ruleset on main: Checks, Plugin\./)
    const [rules] = calls.filter((args) => args.some((arg) => arg.includes('/rules/')))
    assert.deepEqual(rules, ['api', 'repos/{owner}/{repo}/rules/branches/main?per_page=100'])
  })

  // The failure this issue was opened for, from the other side: a job renamed
  // in the workflow and the ruleset, with REQUIRED left behind. It used to
  // refuse every merge; now the rename is judged by its new name.
  test(`${copy.name}: a check renamed in the ruleset is judged by its new name`, async () => {
    const rollup = [
      { name: 'Checks', conclusion: 'SUCCESS' },
      { name: 'Plugin load', conclusion: 'FAILURE' },
    ]
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })], rules: requiring('Checks', 'Plugin load') })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /Plugin load: FAILURE/)
    assert.doesNotMatch(text, /Plugin: never ran/)
    assert.ok(!merged(calls))
  })

  test(`${copy.name}: contexts from several rulesets are all required, once each`, async () => {
    const rules = [...requiring('Checks'), ...requiring('Checks', 'Plugin')]
    const rollup = [{ name: 'Checks', conclusion: 'SUCCESS' }]
    const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })], rules })
    const { code, text } = await drive(copy, gh)
    assert.equal(code, 1)
    assert.match(text, /from the ruleset on main: Checks, Plugin\./)
    assert.match(text, /Plugin: never ran/)
    assert.ok(!merged(calls))
  })

  test(`${copy.name}: the ruleset is asked about the PR's base, not a branch assumed to be main`, async () => {
    const { gh, calls } = fakeGh({ prs: [pr({ baseRefName: 'release/2.x' })] })
    await drive(copy, gh)
    assert.ok(calls.some((args) => args.includes('repos/{owner}/{repo}/rules/branches/release/2.x?per_page=100')))
  })

  // A LOOKUP THAT FAILS falls back to REQUIRED, says so, and hands over the call.
  for (const [why, rules, expected] of [
    ['an error from gh', ghError('gh: Upgrade to GitHub Pro or make this repository public (HTTP 403)'), /HTTP 403/],
    ['an answer that is not JSON', 'Not Found', /Unexpected token|not valid JSON/],
    ['an answer that is not a list', { message: 'Not Found' }, /not a list of rules/],
  ]) {
    test(`${copy.name}: ${why} from the ruleset falls back to REQUIRED`, async () => {
      const rollup = [{ name: 'Checks', conclusion: 'SUCCESS' }]
      const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })], rules })
      const { code, text } = await drive(copy, gh, { required: ['Checks', 'Fallback only'] })
      assert.equal(code, 1)
      assert.match(text, /Could not read the required checks from the ruleset on main, so using REQUIRED/)
      assert.match(text, expected)
      assert.match(text, /gh api repos\/\{owner\}\/\{repo\}\/rules\/branches\/main\?per_page=100/)
      assert.match(text, /Fallback only: never ran/)
      assert.ok(!merged(calls))
    })
  }

  test(`${copy.name}: a failed ruleset lookup with REQUIRED green still merges`, async () => {
    const { gh, calls } = fakeGh({ rules: ghError('gh: error connecting to api.github.com') })
    const { code } = await drive(copy, gh, { required: ['Checks', 'Plugin'] })
    assert.equal(code, 0)
    assert.ok(merged(calls))
  })

  // A RULESET THAT REQUIRES NOTHING
  // Read as "no checks", this would pass every merge whatever the rollup said.
  // It falls back to REQUIRED instead, the same as a failure.
  for (const [why, rules] of [
    ['no rules at all', []],
    ['rules, none of them required checks', THIS_REPOSITORY_RULES.slice(0, 3)],
    ['a required_status_checks rule with an empty list', requiring()],
    ['a required_status_checks rule with no parameters', [{ type: 'required_status_checks', ...RULESET_SOURCE }]],
  ]) {
    test(`${copy.name}: ${why} is not "accept anything", it falls back to REQUIRED`, async () => {
      const rollup = [{ name: 'Checks', conclusion: 'FAILURE' }]
      const { gh, calls } = fakeGh({ prs: [pr({ statusCheckRollup: rollup })], rules })
      const { code, text } = await drive(copy, gh, { required: ['Checks', 'Plugin'] })
      assert.equal(code, 1)
      assert.match(text, /No ruleset on main requires a check, so using REQUIRED in this script: Checks, Plugin\./)
      assert.match(text, /Checks: FAILURE/)
      assert.match(text, /Plugin: never ran/)
      assert.ok(!merged(calls))
    })
  }
}

// THE ASSET ALONE
// An unedited copy has to fail safe: every merge refuses, and says why, rather
// than matching nothing and treating that as green. That now means wherever
// REQUIRED is read: no ruleset, a ruleset that requires nothing, and a lookup
// that fails.
for (const [why, rules] of [
  ['no ruleset', []],
  ['a ruleset that requires nothing', THIS_REPOSITORY_RULES.slice(0, 3)],
  ['a ruleset lookup that fails', ghError('gh: Not Found (HTTP 404)')],
]) {
  test(`assets/merge-pr.mjs: with ${why}, the shipped placeholders refuse every merge as never ran`, async () => {
    const { gh, calls } = fakeGh({ rules })
    const { code, text } = await drive({ run: runAsset, options: {} }, gh)
    assert.equal(code, 1)
    assert.match(text, /REPLACE_WITH_REQUIRED_CHECK_NAME: never ran/)
    assert.ok(!merged(calls))
  })
}

// Where the host has a ruleset, it answers and the placeholders are not read.
// That is the point of reading the ruleset, and check-setup.mjs still reports
// the placeholders, because the fallback is still the host's to set.
test('assets/merge-pr.mjs: a ruleset that names checks is used even with the placeholders unedited', async () => {
  const { gh, calls } = fakeGh()
  const { code, text } = await drive({ run: runAsset, options: {} }, gh)
  assert.equal(code, 0)
  assert.doesNotMatch(text, /REPLACE_WITH/)
  assert.ok(merged(calls))
})

// AGAINST GITHUB, READ-ONLY
// Everything above proves the decisions against a stub. This proves the stub:
// the one call that reaches GitHub is the ruleset read, sent through the real
// `gh` to this repository, and the rest stays stubbed, so no merge, delete or
// write can leave. It needs a token and the network, and `npm run check` is
// hermetic, so it runs only when asked for:
//
//   MERGE_PR_LIVE=1 node --test scripts/merge-pr.test.mjs
test(
  'scripts/merge-pr.mjs: this repository\'s ruleset, read through the real gh, names Checks and Plugin',
  { skip: !process.env.MERGE_PR_LIVE && 'reads GitHub; set MERGE_PR_LIVE=1 to run it' },
  async () => {
    const { execFileSync } = await import('node:child_process')
    const stub = fakeGh()
    const real = []
    const gh = (args) => {
      if (!args.some((arg) => arg.includes('/rules/branches/'))) return stub.gh(args)
      assert.deepEqual(args.slice(0, 1), ['api'])
      assert.ok(!args.some((arg) => /^(-X|--method|-f|-F|--field|--raw-field|--input)$/.test(arg)), 'read-only')
      real.push(args)
      return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    }
    const { code, text } = await drive(COPIES[0], gh, { required: ['Stale name nobody runs'] })
    assert.equal(real.length, 1)
    assert.match(text, /Required checks, from the ruleset on main: Checks, Plugin\./)
    assert.equal(code, 0)
  },
)

// THIS REPOSITORY'S COPY ALONE
// The release line, ADR 0017. It must never turn a merge that happened into a
// failure, and must speak only when the version moved.
test('scripts/merge-pr.mjs: a merge that moves plugin.json says it released', async () => {
  const { gh } = fakeGh({ versions: ['0.54.3', '0.54.4'] })
  const { code, text } = await drive(COPIES[0], gh)
  assert.equal(code, 0)
  assert.match(text, /Released: main now ships 0\.54\.4, was 0\.54\.3/)
})

test('scripts/merge-pr.mjs: a merge that leaves the version alone says nothing about it', async () => {
  const { gh } = fakeGh({ versions: ['0.54.3', '0.54.3'] })
  const { code, text } = await drive(COPIES[0], gh)
  assert.equal(code, 0)
  assert.doesNotMatch(text, /Released/)
})

test('scripts/merge-pr.mjs: an unreadable manifest is admitted, and the merge still succeeded', async () => {
  const { gh } = fakeGh({ versions: ['0.54.3', null] })
  const { code, text } = await drive(COPIES[0], gh)
  assert.equal(code, 0)
  assert.match(text, /cannot say whether the\nmerge moved the shipped version/)
})
