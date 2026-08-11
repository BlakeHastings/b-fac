// Fails when the Claude Code plugin loader does not discover this repo's
// skills, even though every manifest is valid.
//
// WHAT THIS PREVENTS
// `claude plugin validate --strict` proves the JSON parses. It says nothing
// about whether a skill was found: point `plugin.json`'s `skills` field at an
// empty directory and validation still passes, cleanly, with a tick. So does a
// `SKILL.md` containing nothing but a file path. docs/process/review.md has
// warned about this since the repo was set up, and until now nothing checked
// it — Lens 1 was a human running `claude --plugin-dir .` by hand.
//
// This runs the real loader instead. `claude --plugin-dir . plugin details`
// resolves the plugin from disk exactly as a session would and prints the
// component inventory it ended up with. Every skill in `.agents/skills/` must
// appear in that inventory, and nothing else may.
//
// WHY NOT `claude -p`
// Because that runs inference, which needs credentials, and a public repo's
// `pull_request` runs from forks get no secrets. `plugin details` needs no
// credentials at all — verified against an empty CLAUDE_CONFIG_DIR with no
// ANTHROPIC_API_KEY, where `claude --bare -p` exits 1 with "Not logged in".
// That is the whole reason this check can be a required one.
//
// IT ALSO PREVENTS A COPY THAT IS NOT THIS ONE ANSWERING
// Finding the plugin's skill is not the same as being unable to reach anything
// else by that name. See "SHADOWING" below.
//
// WHAT IT STILL DOES NOT PROVE
// That the model chooses the skill, or that the skill's prose is any good.
// Only that the harness found it, parsed its frontmatter, is holding it as an
// invocable component of this plugin, and that its body is not empty.
//
//   node scripts/check-plugin-load.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ADR 0003: `.agents/skills/` is canonical and `.claude/skills/` is a mirror.
// Deriving the expectation from the canonical tree rather than from the
// manifest is deliberate — read it from the manifest and a manifest pointing
// at an empty directory would expect nothing, find nothing, and pass.
const CANONICAL_SKILLS = join(ROOT, '.agents', 'skills')

// The skill this repo exists to ship. Named here so that deleting the entire
// canonical tree fails loudly instead of passing with an empty expectation
// matching an empty inventory. This repo has already shipped one check that
// scanned nothing and reported green; see docs/process/orchestrating.md.
const SENTINEL = 'orchestrated-delivery'

// The floor, in tokens, for what the loader must be holding as the sentinel's
// body. A discovered skill is not the same as a loaded one: a SKILL.md
// containing nothing but a file path — review.md's own example of something
// that validates perfectly — is discovered, named in the inventory, and worth
// under 20 tokens. The real skill measures 2.2k–3.1k, the spread depending on
// the config dir, so this is set an order of magnitude below the low end. It
// is a floor against a gutted payload, not a size budget; raising it towards
// the real figure would turn ordinary editing into a red build.
const SENTINEL_MIN_TOKENS = 500

// SHADOWING
// Where a bare skill name resolves before it ever reaches this plugin. Claude
// Code's precedence is enterprise, then personal, then project, then bundled;
// a plugin's skills sit outside that ladder entirely and are reachable only as
// `<plugin>:<skill>`. The docs are explicit: "enterprise overrides personal,
// and personal overrides project ... Plugin skills use a
// `plugin-name:skill-name` namespace, so they cannot conflict with other
// levels." https://code.claude.com/docs/en/skills
//
// Read the second half of that sentence the other way round and it is the
// problem: the bare name cannot conflict with the plugin because it never
// reaches the plugin. Proven on this repo rather than inferred — with a stale
// 206-line copy at ~/.claude/skills/orchestrated-delivery and the real skill
// loaded through `--plugin-dir`, `Skill(skill: "orchestrated-delivery")`
// returned the stale body, and it still did with a project-level copy present
// as well. Only `b-fac:orchestrated-delivery` returned the loaded one.
//
// Lens 1 of docs/process/review.md asks a reviewer to load the skill and judge
// the words. Against a shadowing copy that reviewer reads a different file and
// reports green, which is the most expensive way for a check to be wrong. A
// personal copy is allowed here — the owner may well want the skill outside
// this repo — but one that *disagrees* is not, because disagreement is the
// only part of this that can lie.
//
// This reads the filesystem instead of the loader because no credential-free
// `claude` command enumerates the personal level; `plugin details` only ever
// describes the plugin. It runs before the CLI is invoked, so a shadowed
// machine is reported as shadowed rather than as whatever the loader says next.
//
// The enterprise level outranks personal and is not checked. Its path is
// platform-specific and there is no managed-settings deployment here to verify
// against, so it would be a code path nobody has ever run.
const PERSONAL_SKILLS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills')

