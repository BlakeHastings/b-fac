---
name: factory
description: Show what the factory is doing, what is waiting on an answer, and whether the observer is actually recording.
---

Run this, and report what it says:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" status
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" needs
```

Then summarise for the operator in this order, and stop:

1. Anything waiting on them, oldest first. Waiting time is the number they
   cannot get anywhere else, so lead with it.
2. What is running now.
3. Whether the observer is healthy.

**If the status output says the observer has never fired, say so first and say
nothing else about the numbers.** An empty page and a broken observer look
identical from here, and reporting "nothing is waiting" off an observer that
was never loaded is a false all-clear. The fix is a new session, because a hook
is snapshotted when a session starts.
