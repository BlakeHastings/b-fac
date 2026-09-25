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
import { whose } from '../.agents/skills/orchestrated-delivery/assets/machine-load.mjs'

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
