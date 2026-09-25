// Three guards carry one command reader between them, in three copies.
//
// The copies have drifted twice. #90's closing-`)` fix landed in one and not
// the other, and #96's reserved words sat in the merge guard for nine hours
// before #98 put them in the guest gate. Both times what caught it was an agent
// reading a file it had been told not to touch. That is luck. This file is the
// mechanical version of it, and it is worth more than either fix, because a
// reader that is right in one copy and wrong in the other is the shape every
// bug in this area has taken so far.
//
// The third copy, `assets/guard-merge.mjs`, was outside these markers and
// outside this file until #102, and it was the copy that mattered most: it is
// what a fresh repository installs as its only preventive layer, while the two
// under test were what this repository runs on itself. It had drifted so far
// that it was a generation behind — still scanning the text of the line — and
// nothing here noticed, because nothing here looked.
//
// The same thing then happened one step outside the markers. Helpers copied
// beside the reader, and the path helpers copied between assets, had nothing
// comparing them until #201. They are marked regions now too, each with its own
// stamp, listed in REGIONS below, and held to one text by the same test.
//
// WHAT IT COMPARES, AND WHAT IT DELIBERATELY DOES NOT
// The *reader*: how a line becomes segments and tokens, and since #199 how a
// `gh api` call's arguments read, which every guard asks. Not the verdicts. The
// guards' rules genuinely differ and are meant to. #98 measured `\git push`,
// `/usr/bin/gh pr create` and `git.exe push` denied by the guest gate and
// allowed by this repository's merge guard, because every rule there goes
// through `commandName` while `ghArguments` there compares the raw token. ADR
// 0033 keeps a push rule in the shipped guard that ADR 0001 deleted from this
// repository's. Asserting equal verdicts would be asserting a fiction.
// Asserting equal segmentation is asserting the thing that is actually one
// thing.
//
// This is not the shared module ADR 0029 refuses, and the difference is not a
// technicality. ADR 0029's reason is distribution: an asset is copied into a
// host repo on its own, and a two-file asset is a setup step that gets half
// done. Nothing here changes that. Each guard is still one file that can be
// handed to a host repo alone; the module below is assembled at test time, in
// this repository, out of the files that ship. Whether the duplication should
// end is #93's question and this does not answer it.
//
//   npm test
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS = '../.agents/skills/orchestrated-delivery/assets/'

const FILES = {
  'scripts/guard-merge.mjs': new URL('./guard-merge.mjs', import.meta.url),
  'assets/guard-guest-writes.mjs': new URL(`${ASSETS}guard-guest-writes.mjs`, import.meta.url),
  'assets/guard-merge.mjs': new URL(`${ASSETS}guard-merge.mjs`, import.meta.url),
  'assets/check-setup.mjs': new URL(`${ASSETS}check-setup.mjs`, import.meta.url),
  'assets/check-outward-writes.mjs': new URL(`${ASSETS}check-outward-writes.mjs`, import.meta.url),
}

