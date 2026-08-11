# 0012. One check reads outside the repo, because that is where the lie is

Status: accepted

## Context

Issue #34. A copy of this repo's skill was left at
`~/.claude/skills/orchestrated-delivery` from before the repo existed. An agent
verifying its own change against `claude --plugin-dir .` was reading that copy,
and had to retract the evidence from three probes.

The resolution order was established from the live docs rather than inferred.
Claude Code's precedence for a skill *name* is enterprise, then personal
(`~/.claude/skills/`), then project (`.claude/skills/`), then bundled. Plugin
skills are not on that ladder at all: "Plugin skills use a
`plugin-name:skill-name` namespace, so they cannot conflict with other levels."
Read from the other end, that sentence is the defect — the bare name cannot
conflict with the plugin because it never reaches it.

Proved rather than assumed, by putting a distinctive marker in a scratch plugin
copy and reading the raw session stream rather than the model's summary of it:

| Invocation | With `--plugin-dir` loaded | Body that arrived |
| --- | --- | --- |
| `orchestrated-delivery` | yes | the stale personal copy |
| `orchestrated-delivery`, project copy also present | yes | still the personal copy |
| `b-fac:orchestrated-delivery` | yes | the marked plugin copy |

So Lens 1 of `review.md` — load the skill, judge whether the words are right —
reads the wrong file on any machine carrying a stale personal copy, and reports
green. That is the most expensive way for a check to be wrong: the change
appears to do nothing, or appears to work because the old text happened to say
something similar.

Three fixes were rejected. **"Remember to use the namespaced form"** is an
instruction, and ADR 0004 is this repo's finding that instructions do not hold.
**A marker inside the canonical skill text** would put the control in the
payload, which would move `plugin.json`'s version for a change that ships no
new behaviour, and would only ever be as good as the reader who checks it.
**Deleting the personal copy** is not the repo's to do, and the owner may
legitimately want the skill available outside this clone.

## Decision

`scripts/check-plugin-load.mjs` now also asserts that **no higher-precedence
copy of a skill this repo ships disagrees with `.agents/skills/`**. It compares
the whole skill tree, normalising line endings, and derives every expectation
from the canonical directory at run time rather than from any constant.

Presence is allowed; disagreement is not. A synced personal copy passes, so the
owner keeps the skill outside this repo if they want it, and the failure message
prints both the delete and the re-copy command with the real paths filled in.

Two things follow from that, and both are the point rather than side effects:

- **A repo check now reads the developer's home directory.** Nothing else here
  does. It is justified because the failure being caught is not in the repo: the
  repo is correct in every one of these cases, and the environment is what lies.
- **The result is machine-dependent.** There is no personal skills directory on
  a CI runner, so this assertion is a no-op in CI and only ever fires locally.
  That is where the failure happens, so that is where the check lives.

It runs before the first `claude` invocation, which keeps a shadowed machine
reported as shadowed rather than as whatever the loader says afterwards, and
lets `scripts/check-plugin-load.test.mjs` exercise both directions in the
`Checks` job, which has no CLI.

The project level is deliberately not compared. `.claude/skills/` is a
byte-identical mirror already gated by `npm run check:sync`, and a second
comparison of the same two trees would be a parallel source of truth for a fact
that already has one.

## Consequences

**This turns the owner's machine red today**, because the stale copy is still
there and still differs. That is the bug arriving rather than a regression, and
it is resolved by choosing: delete the personal copy, or re-copy it from
canonical. The recommendation is to delete it and invoke plugin skills as
`b-fac:orchestrated-delivery`, since a synced copy is one more thing to keep
synced and the namespaced form works from any clone.

The enterprise level outranks personal and is **not** checked. Its path is
platform-specific and there is no managed-settings deployment here to verify
against, so adding it would mean shipping a code path nobody has ever run. If
this repo is ever used under managed settings, that gap is the first thing to
close.

ADR 0003 is unchanged. Three copies of the skill — canonical, mirror, and
whatever the reader has installed — remains the accepted cost; this ADR only
stops the third one from answering with different words.

The check cannot see a *harness* that resolves names differently from the
documented order. It compares text, so it catches the case where two copies
disagree, not the case where a future Claude Code changes which copy wins. If
the precedence table in the docs moves, the table above is what to re-run.
