// The front end, as one string.
//
// WHY IT IS A STRING AND NOT A DIRECTORY OF ASSETS
// This repository has no dependencies, no lockfile and no build step, and
// AGENTS.md says what it costs to change that: `npm ci` in the workflow and a
// committed lockfile. A page that is one template literal keeps all three
// absent. It also means `factory ui` cannot serve a file that failed to ship,
// which is the failure mode a static directory has and a string does not.
//
// The page holds no state and computes nothing. It renders whatever
// `/api/state` hands it, so every decision about what an open need is, or which
// agent counts as running, lives in view.mjs where it can be tested.

export function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factory</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #fbfbfa; --panel: #ffffff; --line: #e4e2dd; --ink: #1c1b19;
  --muted: #6d6a63; --accent: #3a5f8a; --warn: #9a5b1e; --stop: #93331f;
  --ok: #2f6a45; --chip: #f1efea;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a; --panel: #1e1e23; --line: #32323a; --ink: #eceae5;
    --muted: #9b978f; --accent: #8fb4dd; --warn: #d9a05c; --stop: #e08268;
    --ok: #7fbf98; --chip: #2a2a31;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
header {
  padding: 18px 24px; border-bottom: 1px solid var(--line);
  display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap;
}
h1 { font-size: 17px; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
.root { color: var(--muted); font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.spacer { flex: 1; }
main { padding: 20px 24px 60px; max-width: 1100px; }
section { margin-bottom: 34px; }
h2 {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted); margin: 0 0 12px; font-weight: 650;
}
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  padding: 14px 16px; margin-bottom: 10px;
}
.card.blocking { border-left: 3px solid var(--stop); }
.card.blocks-work { border-left: 3px solid var(--warn); }
.card.fyi { border-left: 3px solid var(--accent); }
.q { font-weight: 560; margin-bottom: 8px; }
.meta { color: var(--muted); font-size: 13px; display: flex; gap: 14px; flex-wrap: wrap; }
.chip {
  background: var(--chip); border-radius: 4px; padding: 1px 7px; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.age { font-variant-numeric: tabular-nums; }
.empty { color: var(--muted); font-style: italic; padding: 6px 0; }
.status { font-size: 13px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.dot.on { background: var(--ok); } .dot.off { background: var(--muted); }
.dot.bad { background: var(--stop); }
.warnbar {
  background: var(--chip); border: 1px solid var(--warn); border-radius: 8px;
  padding: 12px 16px; margin-bottom: 20px; font-size: 14px;
}
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th {
  text-align: left; font-weight: 560; color: var(--muted); font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 10px 6px 0;
  border-bottom: 1px solid var(--line);
}
td { padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
td.mono, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.brief { color: var(--muted); font-size: 13px; margin-top: 6px; white-space: pre-wrap; }
.log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.log div { padding: 3px 0; border-bottom: 1px solid var(--line); color: var(--muted); }
.log b { color: var(--ink); font-weight: 560; }
</style>
</head>
<body>
<header>
  <h1>Factory</h1>
  <span class="root" id="root"></span>
  <span class="spacer"></span>
  <span class="status" id="status"></span>
</header>
<main>
  <div id="health"></div>

  <section>
    <h2>Needs an answer <span id="needcount"></span></h2>
    <div id="needs"></div>
  </section>

  <section>
    <h2>Running now</h2>
    <div id="running"></div>
  </section>

  <section>
    <h2>Sessions</h2>
    <div id="sessions"></div>
  </section>

  <section>
    <h2>Recent</h2>
    <div class="log" id="recent"></div>
  </section>
</main>
<script>
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
))

function age(ms) {
  if (ms == null) return '?'
  const s = Math.floor(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 48) return h + 'h ' + (m % 60) + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

function needCard(n) {
  const bits = []
  bits.push('<span class="age">waiting ' + esc(age(n.ageMs)) + '</span>')
  bits.push('<span class="chip">' + esc(n.severity) + (n.severityInferred ? ' (inferred)' : '') + '</span>')
  bits.push('<span class="chip">' + esc(n.source) + '</span>')
  if (n.blocks && n.blocks.length) bits.push('blocks ' + n.blocks.map((b) => '#' + esc(b)).join(', '))
  bits.push(n.answerer ? 'for ' + esc(n.answerer) : '<i>nobody named</i>')
  if (n.askedIn) bits.push('asked in #' + esc(n.askedIn))
  if (n.restated) bits.push('restated')
  return '<div class="card ' + esc(n.severity) + '">' +
    '<div class="q">' + esc(n.question) + '</div>' +
    '<div class="meta">' + bits.join('<span>·</span>') + '</div>' +
    (n.meanwhile ? '<div class="brief">Meanwhile: ' + esc(n.meanwhile) + '</div>' : '') +
    '<div class="meta" style="margin-top:6px"><span class="mono">' + esc(n.id) + '</span></div>' +
    '</div>'
}

function render(state) {
  document.getElementById('root').textContent = state.root || ''

  const s = state.project || {}
  const health = []
  let dot = s.enabled ? 'on' : 'off'
  let label = s.enabled ? 'recording' : 'off'
  if (s.enabled && !s.lastSeen) {
    dot = 'bad'
    label = 'enabled, never observed'
    health.push('<div class="warnbar"><b>The observer has never fired in this project.</b> ' +
      'A session started before the plugin was installed does not have the hook in its ' +
      'snapshot, and nothing will be recorded for it however long it runs. Start a new ' +
      'session, or check that the plugin is installed.</div>')
  }
  document.getElementById('status').innerHTML =
    '<span class="dot ' + dot + '"></span>' + esc(label) +
    (s.lastSeen ? ' · last event ' + esc(age(Date.now() - Date.parse(s.lastSeen))) + ' ago' : '')
  document.getElementById('health').innerHTML = health.join('')

  const needs = state.needs || []
  document.getElementById('needcount').textContent = needs.length ? '(' + needs.length + ')' : ''
  document.getElementById('needs').innerHTML = needs.length
    ? needs.map(needCard).join('')
    : '<div class="empty">Nothing is waiting on you.</div>'

  const running = state.running || []
  document.getElementById('running').innerHTML = running.length
    ? '<table><thead><tr><th>Agent</th><th>Running</th><th>Session</th></tr></thead><tbody>' +
      running.map((a) =>
        '<tr><td><b>' + esc(a.type) + '</b>' +
        (a.brief ? '<div class="brief">' + esc(a.brief.slice(0, 400)) + '</div>' : '') +
        '</td><td class="age">' + esc(age(a.ageMs)) + '</td>' +
        '<td class="mono">' + esc((a.session || '').slice(0, 8)) + '</td></tr>'
      ).join('') + '</tbody></table>'
    : '<div class="empty">No agents running.</div>'

  const turns = {}
  for (const t of state.turns || []) turns[t.session] = t
  const sessions = state.sessions || []
  document.getElementById('sessions').innerHTML = sessions.length
    ? '<table><thead><tr><th>Session</th><th>State</th><th>Idle</th><th>Next</th></tr></thead><tbody>' +
      sessions.map((x) => {
        const t = turns[x.id]
        let next = '<i>no turn recorded</i>'
        if (t) {
          next = t.nextIsNothing
            ? '<b>Next: nothing</b>'
            : esc(t.next || '').slice(0, 160) || '<i>empty</i>'
          if (t.missingLines && t.missingLines.length) {
            next += ' <span class="chip">missing ' + esc(t.missingLines.join(' and ')) + '</span>'
          }
        }
        return '<tr><td class="mono">' + esc(x.id.slice(0, 8)) + '</td>' +
          '<td>' + (x.live ? 'live' : 'idle') + '</td>' +
          '<td class="age">' + esc(age(x.idleMs)) + '</td><td>' + next + '</td></tr>'
      }).join('') + '</tbody></table>'
    : '<div class="empty">No sessions recorded.</div>'

  const recent = state.recent || []
  document.getElementById('recent').innerHTML = recent.length
    ? recent.map((e) =>
        '<div>' + esc((e.ts || '').slice(11, 19)) + '  <b>' + esc(e.kind) + '</b>  ' +
        esc(e.agent_type || e.next || e.question || e.reason || '') + '</div>'
      ).join('')
    : '<div class="empty">Nothing recorded yet.</div>'
}

async function load() {
  try {
    const res = await fetch('/api/state')
    render(await res.json())
  } catch (err) {
    document.getElementById('status').textContent = 'cannot reach the server'
  }
}

load()
const stream = new EventSource('/api/stream')
stream.onmessage = load
// The stream is a nudge rather than a transport, so a dropped connection costs
// freshness and not correctness. Polling underneath it is the whole recovery.
setInterval(load, 5000)
</script>
</body>
</html>
`
}