// Every marked region, #201. The reader was the first and is still the one the
// corpus below walks. The others are helpers that had been copied just outside
// its markers, where nothing compared them: `canonical` and `samePath` in three
// assets from #194, `commandName` and `shellPayload` in all three guards,
// `gitArguments` and `ghArguments` in the two guards that read both the same
// way, and the merge rule, REST and GraphQL, in the two merge guards from #213.
//
// Each helper group is a region of its own with a stamp of its own, rather than
// a wider reader region, for two reasons. The groups live in different sets of
// files: the path helpers are in two files that carry no reader at all, and the
// merge rule is not in the guest gate. One region would have meant shipping dead
// code into the files that lack a group, or not covering it. And the reader's
// stamp is the line a host already compares; a helper change should not tell a
// host its reader moved when it did not.
//
// `needs` names regions of the same file that a region's code calls, so the
// module a region is imported as can be assembled from that one file. `prelude`
// is the imports a region would otherwise take from its file's header.
// `exports` is what proves the markers enclose the thing: a name the region no
// longer declares fails to import, rather than shrinking the comparison.
//
// `scripts/guard-merge.mjs`'s `ghArguments` is left out of its region on
// purpose. It compares the raw token where the other two ask `commandName`, so
// `/usr/bin/gh pr merge` reads as a merge in the shipped guard and not in this
// repository's. ADR 0031 records that as a difference in the rules, not in the
// reading, and this does not change it.
const REGIONS = [
  {
    name: 'command reader',
    stamp: 'reader stamp',
    files: ['scripts/guard-merge.mjs', 'assets/guard-guest-writes.mjs', 'assets/guard-merge.mjs'],
    exports: ['segmentsOf', 'ghApiCall'],
  },
  {
    name: 'shell payload',
    stamp: 'shell payload stamp',
    files: ['scripts/guard-merge.mjs', 'assets/guard-guest-writes.mjs', 'assets/guard-merge.mjs'],
    exports: ['commandName', 'shellPayload'],
  },
  {
    name: 'command arguments',
    stamp: 'command arguments stamp',
    files: ['assets/guard-guest-writes.mjs', 'assets/guard-merge.mjs'],
    needs: ['shell payload'],
    exports: ['gitArguments', 'ghArguments'],
  },
  {
    name: 'merge rule',
    stamp: 'merge rule stamp',
    files: ['scripts/guard-merge.mjs', 'assets/guard-merge.mjs'],
    needs: ['command reader'],
    exports: ['mergesThroughApi', 'graphqlMerge', 'GRAPHQL_MERGE', 'GRAPHQL_UNREADABLE'],
  },
  {
    name: 'path comparison',
    stamp: 'path comparison stamp',
    files: ['assets/guard-guest-writes.mjs', 'assets/check-setup.mjs', 'assets/check-outward-writes.mjs'],
    prelude:
      "import { realpathSync } from 'node:fs'\n" +
      "import { basename, dirname, join, resolve } from 'node:path'\n",
    exports: ['canonical', 'samePath'],
  },
]

const regionNamed = (name) => REGIONS.find((region) => region.name === name)

// The reader's copies, which the corpus below walks.
const GUARDS = Object.fromEntries(regionNamed('command reader').files.map((file) => [file, FILES[file]]))

// Neither guard can be imported: both read stdin at the top level and one of
// them installs itself. The two checks run on import too. So a region is lifted
// out by its markers instead. A marker that goes missing, or appears twice, fails
// here rather than shrinking what is compared.
function regionSource(file, name) {
  const lines = readFileSync(fileURLToPath(FILES[file]), 'utf8').split('\n')
  const at = (marker) => lines.flatMap((line, i) => (line.trimEnd() === marker ? [i] : []))
  const begins = at(`// BEGIN ${name}`)
  const ends = at(`// END ${name}`)
  assert.equal(begins.length, 1, `${file} should carry exactly one \`// BEGIN ${name}\` line, and carries ${begins.length}`)
  assert.equal(ends.length, 1, `${file} should carry exactly one \`// END ${name}\` line, and carries ${ends.length}`)
  assert.equal(begins[0] < ends[0], true, `${file} has the ${name} markers the wrong way round`)
  return lines.slice(begins[0] + 1, ends[0]).join('\n')
}

