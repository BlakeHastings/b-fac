// The factory CLI as an installer gets it: the committed bundle, run by Node.
// Not the source, so these say nothing about cli/src/ until it is rebuilt, and
// check:bundle is what makes that rebuild compulsory.
//
// What these cannot see is a bundle that imports from node_modules, because a
// checkout that ran `npm ci` resolves that import. check-plugin-load.mjs runs
// the bundle in CI's Plugin job, which installs nothing, and catches it there.
// ADR 0073.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'cli', 'factory.mjs')

function factory(...args) {
  return spawnSync(process.execPath, [BUNDLE, ...args], { encoding: 'utf8' })
}

test('--version prints the plugin version, the only version an installer has', () => {
  const { version } = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'))
  const run = factory('--version')
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), version)
})

test('status exits 0 and says that nothing is configured', () => {
  const run = factory('status')
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /Setup: not recorded\./)
  assert.match(run.stdout, /nothing above was read from anywhere/)
})

// #183's hand-rolled parser swallowed `factory ask --owner "q"`, taking the
// question as the flag's value. Refusing what it does not know is the least a
// framework buys, so it is held here rather than assumed.
test('an unknown option is refused, not swallowed', () => {
  const run = factory('status', '--owner', 'q')
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /unknown option '--owner'/)
})

test('an unknown command is refused', () => {
  const run = factory('claim')
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /unknown command 'claim'/)
})
