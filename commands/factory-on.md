---
name: factory-on
description: Start recording this project's factory sessions so the front end has something to show.
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" on
```

Then tell the operator two things, briefly:

- Recording is on for this project. Other projects and other sessions are
  untouched, because the switch is per project and the hook reads it on every
  fire rather than being wired per session.
- Whether anything has been observed yet. If the command reported that nothing
  has, the honest statement is that this session may never record, since a hook
  is snapshotted when a session starts and this one may predate the plugin.
  Suggest `/factory` in a few minutes to confirm it actually fired.

Do not claim it is working. Claim it is switched on, and say what would prove it.