async function importRegion(file, name) {
  const region = regionNamed(name)
  const parts = [region.prelude ?? '']
  for (const needed of region.needs ?? []) parts.push(regionSource(file, needed))
  parts.push(regionSource(file, name))
  parts.push(`export { ${region.exports.join(', ')} }`)
  const module = parts.join('\n')
  return import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`)
}

// Whole lines that are entirely a comment, and blank ones. Comments are the one
// thing the copies are free to disagree about, and they should: the guest
// gate's reader explains itself to somebody reading it in a repository that is
// not ours. Stripping by whole line never reaches inside a string, which a
// cleverer stripper would eventually get wrong.
const codeLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))

// Every region's module, per file. Importing is itself the check that each
// region still declares what it is supposed to hold.
const modules = {}
for (const region of REGIONS) {
  modules[region.name] = Object.fromEntries(
    await Promise.all(region.files.map(async (file) => [file, await importRegion(file, region.name)])),
  )
}

const readers = modules['command reader']
const [FIRST, ...REST] = Object.keys(GUARDS)

// The drift control. It is a text comparison rather than a behavioural one on
// purpose: a corpus only covers the paths it happens to walk, and the two bugs
// that got us here were both in a path nobody had thought to write a line for.
//
// Every copy is compared against one of them rather than pairwise, because
// equality is transitive and a pairwise matrix would report one drift three
// times.
test('the marked region is big enough to be the reader', () => {
  for (const name of Object.keys(GUARDS)) {
    assert.equal(
      codeLines(regionSource(name, 'command reader')).length > 50,
      true,
      `${name}'s marked region is too small to be the reader`,
    )
  }
})

for (const region of REGIONS) {
  const [first, ...rest] = region.files
  for (const file of region.files) {
    test(`${file}'s ${region.name} region holds ${region.exports.join(', ')}`, () => {
      for (const name of region.exports) {
        assert.notEqual(modules[region.name][file][name], undefined, `${file}'s ${region.name} lost ${name}`)
      }
    })
  }
  for (const file of rest) {
    const label = region.name === 'command reader' ? 'the same reader' : `the same ${region.name}`
    test(`${file} carries ${label} as ${first}, comments aside`, () => {
      assert.deepEqual(
        codeLines(regionSource(file, region.name)),
        codeLines(regionSource(first, region.name)),
        `The ${region.name} region has drifted between ${first} and ${file}.\n` +
          'Every copy answers the same question and a fix belongs in all of them, in\n' +
          'one commit. ADR 0029 refuses a shared module; #93 holds the duplication.',
      )
    })
  }
}

// The stamp, #185. A copy of the reader that leaves for a host repository is a
// fourth copy nobody here can read, so each region carries a line naming the
// code it holds, and an operator compares that one line with the skill's. Since
// #201 every marked region carries one, each under its own label.
//
// It hashes exactly what the drift control above compares, `codeLines`, and
// that choice is forced rather than taste. The copies' comments differ on
// purpose, so a hash over them would give three stamps for one reader and the
// host would have nothing single to compare against. And the stamp is itself a
// comment inside the region it describes: `codeLines` drops it, so the hash
// never has to reach around its own line. What the normalisation drops is whole
// lines that start `//`, so a trailing comment on a line of code *is* hashed.
// That errs toward a stamp that moves when it need not, which costs one edit.
//
// It is checked here rather than in a script of its own because this file
// already owns the region and its normalisation. A second script would be a
// second copy of `codeLines`, and a second copy of a thing is how this whole
// area keeps going wrong.
const stampOf = (region) =>
  createHash('sha256').update(codeLines(region).join('\n')).digest('hex').slice(0, 16)

for (const region of REGIONS) {
  const pattern = new RegExp(`^// ${region.stamp}: sha256 ([0-9a-f]+)$`)
  for (const file of region.files) {
    test(`${file} carries a ${region.stamp} that matches its ${region.name}`, () => {
      const source = regionSource(file, region.name)
      const stamps = source
        .split('\n')
        .map((line) => pattern.exec(line.trim()))
        .filter(Boolean)
      const expected = stampOf(source)
      assert.equal(
        stamps.length,
        1,
        `${file} should carry exactly one \`// ${region.stamp}: sha256 <hash>\` line inside the ${region.name} region, and carries ${stamps.length}.\n` +
          `For the code it holds now, the line is: // ${region.stamp}: sha256 ${expected}`,
      )
      assert.equal(
        stamps[0][1],
        expected,
        `${file}'s ${region.stamp} does not match the code it stamps. The code changed and the stamp did not,\n` +
          'so a host repository comparing stamps would be told its copy is current when it is not.\n' +
          `Update the line, in all ${region.files.length} copies, to: // ${region.stamp}: sha256 ${expected}`,
      )
    })
  }
}

