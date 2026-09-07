// `factory ui`: a local page over the event log, and nothing more than that.
//
// LOOPBACK ONLY, AND THAT IS THE WHOLE SECURITY MODEL
// The log can hold an agent's brief and a question about a client's product, so
// the server binds 127.0.0.1 and there is no flag that changes it. Anyone who
// can reach the port can already read the file it is serving, which is what
// makes loopback sufficient here and what would stop being true the moment it
// listened on anything else.
//
// NO WEBSOCKET, NO FRAMEWORK, NO BUILD
// Server-sent events over the built-in http module, with the page polling
// underneath. The stream is a nudge that says "something changed", so a dropped
// connection costs freshness and never correctness, and the fallback is already
// the thing that works.
//
// THE WATCH IS ON THE DIRECTORY, NOT THE FILE
// The events file does not exist until the first event, and `fs.watch` on a
// path that is not there throws. Watching the project directory works from the
// moment it is created, and picks up project.json changes too, which is how the
// header's on/off state updates without a reload.
import { createServer } from 'node:http'
import { watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { ensureProjectDir, read, readProject } from './store.mjs'
import { fold } from './view.mjs'
import { page } from './page.mjs'
import { paths } from './paths.mjs'

const DEFAULT_PORT = 4177
const PORT_ATTEMPTS = 20

function stateFor(root) {
  const project = readProject(root)
  return {
    root,
    project: {
      enabled: !!project.enabled,
      lastSeen: project.lastSeen || null,
      muted: project.muted || [],
    },
    ...fold(read(root)),
  }
}

function openBrowser(url) {
  try {
    const [command, args] =
      platform() === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : platform() === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]]
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    // A headless box or a locked-down desktop. The URL is printed either way,
    // so failing to open a browser is not failing to start the server.
    return false
  }
}

function listen(server, port, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening)
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        // Another `factory ui` is probably already up. Stepping to the next
        // port beats refusing, because the common case is a second terminal
        // rather than a mistake.
        resolve(listen(server, port + 1, attemptsLeft - 1))
      } else {
        reject(err)
      }
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve(port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function serve({ root, port = DEFAULT_PORT, open = true, log = console.log } = {}) {
  ensureProjectDir(root)
  const clients = new Set()

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')

    if (url.pathname === '/api/state') {
      const body = JSON.stringify(stateFor(root))
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      res.end(body)
      return
    }

    if (url.pathname === '/api/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      })
      res.write('retry: 3000\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(page())
      return
    }

    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found\n')
  })

  const actual = await listen(server, port, PORT_ATTEMPTS)

  // Coalesce a burst of writes into one nudge. Several hooks can land inside a
  // few milliseconds when a wave of agents returns together.
  let pending = null
  const nudge = () => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      for (const client of clients) {
        try {
          client.write('data: changed\n\n')
        } catch {
          clients.delete(client)
        }
      }
    }, 150)
    pending.unref?.()
  }

  let watcher = null
  try {
    watcher = watch(paths(root).dir, nudge)
    watcher.on('error', () => {})
  } catch {
    // Watching is an optimisation. The page polls regardless.
  }

  const url = `http://127.0.0.1:${actual}/`
  log(`Factory UI on ${url}`)
  log(`Project: ${root}`)
  if (open) openBrowser(url)
  log('Ctrl-C to stop.')

  return {
    url,
    port: actual,
    close: () =>
      new Promise((resolve) => {
        if (pending) clearTimeout(pending)
        watcher?.close()
        for (const client of clients) {
          try {
            client.end()
          } catch {
            // Already gone.
          }
        }
        clients.clear()
        server.close(() => resolve())
      }),
  }
}

export const _test = { DEFAULT_PORT, stateFor }
