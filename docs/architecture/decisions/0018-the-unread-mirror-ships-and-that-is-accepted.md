# 0018. The mirror ships to installers who never read it, and that is accepted

Status: accepted

## Context

`.claude/skills/` is a byte-for-byte copy of `.agents/skills/`, created by ADR
0003 for the contributor who clones this repository instead of installing the
plugin, and who would otherwise be the only person in the ecosystem unable to
run the thing the repo is about. `plugin.json` declares only
`"skills": ["./.agents/skills/"]`, but the marketplace entry is `"source": "./"`,
so an install copies the whole tree and the mirror rides along.

ADR 0014 measured that and left the question open: removing it from the install
would be a payload change and was out of scope there. #49 asks it directly.
**Must the copy that exists for cloners also ship to installers?**

### Measured again, on `main` today

```
$ git ls-tree -r --long origin/main   # aggregated by top-level path
files: 68  bytes: 400693 (391.3 KiB)
.claude/              16  121857 30.4%
.agents/              15  121496 30.3%
docs/                 14   80145 20.0%
scripts/               9   57482 14.3%
(root files)           8   11983  3.0%
.github/               3    5897  1.5%
.claude-plugin/        2    1767  0.4%
.gemini/               1      66  0.0%
---
.agents/skills/ : 15 files 121496 bytes
.claude/skills/ : 15 files 121496 bytes
mirror share of tree: 30.3%
```

