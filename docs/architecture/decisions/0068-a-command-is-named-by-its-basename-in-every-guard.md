# 0068. A command is named by its basename, in every guard

Status: accepted, and amended by ADR 0069, which puts `git arguments` in this
repository's merge guard too, for its uncommitted-work rule.

Issue #219. Amends ADR 0031, whose "known difference" between the guards'
reading of a command name was a hole and not a rule, and ADR 0067, which left
this repository's `ghArguments` outside its region because of that difference.
ADR 0029 still refuses a shared module.

## Context

Measured from real `PreToolUse` payloads on `main` at `d7fb64d`:

| command | `scripts/guard-merge.mjs` | `assets/guard-merge.mjs` | guest gate |
| --- | --- | --- | --- |
| `gh pr merge 42` | deny | deny | deny |
| `/usr/bin/gh pr merge 42` | **allow** | deny | deny |
| `"C:\Program Files\GitHub CLI\gh.exe" pr merge 42` | **allow** | deny | deny |
| `gh.exe pr merge 42` | **allow** | deny | deny |
| `gh.cmd pr merge 42` | **allow** | **allow** | **allow** |
| `/usr/bin/gh issue create ...` | allow | allow | deny |
| `git.cmd push origin main` | allow | **allow** | **allow** |

This repository's merge guard compared `tokens[0]` with `'gh'`. ADR 0031
recorded that as a difference in the guards' rules, beside differences that are
real (the guest gate refuses every outward write; ADR 0033 keeps a push rule
in the shipped guard). It was not one. No guard means to let `/usr/bin/gh pr
merge 42` through, and a difference nobody wants is a defect. ADR 0067 then
left the function outside its region because of that entry, so nothing compared
it.

The issue also read the shipped guard as letting `/usr/bin/gh` through. It did
not, at `d7fb64d` or at `901371d`: its `commandName` already split on either
slash. Its own NOT COVERED comment listed `/usr/bin/gh pr merge` and `\gh pr
merge` as allowed, which was false for that copy. The comment is the likely
source of the reading. The shipped copies' real hole was the extension: only
`.exe` came off, so `gh.cmd` and `git.cmd` were other programs.

## Decision

**Every guard decides "is this `gh`" and "is this `git`" through `commandName`,
and `commandName` returns the basename, lowercased, with a trailing `.exe`,
`.cmd` or `.bat` removed.** Either slash separates path parts. The reader has
already removed quotes and escapes. The comparison after that is exact, so
`gh-dash`, `ghq` and `/opt/gh/bin/not-gh` stay other programs.

The name is lowercased on every platform. Windows ignores case. A POSIX program
named `GH` that is not `gh` is not worth leaving a merge open for.

**The `command arguments` region is split into `git arguments` and `gh
arguments`.** `gh arguments` is in all three guards. `git arguments` is in the
two shipped ones, because this repository's merge guard has no `git` rule
(ADR 0001). This follows ADR 0067's reason 1: a region goes only in the files
that use it, and a whole region would have put an unused `gitArguments` here.

## Consequences

The `shell payload` stamp changed, because `commandName` changed. The `command
arguments` stamp line is gone. `git arguments` and `gh arguments` each have a
stamp line. A host that compared the old line finds no line with that name,
so it sees that its copy is out of date.

ADR 0031's statement that the guards' verdicts differ is still true, and the
reader test still compares the reading and not the verdicts. What changes is
the example ADR 0031 gave: the name a guard reads is now part of the
compared text, so the three guards cannot read it differently again.