// What each helper region is for, pinned in every copy. The text comparison
// already makes the copies one; these make sure the one is right, and give
// `canonical` and `samePath` a test of their own, which until #201 they had
// only through their callers.
for (const [file, m] of Object.entries(modules['shell payload'])) {
  test(`${file}'s shell payload reads a nested shell's command line`, () => {
    assert.equal(m.commandName('C:\\Program Files\\Git\\bin\\GIT.EXE'), 'git')
    assert.equal(m.commandName('/usr/bin/gh'), 'gh')
    assert.equal(m.shellPayload(['bash', '-c', 'gh pr merge 42']), 'gh pr merge 42')
    assert.equal(m.shellPayload(['/usr/bin/pwsh.exe', '-Command', 'git push']), 'git push')
    assert.equal(m.shellPayload(['cmd', '/C', 'git push']), 'git push')
    assert.equal(m.shellPayload(['bash', 'script.sh']), null)
    assert.equal(m.shellPayload(['bash', '-c']), null)
    assert.equal(m.shellPayload(['node', '-c', 'x']), null)
  })
}

for (const [file, m] of Object.entries(modules['command arguments'])) {
  test(`${file}'s command arguments skip the global flags`, () => {
    assert.deepEqual(m.gitArguments(['git', '-C', 'repo', '-c', 'a=b', '--no-pager', 'push', 'origin']), ['push', 'origin'])
    assert.deepEqual(m.gitArguments(['/usr/bin/git.exe', 'push']), ['push'])
    assert.equal(m.gitArguments(['gh', 'pr', 'merge']), null)
    assert.deepEqual(m.ghArguments(['gh', '--repo', 'o/r', 'pr', 'merge', '42']), ['pr', 'merge', '42'])
    assert.deepEqual(m.ghArguments(['/usr/bin/gh', '-R', 'o/r', 'api', 'x']), ['api', 'x'])
    assert.equal(m.ghArguments(['git', 'push']), null)
  })
}

for (const [file, m] of Object.entries(modules['merge rule'])) {
  test(`${file}'s merge rule tells a merge from a read, REST and GraphQL`, () => {
    assert.equal(m.mergesThroughApi(['repos/o/r/pulls/1/merge', '-X', 'PUT']), true)
    assert.equal(m.mergesThroughApi(['--silent', 'repos/o/r/pulls/1/merge-async', '-X', 'PUT']), true)
    assert.equal(m.mergesThroughApi(['repos/o/r/pulls/1/merge']), false)
    assert.equal(m.mergesThroughApi(['repos/o/r/issues/1/comments', '-f', 'body=pulls/1/merge']), false)
    assert.equal(m.graphqlMerge(['graphql', '-f', 'query=mutation { mergePullRequest(input: {}) { clientMutationId } }']), 'merge')
    assert.equal(m.graphqlMerge(['graphql', '-f', 'query=query { search(query: "mergePullRequest") { issueCount } }']), null)
    assert.equal(m.graphqlMerge(['graphql', '-F', 'query=@q.graphql']), 'unreadable')
    assert.equal(m.graphqlMerge(['graphql', '--input', 'body.json']), 'unreadable')
    assert.equal(m.graphqlMerge(['repos/o/r/issues']), null)
  })
}

