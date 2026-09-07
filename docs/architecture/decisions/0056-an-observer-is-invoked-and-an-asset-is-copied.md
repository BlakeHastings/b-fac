# 0056. An observer is invoked, so it lives in cli/ rather than beside the assets

Status: accepted

ADR 0014 says the plugin ships the whole repository, which is what makes this a
placement question rather than a packaging one. ADR 0003 puts the canonical
skills in `.agents/skills/`. ADR 0021 is the write boundary the store location
answers to.

## Context

Everything shippable in this repository had one shape until now.
`assets/guard-merge.mjs`, `assets/merge-pr.mjs`, `assets/check-setup.mjs` and
the rest are **copied into a target repository** and then run from there. That
is why they sit inside the skill: the skill's prose tells an agent to copy one,
and the path in the prose is the path on disk.

The observer is not that. It is run from wherever the plugin happens to be
installed, by `${CLAUDE_PLUGIN_ROOT}` in a hook entry and in a slash command,
and copying it into a target repository would be a mistake rather than the
installation step. Nothing about it is a template. It has no placeholders to
fill in and no per-repo constants to edit.

Putting it in `assets/` anyway would have cost three things. It would be
mirrored into `.claude/skills/` by `npm run sync`, so every file would exist
twice with a check holding the copies together, for no reader. It would appear
in the skill's own file listing as something to install, which is exactly the
wrong instruction. And this repository, which is run by the workflow it ships,
would have to either copy it to use it or reach into the skill's assets
directory, and both of those are the confusion in a different place.

## Decision

**`cli/`, `hooks/` and `commands/` are top-level and are payload.** The CLI is
one implementation invoked from wherever it is installed, this repository runs
that same file rather than a copy of it, and `sync-harnesses.mjs` never sees it.

**The distinction, stated so the next component lands in the right place: an
asset is copied and then belongs to the repository that copied it; a command is
invoked and always belongs to the plugin.** Copying is what makes a per-repo
edit legitimate, which is why `merge-pr.mjs` has a `REQUIRED` array at the top
that every installation is meant to change. There is no such array here, and if
one ever appears the file has become an asset and should move.

**`check-version-bump.mjs`'s `PAYLOAD` gained all three directories.** This is
the load-bearing half. That check exists because a payload change shipped
without a version bump reaches `claude plugin update` as no change at all, and
until this it enumerated only the skills and the manifest. A `commands/` file
becomes a slash command in a stranger's session and `hooks/hooks.json` wires
hooks into every session they start, so both reach an installer exactly as a
skill does, and a list that omitted them would have let the observer ship
silently forever.

**`check-plugin-load.mjs` gained the commands and the hooks.** Its whole
argument is that a valid manifest says nothing about whether the loader found
anything, and that argument does not stop at skills. The commands land in the
same `Skills (n)` inventory line, so without this every command added here would
have read as a stray skill and failed the check. The hooks needed a new
assertion because this repository shipped none until now.

## Consequences

**Three top-level directories that are not obviously payload from their names.**
`scripts/` sits beside them and is not shipped in the sense that matters, since
nothing in a stranger's session runs it. The `PAYLOAD` comment is where that
distinction is written down, because it is the only place a mistake about it
gets caught.

**`npm run sync` covers less of the payload than it used to.** It was previously
true that everything shipped was either mirrored or the manifest. A reader who
still believes that will look for the observer in `.claude/skills/` and not find
it.

**The version bump check now fires on more of the repository**, which will
occasionally demand a bump for a change to the CLI that no user would notice.
That is the safe direction and it is the same trade the check already made for a
typo fix in a skill.

**This repository runs the shipped file directly, so there is no copy to drift.**
The parity tests that hold `scripts/guard-merge.mjs` against its asset have no
analogue here and need none, which is a small piece of machinery that never has
to be built.
