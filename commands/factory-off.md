---
name: factory-off
description: Stop recording this project, or mute one noisy session while the rest keep recording.
---

With no argument, stop recording the whole project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" off
```

If the operator named a session id in `$ARGUMENTS`, mute only that one:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" off --session "$ARGUMENTS"
```

Say which of the two you did. Mention that the log is kept either way and
`/factory-ui` still reads it, because "off" reads as "deleted" to most people
and it is not.
