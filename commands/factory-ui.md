---
name: factory-ui
description: Open the local front end showing pending questions, running agents and recent factory activity.
---

Start the front end in the background and give the operator the URL:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" ui
```

Run it with `run_in_background` set, because it serves until it is stopped and
a foreground run would hold the turn open.

It binds 127.0.0.1 and opens a browser. Report the URL it printed. If the port
was taken it will have stepped to the next one, so read the URL out of the
output rather than assuming the default.
