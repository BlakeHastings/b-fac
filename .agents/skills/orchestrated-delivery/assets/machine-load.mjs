// What else is running on this machine, before you add three more agents to it.
//
// WHAT THIS PREVENTS
// On 2026-09-07 an owner stopped four running agents because the system had run
// out of resources. The orchestrator had no idea. The loop's dispatch inputs are
// collision surface and the context window, neither of which is about the
// machine, so nothing ever looks at it.
//
// Measured a minute later: 16 logical cores, 31.9 GB of RAM with 10.1 GB free,
// 24 node processes and 6 claude processes. Most of it was not that session's.
// The heavy processes belonged to a different project's preview server and to
// eight worktrees under a sibling checkout, driven by a different session on the
// same machine. A session counting its own agents would have counted three and
// concluded there was room.
//
// So the failure is not "spawned too many". It is "spawned into a box whose
// occupancy it had no way to read", and what made it invisible is that the
// occupancy is shared between sessions that cannot see each other.
//
// WHY THIS PRINTS NUMBERS AND NOT A VERDICT
// references/parallelism.md refuses to put a number on the context-window
// version of this question, in as many words: "There is no number here and
// inventing one would be worse than nothing." The same holds for memory. A
// threshold invented here would be obeyed, would be wrong on somebody else's
// hardware, and would be believed because it came from a script.
//
// So this reports what is there, groups it by whose it looks like, and says what
// a worktree has actually cost. The judgement stays with the orchestrator; what
// it has been missing is the input rather than the rule.
//
// It exits 0 whether the machine is empty or full. A busy machine is not an
// error and this is not a gate: turning an input into a refusal produces a
// refusal that is wrong at the moment somebody most needs to override it.
//
//   node assets/machine-load.mjs           # the report
//   node assets/machine-load.mjs --json    # the same, for a script
import { execFileSync } from 'node:child_process'
import { cpus, freemem, loadavg, platform, totalmem } from 'node:os'

const GB = 1024 ** 3
const MB = 1024 ** 2
const asJson = process.argv.includes('--json')

/**
 * The processes worth grouping.
 *
 * `node` is what an agent's tooling runs as and `claude` is the sessions
 * themselves. Everything else on the machine is somebody's browser and is not
 * this script's business: reporting it would drown the two lines that matter.
 */
const INTERESTING = ['node', 'claude']

/**
 * A process reduced to whose it is.
 *
 * The grouping is the whole point. "Twenty-four node processes" is not
 * actionable; "eight of them belong to a sibling checkout you are not driving"
 * is. So this prefers a label a person recognises over an exact one, and a
 * worktree reports under its parent repository, because the question is which
 * project is busy rather than which branch.
 *
 * A session is labelled by its name and never by a path. This was learned by
 * running the first version: the largest bucket came back `unknown`, and it was
 * six `claude` processes holding about 3 GB between them, more than every
 * project on the machine combined. A session's command line carries no
 * repository, so path matching can only ever call the dominant cost a mystery.
 * That row is the one an orchestrator most needs, because each session it names
 * is a colleague dispatching agents it cannot see.
 */
