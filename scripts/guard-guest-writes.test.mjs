// Both directions, for the asset that holds guest mode's write boundary.
//
// A gap lets an outward write through; a false positive gets the gate switched
// off, and the second is the likelier failure. This repo's own guard shipped
// three false positives in a day, so the allow cases below carry at least as
// much weight as the deny cases — and here there are more of them, because
// guest mode's premise is that reads are unrestricted.
//
// The third direction is the one this file exists for as much as either of
// those: **owned mode is unaffected**. Every command the guest gate refuses is
// run through the owned-mode merge guard and has to come back allowed, because
// a boundary that leaks into the mode it was not written for is a boundary
// nobody will keep installed.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(
  new URL('../.agents/skills/orchestrated-delivery/assets/guard-guest-writes.mjs', import.meta.url),
)
const OWNED_GUARD = fileURLToPath(new URL('./guard-merge.mjs', import.meta.url))

function run(guard, command) {
  const out = execFileSync('node', [guard], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  if (!out.trim()) return { denied: false, reason: '' }
  const decision = JSON.parse(out).hookSpecificOutput
  return { denied: decision.permissionDecision === 'deny', reason: decision.permissionDecisionReason }
}

const DENIED = [
  // A push is the outward write the boundary is named for.
  'git push',
  'git push origin HEAD',
  'git push -u origin backlog/12-eligibility',
  'git push --force origin feature',
  'git -C /work/repo push origin HEAD',
  // Every `gh` verb that is not a read. These are ordinary commands in owned
  // mode, which is exactly why the boundary needs a shape rather than a
  // sentence: nothing about them looks wrong.
  'gh pr create --fill',
  'gh issue create --title "Parcel import loses leading zeros"',
  'gh issue comment 45 --body "picked this up"',
  'gh issue close 45',
  'gh pr review 12 --approve',
  'gh repo create permits/intake --private',
  'gh secret set DEPLOY_KEY',
  'gh workflow run checks.yml',
  'gh label create area:zoning',
  // Installs into the operator's home directory, not into this repo.
  'gh extension install owner/gh-thing',
  // The merge rules the owned guard already holds are inside this boundary too,
  // and arrive here by the general rule rather than by a special case.
  'gh pr merge 42 --squash',
  // `gh api` defaults to GET and becomes a POST the moment it is handed a
  // field, so the method is not always written down. Both forms are the write.
  'gh api --method POST repos/o/r/issues',
  'gh api -X PATCH repos/o/r/issues/3',
  'gh api repos/o/r/issues/3/comments -f body="done"',
  'gh api --method=DELETE repos/o/r/issues/3',
  // A GraphQL call cannot be classified: query and mutation are the same POST
  // carrying `-f query=`. Refused whatever the method says, and refused with a
  // message that does not promise a remedy that cannot work — see below.
  "gh api graphql -f query='query{viewer{login}}'",
  'gh api graphql -F query=@issues.graphql',
  'gh api --method GET graphql -f query=x',
  'gh --repo o/r api graphql -f query=x',
  // The home directory and the machine, which are outside the repository in
  // the most literal sense the boundary has.
  'git config --global user.email agent@example.com',
  'git config --system core.autocrlf true',
  'git config --global --unset user.email',
  'git config --global --add safe.directory /work',
  'git config set --global user.email agent@example.com',
  // The classic one-argument form prints rather than sets, and is refused
  // anyway. Telling it from a write means counting positionals through flags
  // that take values, and a miscount the other way is a silent write to
  // somebody's home directory. The message says so and names `--get`.
  'git config --global user.email',
  // The two beads commands that write tracked files into a host repo. Both are
  // named in references/beads-backlog.md as things to remember not to run,
  // which is layer 0, which is what this file replaces.
  'bd init',
  'bd init --skip-agents',
  'bd setup claude',
  'bd setup claude --stealth',
  // Every way one command follows another, because reading the head of each
  // command is what stops the whole thing degrading into a text scan.
  'npm run check && git push origin HEAD',
  'cd repo; gh pr create --fill',
  'git status || git push',
  'npm run check\ngit push origin HEAD',
  '(cd repo && git push)',
  'echo "$(gh pr create --fill)"',
  "echo don't && git push origin HEAD",
  // Grouping, and the reserved words that introduce a command inside a compound
  // one. Every one of these was allowed until #96 while the bare form was
  // denied, and every one is an outward write from a repository the operator is
  // a guest in. `for ... do git push ...; done` is the one that happens by
  // accident: pushing several branches in a loop is ordinary work, not evasion.
  '{ git push origin HEAD; }',
  'if true; then git push origin HEAD; fi',
  'time git push origin HEAD',
  '! git push origin HEAD',
  'for b in a b; do git push origin $b; done',
  'if false; then echo no; else git push origin HEAD; fi',
  // The other four rules reach through a reserved word too, or only the push
  // rule would have been ported.
  'if gh pr checks 42; then gh pr create --fill; fi',
  'time git config --global user.email agent@example.com',
  '! gh api graphql -f query=x',
  'for r in a b; do bd setup claude; done',
  // #97. An assignment prefix binds a variable for the command that follows, so
  // the command is what follows it. `GIT_TRACE=1 git push` is an agent
  // debugging a push, which is the honest-but-mistaken case this gate exists
  // for, and every line here was an outward write that walked straight through.
  'GIT_TRACE=1 git push origin HEAD',
  'GIT_TRACE=1 GIT_CURL_VERBOSE=1 git push',
  'GIT_SSH_COMMAND="ssh -v" git push origin HEAD',
  'GIT_SSH_COMMAND=ssh\\ -v git push origin HEAD',
  'GH_TOKEN=x gh pr create --fill',
  'EDITOR=vim git config --global user.email agent@example.com',
  'FOO=1 bd setup claude',
  'if true; then GIT_TRACE=1 git push origin HEAD; fi',
  // Each shell tool the hook is wired to can invoke the other one.
  'bash -c "git push origin HEAD"',
  'pwsh -Command "gh issue create --title x"',
  // The probe is refused on purpose: being refused is its answer.
  'node .factory/guard-guest-writes.mjs --probe',
  'node C:\\work\\repo\\.factory\\guard-guest-writes.mjs --probe',
  // #97 again, and the reason it is filed as a defect in a control rather than
  // a gap. A probe walked past reports the gate inert in a session where it is
  // live, and a false "inert" arrives with the authority of a measurement.
  'GH_TOKEN=x node .factory/guard-guest-writes.mjs --probe',
]

const ALLOWED = [
  // Reads are unrestricted. Pulling the host's ticket in is the normal case,
  // and a gate that made it awkward would be uninstalled within a day.
  'gh issue view 4102',
  'gh issue list --label area:zoning --limit 0',
  'gh pr view 42 --json statusCheckRollup',
  'gh pr diff 42',
  'gh pr checks 42',
  'gh pr checkout 42',
  'gh repo clone permits/intake',
  'gh run view 991 --log',
  'gh run download 991',
  'gh search issues "leading zero" --repo permits/intake',
  'gh auth status',
  'gh api repos/o/r/issues/3',
  'gh api repos/{owner}/{repo}/issues?state=open',
  // An explicit GET puts the fields in the query string, so it stays a read.
  // This is the remedy the write-shaped refusal names, so it has to work.
  'gh api repos/o/r/issues --method GET -f state=open',
  'gh api --paginate repos/o/r/issues',
  // Reading the operator's global config is a read, and reads are unrestricted.
  // Unlike a GraphQL call, these announce themselves: no shape of `--get` or
  // `--list` writes anything.
  'git config --global --get user.email',
  'git config --global --get-all remote.origin.url',
  'git config --global --get-regexp "^user"',
  'git config --global --list',
  'git config --global -l',
  'git config --system --list --show-origin',
  'git config get --global user.email',
  'git config list --global',
  // Contacts the remote and changes nothing, which is how you rehearse the
  // publish step without taking it.
  'git push --dry-run origin HEAD',
  // Ordinary local work, all of it inside the boundary.
  'git status --porcelain -uall',
  'git fetch origin',
  'git pull --ff-only',
  'git commit -m "Import the parcel polygons"',
  'git checkout -b backlog/12-eligibility',
  'git config user.email agent@example.com',
  'npm run check',
  'node scripts/merge-pr.mjs 42',
  // The local store. `--stealth` is the whole difference and the gate reads it.
  'bd init --stealth',
  'bd create "Overlay the historic district" -t task -p 2',
  'bd comment permit-scratch-4sr --file review.md',
  'bd list --limit 0',
  // Empty and malformed payloads are not this gate's problem.
  '',
  '   ',

  // The false-positive class that got the merge guard denying a comment about
  // itself within seconds of first firing. In guest mode this is likelier, not
  // less likely: the review record in the local store describes the outward
  // writes the factory did not make.
  'git commit -m "Explain why we cannot push until the owner publishes"',
  'bd comment permit-scratch-4sr --file review.md # says gh pr create is denied',
  'echo "git push origin main"',
  'echo "gh issue create --title x"',
  "bd comment 1 --body \"$(cat <<'EOF'\n| git push | denied |\nEOF\n)\"",
  // Talking about the probe is not running it, and neither is editing it.
  'echo "node .factory/guard-guest-writes.mjs --probe"',
  'cat .factory/guard-guest-writes.mjs',
  'node .factory/guard-guest-writes.mjs --install',
  // Reading a command line means reading it all the way down, or the nested
  // case quietly reintroduces the text scan.
  'bash -c "echo git push origin main"',
  'pwsh -Command "git commit -m \'gh pr create is denied in guest mode\'"',

  // A read behind a reserved word, which is the allow direction #96 created and
  // the merge guard never had. Its two rules only ever deny, so stripping a
  // word there could not turn a read into a refusal. Here `gh` is
  // deny-by-default, so these were allowed before #96 only because the segment
  // began with `then` and the `gh` rules never saw it — the right verdict for
  // the wrong reason. Stripping puts them in front of GH_READS, where they have
  // to be allowed on their merits. A false positive in a repository the
  // operator does not own is the failure that gets guest mode abandoned.
  'then gh issue view 42',
  'do bd list',
  '! gh pr view 42',
  '{ gh issue view 42; }',
  'time gh pr checks 42',
  'else gh pr diff 42',
  'elif gh run view 991',
  'if gh pr checks 42; then gh pr view 42; fi',
  'for r in 41 42; do gh issue view $r; done',
  'time git config --global --get user.email',
  '! git push --dry-run origin HEAD',
  '{ bd init --stealth; }',
  'time gh api repos/o/r/issues/3',
  // The compound forms with nothing in them to deny, which is most of the work
  // an agent does inside one.
  '{ npm run check; }',
  'time npm run check',
  'for f in docs/*.md; do git add "$f"; done',
  // A leading reserved word is matched as a whole token, so a brace inside a
  // word is not one of them.
  'mkdir -p docs/{process,architecture}',
  'echo "{ git push origin HEAD; }"',
  // #97's other direction, and the expensive one here. Stripping an assignment
  // puts a read in front of GH_READS, where it now has to be allowed on its
  // merits rather than because the segment did not begin with `gh`.
  'GIT_TRACE=1 gh issue view 42',
  'GIT_TRACE=1 gh pr checks 42',
  'GIT_PAGER=cat git status',
  'GIT_TRACE=1 git push --dry-run origin HEAD',
  'GIT_TRACE=1 git config --global --get user.email',
  'FOO=1 bd init --stealth',
  // An `=` in an argument is not an assignment prefix, and a rule that strips
  // too eagerly turns an argument into a command.
  'git commit -m "FOO=1"',
  'bd comment 1 --body "GIT_TRACE=1 git push was denied"',
  'cd C:\\build\\out=release',
  // The name has to be a valid shell identifier. A shell reads `=x` as a
  // command name and fails to find it, so stripping it would invent a command
  // that never ran.
  '=x git push origin HEAD',
  // Stripping a leading word can leave a segment with no tokens at all, and
  // every rule reads the first one. Without the filter this throws.
  'time',
  'time; git status',
  // An assignment with no command after it runs nothing, and empties the
  // segment the same way.
  'GIT_TRACE=1',
  'FOO=1 BAR=2',
]

for (const command of DENIED) {
  test(`denies: ${command}`, () => {
    assert.equal(run(GATE, command).denied, true, 'should have been denied')
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command || '(empty)'}`, () => {
    assert.equal(run(GATE, command).denied, false, 'should have been allowed')
  })
}

// A refusal is only half the layer. The other half is what it tells the person
// it just stopped, and a remedy that cannot work is worse than none: it costs a
// retry, proves the gate does not understand itself, and sends them looking for
// the switch that turns it off. That is the failure references/enforcement.md
// names, and these are the two places this gate came closest to it.
test('the GraphQL refusal does not promise the GH_READS escape, which cannot help', () => {
  const { denied, reason } = run(GATE, "gh api graphql -f query='query{viewer{login}}'")
  assert.equal(denied, true)
  assert.match(reason, /cannot be classified/, 'it does not say why it could not decide')
  assert.match(reason, /There is no verb to add/, 'it does not rule out the remedy that cannot work')
  // A wall is fine. A wall with no signpost is not.
  assert.match(reason, /gh api repos\//, 'it names no REST read to reach for instead')
  assert.match(reason, /waits for publish/, 'it does not say what happens when there is no REST form')
})

test('the GraphQL refusal is not the generic payload refusal wearing the same words', () => {
  const graphql = run(GATE, 'gh api graphql -f query=x').reason
  const payload = run(GATE, 'gh api repos/o/r/issues -f title=x').reason
  assert.notEqual(graphql, payload, 'one message for two different reasons is one of them wrong')
  assert.match(payload, /--method GET/, 'the payload refusal names no read form either')
})

test('the global-config refusal names the read form it is asking for', () => {
  const { denied, reason } = run(GATE, 'git config --global user.email')
  assert.equal(denied, true)
  assert.match(reason, /--get/, 'it refuses a read without saying how to ask for one')
  assert.match(reason, /prints\nrather than sets/, 'it does not admit this form is a read')
})

// The allow direction that matters most, and the one the issue asked for by
// name. In owned mode these are the workflow, not a violation of it, and the
// gate that refuses them is simply not installed. Proving that here rather than
// asserting it means the two modes are held apart by a test rather than by
// whoever remembers which file went where.
const OWNED_MODE_UNAFFECTED = [
  'git push origin HEAD',
  'git push -u origin backlog/12-eligibility',
  'gh pr create --fill',
  'gh issue create --title "Parcel import loses leading zeros"',
  'gh issue comment 45 --body "picked this up"',
  'gh api repos/o/r/issues/3/comments -f body="done"',
  'gh label create area:zoning',
  'bd init --skip-agents',
  'git config --global user.email agent@example.com',
  // Both readers strip reserved words now, so the compound forms have to hold
  // the modes apart the same way the bare forms do. That is the whole point of
  // #96: the two copies answer the same question and had stopped agreeing.
  '{ git push origin HEAD; }',
  'if true; then gh pr create --fill; fi',
  'for b in a b; do git push origin $b; done',
  // And #97's, for the same reason. Debugging a push with GIT_TRACE is ordinary
  // work in a repository you own, and the gate that refuses it is not installed
  // there.
  'GIT_TRACE=1 git push origin HEAD',
  'GH_TOKEN=x gh pr create --fill',
]

for (const command of OWNED_MODE_UNAFFECTED) {
  test(`owned mode is unaffected: ${command}`, () => {
    assert.equal(run(GATE, command).denied, true, 'the guest gate should refuse this')
    assert.equal(run(OWNED_GUARD, command).denied, false, 'the owned guard should not')
  })
}

test('a malformed payload does not deny', () => {
  const out = execFileSync('node', [GATE], { input: 'not json', encoding: 'utf8' })
  assert.equal(out.trim(), '')
})

// ADR 0027's probe and its rule were two files agreeing on a filename, and a
// rename would have turned the answer into a permanent, silent "inert". Here
// they are one file, so the only thing left to assert is that the file really
// does refuse itself.
test('the gate refuses the probe form of its own path', () => {
  assert.equal(run(GATE, `node ${GATE} --probe`).denied, true, 'the gate does not refuse its probe')
})

// `npm test` puts `npm_lifecycle_event` in this process's environment and every
// child inherits it, so a probe run from here looks to itself exactly like one
// an installer wrapped in a package script. That is the state the second test
// below is about, and the first one has to be run outside it or it quietly
// asserts nothing: #104 found the identical test in the merge guard's file
// passing under `node --test` and failing under `npm test`.
const withoutNpm = () => {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('npm_')) delete env[name]
  return env
}

const probe = (env) => {
  try {
    execFileSync('node', [GATE, '--probe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env })
    return null
  } catch (error) {
    return error
  }
}

test('the probe reports inert, loudly, when nothing intercepts it', () => {
  const failed = probe(withoutNpm())
  assert.notEqual(failed, null, 'the probe exited 0, so a session cannot tell inert from loaded')
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /NOT loaded/)
})

// The other direction, and the one #110 is about. A script runner re-invokes
// through a shell of its own, so the hook is shown `npm run <name>`, the file
// name is nowhere in it, and the probe runs where it should have been refused.
// Reporting "not loaded" there is a confident wrong answer about a boundary in
// somebody else's repository, so the probe says nothing about loaded or inert
// and names the direct command instead. ADR 0027, and ADR 0033's amendment.
test('the probe refuses to report at all when a package script is in the way', () => {
  const failed = probe({ ...withoutNpm(), npm_lifecycle_event: 'probe' })
  assert.notEqual(failed, null, 'a probe that cannot be refused must not report')
  assert.equal(failed.status, 1)
  assert.doesNotMatch(failed.stderr, /NOT loaded/, 'it answered a question it could not observe')
  assert.match(failed.stderr, /not through a package script/)
  // The remedy has to be the command that works, not a restart. A restart
  // cannot fix a state that is not wrong.
  assert.match(failed.stderr, /node .*guard-guest-writes\.mjs --probe/)
})

// --install is the half that decides whether any of the above is reachable, and
// it runs against a repository that is not ours. The assertion that matters is
// the last one: a host repo's `git status` is unchanged afterwards.
function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'guest-mode-'))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  return root
}

function install(root) {
  return execFileSync('node', [GATE, '--install'], { cwd: root, encoding: 'utf8' })
}

const status = (root) =>
  execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' })

test('--install leaves the host repo\'s git status empty', () => {
  const root = scratchRepo()
  try {
    // A tracked file, so the comparison is against a repo with contents rather
    // than against an empty one where anything would look clean.
    writeFileSync(join(root, 'README.md'), '# host\n')
    execFileSync('git', ['add', 'README.md'], { cwd: root })
    const before = status(root)

    install(root)

    assert.equal(existsSync(join(root, '.factory/guard-guest-writes.mjs')), true)
    assert.equal(existsSync(join(root, '.factory/machine.md')), true)
    assert.equal(existsSync(join(root, '.claude/settings.local.json')), true)
    assert.match(readFileSync(join(root, '.factory/machine.md'), 'utf8'), /^Write boundary: guest$/m)
    assert.equal(status(root), before, 'installing changed what the host repo sees')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install wires every shell-capable tool, not just Bash', () => {
  const root = scratchRepo()
  try {
    install(root)
    const settings = JSON.parse(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'))
    const entries = (settings.hooks?.PreToolUse ?? []).filter((entry) =>
      (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('guard-guest-writes')),
    )
    assert.equal(entries.length, 1)
    for (const tool of ['Bash', 'PowerShell']) {
      const covered = entries.some((entry) => new RegExp(`^(${entry.matcher})$`).test(tool))
      assert.equal(covered, true, `${tool} is not matched, so it walks past the gate`)
    }
    // `if` uses permission-rule syntax, which names one tool, so it reopens the
    // hole the matcher just closed.
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) assert.equal(hook.if, undefined)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install merges into local settings that are already there, and repeats safely', () => {
  const root = scratchRepo()
  const path = join(root, '.claude/settings.local.json')
  try {
    mkdirSync(join(root, '.claude'))
    writeFileSync(path, `${JSON.stringify({ env: { TZ: 'UTC' } }, null, 2)}\n`)

    install(root)
    install(root)

    const after = JSON.parse(readFileSync(path, 'utf8'))
    assert.deepEqual(after.env, { TZ: 'UTC' }, 'an existing key was lost')
    const ours = after.hooks.PreToolUse.filter((entry) =>
      (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('guard-guest-writes')),
    )
    assert.equal(ours.length, 1, 'a second install duplicated the hook entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--install refuses to touch local settings it cannot parse', () => {
  const root = scratchRepo()
  try {
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, '.claude/settings.local.json'), '{ not json')
    let failed = null
    try {
      install(root)
    } catch (error) {
      failed = error
    }
    assert.notEqual(failed, null, 'it overwrote or ignored a file it could not read')
    assert.equal(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'), '{ not json')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
