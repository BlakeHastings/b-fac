# 0014. The plugin ships the whole repository, and the `CLAUDE.md` warning is expected

Status: accepted

## Context

ADR 0003 put `"source": "./"` in the marketplace entry so the plugin root is the
repository root. An install therefore copies the repository, including the files
that exist for people working *on* it. `claude plugin tag` says so on every
release:

```
⚠ CLAUDE.md: CLAUDE.md at the plugin root is not loaded as project context.
  To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.
```

ADR 0003 chose the root-sourced layout but never said what that layout ships.
Its consequences cover mirror drift and the double-listing an installer sees;
they do not mention the payload at all. This is the gap, not a restatement.

### What actually ships, measured

A fresh shallow clone of `main` on 2026-08-11, which is the tree an install
copies:

```
$ git clone --depth 1 https://github.com/BlakeHastings/b-fac payload-probe
$ find payload-probe -path ./payload-probe/.git -prune -o -type f -print | wc -l
64
$ du -sk payload-probe payload-probe/.git
716     payload-probe
197     payload-probe/.git
```

**64 files, 369,631 bytes of content (361.0 KiB); 716 KiB on disk, of which
197 KiB is `.git`.** By top-level path, in content bytes:

| Path | Files | Bytes |
| --- | ---: | ---: |
| `.claude/` | 15 | 114,017 |
| `.agents/` | 14 | 113,656 |
| `docs/` | 12 | 65,185 |
| root files | 8 | 11,561 |
| `scripts/` | 9 | 57,482 |
| `.github/` | 3 | 5,897 |
| `.claude-plugin/` | 2 | 1,767 |
| `.gemini/` | 1 | 66 |

The two files the warning is about are `CLAUDE.md` (728 bytes) and `AGENTS.md`
(2,905). Together they are **3,633 bytes, 1.0% of the tree**. Everything outside
the payload as `docs/process/releasing.md` defines it — docs, scripts, CI and
harness config, root files — is 35 files and 138.2 KiB, 38%.

Size is therefore not an argument for acting. The interesting number is a
different one: **`.claude/skills/` is a byte-for-byte copy of `.agents/skills/`,
113,656 bytes each**, and `plugin.json` declares only `./.agents/skills/`. The
mirror ships to every installer and no installer reads it. That is 31% of the
tree and 31 times the size of the two files the warning names. ADR 0003 created
the mirror deliberately, for the contributor who clones rather than installs;
it merely also rides along into the cache. Removing it from the install would be
a payload change and is out of scope here. It is recorded so that anyone who
later argues about install size starts from the right file.

**ADR 0018 took that question up and accepted the mirror**, having confirmed
against the CLI's own validator that no manifest key excludes a path, and having
shown with the loader that the shipped copy costs an installer nothing at load
time. Its measurement supersedes the figures above, which were correct when
taken and have since moved.

### The warning is narrower than it looks

Two things were checked rather than assumed.

**It is `CLAUDE.md` alone, not repo-development files in general.** Deleting
`CLAUDE.md` from a clone and re-running the same command prints nothing, with
`AGENTS.md`, `docs/` and `scripts/` all still present:

```
$ claude plugin tag . --dry-run -f | head -2
⚠ CLAUDE.md: CLAUDE.md at the plugin root is not loaded as project context. ...
Plugin:  b-fac
$ rm CLAUDE.md && claude plugin tag . --dry-run -f | head -2
Plugin:  b-fac
Version: 0.5.0 (from plugin.json)
```

So the CLI is not complaining about payload contents. It is warning that a file
named `CLAUDE.md` at a plugin root does *not* become context for the installing
project, which is a reasonable thing for it to say and a thing we already know.

**It never reaches CI.** `npm run check:plugin` is
`claude plugin validate . --strict`, and on this repository it prints
`✔ Validation passed` and exits 0 with no warnings at all. Only
`claude plugin tag` emits the line, on **stdout**, exit 0. `tag` is a manual
step in `docs/process/releasing.md`, run by the owner on `main` after a merge.
The issue's worry that `check:plugin` would carry this warning forever is
unfounded: no CI log contains it, so every warning that does appear in
`check:plugin` output is load-bearing by construction, and no rule is needed to
tell the two apart.

### There is no exclude mechanism to reach for

Neither published manifest schema has one. `claude-code-plugin-manifest.json`
allows `$schema, name, version, description, author, homepage, repository,
license, keywords, dependencies, hooks, commands, agents, skills, outputStyles,
themes, channels, mcpServers, lspServers, monitors, settings, userConfig`, and
the marketplace entry adds only `source, category, tags, strict`. No `files`, no
`exclude`, no ignore file. The declared paths say what gets *loaded*, not what
gets *copied*.

## Decision

**The repository-development files ship, and that is accepted.** 3.6 KiB of
inert markdown in a 361 KiB tree is not a cost worth a structural change, and
the files are inert rather than harmful: nothing loads them, so an installer
sees no behaviour from them.

**Do not move the plugin into a subdirectory.** It is the only mechanism that
would exclude anything, and it costs the thing ADR 0003 was actually for: a
repository root that around forty harnesses read directly, with `.agents/`,
`AGENTS.md` and per-harness config where the spec says they go. Reversing a
portability decision to silence one line printed once per release, on a command
only the owner runs, is a bad trade. If the recurring line is the irritant, the
proportionate answer is to write down that it is expected.

**Say where the warning is expected, next to the command that prints it.**
`docs/process/releasing.md` gains one short section by the `claude plugin tag`
step. That is the only place a human meets it.

## Consequences

Every release prints one warning that is correct and that we have decided to
live with. Someone cutting a tag who has not read this will still pause at it
once; releasing.md now answers them in the place they are standing.

An installer's disk holds the tree twice, once as the marketplace clone and once
as the plugin cache copy — `known_marketplaces.json` records an
`installLocation` under `plugins/marketplaces/<name>`, and
`installed_plugins.json` records an `installPath` under
`plugins/cache/<marketplace>/<plugin>/<version>`. At this size that is under
1.5 MB and not worth engineering against.

**Revisit when any of these changes**, and not otherwise:

- `claude plugin validate --strict` starts emitting the warning. Then it is in
  CI, `check:plugin` goes red, and the calculus is different because the cost
  moves from one human to every pull request.
- The tree grows by an order of magnitude — a few megabytes of assets, fixtures
  or vendored anything. The argument here is entirely about 361 KiB.
- The plugin format gains a documented exclude mechanism. Then this becomes a
  two-line manifest change with no layout cost, and there is no reason not to.

**Rejected: deleting or renaming `CLAUDE.md`.** It exists because Claude Code
does not read `AGENTS.md`, and the `@AGENTS.md` import is Anthropic's own
guidance for Windows (ADR 0003). Deleting it to silence a warning would break
the harness the repository is verified on.

**Rejected: filtering the warning in a wrapper script.** A script that hides one
known line is a script that will one day hide an unknown one, and the warning
does not appear in CI, which is the only place volume would justify filtering.
