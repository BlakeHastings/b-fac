// Where the observer's state lives, and why it is nowhere near your repository.
//
// THREE CONSTRAINTS DECIDE THIS, AND THEY ALL POINT THE SAME WAY
// 1. Guest mode may not write inside a host repository, not even an ignored
//    file, because editing a tracked ignore file to hide your own scratch state
//    is itself a change to a repo you are a guest in. SKILL.md's machine facts.
// 2. The user wants one front end for the factory, not one per checkout, so the
//    store has to be findable without being told where it is.
// 3. A test must be able to point the whole thing at a temporary directory, or
//    every test run pollutes the developer's real history.
//
// So: a user-level directory, overridable by FACTORY_HOME, and never a path
// inside the project.
//
// THE PROJECT KEY IS THE GIT COMMON DIRECTORY, NOT THE WORKING DIRECTORY
// The factory dispatches agents into worktrees. A worktree has its own
// toplevel, so keying on `git rev-parse --show-toplevel` files an agent's
// events under a different project than the orchestrator that dispatched it,
// and the front end shows two unrelated projects that are the same run.
//
// `--git-common-dir` answers identically from every checkout of a repository,
// which is the same property ADR 0037 relies on for the guest gate's scope
// check. Its parent is the repository, and that is the key.
//
// CLAUDE_PROJECT_DIR IS PREFERRED WHERE IT EXISTS AND IS NOT ENOUGH ALONE
// Claude Code exports it to hooks and to Bash tool calls, and documents that it
// stays at the original project root even when the session enters a worktree.
// That is exactly the answer we want. But a human running `factory ui` from
// their own terminal has no such variable, so the git lookup is the fallback
// rather than the exception, and both must agree or the two of them are looking
// at different logs. They do agree: the hook's CLAUDE_PROJECT_DIR and the
// user's git lookup both resolve to the repository root.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

// A short hash keeps two checkouts of differently-named repositories apart
// while the readable prefix keeps the directory listing meaningful. Neither
// half is load-bearing on its own: the prefix can collide and the hash is
// unreadable, so the key is both.
function keyFor(root) {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 12)
  const name = basename(root).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40) || 'repo'
  return `${name}-${hash}`
}

// realpath so that a symlinked or 8.3-shortened path does not become a second
// project. It throws on a path that does not exist, which is not a reason to
// fail: an unresolvable path is still a usable key.
function canonical(path) {
  try {
    return realpathSync(resolve(path))
  } catch {
    return resolve(path)
  }
}

export function factoryHome() {
  if (process.env.FACTORY_HOME) return resolve(process.env.FACTORY_HOME)
  if (process.env.XDG_STATE_HOME) return join(resolve(process.env.XDG_STATE_HOME), 'factory')
  if (platform() === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'factory')
  }
  return join(homedir(), '.local', 'state', 'factory')
}

// The repository this invocation is about.
//
// Order matters and each step is a different question. FACTORY_PROJECT is the
// explicit answer, for tests and for pointing the UI at a project you are not
// standing in. CLAUDE_PROJECT_DIR is the harness's answer, correct inside a
// worktree where the next step is not. The git lookup is the human's answer.
// cwd is the last resort, and it is why this never throws.
export function projectRoot(cwd = process.cwd()) {
  if (process.env.FACTORY_PROJECT) return canonical(process.env.FACTORY_PROJECT)
  if (process.env.CLAUDE_PROJECT_DIR) return canonical(process.env.CLAUDE_PROJECT_DIR)
  try {
    const common = execFileSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (common) {
      // `.git` in the ordinary case, an absolute path from a worktree. Either
      // way the repository is its parent, and a bare repo answers `.` — for
      // which the parent of the resolved path is still the right answer.
      const absolute = resolve(cwd, common)
      return canonical(dirname(absolute))
    }
  } catch {
    // Not a git repository, or git is not installed. Both are fine.
  }
  return canonical(cwd)
}

export function projectDir(root = projectRoot()) {
  return join(factoryHome(), 'projects', keyFor(root))
}

export function paths(root = projectRoot()) {
  const dir = projectDir(root)
  return {
    root,
    dir,
    project: join(dir, 'project.json'),
    events: join(dir, 'events.jsonl'),
  }
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export const _test = { keyFor, canonical }
