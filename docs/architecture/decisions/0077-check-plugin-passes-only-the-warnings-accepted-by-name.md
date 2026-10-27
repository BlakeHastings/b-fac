# 0077. `check:plugin` passes only the warnings accepted by name

Status: accepted

Issue #236. Amends ADR 0014, whose first revisit trigger has fired: `claude
plugin validate --strict` now emits the `CLAUDE.md` warning. Keeps 0014's
decision to ship `CLAUDE.md`, and replaces its rejection of a wrapper script
with the narrower one below.

## Context

Measured on Claude Code 2.1.311, the version on the machine that found this.
`claude plugin validate . --strict` on `main` prints two warnings and exits 1:

```
Validating plugin: <repo>/CLAUDE.md

⚠ Found 1 warning:

  ❯ root: CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.
```

```
⚠ Found 1 plugin directory warning:

  ❯ .claude-plugin/plugin.json icon: No icon (ICON_MISSING). No icon found in the plugin. The validator looked for `icon` in plugin.json and for a file at .claude-plugin/icon.png or .svg, assets/icon.png or .svg, or a similar path.
    Fix: Add a square PNG to the plugin folder at .claude-plugin/icon.png, or set `icon` in plugin.json to the path of a square PNG or JPEG in the plugin: 512 to 2048 px on each side, under 2 MB. SVG and WebP are not accepted. ...

These plugin directory checks do not change the result below.
...
✘ Validation failed (--strict treats warnings as errors)
```

The issue named only the first. They are different in kind:

- **The `CLAUDE.md` warning is the one that fails the run.** Deleting
  `CLAUDE.md` from a copy and re-running gives `✔ Validation passed`, exit 0,
  with `ICON_MISSING` still printed. It is the same sentence `claude plugin
  tag` printed when ADR 0014 was written, now reached by `validate`.
- **`ICON_MISSING` is a "plugin directory" finding**, the checks the public
  catalog runs on a submission, and the CLI says outright that it does not
  change the result. It is an agent seeing it next to a red run that made it
  look like a cause.

CI pinned 2.1.226, which emits neither, so only local runs were red. Three
implementation agents in one wave each hit it and each correctly called it
unrelated to their diff. A local check every agent learns to ignore is no
longer a check.

## Decision

**`CLAUDE.md` stays, and its warning is accepted.** Nothing in 0014's reasoning
moved: the file is the `@AGENTS.md` bridge Claude Code needs, it is inert for
an installer, which is all the warning says, and moving the plugin into a
subdirectory still costs the root layout ADR 0003 was for. What moved is that
the warning is now in a check, and 0014 said that changes the calculus. It
changes it towards a mechanism, not towards a different layout.

**`ICON_MISSING` is accepted too, without an icon.** The manifest does take an
`icon` field, but the fix it asks for is a square PNG of 512 to 2048 px that
nobody has drawn, and adding one is a payload change. The icon matters only to
the public plugin directory, which this plugin is not submitted to; it is
installed from its own marketplace. When someone does draw one and submits,
deleting the acceptance is the whole change.

**`npm run check:plugin` becomes `node scripts/check-plugin.mjs`.** It runs
`claude plugin validate . --strict --json` and passes only when every finding
in the report is listed in its `ACCEPTED` array, matched on file, path and exact
message (or, for a directory finding, on file and code). It fails on:

- any error, which cannot be accepted
- any warning or directory finding not in `ACCEPTED`, including an accepted
  one whose wording or file changed
- an entry in `ACCEPTED` that the report no longer contains, so the list cannot
  quietly outlive what it excuses
- a strict failure with no validator warning to explain it
- a report it cannot parse, which is what an older CLI without `--json` gives

It counts directory findings, which `--strict` alone ignores, so it is stricter
than the command it wraps, not looser. `--strict` stays in the invocation.

**The CI pin moves from 2.1.226 to 2.1.311**, because 2.1.226 has no `--json`.
It is the version every case here was run on, and it still descends into
`plugin.json` for a root-sourced plugin: an unknown field reports as
`plugins[0] plugin.json → bogusField`.

### Why this is not the filter ADR 0014 rejected

0014 rejected "a script that hides one known line", because it "will one day
hide an unknown one". That objection is to matching text and dropping lines.
This reads the CLI's structured report and keys on the exact finding, so an
unknown warning cannot match by accident, and an acceptance that stops matching
fails instead of lingering. 0014 also reasoned that filtering was only worth it
where volume justified it, and that the warning never reached CI. It now
reaches every run of the check, which is that case.

## Evidence

Run on 2.1.311 against copies of this branch:

| Copy | `check:plugin` |
| --- | --- |
| unchanged | passes, both acceptances still reported |
| unknown field added to `plugin.json` | fails, `not accepted: validator .claude-plugin/plugin.json bogusField: ...` and the marketplace's view of the same |
| `CLAUDE.md` deleted | fails, `accepted but no longer reported` |
| `README.md` deleted | fails, `error, which cannot be accepted: directory README.md README_MISSING` |
| on CLI 2.1.226 | fails, no JSON report, `unknown option '--json'` |

`scripts/check-plugin.test.mjs` holds the same cases against hand-built
reports, so `npm test` covers the judgement without the CLI.

## Consequences

`check:plugin` is green again locally and in CI, and a red from it means
something nobody has accepted.

A CLI release that rewords either accepted warning reds the check until
`ACCEPTED` is updated. That is the intended price of exact matching: a reword is
the moment someone should re-read what is being accepted.

Accepting a further warning is a line in `ACCEPTED` and an ADR saying why. The
script's failure message prints the finding's key in the exact form the array
takes.
