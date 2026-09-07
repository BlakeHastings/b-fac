---
name: factory-ask
description: File something that needs the owner's answer, with its severity and what it is holding up.
---

File what is in `$ARGUMENTS` as a need:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/factory.mjs" ask "<the question>" \
  --severity <blocking|blocks-work|fyi> \
  --blocks <comma-separated work item ids> \
  --answerer owner \
  --asked-in <work item where it is asked at length>
```

Pick severity by **what the loop can still do**, never by how urgent it feels:

- `blocking` — nothing can proceed. This should be rare. If you can name work
  that is unaffected, it is not this.
- `blocks-work` — names what it holds up while the loop continues elsewhere.
- `fyi` — wants an answer eventually and holds up nothing.

Omit `--blocks` only when the answer is genuinely nothing, and prefer naming
one item to naming none.

**Then carry on with everything that does not depend on the answer.** Filing a
need is not a stopping point, and a turn that ends because it asked something
is the same stop wearing different clothes. Report the id it printed, put the
question in your `Blocked on:` line, and dispatch whatever is unaffected.