const scratch = mkdtempSync(join(tmpdir(), 'b-fac-paths-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

for (const [file, m] of Object.entries(modules['path comparison'])) {
  test(`${file}'s path comparison names a directory by what the filesystem calls it`, () => {
    const real = realpathSync.native(scratch)
    // What the filesystem calls it, whichever spelling it was asked with.
    assert.equal(m.canonical(scratch), real)
    assert.equal(m.canonical(tmpdir()), realpathSync.native(tmpdir()))
    // A tail that does not exist yet is kept as written, under the real head.
    assert.equal(m.canonical(join(scratch, 'not', 'yet')), join(real, 'not', 'yet'))
    assert.equal(m.samePath(scratch, real), true)
    assert.equal(m.samePath(scratch, `${scratch}${sep}`), true)
    assert.equal(m.samePath(join(scratch, 'gone'), join(real, 'gone')), true)
    assert.equal(m.samePath(join(scratch, 'a'), join(scratch, 'b')), false)
    assert.equal(m.samePath(scratch.toUpperCase(), scratch.toLowerCase()), process.platform === 'win32')
  })
}

// A corpus of lines chosen for how they *segment*, not for what any guard then
// decides about them. Half of these are allowed by all three; that is fine,
// because the assertion is about the tokens.
const CORPUS = [
  // Plain commands, and every way one follows another.
  'gh pr merge 42',
  'git push origin HEAD',
  'npm run check && git push origin HEAD',
  'cd repo; gh pr create --fill',
  'git status || git push',
  'npm run check\ngit push origin HEAD',
  'yes | gh pr merge 42',
  // Brackets that open a command, and brackets that are ordinary text.
  '(cd repo && git push)',
  '(cd repo && gh pr merge)',
  'echo "$(gh pr create --fill)"',
  'echo `gh pr merge 42`',
  'git commit -m "fix (again)"',
  'cd C:\\Program Files (x86)\\repo',
  // #135. A `$(...)` is a command *and* part of the argument it sits in, so it
  // has to segment as both.
  'node "$(git rev-parse --path-format=absolute --git-common-dir)/../scripts/check-guard-live.mjs"',
  'node $(cat pointer)/guard/check-guard-live.mjs',
  'echo "$(cat x)/gh pr merge"',
  '"$(cat pointer)/bin/gh" pr merge 42',
  'echo "$(cat a)$(cat b)"',
  'echo "$(cd repo && (pwd))"',
  "echo '$(gh pr merge 42)'",
  'gh pr merge $(cat',
  // Quotes decide structure and then come off the tokens.
  'gh pr "merge" 42',
  'gh pr me"rge" 42',
  "echo don't && git push origin HEAD",
  'gh issue comment 45 --body "| Command | Result |\n| gh pr merge --help | denied |"',
  // A heredoc body is data the shell hands to a command.
  "gh pr create --body \"$(cat <<'EOF'\n| gh pr merge 42 | denied |\nEOF\n)\"",
  // Escapes, and the Windows paths that made escaping selective.
  'git add "docs/notes (draft).md"',
  '\\git push origin HEAD',
  'git.exe push',
  '/usr/bin/gh pr create',
  // Reserved words and grouping, including the forms that empty a segment.
  '{ git push origin HEAD; }',
  'if gh pr checks 42; then gh pr merge 42; fi',
  'for b in a b; do git push origin $b; done',
  '! gh pr merge 42',
  'time npm run check',
  'time',
  'time; git status',
  'mkdir -p docs/{process,architecture}',
  // Assignment prefixes, #97, in both directions.
  'GH_TOKEN=x gh pr merge 42 --squash',
  'GIT_TRACE=1 git push origin HEAD',
  'FOO=1 BAR=2 gh pr merge 42',
  'FOO="a b" git push origin HEAD',
  'FOO=a\\ b git push origin HEAD',
  'GIT_TRACE=1 gh issue view 42',
  'FOO=1',
  '=x git push origin HEAD',
  'git commit -m "FOO=1"',
  'gh api repos/o/r/issues -f body="a=b"',
  'cd C:\\build\\out=release',
  'env GIT_TRACE=1 git push origin HEAD',
  // What each guard recurses into, read by this same function.
  'bash -c "gh pr merge 42"',
  'pwsh -Command "git commit -m \'gh pr create is denied in guest mode\'"',
  // Nothing at all.
  '',
  '   ',
]

for (const line of CORPUS) {
  test(`every reader segments alike: ${JSON.stringify(line)}`, () => {
    for (const name of REST) {
      assert.deepEqual(readers[name].segmentsOf(line), readers[FIRST].segmentsOf(line), name)
    }
  })
}

// Agreement alone is satisfied by readers that are wrong in the same way,
// which is precisely the state #97 found them in. So the cases this issue turns
// on are pinned to what the reader is supposed to produce, not only to each
// other.
const EXPECTED = [
  ['GH_TOKEN=x gh pr merge 42', [['gh', 'pr', 'merge', '42']]],
  ['FOO=1 BAR=2 git push origin HEAD', [['git', 'push', 'origin', 'HEAD']]],
  ['FOO="a b" git push origin HEAD', [['git', 'push', 'origin', 'HEAD']]],
  ['FOO=a\\ b git push origin HEAD', [['git', 'push', 'origin', 'HEAD']]],
  // An assignment behind a reserved word is stripped too, and `if` is not one
  // of the stripped words: the command it introduces is the condition, and
  // reading `if true` as a command named `if` costs nothing, because no rule
  // matches it either way.
  ['if true; then GIT_TRACE=1 git push; fi', [['if', 'true'], ['git', 'push'], ['fi']]],
  // An assignment with no command runs nothing, and the empty segment it leaves
  // is the case #90's filter already handles.
  ['FOO=1', []],
  ['FOO=1 BAR=2', []],
  // The name has to be a shell identifier. `=x` is a command name a shell fails
  // to find, so stripping it would invent a command that never ran.
  ['=x git push', [['=x', 'git', 'push']]],
  // An `=` that is not a leading token is an argument, and always was.
  ['git commit -m "FOO=1"', [['git', 'commit', '-m', 'FOO=1']]],
  ['gh api repos/o/r/issues -f body="a=b"', [['gh', 'api', 'repos/o/r/issues', '-f', 'body=a=b']]],
  ['gh pr create --field key=value', [['gh', 'pr', 'create', '--field', 'key=value']]],
  ['cd C:\\build\\out=release', [['cd', 'C:\\build\\out=release']]],
  // A wrapper command is not syntax, and stays open. See either guard's
  // NOT COVERED section for why that line is drawn where it is.
  ['env GIT_TRACE=1 git push', [['env', 'GIT_TRACE=1', 'git', 'push']]],

  // #135. A substitution is two things at once and the reader has to produce
  // both: the command it runs, and the argument its result becomes. Ending the
  // outer command at the `$(` produced only the first, so `node` and the script
  // it runs landed in different segments and every rule needing both saw
  // neither. The substitution's own command comes first because that is the
  // order a shell runs them in.
  [
    'node "$(cat pointer)/check-guard-live.mjs"',
    [
      ['cat', 'pointer'],
      ['node', '$()/check-guard-live.mjs'],
    ],
  ],
  // Quoting the substitution changes nothing: `$(` expands inside double quotes.
  [
    'node $(cat pointer)/check-guard-live.mjs',
    [
      ['cat', 'pointer'],
      ['node', '$()/check-guard-live.mjs'],
    ],
  ],
  // The direction that decides the placeholder's shape. The result is an
  // argument to `echo`, so the words after it are that argument's text and stay
  // in one token. A reader that broke the segment here would read `gh pr merge`
  // as a command and refuse a line that runs nothing of the sort, which is #58.
  [
    'echo "$(cat x)/gh pr merge"',
    [
      ['cat', 'x'],
      ['echo', '$()/gh pr merge'],
    ],
  ],
  // The result standing alone as an argument leaves the placeholder alone.
  [
    'echo "$(gh pr create --fill)"',
    [
      ['gh', 'pr', 'create', '--fill'],
      ['echo', '$()'],
    ],
  ],
  // Two of them in one argument, so the frames have to nest rather than share.
  // The `['echo', '$()']` in the middle is the second `$(`'s vanishing reading,
  // which by then has a word in front of it: `echo "$(cat a)"` is what the line
  // runs if `cat b` prints nothing.
  [
    'echo "$(cat a)$(cat b)"',
    [['cat', 'a'], ['echo', '$()'], ['cat', 'b'], ['echo', '$()$()']],
  ],
  // The vanishing reading is what keeps the deny direction from narrowing. A
  // placeholder glued to `merge` would otherwise stop this being a merge, and
  // `$(true)` prints nothing, so it merges.
  [
    'gh pr merge$(true)',
    [
      ['gh', 'pr', 'merge'],
      ['true'],
      ['gh', 'pr', 'merge$()'],
    ],
  ],
  // A subshell inside a substitution closes its own bracket. Without a frame
  // for `(`, the first `)` would put the outer argument back a bracket early.
  [
    'echo "$(cd repo && (pwd))"',
    [['cd', 'repo'], ['pwd'], ['echo', '$()']],
  ],
  // Single quotes do not expand a substitution, so there is no command in here
  // at all and the text is one argument.
  ["echo '$(gh pr merge 42)'", [['echo', '$(gh pr merge 42)']]],
  // A `$(` with no `)` must not swallow the command it interrupted. It did not
  // before, because the outer command was already closed at the `$(`; now the
  // frame is unwound at the end of the line to the same effect.
  [
    'gh pr merge $(cat',
    [
      ['cat'],
      ['gh', 'pr', 'merge', '$()'],
    ],
  ],
  // The brackets that are ordinary text still are. `(` and `)` have split this
  // line since #58 and the placeholder does not reach it, because no `$(` is
  // open for the `)` to close.
  [
    'cd C:\\Program Files (x86)\\repo',
    [['cd', 'C:\\Program', 'Files'], ['x86'], ['\\repo']],
  ],
  // #90, unchanged: a subshell's `)` still ends a command rather than gluing
  // itself to `merge`.
  [
    '(cd repo && gh pr merge)',
    [
      ['cd', 'repo'],
      ['gh', 'pr', 'merge'],
    ],
  ],
]

for (const [line, segments] of EXPECTED) {
  for (const name of Object.keys(GUARDS)) {
    test(`${name} reads ${JSON.stringify(line)} as ${JSON.stringify(segments)}`, () => {
      assert.deepEqual(readers[name].segmentsOf(line), segments)
    })
  }
}

// #199. How a `gh api` call reads is part of the region too. It lived beside
// the rules until then, in three copies that had drifted into two versions and
// shared one hole: each assumed every flag before the endpoint takes a value, so
// a flag that takes none swallowed it. The text comparison above now holds the
// copies together; these pin what the one reading is supposed to produce, from
// `gh api --help` on gh 2.101.0 and from gh's own `--verbose` output for the
// method forms.
const GH_API = [
  // The table #199 opened with.
  ['repos/o/r/pulls/1/merge -X PUT', ['repos/o/r/pulls/1/merge'], 'PUT'],
  ['--silent repos/o/r/pulls/1/merge -X PUT', ['repos/o/r/pulls/1/merge'], 'PUT'],
  ['--paginate repos/o/r/pulls/1/merge --method PUT', ['repos/o/r/pulls/1/merge'], 'PUT'],
  // A flag that takes a value, before the endpoint, still has its value taken.
  ['--jq .sha repos/o/r/pulls/1/merge -X PUT', ['repos/o/r/pulls/1/merge'], 'PUT'],
  ['-H "Accept: x" repos/o/r/issues', ['repos/o/r/issues'], 'GET'],
  // A flag the reader does not know stands alone, so whatever follows it is
  // still asked about. The wrong-way case costs a refusal, not a merge.
  ['--futureflag repos/o/r/pulls/1/merge', ['repos/o/r/pulls/1/merge'], 'GET'],
  ['--futureflag value repos/o/r/issues', ['value', 'repos/o/r/issues'], 'GET'],
  // The method: the last one wins, it is upper-cased, and it can share a token.
  ['-X GET -X PUT x', ['x'], 'PUT'],
  ['-XPUT x', ['x'], 'PUT'],
  ['-X=PUT x', ['x'], 'PUT'],
  ['-iXPUT x', ['x'], 'PUT'],
  ['--method=put x', ['x'], 'PUT'],
  // No method written down: a field or `--input` makes it a POST.
  ['repos/o/r/issues -f title=x', ['repos/o/r/issues'], 'POST'],
  ['repos/o/r/issues -ftitle=x', ['repos/o/r/issues'], 'POST'],
  ['repos/o/r/issues --raw-field=title=x', ['repos/o/r/issues'], 'POST'],
  ['repos/o/r/rulesets --input file.json', ['repos/o/r/rulesets'], 'POST'],
  ['repos/o/r/issues --method GET -f state=open', ['repos/o/r/issues'], 'GET'],
  // A field's value is payload, never an argument.
  ['repos/o/r/issues/1/comments -f body=repos/o/r/pulls/1/merge', ['repos/o/r/issues/1/comments'], 'POST'],
  // `--` ends the flags.
  ['-X PUT -- repos/o/r/pulls/1/merge', ['repos/o/r/pulls/1/merge'], 'PUT'],
  ['--method GET --silent graphql -f query=x', ['graphql'], 'GET'],
]

for (const [args, positionals, method] of GH_API) {
  for (const name of Object.keys(GUARDS)) {
    test(`${name} reads gh api ${args} as ${method} ${JSON.stringify(positionals)}`, () => {
      const [tokens] = readers[name].segmentsOf(`gh api ${args}`)
      const call = readers[name].ghApiCall(tokens.slice(2))
      assert.deepEqual(call.positionals, positionals)
      assert.equal(call.method, method)
      assert.equal(call.writes, !['GET', 'HEAD', 'OPTIONS'].includes(method))
    })
  }
}

// #210. The fields, because a GraphQL call's verb is in its `query` field. gh
// splits a field at its first `=`, and only `-F`/`--field` reads a value that
// starts with `@` from a file, which leaves its text off the command line and
// its value null. `--input` is the whole body from a file, and is named apart.
const GH_API_FIELDS = [
  ['graphql -f query=q', [{ key: 'query', value: 'q' }], null],
  ['graphql -fquery=a=b', [{ key: 'query', value: 'a=b' }], null],
  ['graphql --raw-field=query=q', [{ key: 'query', value: 'q' }], null],
  ['graphql -f query=@q', [{ key: 'query', value: '@q' }], null],
  ['graphql -F query=@q.graphql', [{ key: 'query', value: null }], null],
  ['graphql --field query=@-', [{ key: 'query', value: null }], null],
  ['graphql -F n=1 -f query=q', [{ key: 'n', value: '1' }, { key: 'query', value: 'q' }], null],
  ['graphql -f query', [{ key: 'query', value: '' }], null],
  ['graphql --input body.json', [], 'body.json'],
  ['graphql --input=-', [], '-'],
  ['repos/o/r/issues', [], null],
]

for (const [args, fields, input] of GH_API_FIELDS) {
  for (const name of Object.keys(GUARDS)) {
    test(`${name} reads the fields of gh api ${args}`, () => {
      const [tokens] = readers[name].segmentsOf(`gh api ${args}`)
      const call = readers[name].ghApiCall(tokens.slice(2))
      assert.deepEqual(call.fields, fields)
      assert.equal(call.input, input)
    })
  }
}
