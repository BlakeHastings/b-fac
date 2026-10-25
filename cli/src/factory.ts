// The factory CLI. Source only: what runs is ../factory.mjs, which
// scripts/build-cli.mjs bundles from this file and `npm run check:bundle`
// holds equal to a fresh build. ADR 0073.
//
// THIS IS THE FRAME, NOT THE TOOL
// BlakeHastings/b-fac#196 is the epic that fills it. Every verb that touches a
// tracker or a message arrives in a child of it, and setup decides which
// tracker is the record before any of them reads anything. Until that record
// exists there is nothing to read, so `status` reads nothing and says so.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from '@commander-js/extra-typings'

// Resolved against the running file, which is the bundle in cli/, so the
// plugin root is one level up. Running this source directly would resolve it
// two levels up from cli/src/ and miss; nothing does that, the bundle is the
// only thing that runs.
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The CLI's version is the plugin's. releasing.md's rule is one version number
// in one place, and an installer can only ever have the two together, so a
// second number here could only be a stale one. Read at run time rather than
// baked in at build time, because baking it in would make every version bump
// a bundle change and every payload pull request a rebuild.
function pluginVersion(): string {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof manifest.version !== 'string') {
    throw new Error(`${pluginRoot}/.claude-plugin/plugin.json has no string "version".`)
  }
  return manifest.version
}

const version = pluginVersion()

// The three facts setup will record, as BlakeHastings/b-fac#196 decided on
// 2026-09-28. Listed now so that `status` already has the shape it will keep,
// and so nobody reads "not set" as a fault in a tool that has no setup yet.
const SETUP_FACTS = [
  'Tracker of record (GitHub, Jira or local)',
  'Whether state may be pushed through the adapter',
  'Whether the provider API may be called directly',
]

const program = new Command()
  .name('factory')
  .description("The factory's command line. A frame for now: it configures and reads nothing yet.")
  .version(version, '-v, --version', 'Print the plugin version this CLI shipped in.')
  .showHelpAfterError()

program
  .command('status')
  .description('Say what is configured. Nothing is, yet.')
  .action(() => {
    const width = Math.max(...SETUP_FACTS.map((fact) => fact.length))
    console.log(`factory ${version}, from ${pluginRoot}`)
    console.log('')
    console.log('Setup: not recorded.')
    for (const fact of SETUP_FACTS) console.log(`  ${fact.padEnd(width)}  not set`)
    console.log('')
    console.log('No setup step exists yet, so nothing above was read from anywhere.')
    console.log('BlakeHastings/b-fac#196 is the epic that adds it.')
  })

program.parse()
