// Asks each installed harness what skills it discovered in /work, and prints
// the answers as JSON on stdout. Runs inside the container built by the
// Dockerfile beside this file; verify.mjs on the host does the judging.
//
// It probes twice. The first pass is the repository as mounted. The second is
// the same tree with every skill directory deleted, which is the control that
// stops this from becoming a check that cannot fail. Both answers go in the
// JSON and verify.mjs requires the sentinel in the first and absent from the
// second.
//
// Nothing here needs credentials. That is the whole reason a container helps:
// `codex exec`, `gemini -p` and `copilot -p` all run inference and all demand
// auth, and auth inside a container is still auth. The four commands below
// print what the harness found on disk before any model is contacted.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'

const MOUNT = '/repo'
const WORK = '/work'

// The skill this repo exists to ship. Same sentinel as
// scripts/check-plugin-load.mjs, for the same reason: derive the expectation
// from a name, not from a directory listing, so that deleting the tree fails
// loudly instead of matching an empty expectation against an empty inventory.
const SENTINEL = 'orchestrated-delivery'

// ADR 0003: `.agents/skills/` is canonical and `.claude/skills/` is a generated
// mirror for Claude Code alone. Every harness here is supposed to read the
// canonical path from a plain clone with no glue, so the probe reports the path
// each harness resolved and verify.mjs insists it is the canonical one. Both
// trees are deleted for the negative control, otherwise a harness that quietly
// fell back to the mirror would keep the control green.
const SKILL_TREES = [`${WORK}/.agents/skills`, `${WORK}/.claude/skills`]

function run(argv) {
  return execFileSync(argv[0], argv.slice(1), {
    cwd: WORK,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// Every harness answers the same three questions in its own shape: what is the
// skill called, what description did it parse out of the frontmatter, and which
// file did it read. `body` is the loaded skill text and is null wherever the
// harness does not expose it — only opencode does, and it is the only one of
// the four that can tell a real skill from a gutted one.
const HARNESSES = {
  // Renders the model-visible prompt input as JSON, skills block included. This
  // is a stronger signal than a listing: it is not "the CLI can enumerate a
  // directory", it is "this text is what the model would have received".
  codex: {
    probe: () => {
      const messages = JSON.parse(run(['codex', 'debug', 'prompt-input']))
      const text = messages
        .flatMap((message) => message.content ?? [])
        .map((part) => part.text ?? '')
        .find((part) => part.includes('<skills_instructions>'))
      if (text === undefined) return []
      // `- name: description (file: /path/to/SKILL.md)`, one per line. The name
      // may carry a plugin namespace, so the colon is part of it — see the note
      // on namespacing above `matchesSentinel`.
      return [...text.matchAll(/^- ([\w:.-]+): (.*) \(file: (.+)\)$/gm)].map((m) => ({
        name: m[1],
        description: m[2],
        path: m[3],
        body: null,
      }))
    },
  },

  gemini: {
    // Gemini skips project skills in an untrusted folder and says so rather
    // than failing, so without this the probe would report a clean, confident,
    // wrong "not discovered". `--skip-trust` is the documented alternative and
    // is not usable here: it routes through a code path that demands
    // GEMINI_API_KEY before it will list anything.
    setup: () => {
      mkdirSync('/root/.gemini', { recursive: true })
      writeFileSync('/root/.gemini/trustedFolders.json', JSON.stringify({ [WORK]: 'TRUST_FOLDER' }))
    },
    probe: () => {
      const out = run(['gemini', 'skills', 'list'])
      // `name [Enabled]`, then indented `Description:` and `Location:` lines.
      return [
        ...out.matchAll(/^(\S+) \[\w+\]\n\s+Description:\s*(.*)\n\s+Location:\s*(.*)$/gm),
      ].map((m) => ({ name: m[1], description: m[2].trim(), path: m[3].trim(), body: null }))
    },
  },

  copilot: {
    probe: () =>
      JSON.parse(run(['copilot', 'skill', 'list', '--json'])).map((skill) => ({
        name: skill.name,
        description: skill.description,
        // A directory here, where the others give the SKILL.md itself.
        path: skill.path,
        body: null,
      })),
  },

  opencode: {
    probe: () =>
      JSON.parse(run(['opencode', 'debug', 'skill'])).map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.location,
        body: skill.content,
      })),
  },
}

// Codex namespaces a discovered skill under the plugin that supplies it, the
// way Claude Code does, and this repo's `.claude-plugin/plugin.json` is enough
// to trigger it: codex 0.147.0 reports `b-fac:orchestrated-delivery` with the
// manifest present and a bare `orchestrated-delivery` with it moved aside. The
// namespace is reported back to verify.mjs rather than normalised away, because
// it is the name a Codex user has to type.
const matchesSentinel = (name) => name === SENTINEL || name.endsWith(`:${SENTINEL}`)

function sentinelFrom(harness) {
  try {
    const found = HARNESSES[harness].probe().find((skill) => matchesSentinel(skill.name))
    if (!found) return null
    // The body can be megabytes; verify.mjs only needs its size.
    return { ...found, body: undefined, bodyBytes: found.body?.length ?? null }
  } catch (error) {
    return { error: (error.stderr || error.stdout || error.message).toString().trim().slice(0, 2000) }
  }
}

execFileSync('cp', ['-a', `${MOUNT}/.`, WORK], { stdio: 'inherit' })
for (const harness of Object.values(HARNESSES)) harness.setup?.()

// The canonical frontmatter, whitespace-collapsed, so verify.mjs can require
// that what a harness reports as the description actually occurs in it. The
// description is a YAML folded scalar and each harness unfolds it slightly
// differently, so this is deliberately a haystack to search rather than a
// string to equal — the failure worth catching is a harness reporting a
// truncated or invented description, not a disagreement about line wrapping.
//
// Null when the file is not there. All the judging lives in verify.mjs, and a
// missing sentinel is a finding to report rather than a reason to abort: the
// probe still runs, so the output says both that the repo has no skill and
// that no harness found one.
const source = existsSync(`${WORK}/.agents/skills/${SENTINEL}/SKILL.md`)
  ? readFileSync(`${WORK}/.agents/skills/${SENTINEL}/SKILL.md`, 'utf8')
  : null
const declared = source === null ? null : /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)

const names = Object.keys(HARNESSES)
const present = Object.fromEntries(names.map((name) => [name, sentinelFrom(name)]))

for (const tree of SKILL_TREES) rmSync(tree, { recursive: true, force: true })
const absent = Object.fromEntries(names.map((name) => [name, sentinelFrom(name)]))

process.stdout.write(
  JSON.stringify(
    {
      sentinel: SENTINEL,
      frontmatter: declared === null ? null : declared[1].replace(/\s+/g, ' ').trim(),
      present,
      absent,
    },
    null,
    2,
  ),
)
