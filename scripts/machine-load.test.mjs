// What `machine-load.mjs` calls a process, one command line at a time.
//
// WHAT THIS PREVENTS
// #184: a session's scratch directory came back `unknown`, the one label that
// cannot say "another session". The fix is a rule matching the Claude temp
// path, and #193 already showed that path reaching a command line spelled more
// than one way on Windows. So every spelling below is one actually read off a
// process on 2026-09-25, and a rule that matches one of them and not another
// fails here rather than on somebody's machine.
//
// The other half is the lines it must not match. A rule widened until nothing
// is `unknown` is worse than the `unknown` it replaced, because a wrong label is
// believed.
//
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posixRow, whose } from '../.agents/skills/orchestrated-delivery/assets/machine-load.mjs'

const NODE = '"C:\\Program Files\\nodejs\\node.exe" '
const SCRATCH_TAIL = 'claude/C--Users-someone-source-repos-personal-b-fac/c734ce25-2582-43fa-a22f-29f43f38cb35/scratchpad/idle.mjs'

// The first five are the shapes a process launched from a scratch directory
// actually had, read back from Win32_Process on 2026-09-25 with only the user
// name changed. The last is a case no process showed, held because Windows
// paths are case-insensitive and the rule should be too.
const SPELLINGS = {
  'short user name, backslashes, quoted':
    NODE + '"C:\\Users\\SOMEON~1\\AppData\\Local\\Temp\\' + SCRATCH_TAIL.replace(/\//g, '\\') + '"',
  'long user name, backslashes, quoted':
    NODE + '"C:\\Users\\someone\\AppData\\Local\\Temp\\' + SCRATCH_TAIL.replace(/\//g, '\\') + '"',
  'short user name, forward slashes':
    NODE + '"C:/Users/SOMEON~1/AppData/Local/Temp/' + SCRATCH_TAIL + '"',
  'long user name, forward slashes, unquoted, as Git Bash hands it to node':
    NODE + 'C:/Users/someone/AppData/Local/Temp/' + SCRATCH_TAIL,
  'every component shortened':
    NODE + 'C:\\Users\\SOMEON~1\\AppData\\Local\\Temp\\claude\\C--USE~3\\C734CE~1\\SCRATC~1\\idle.mjs',
  'a different case, because Windows paths ignore it':
    NODE + 'C:\\Users\\someone\\AppData\\Local\\TEMP\\claude\\abc\\probe.mjs',
}

for (const [spelling, commandLine] of Object.entries(SPELLINGS)) {
  test('a scratch process is session scratch: ' + spelling, () => {
    assert.equal(whose('node.exe', commandLine), 'session scratch')
  })
}

test('what is not a session scratch directory stays what it was', () => {
  // The desktop app's own data, which says Claude and is not scratch.
  assert.equal(whose('node.exe', NODE + 'C:\\Users\\someone\\AppData\\Roaming\\Claude\\x.js'), 'unknown')
  // A sibling temp directory whose name only starts with `claude`.
  assert.equal(whose('node.exe', NODE + 'C:/Users/someone/AppData/Local/Temp/claude-cli-nodejs/x.js'), 'unknown')
  // Session state under the home directory rather than temp.
  assert.equal(whose('node.exe', NODE + 'C:/Users/someone/.claude/projects/x/y.js'), 'unknown')
  // A relative path carries no directory at all. Launched from a scratch
  // directory it looks exactly like this, and saying so beats guessing.
  assert.equal(whose('node.exe', NODE + 'idle.mjs'), 'unknown')
})

test('a scratch script handed a project reports the project', () => {
  const line = NODE + 'C:/Users/someone/AppData/Local/Temp/claude/abc/probe.mjs C:\\Users\\someone\\source\\repos\\permits'
  assert.equal(whose('node.exe', line), 'permits')
})

test('the rules that were there before still answer first', () => {
  assert.equal(whose('claude.exe', NODE + 'C:/Users/someone/AppData/Local/Temp/claude/abc/x.js'), 'claude sessions')
  assert.equal(
    whose('node.exe', NODE + 'C:/Users/someone/src/permits/.claude/worktrees/agent-1/x.js'),
    'permits (worktree agent-1)',
  )
  assert.equal(whose('node.exe', NODE + 'C:/Users/someone/AppData/Local/npm-cache/_npx/1a2b/node_modules/x.js'), 'npx cache')
})

// BlakeHastings/b-fac#241: the Orca IDE. Every line below is one `ps -eo
// pid=,rss=,comm=,args=` printed on Linux on 2026-10-26 with Orca serving its
// terminals, with the user name changed and long hashes and trailing arguments
// cut. Orca's bundled node calls itself `MainThread`, which is why a filter on
// `comm` alone never counted any of it.
const ORCA_HOME = '/home/someone/.config/orca/orcad-artifacts/linux-x64-glibc/'
const ORCA_NODE = ORCA_HOME + 'runtimes/node-e32e2d16/bin/node '
const ORCA_LINES = {
  'the app, serving':
    '3777666 107192 orca-ide /home/someone/.local/opt/orca/squashfs-root/orca-ide ' +
    '/home/someone/.config/orca/serve-supervisor/8fe4/app.asar.unpacked/out/cli/index.js serve --port 6768 --supervise',
  'its server':
    '3777809 296800 MainThread ' + ORCA_NODE + ORCA_HOME + '0.1.0+4402cbac17e5/orcad-server.js --bind 0.0.0.0 --port 6768',
  'the daemon that hosts the terminals':
    '3777921 103164 MainThread ' + ORCA_NODE + '--max-semi-space-size=4 ' + ORCA_HOME +
    '0.1.0+4402cbac17e5/daemon-entry.js --socket /home/someone/.config/orca/daemon/daemon-v52.sock',
  'the session scanner':
    '3795347 74012 MainThread ' + ORCA_NODE + '--max-old-space-size=384 ' + ORCA_HOME +
    '0.1.0+4402cbac17e5/session-scanner-service-entry.js',
  'the file watcher':
    '3815055 104032 MainThread ' + ORCA_NODE + ORCA_HOME + '0.1.0+4402cbac17e5/parcel-watcher-process-entry.js',
}

for (const [what, line] of Object.entries(ORCA_LINES)) {
  test('an Orca process is counted and named: ' + what, () => {
    const row = posixRow(line)
    assert.ok(row, 'not counted at all')
    assert.equal(row.whose, 'Orca IDE')
  })
}

test('a claude an Orca terminal started counts with the sessions', () => {
  // Its parent is a bash Orca started with an rcfile under its config, but the
  // process itself carries nothing of Orca's, and should not need to.
  assert.equal(posixRow('3799919 472656 claude claude').whose, 'claude sessions')
})

test('what Orca leaves behind, and what is not Orca, stays out of its row', () => {
  // Two zombies sit under the app, holding nothing.
  assert.equal(posixRow('3777679 0 orca- [orca-ide] <defunct>'), undefined)
  // The terminals themselves are shells, which this report does not group.
  const shell = '3799507 10000 bash /bin/bash --rcfile /home/someone/.config/orca/shell-wrappers/6f4f/rcfile'
  assert.equal(posixRow(shell), undefined)
  // A project that happens to be called orca reports as that project.
  assert.equal(whose('node', '/usr/bin/node /home/someone/source/repos/orca/server.js'), 'orca')
  // A node renamed `MainThread` that is not Orca's is counted under its project.
  assert.equal(posixRow('42 1000 MainThread /usr/bin/node /home/someone/source/repos/permits/x.js').whose, 'permits')
})
