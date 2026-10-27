// Fails when `claude plugin validate . --strict` reports anything this
// repository has not accepted by name.
//
// WHY NOT THE BARE COMMAND
// From 2.1.310 the validator warns that `CLAUDE.md` at the plugin root is not
// loaded as project context, and `--strict` turns that into exit 1 on every
// run. That is ADR 0014's revisit trigger. ADR 0077 revisited it and kept the
// file, so the bare command can no longer be the gate: it would be red for
// ever, and a check everyone learns to ignore stops being one.
//
// WHY THIS IS NOT THE FILTER ADR 0014 REJECTED
// That ADR rejected "a script that hides one known line", because it will one
// day hide an unknown one. This one reads the CLI's `--json` report rather
// than its text, and passes only when every finding is in ACCEPTED below,
// matched on the file, the path and the exact message. Anything else fails:
// an error of any kind, a warning nobody accepted, a reworded message, a
// strict failure this script cannot attribute, and an acceptance that no
// longer matches anything.
//
// IT IS STRICTER THAN `--strict`, ON PURPOSE
// The CLI also prints "plugin directory" findings and says they "do not change
// the result". This script counts them too, so a new one fails here until it
// is accepted or fixed. ICON_MISSING is the one accepted today.
//
//   node scripts/check-plugin.mjs
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Each entry is a finding's key exactly as `findings()` builds it and as this
// script prints it when it fails, so accepting a new one is a copy, and an ADR
// to say why. Keep the reason next to the key, not only in the ADR.
export const ACCEPTED = [
  // ADR 0077, amending ADR 0014. The file is the `@AGENTS.md` bridge for
  // people working on this repo; it is inert for installers, which is all the
  // warning says.
  'validator CLAUDE.md root: CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.',
  // ADR 0077. The fix is a 512 to 2048 px PNG that nobody has drawn, and this
  // plugin is published through its own marketplace, not the directory.
  'directory .claude-plugin/plugin.json ICON_MISSING',
]

function relativeFile(file) {
  return relative(ROOT, file).split(sep).join('/')
}

// Flattens the report into one key per finding. `severity` is carried so the
// failure message can say "error" where it was one.
export function findings(report) {
  const out = []
  for (const section of [report.manifest, ...(report.contents ?? [])]) {
    const file = relativeFile(section.file)
    for (const [severity, list] of [['error', section.errors], ['warning', section.warnings]]) {
      for (const item of list ?? []) {
        out.push({ severity, key: `validator ${file} ${item.path}: ${item.message}` })
      }
    }
  }
  for (const item of report.directory?.findings ?? []) {
    out.push({ severity: item.severity, key: `directory ${item.file} ${item.code}` })
  }
  return out
}

// Returns the lines to print on failure, empty when the report passes.
export function judge(report, accepted = ACCEPTED) {
  if (!report?.manifest || !Array.isArray(report.contents)) {
    return ['The validator report has no `manifest` or `contents`, so there is nothing here to judge.']
  }
  const found = findings(report)
  const problems = []
  for (const { severity, key } of found) {
    if (severity === 'error') problems.push(`error, which cannot be accepted: ${key}`)
    else if (!accepted.includes(key)) problems.push(`not accepted: ${key}`)
  }
  for (const key of accepted) {
    if (!found.some((f) => f.key === key)) {
      problems.push(`accepted but no longer reported, so remove it from ACCEPTED: ${key}`)
    }
  }
  // A strict failure must be explained by a validator warning read above. If
  // the CLI failed and none was, it failed for a reason this script does not
  // read, and passing would be guessing.
  if (report.success === false && problems.length === 0
    && !found.some((f) => f.key.startsWith('validator '))) {
    problems.push('the validator failed, and its report names no finding this script reads.')
  }
  return problems
}

function main() {
  // The npm-installed CLI is a `.cmd` shim on Windows, which spawnSync cannot
  // exec directly. No argument below contains a space, so a shell is safe.
  const run = spawnSync('claude', ['plugin', 'validate', '.', '--strict', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    console.error('`claude plugin validate . --strict --json` did not print a JSON report.\n')
    console.error(run.stderr?.trim() || run.stdout?.trim() || run.error?.message || '(no output)')
    console.error('\n`--json` arrived after 2.1.226. Install the version pinned in .github/workflows/checks.yml.')
    return 1
  }
  const problems = judge(report)
  if (problems.length > 0) {
    console.error('Plugin validation found something this repository has not accepted:\n')
    for (const line of problems) console.error(`  ${line}`)
    console.error('\nFix it, or accept it in scripts/check-plugin.mjs with an ADR saying why. ADR 0077.')
    return 1
  }
  console.log(`Plugin validation passed. ${ACCEPTED.length} accepted warnings, each still reported. ADR 0077.`)
  return 0
}

const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry === realpathSync(fileURLToPath(import.meta.url))) process.exit(main())