// Both the namespace a plugin skill is invoked under and the name the loader
// must report back, so it is read once rather than assumed twice.
const MANIFEST_NAME = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
).name

// The npm-installed CLI is a `.cmd` shim on Windows, which execFileSync cannot
// exec directly. No argument below contains a space, so a shell is safe here.
const NEEDS_SHELL = process.platform === 'win32'

function claude(args) {
  try {
    return execFileSync('claude', args, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: NEEDS_SHELL,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    console.error(`\`claude ${args.join(' ')}\` failed.\n`)
    console.error(error.stderr?.trim() || error.stdout?.trim() || error.message)
    console.error('\nInstall the CLI, or run `npm run check` for the checks that do not need it.')
    process.exit(1)
  }
}

function fail(...lines) {
  console.error(lines.join('\n'))
  process.exit(1)
}

// The CLI prints token counts as `~290`, `~3.1k` or `< 20`. `< 20` is an upper
// bound, so reading it as 20 is the reading least likely to fail the build.
function parseTokens(text) {
  const [, digits, scale] = /([\d.]+)\s*([kM]?)/.exec(text)
  return Number(digits) * { '': 1, k: 1_000, M: 1_000_000 }[scale]
}

// What the repo says it ships.
if (!existsSync(CANONICAL_SKILLS)) {
  fail(`${CANONICAL_SKILLS} does not exist. ADR 0003 says that is where skills live.`)
}
const expected = readdirSync(CANONICAL_SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(CANONICAL_SKILLS, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort()

if (expected.length === 0) {
  fail('No skill directory under .agents/skills/ contains a SKILL.md.')
}
if (!expected.includes(SENTINEL)) {
  fail(
    `.agents/skills/${SENTINEL}/SKILL.md is missing.`,
    'That is the skill this repository exists to ship. If it moved on purpose,',
    'update SENTINEL in this script and say why in the pull request.',
  )
}

// Nothing that outranks the plugin may disagree with it. See SHADOWING above.
// Newlines are normalised because a CRLF checkout is not a difference of
// wording, and wording is the only thing worth failing a build over.
function skillTree(root) {
  const files = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const key = relative(root, full).replaceAll('\\', '/')
        files.set(key, readFileSync(full, 'utf8').replaceAll('\r\n', '\n'))
      }
    }
  }
  walk(root)
  return files
}

const shadowed = []
for (const name of expected) {
  const personal = join(PERSONAL_SKILLS, name)
  if (!existsSync(join(personal, 'SKILL.md'))) continue

  const ours = skillTree(join(CANONICAL_SKILLS, name))
  const theirs = skillTree(personal)
  const differences = []
  for (const [path, text] of ours) {
    if (!theirs.has(path)) differences.push(`only in this repo: ${path}`)
    else if (theirs.get(path) !== text) differences.push(`differs: ${path}`)
  }
  for (const path of theirs.keys()) {
    if (!ours.has(path)) differences.push(`only in the personal copy: ${path}`)
  }
  if (differences.length > 0) shadowed.push({ name, personal, differences })
}

if (shadowed.length > 0) {
  console.error('A personal skill outranks this plugin and says something different.\n')
  for (const { name, personal, differences } of shadowed) {
    console.error(`  ${personal}`)
    for (const line of differences.slice(0, 10)) console.error(`    ${line}`)
    if (differences.length > 10) {
      console.error(`    ...and ${differences.length - 10} more`)
    }
    console.error(`    Invoking \`${name}\` by bare name reads that tree, not this one.`)
    console.error('')
  }
  const [{ name, personal }] = shadowed
  fail(
    'Verifying a change to this repo in a session on this machine would exercise',
    'the personal copy, not the change. That is how this check was earned: an',
    'agent read 206 lines of pre-change text and would have reported it green.',
    '',
    'Either delete the personal copy and invoke plugin skills as',
    `\`${MANIFEST_NAME}:${name}\`, or keep it and re-copy it from canonical`,
    'whenever this repo\'s skill changes:',
    '',
    `  PowerShell: Remove-Item -Recurse -Force "${personal}"; ` +
      `Copy-Item -Recurse "${join(CANONICAL_SKILLS, name)}" "${personal}"`,
    `  POSIX:      rm -rf "${personal}" && cp -r "${join(CANONICAL_SKILLS, name)}" "${personal}"`,
  )
}

