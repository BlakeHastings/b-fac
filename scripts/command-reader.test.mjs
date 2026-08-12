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
// WHAT IT COMPARES, AND WHAT IT DELIBERATELY DOES NOT
// The *reader*: how a line becomes segments and tokens. Not the verdicts. The
// guards' rules genuinely differ and are meant to. #98 measured `\git push`,
// `/usr/bin/gh pr create` and `git.exe push` denied by the guest gate and
// allowed by this repository's merge guard, because every rule there goes
// through `commandName` while `ghArguments` there compares the raw token. ADR
// 0032 keeps a push rule in the shipped guard that ADR 0001 deleted from this
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
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BEGIN = '// BEGIN command reader'
const END = '// END command reader'

const GUARDS = {
  'scripts/guard-merge.mjs': new URL('./guard-merge.mjs', import.meta.url),
  'assets/guard-guest-writes.mjs': new URL(
    '../.agents/skills/orchestrated-delivery/assets/guard-guest-writes.mjs',
    import.meta.url,
  ),
  'assets/guard-merge.mjs': new URL(
    '../.agents/skills/orchestrated-delivery/assets/guard-merge.mjs',
    import.meta.url,
  ),
}

// Neither guard can be imported: both read stdin at the top level and one of
// them installs itself. So the reader is lifted out by its markers instead. A
// marker that goes missing fails here rather than shrinking what is compared.
function readerSource(url) {
  const source = readFileSync(fileURLToPath(url), 'utf8')
  const from = source.indexOf(BEGIN)
  const to = source.indexOf(END)
  assert.notEqual(from, -1, `${url} carries no \`${BEGIN}\` marker`)
  assert.notEqual(to, -1, `${url} carries no \`${END}\` marker`)
  assert.equal(from < to, true, `${url} has the reader markers the wrong way round`)
  return source.slice(from + BEGIN.length, to)
}

async function readerOf(url) {
  const module = `${readerSource(url)}\nexport { segmentsOf }\n`
  return import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`)
}

// Whole lines that are entirely a comment, and blank ones. Comments are the one
// thing the two copies are free to disagree about, and they should: the guest
// gate's reader explains itself to somebody reading it in a repository that is
// not ours. Stripping by whole line never reaches inside a string, which a
// cleverer stripper would eventually get wrong.
const codeLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))

const readers = Object.fromEntries(
  await Promise.all(Object.entries(GUARDS).map(async ([name, url]) => [name, await readerOf(url)])),
)
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
      codeLines(readerSource(GUARDS[name])).length > 50,
      true,
      `${name}'s marked region is too small to be the reader`,
    )
  }
})

for (const name of REST) {
  test(`${name} carries the same reader as ${FIRST}, comments aside`, () => {
    assert.deepEqual(
      codeLines(readerSource(GUARDS[name])),
      codeLines(readerSource(GUARDS[FIRST])),
      `The command reader has drifted between ${FIRST} and ${name}.\n` +
        'Every copy answers the same question and a fix belongs in all of them, in\n' +
        'one commit. ADR 0029 refuses a shared module; #93 holds the duplication.',
    )
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
]

for (const [line, segments] of EXPECTED) {
  for (const name of Object.keys(GUARDS)) {
    test(`${name} reads ${JSON.stringify(line)} as ${JSON.stringify(segments)}`, () => {
      assert.deepEqual(readers[name].segmentsOf(line), segments)
    })
  }
}
