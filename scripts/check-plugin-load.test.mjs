// The shadowing half of check-plugin-load.mjs, in both directions.
//
// Only the shadowing half. Everything else in that script needs the `claude`
// CLI, which the `Checks` job deliberately does not have — see AGENTS.md. The
// shadow check runs before the first CLI call precisely so it can be exercised
// without one, and these tests then blank PATH so the CLI call that follows
// fails instantly instead of costing ten seconds per case. They therefore
// assert on the message rather than the exit code: in the allow direction the
// script still exits non-zero, for the unrelated reason that it could not find
// `claude`, and treating that as a failure would test the wrong thing.
//
// The allow direction matters at least as much as the deny direction here. A
// personal copy is legitimate; only a personal copy that disagrees is not. A
// check that failed on mere presence would push the owner into deleting a skill
// they may want, and a check people route around is worth nothing.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Absolute, because these tests blank PATH and a bare `node` would then be
// unresolvable — the first version of this file spawned nothing at all and
// asserted against an empty string.
const NODE = process.execPath

const SCRIPT = fileURLToPath(new URL('./check-plugin-load.mjs', import.meta.url))
const CANONICAL = fileURLToPath(new URL('../.agents/skills/orchestrated-delivery', import.meta.url))

// The text the script prints when a higher-precedence copy disagrees. Asserting
// on it rather than on an exit code is what lets the allow cases run without
// the CLI.
const SHADOW_MESSAGE = 'outranks this plugin'

const temporary = []
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'b-fac-shadow-'))
  temporary.push(dir)
  return dir
}
process.on('exit', () => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true })
})

// Windows spells it `Path`, POSIX spells it `PATH`, and leaving both in the
// child's environment would let the real CLI run.
function withoutPath(overrides) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^path$/i.test(key)),
  )
  return { ...env, PATH: '', ...overrides }
}

function runAgainst(configDir) {
  try {
    const stdout = execFileSync(NODE, [SCRIPT], {
      encoding: 'utf8',
      env: withoutPath({ CLAUDE_CONFIG_DIR: configDir }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { output: stdout, exitCode: 0 }
  } catch (error) {
    return {
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
      exitCode: error.status ?? 1,
    }
  }
}

// Every fixture is copied from the canonical tree at run time, so none of this
// can rot into asserting against a payload the repo no longer ships.
function personalCopyOf(configDir, mutate = () => {}) {
  const skill = join(configDir, 'skills', 'orchestrated-delivery')
  mkdirSync(join(configDir, 'skills'), { recursive: true })
  cpSync(CANONICAL, skill, { recursive: true })
  mutate(skill)
  return skill
}

test('denies a personal copy whose SKILL.md differs by one word', () => {
  const configDir = scratch()
  personalCopyOf(configDir, (skill) => {
    const body = join(skill, 'SKILL.md')
    writeFileSync(body, readFileSync(body, 'utf8').replace('# Orchestrated delivery', '# Drifted'))
  })

  const { output, exitCode } = runAgainst(configDir)
  assert.equal(exitCode, 1, 'a disagreeing personal copy must fail the build')
  assert.match(output, new RegExp(SHADOW_MESSAGE))
  assert.match(output, /differs: SKILL\.md/)
})

test('denies a personal copy whose reference file differs', () => {
  const configDir = scratch()
  personalCopyOf(configDir, (skill) => {
    const reference = join(skill, 'references', 'briefing.md')
    writeFileSync(reference, `${readFileSync(reference, 'utf8')}\nstale advice\n`)
  })

  const { output } = runAgainst(configDir)
  assert.match(output, new RegExp(SHADOW_MESSAGE))
  assert.match(output, /differs: references\/briefing\.md/)
})

test('denies a personal copy that is missing a file this repo ships', () => {
  const configDir = scratch()
  personalCopyOf(configDir, (skill) => {
    rmSync(join(skill, 'references'), { recursive: true, force: true })
  })

  const { output } = runAgainst(configDir)
  assert.match(output, new RegExp(SHADOW_MESSAGE))
  assert.match(output, /only in this repo: references\//)
})

test('allows a personal copy that matches canonical exactly', () => {
  const configDir = scratch()
  personalCopyOf(configDir)

  const { output } = runAgainst(configDir)
  assert.doesNotMatch(output, new RegExp(SHADOW_MESSAGE), 'a synced personal copy is legitimate')
})

test('allows a machine with no personal copy at all', () => {
  const { output } = runAgainst(scratch())
  assert.doesNotMatch(output, new RegExp(SHADOW_MESSAGE))
})

test('allows a personal copy that differs only in line endings', () => {
  const configDir = scratch()
  personalCopyOf(configDir, (skill) => {
    const body = join(skill, 'SKILL.md')
    writeFileSync(body, readFileSync(body, 'utf8').replaceAll('\n', '\r\n'))
  })

  const { output } = runAgainst(configDir)
  assert.doesNotMatch(output, new RegExp(SHADOW_MESSAGE), 'CRLF is a checkout artifact')
})

test('allows an unrelated personal skill with a different name', () => {
  const configDir = scratch()
  const other = join(configDir, 'skills', 'something-else')
  mkdirSync(other, { recursive: true })
  writeFileSync(join(other, 'SKILL.md'), '---\nname: something-else\n---\n\nUnrelated.\n')

  const { output } = runAgainst(configDir)
  assert.doesNotMatch(output, new RegExp(SHADOW_MESSAGE), 'only same-named skills shadow')
})