// What the loader actually found. `--plugin-dir` loads the plugin for this
// invocation only; the docs require the flag to precede the subcommand.
const listed = JSON.parse(claude(['--plugin-dir', '.', 'plugin', 'list', '--json']))
const rootReal = realpathSync(ROOT)
const session = listed.filter(
  (plugin) => plugin.scope === 'session' && realpathSync(plugin.installPath) === rootReal,
)

if (session.length !== 1) {
  fail(
    `Expected exactly one session-scope plugin loaded from ${ROOT}, found ${session.length}.`,
    `\`claude --plugin-dir . plugin list --json\` returned:\n${JSON.stringify(listed, null, 2)}`,
  )
}

const [plugin] = session
if (!plugin.id.startsWith(`${MANIFEST_NAME}@`)) {
  fail(`Loaded plugin is "${plugin.id}", but plugin.json declares the name "${MANIFEST_NAME}".`)
}

const details = claude(['--plugin-dir', '.', 'plugin', 'details', plugin.id])

// `  Skills (1)  orchestrated-delivery` — the count and the names are printed
// independently, so disagreement between them means the format moved and this
// parser is reading something other than what it thinks.
const inventory = /^\s*Skills \((\d+)\)(.*)$/m.exec(details)
if (!inventory) {
  fail(
    'Could not find the Skills line in `claude plugin details` output.',
    'The output format changed. Re-read it and fix this parser rather than',
    `deleting the check.\n\n${details}`,
  )
}
const [, rawCount, rawNames] = inventory
const found = rawNames
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)
  .sort()

if (found.length !== Number(rawCount)) {
  fail(
    `\`plugin details\` reported Skills (${rawCount}) but named ${found.length}: ${found.join(', ')}`,
    'The output format changed. Fix this parser.',
  )
}

const missing = expected.filter((name) => !found.includes(name))
const extra = found.filter((name) => !expected.includes(name))

if (missing.length > 0 || extra.length > 0) {
  console.error('The plugin loaded, but its skill inventory is not what this repo ships.\n')
  if (missing.length > 0) {
    console.error(`  In .agents/skills/ but NOT loaded: ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    console.error(`  Loaded but not in .agents/skills/: ${extra.join(', ')}`)
  }
  console.error(
    [
      '',
      'Usual cause: the `skills` field in .claude-plugin/plugin.json no longer',
      'points at the directory the skill is in. `plugin validate` passes either',
      'way, which is why this check exists.',
      '',
      'Reproduce by hand:',
      '  claude --plugin-dir . plugin details ' + plugin.id,
    ].join('\n'),
  )
  process.exit(1)
}

// `  orchestrated-delivery       ~290      ~3.1k` — the loader's own count of
// what it is holding for this skill, which is the closest a credential-free
// command gets to "the body loaded" rather than "the name was seen".
const cost = new RegExp(`^\\s*${SENTINEL}\\s+.*?(<\\s*\\d+|~[\\d.]+[kM]?)\\s*$`, 'm').exec(details)
if (!cost) {
  fail(
    `Could not find the per-component cost row for ${SENTINEL}.`,
    `The output format changed. Fix this parser.\n\n${details}`,
  )
}

const onInvoke = cost[1]
if (parseTokens(onInvoke) < SENTINEL_MIN_TOKENS) {
  fail(
    `${SENTINEL} was discovered, but the harness is holding only ${onInvoke} tokens of it.`,
    `Under ${SENTINEL_MIN_TOKENS} means the body is effectively empty: a skill that is`,
    'invocable and says nothing. `plugin validate` passes on a SKILL.md',
    'containing one line, which is why this floor exists.',
  )
}

console.log(
  `${plugin.id} loaded from disk with ${found.length} skill${found.length === 1 ? '' : 's'}: ${found.join(', ')}`,
)
console.log(`${SENTINEL} costs ${onInvoke} tokens on invoke, so its body loaded too.`)
console.log(
  `No skill under ${PERSONAL_SKILLS} outranks it with different words, so ` +
    `\`${MANIFEST_NAME}:${SENTINEL}\` and the bare name agree.`,
)
