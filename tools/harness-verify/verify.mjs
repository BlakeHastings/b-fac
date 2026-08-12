// Fails when a harness this repo claims to support does not discover the skill
// from a plain clone.
//
// WHAT THIS PREVENTS
// `scripts/check-plugin-load.mjs` proves the Claude Code loader finds the
// skill. Nothing proved it for anything else, and ADR 0003 rests entirely on
// the claim that roughly forty other harnesses read `.agents/skills/` with no
// glue at all. That claim was research, not observation. This observes it.
//
// WHY A CONTAINER
// Two reasons, and the second is the one that matters. The first is that the
// harnesses are not installed on most machines and installing four CLIs
// globally to run a check is not a reasonable ask. The second is that a
// developer machine is the worst possible place to test discovery: the machine
// this was written on has 53 skills in `~/.claude/skills` and `~/.agents/skills`
// that every one of these harnesses also loads, so "the skill was found" proves
// nothing about the repository. In the container the only skills on disk are
// the harnesses' own built-ins and this repo's.
//
// WHY THIS CAN RUN WITHOUT CREDENTIALS
// The same asymmetry `check-plugin-load.mjs` is built on. Running the harness
// needs auth; asking the harness what it discovered does not. `codex debug
// prompt-input`, `gemini skills list`, `copilot skill list --json` and
// `opencode debug skill` all answer from disk before any model is contacted,
// while `codex exec`, `gemini -p`, `copilot -p` and `opencode run` all demand
// credentials. No API key is used, set, or needed, here or in the image.
//
// IT CANNOT SILENTLY STOP CHECKING
// Every run probes twice: once against the repository, once against the same
// tree with `.agents/skills/` and `.claude/skills/` deleted. The sentinel must
// be in the first answer and out of the second. A parser that has quietly
// stopped matching anything fails the first assertion; a probe that has started
// reporting a stale cache fails the second. This repo has already shipped one
// check that scanned nothing and reported green — see
// docs/process/orchestrating.md — so the control is built in rather than left
// to whoever remembers to try it.
//
// WHAT IT STILL DOES NOT PROVE
// That the model chooses the skill, or that the prose is any good. And for
// three of the four harnesses it does not prove the body loaded: only opencode
// reports the skill text it is holding, so only opencode gets a size floor.
// codex, gemini and copilot would each report a `SKILL.md` gutted to its
// frontmatter exactly as they report the real one.
//
//   node tools/harness-verify/verify.mjs
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const IMAGE = 'b-fac-harness-verify'

// ADR 0003's claim in one string. A harness that resolved the Claude mirror
// instead would still name the skill, so the path is asserted, not just the
// name.
const CANONICAL = '/work/.agents/skills/'

// Only opencode reports the loaded body. The real skill is ~15 KB; this is a
// floor against a gutted payload, not a size budget, so it sits an order of
// magnitude below that. Raising it towards the real figure would turn ordinary
// editing into a red build.
const MIN_BODY_BYTES = 1500

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}

try {
  docker(['version', '--format', '{{.Server.Os}}'], { stdio: ['ignore', 'ignore', 'pipe'] })
} catch {
  console.error('Docker is not available. This check needs it; there is no host fallback.')
  console.error('Run `npm run check` for the checks that do not need a container.')
  process.exit(1)
}

console.error(`Building ${IMAGE} (first run installs four CLIs and takes a few minutes)...`)
docker(['build', '--quiet', '--tag', IMAGE, HERE], { stdio: ['ignore', 'inherit', 'inherit'] })

console.error('Probing...')
// Read-only, so a harness cannot write into the working tree it is inspecting.
// The probe copies it to a writable /work inside the container.
const run = ['run', '--rm', '--volume', `${ROOT}:/repo:ro`, IMAGE]
let report
try {
  report = JSON.parse(docker(run))
} catch (error) {
  console.error('The probe did not return a report. Its output was:\n')
  console.error((error.stderr || error.stdout || error.message).toString().trim())
  console.error(`\nReproduce by hand:\n  docker ${run.join(' ')}`)
  process.exit(1)
}

const { sentinel, frontmatter, present, absent } = report
const failures = []
const rows = []

if (frontmatter === null) {
  failures.push(
    `.agents/skills/${sentinel}/SKILL.md is missing.\n` +
      '    That is the skill this repository exists to ship. If it moved on purpose,\n' +
      '    update SENTINEL in probe.mjs and say why in the pull request.',
  )
}

for (const harness of Object.keys(present)) {
  const found = present[harness]
  const stillThere = absent[harness]

  if (found === null) {
    failures.push(`${harness}: did not discover ${sentinel} at all.`)
    rows.push([harness, 'NOT DISCOVERED', '', ''])
    continue
  }
  if (found.error) {
    failures.push(`${harness}: the probe command failed.\n    ${found.error.replaceAll('\n', '\n    ')}`)
    rows.push([harness, 'PROBE FAILED', '', ''])
    continue
  }

  if (!found.path.startsWith(CANONICAL)) {
    failures.push(
      `${harness}: resolved ${found.path}, which is not under ${CANONICAL}.\n` +
        '    ADR 0003 says the canonical tree is what non-Claude harnesses read;\n' +
        '    .claude/skills/ is a generated mirror and must not be what answers.',
    )
  }

  // A harness that names the skill but reports a description the file does not
  // contain has parsed the frontmatter wrongly, which is invisible in a listing
  // and very visible to the model.
  if (frontmatter !== null && !frontmatter.includes(found.description.replace(/\s+/g, ' ').trim())) {
    failures.push(
      `${harness}: reported a description that does not occur in the SKILL.md frontmatter.\n` +
        `    reported: ${found.description.slice(0, 160)}...`,
    )
  }

  if (found.bodyBytes !== null && found.bodyBytes < MIN_BODY_BYTES) {
    failures.push(
      `${harness}: discovered ${sentinel} but is holding only ${found.bodyBytes} bytes of it.\n` +
        `    Under ${MIN_BODY_BYTES} means the body is effectively empty: a skill that is\n` +
        '    invocable and says nothing.',
    )
  }

  // The negative control. See the header.
  if (stillThere !== null) {
    failures.push(
      `${harness}: still reported ${sentinel} after both skill trees were deleted.\n` +
        '    That means this check cannot fail, so its passes mean nothing. Likely a\n' +
        '    cache in the harness, or a copy of the skill somewhere the deletion missed.',
    )
  }

  // The name is printed because it is not always the sentinel: codex namespaces
  // it under this repo's plugin manifest, and that is the name a user types.
  rows.push([
    harness,
    found.name,
    found.path.startsWith(CANONICAL) ? found.path.slice(CANONICAL.length) : found.path,
    found.bodyBytes === null ? 'body not reported' : `${found.bodyBytes} bytes`,
  ])
}

const widths = [0, 1, 2, 3].map((column) => Math.max(0, ...rows.map((row) => row[column].length)))
for (const row of rows) {
  console.log(`  ${row.map((cell, column) => cell.padEnd(widths[column])).join('  ')}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} harness problem${failures.length === 1 ? '' : 's'}:\n`)
  for (const failure of failures) console.error(`  ${failure}\n`)
  console.error('Reproduce by hand:')
  console.error(`  docker run --rm -v "${ROOT}:/repo:ro" ${IMAGE}`)
  process.exit(1)
}

console.log(
  `\n${rows.length} harnesses discovered ${sentinel} under .agents/skills/ with no credentials,` +
    '\nand none of them still saw it once the skill trees were deleted.',
)