function whose(name, commandLine) {
  if (name.toLowerCase().startsWith('claude')) return 'claude sessions'
  if (!commandLine) return 'unknown'
  const text = commandLine.replace(/\\/g, '/')

  const worktree = text.match(/\/([^/]+)\/\.claude\/worktrees\/([^/"\s]+)/)
  if (worktree) return worktree[1] + ' (worktree ' + worktree[2] + ')'

  const repos = [...text.matchAll(/\/repos\/([^/"\s]+)/g)].pop()
  if (repos) return repos[1]

  // Before `node_modules`, because an npx download is a cache directory named
  // after a hash and reporting that hash as a project is worse than saying npx.
  if (/\/npm-cache\/_npx\//.test(text)) return 'npx cache'

  const modules = text.match(/\/([^/]+)\/node_modules\//)
  if (modules) return modules[1]

  return 'unknown'
}

/** Every interesting process, or undefined where the platform cannot say. */
function processes() {
  try {
    return platform() === 'win32' ? windowsProcesses() : posixProcesses()
  } catch {
    return undefined
  }
}

function windowsProcesses() {
  const filter = INTERESTING.map((name) => '$_.Name -like "' + name + '*"').join(' -or ')
  const script =
    'Get-CimInstance Win32_Process | Where-Object { ' +
    filter +
    ' } | Select-Object Name, WorkingSetSize, CommandLine | ConvertTo-Json -Compress -Depth 2'
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', maxBuffer: 32 * MB, windowsHide: true },
  )
  const raw = JSON.parse(out.trim() || '[]')
  const rows = Array.isArray(raw) ? raw : [raw]
  return rows.map((row) => ({
    name: String(row.Name ?? '').replace(/\.exe$/i, ''),
    bytes: Number(row.WorkingSetSize ?? 0),
    whose: whose(String(row.Name ?? ''), row.CommandLine),
  }))
}

function posixProcesses() {
  const out = execFileSync('ps', ['-eo', 'rss=,comm=,args='], {
    encoding: 'utf8',
    maxBuffer: 32 * MB,
  })
  const rows = []
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/)
    if (!match) continue
    const name = match[2].split('/').pop() ?? match[2]
    if (!INTERESTING.some((want) => name.startsWith(want))) continue
    // `rss` is kilobytes on every ps this runs on.
    rows.push({ name, bytes: Number(match[1]) * 1024, whose: whose(name, match[3]) })
  }
  return rows
}

/** Free space on the volume this repository is on, which is where worktrees land. */
function diskFreeBytes() {
  try {
    if (platform() === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '(Get-PSDrive -Name (Get-Location).Drive.Name).Free'],
        { encoding: 'utf8', windowsHide: true },
      )
      return Number(out.trim())
    }
    const out = execFileSync('df', ['-k', '.'], { encoding: 'utf8' })
    const line = out.trim().split('\n').pop() ?? ''
    return Number(line.split(/\s+/)[3]) * 1024
  } catch {
    return undefined
  }
}

function round(value, places = 1) {
  return Number(value.toFixed(places))
}

const cores = cpus().length
const totalBytes = totalmem()
const freeBytes = freemem()
const rows = processes()
const disk = diskFreeBytes()

const byOwner = new Map()
for (const row of rows ?? []) {
  const seen = byOwner.get(row.whose) ?? { count: 0, bytes: 0 }
  byOwner.set(row.whose, { count: seen.count + 1, bytes: seen.bytes + row.bytes })
}
const owners = [...byOwner.entries()]
  .map(([name, seen]) => ({ name, count: seen.count, gb: round(seen.bytes / GB, 2) }))
  .sort((a, b) => b.gb - a.gb || b.count - a.count)

const report = {
  cores,
  memory: {
    totalGb: round(totalBytes / GB),
    freeGb: round(freeBytes / GB),
    usedPercent: Math.round((100 * (totalBytes - freeBytes)) / totalBytes),
  },
  ...(platform() === 'win32' ? {} : { loadAverage: loadavg().map((n) => round(n, 2)) }),
  ...(disk === undefined ? {} : { diskFreeGb: round(disk / GB) }),
  processes:
    rows === undefined
      ? 'not readable on this platform'
      : { total: rows.length, byOwner: owners },
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const memory = report.memory
console.log(
  cores +
    ' logical cores, ' +
    memory.totalGb +
    ' GB of RAM, ' +
    memory.freeGb +
    ' GB free (' +
    memory.usedPercent +
    '% used).',
)
if (report.loadAverage) {
  console.log('Load average ' + report.loadAverage.join(', ') + ' over 1, 5 and 15 minutes.')
}
if (report.diskFreeGb !== undefined) {
  console.log(report.diskFreeGb + ' GB free on the volume this repository is on.')
}

if (rows === undefined) {
  console.log('')
  console.log('Per-process detail is not readable on this platform, so the memory above is all')
  console.log('there is. It is still the number that decides whether another agent fits.')
} else if (owners.length === 0) {
  console.log('')
  console.log('No node or claude processes running. Nothing else is competing for this machine.')
} else {
  console.log('')
  console.log(rows.length + ' node and claude processes, by whose they look like:')
  for (const owner of owners) {
    console.log(
      '  ' +
        String(owner.gb).padStart(6) +
        ' GB  ' +
        String(owner.count).padStart(3) +
        '  ' +
        owner.name,
    )
  }
  console.log('')
  console.log('A line you do not recognise is another session on this machine, and it is the')
  console.log('reason counting your own agents undercounts. Read the whole list before')
  console.log('dispatching, not just your own rows.')
}

console.log('')
console.log('There is deliberately no threshold here. What a worktree costs depends on the')
console.log('project: one measured on 2026-09-07 was about 58 MB of disk with node_modules')
console.log('installed, and its running processes about 58 MB of RAM each. Measure yours')
console.log('rather than trusting that.')