The absolute figure has moved twice already (107,387 bytes at #48, 113,656 after
#47 rebased, 121,496 now). The ratio has not: the mirror is generated from the
canonical tree, so it is a fixed ~30% of whatever the skill ever grows to. The
ratio is the durable number.

### No installer reads it, proven with the loader rather than the manifest

Reading the manifest tells you what *should* load. This repository has already
been caught by the gap between should and does — `check-plugin-load.mjs` exists
because a manifest pointing at an empty directory validates cleanly. So the
claim was tested against the real loader, on a plugin root that physically
contains both trees:

```
$ claude --plugin-dir . plugin details b-fac@inline
Component inventory
  Skills (1)  orchestrated-delivery
Projected token cost
  Always-on:   ~286 tok   added to every session
```

One skill, from a root holding two copies of it. The control matters as much as
the result — a loader that never looks inside `.claude/skills/` of a plugin
would print the same thing for the wrong reason. So the same tree was copied
outside the repository with `skills` declaring both paths:

```
$ claude --plugin-dir . plugin details b-fac@inline   # skills: both paths declared
Component inventory
  Skills (2)  orchestrated-delivery, orchestrated-delivery
Projected token cost
  Always-on:   ~567 tok   added to every session
```

So the loader is perfectly capable of reading the mirror out of a plugin root
and does not, because nothing declares it. **The mirror costs an installer zero
tokens, zero always-on context and zero behaviour.** It is inert, not merely
unused. What it costs is disk.

### There is no way to exclude it, verified against the CLI

ADR 0014 checked the published JSON schemas. Those are generated and, as
`.github/workflows/checks.yml` says of them, "months stale", so the check was
redone against the validator that actually decides — `claude` 2.1.227, the
version CI pins.

Both manifest levels reject the keys as unknown:

```
$ claude plugin validate ./probe --strict     # plugin.json gained exclude + files
⚠ Found 2 warnings:
  ❯ plugins[0] plugin.json → exclude: Unknown field 'exclude'. Claude Code ignores it at load time.
  ❯ plugins[0] plugin.json → files: Unknown field 'files' (commonly seen in an npm package.json).
    Claude Code ignores unrecognized fields at load time, so it's safe to keep.

$ claude plugin validate ./probe --strict     # marketplace entry gained exclude + ignore
⚠ Found 2 warnings:
  ❯ plugins[0].exclude: Unknown field 'exclude'. Claude Code ignores it at load time.
  ❯ plugins[0].ignore: Unknown field 'ignore'. Claude Code ignores it at load time.
```

The live SchemaStore copies agree, and a recursive walk of both for any
property named `files`, `exclude`, `ignore`, `include`, `filter` or `omit`
returns nothing. There is no ignore file either: `claudeignore` appears zero
times in the CLI binary, which does yield plaintext strings — `Unknown field`
appears twelve times in the same search.

The only path-granularity mechanism the format has is the plugin root itself.
The marketplace schema now names it explicitly, under `git-subdir`: "Only the
specified subdirectory is materialized; the rest of the repo is not
downloaded." That is the subdirectory layout ADR 0014 rejected, for the reason
ADR 0003 chose the root: around forty harnesses read `.agents/`, `AGENTS.md` and
per-harness config from a repository root, and moving the plugin under a
subdirectory would either abandon that or duplicate the canonical tree into the
subdirectory, which is the same copy again in a worse place.

**So the answer to #49's narrow question is: it cannot be excluded.** What is
left is the choice between accepting it and not committing it.

### Not committing it is the worse trade, and not because of the mirror

The alternative is to delete `.claude/skills/` from the tree and generate it on
clone. The mirror's entire purpose is that Claude Code scans `.claude/skills/`
**when a session starts**, before anyone has run anything. A generated mirror is
therefore only correct if the generating step has already run, and there is
nothing here to run it: `package.json` has no dependencies and no lockfile, CI
has no install step by design, and `npm run <script>` fires no lifecycle hook.
The trigger would be a line in `AGENTS.md` telling a contributor to run
`npm run sync` first.

That is an instruction, and the finding this repository keeps arriving at — ADR
0009 states it, #52 is the fourth instance of it — is that instructions do not
hold and checks do. It would replace a committed artifact guarded by
`npm run check:sync` with an instruction guarded by nothing, and the failure
mode is a cloner whose skill is silently absent, which is worse than 121 KiB on
an installer's disk. It would also delete `check:sync`, the check that catches
the mirror drifting, along with the drift.

## Decision

**The mirror ships, and that is accepted.** It is ~30% of the payload, it is
inert at load time, and the payload is 391 KiB of markdown. Nobody's disk,
bandwidth or context is affected by it.

**Judged on what an installer is entitled to expect, it is still fine.** An
installer is entitled to a plugin that loads what it declares and nothing else,
and does not slow down or confuse their session. The loader inventory above says
they get exactly that: one skill, ~286 always-on tokens, no duplicate. What they
also get is a copy of a repository, which is what `"source": "./"` means and
what ADR 0014 already accepted for `docs/`, `scripts/` and `CLAUDE.md`. The
mirror is the largest item in that category, not a different kind of thing.

**ADR 0003 is not reversed and is not amended.** It gets a forward pointer, as
it already has to 0014. The mirror stays committed, `check:sync` stays, and the
copy-not-a-symlink reasoning stands.

**The number is recorded here rather than re-derived.** The next person sizing
the payload should start from the ratio, not the byte count: it is ~30% by
construction and will stay ~30%.

## Consequences

An installer's plugin cache holds the skill twice on disk. At this size it is
not worth engineering against, which is the same conclusion ADR 0014 reached
about the double copy the cache already makes of the whole tree.

The mirror grows in lockstep with the canonical tree, so the payload grows at
twice the rate of the skill. That is the number that could eventually matter,
and it is why the revisit trigger below is expressed as a size rather than a
share.

**Revisit when any of these changes**, and not otherwise:

- The plugin format gains an exclude mechanism, in the manifest or as an ignore
  file. Then this is a two-line change with no layout cost and there is no
  reason not to make it. The probe above is the way to check: add the key and
  see whether `validate --strict` still calls it unknown.
- The skill tree passes a few megabytes — vendored assets, fixtures, images.
  The argument here is entirely about 391 KiB of markdown, of which the mirror
  is 121 KiB.
- Claude Code starts reading `.agents/skills/` from a project directory. Then
  the mirror has no reason to exist at all, for cloners or anyone else, and this
  becomes a deletion rather than an exclusion.

**Rejected: generating the mirror on clone.** Argued above. It trades a checked
artifact for an unchecked instruction and takes `check:sync` with it.

**Rejected: moving the plugin into a subdirectory.** The one mechanism that
would work, and the one ADR 0003 exists to avoid. Reversing the portability
decision the whole repository rests on, to save 121 KiB of markdown on an
install, is not close.

**Rejected: recording the byte count in ADR 0003.** #49 suggested it, and it is
the wrong file. ADR 0003 is the layout decision; a measurement that moves every
time the skill is edited would need updating there forever. It lives here, with
the ratio flagged as the durable part, and 0003 points at it.
