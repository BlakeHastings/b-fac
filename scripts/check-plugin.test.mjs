// The judgement half of check-plugin.mjs, in both directions.
//
// Only the judgement. Running the validator needs the `claude` CLI, which the
// `Checks` job deliberately does not have, so these feed `judge()` reports
// shaped like the ones 2.1.311 prints for this repository. ADR 0077 records the
// same cases run against the real CLI.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { ACCEPTED, judge } from './check-plugin.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLAUDE_MD_WARNING = {
  path: 'root',
  message: 'CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.',
  code: null,
}
const ICON_MISSING = {
  code: 'ICON_MISSING',
  severity: 'warning',
  blocking: false,
  file: '.claude-plugin/plugin.json',
  field: 'icon',
}

// This repository's report as 2.1.311 gives it, with overrides per case.
function report({ manifest = {}, plugin = {}, contents, directory = [ICON_MISSING], success = false } = {}) {
  return {
    success,
    strict: true,
    manifest: { file: `${ROOT}.claude-plugin/marketplace.json`, errors: [], warnings: [], ...manifest },
    contents: contents ?? [
      { file: `${ROOT}CLAUDE.md`, errors: [], warnings: [CLAUDE_MD_WARNING], ...plugin },
    ],
    directory: { findings: directory },
  }
}

test('passes this repository as it stands, though the CLI itself says it failed', () => {
  assert.deepEqual(judge(report()), [])
})

test('fails a warning nobody accepted, beside the accepted ones', () => {
  const problems = judge(report({
    manifest: { warnings: [{ path: 'plugins[0] plugin.json → bogusField', message: "Unknown field 'bogusField'." }] },
  }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^not accepted: .*bogusField/)
})

test('fails an accepted warning whose wording changed', () => {
  const problems = judge(report({
    plugin: { warnings: [{ ...CLAUDE_MD_WARNING, message: 'CLAUDE.md is not loaded.' }] },
  }))
  assert.ok(problems.some((p) => p.startsWith('not accepted: validator CLAUDE.md root: CLAUDE.md is not loaded.')))
  assert.ok(problems.some((p) => p.startsWith('accepted but no longer reported')))
})

test('fails an accepted warning reported against a different file', () => {
  const problems = judge(report({
    contents: [{ file: `${ROOT}docs/CLAUDE.md`, errors: [], warnings: [CLAUDE_MD_WARNING] }],
  }))
  assert.ok(problems.some((p) => p.startsWith('not accepted: validator docs/CLAUDE.md root:')))
})

test('fails an error, even one whose text matches an acceptance', () => {
  const problems = judge(report({ plugin: { errors: [CLAUDE_MD_WARNING], warnings: [] } }))
  assert.ok(problems.some((p) => p.startsWith('error, which cannot be accepted:')))
})

test('fails a directory finding nobody accepted, which `--strict` alone would pass', () => {
  const problems = judge(report({ directory: [ICON_MISSING, { code: 'LICENSE_MISSING', severity: 'warning', file: 'LICENSE' }] }))
  assert.deepEqual(problems, ['not accepted: directory LICENSE LICENSE_MISSING'])
})

test('fails an acceptance that no longer matches anything, so the list cannot go stale', () => {
  const problems = judge(report({ directory: [] }))
  assert.deepEqual(problems, [`accepted but no longer reported, so remove it from ACCEPTED: ${ACCEPTED[1]}`])
})

test('fails a strict failure with no finding to explain it', () => {
  const problems = judge(report({ contents: [] }), [ACCEPTED[1]])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /names no finding this script reads/)
})

test('passes a clean report once nothing is accepted', () => {
  assert.deepEqual(judge(report({ contents: [], directory: [], success: true }), []), [])
})

test('fails a report it cannot read', () => {
  assert.equal(judge({ success: true }).length, 1)
})
