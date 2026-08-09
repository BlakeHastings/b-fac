// Mirrors the canonical skills into the one location that will not read them.
//
// WHY THIS EXISTS
// `.agents/skills/` is the cross-harness convention: the Agent Skills client
// implementation guide tells every client to scan `.<client>/skills/` and
// `.agents/skills/`, and around forty products comply. Claude Code does not.
// It reads `~/.claude/skills/`, `.claude/skills/`, and a plugin's declared
// skill paths, and nothing else.
//
// So a Claude user who INSTALLS the plugin is fine — .claude-plugin/plugin.json
// points at `.agents/skills/` directly. This script is for the other Claude
// user: the contributor who clones this repo to work on the skill, and who
// would otherwise be the only person in the ecosystem unable to run it.
//
// WHY A COPY AND NOT A SYMLINK
// This repo is developed on Windows. Without Developer Mode and
// `core.symlinks=true`, git does not fail on a symlink — it writes a small
// text file containing the link target and exits 0. The result is a SKILL.md
// whose entire content is the string `../../.agents/skills/...`, which loads
// as a skill and silently does nothing. A copy cannot fail that way.
//
//   node scripts/sync-harnesses.mjs           # write the mirror
//   node scripts/sync-harnesses.mjs --check   # fail if it has drifted
import { readdirSync, readFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const CANONICAL = '.agents/skills'
const MIRROR = '.claude/skills'
const check = process.argv.includes('--check')

function tree(root) {
  const files = new Map()
  if (!existsSync(root)) return files
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.set(relative(root, full).replaceAll('\\', '/'), readFileSync(full))
    }
  }
  walk(root)
  return files
}

const source = tree(CANONICAL)
if (source.size === 0) {
  console.error(`Nothing in ${CANONICAL}. That is the canonical location; refusing to`)
  console.error(`wipe ${MIRROR} on the assumption it was meant to be empty.`)
  process.exit(1)
}

const mirror = tree(MIRROR)

const drift = []
for (const [path, bytes] of source) {
  const other = mirror.get(path)
  if (other === undefined) drift.push(`missing from the mirror: ${path}`)
  else if (!other.equals(bytes)) drift.push(`differs: ${path}`)
}
for (const path of mirror.keys()) {
  if (!source.has(path)) drift.push(`stale in the mirror, not in canonical: ${path}`)
}

if (drift.length === 0) {
  console.log(`${MIRROR} is in sync with ${CANONICAL} (${source.size} files).`)
  process.exit(0)
}

if (check) {
  console.error(`${MIRROR} has drifted from ${CANONICAL}:\n`)
  for (const line of drift) console.error(`  ${line}`)
  console.error(`\nEdit ${CANONICAL} — it is the canonical copy — then run:`)
  console.error(`  npm run sync`)
  console.error(`\nIf you edited the mirror by mistake, your change is about to be`)
  console.error(`overwritten. Move it to ${CANONICAL} first.`)
  process.exit(1)
}

rmSync(MIRROR, { recursive: true, force: true })
mkdirSync(MIRROR, { recursive: true })
cpSync(CANONICAL, MIRROR, { recursive: true })
console.log(`Wrote ${source.size} files to ${MIRROR}.`)
for (const line of drift) console.log(`  ${line}`)
