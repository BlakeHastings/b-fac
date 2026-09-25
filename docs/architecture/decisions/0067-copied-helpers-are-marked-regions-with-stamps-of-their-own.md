# 0067. Copied helpers are marked regions, each with a stamp of its own

Status: accepted, and amended by ADR 0068, which splits `command arguments` into
`git arguments` and `gh arguments` and brings this repository's `ghArguments`
into the second.

Issue #201. Amends ADR 0061, whose stamp covered the reader and nothing else,
and extends ADR 0031 (the reader is held together by a test) to the helpers
beside it. ADR 0029 still refuses a shared module.

## Context

ADR 0031's markers and ADR 0061's stamp held the command reader together. Other
helpers had been copied just outside the markers, and nothing compared them:

| Helpers | Copies |
| --- | --- |
| `canonical`, `samePath` | `assets/guard-guest-writes.mjs`, `assets/check-setup.mjs`, `assets/check-outward-writes.mjs` |
| `commandName`, `SHELLS`, `shellPayload` | both merge guards and the guest gate |
| `gitArguments`, `ghArguments` | `assets/guard-merge.mjs`, `assets/guard-guest-writes.mjs` |
| the REST and GraphQL merge rule, from `isMergeEndpoint` to its two messages | `scripts/guard-merge.mjs`, `assets/guard-merge.mjs` |
| `show` | `assets/check-setup.mjs`, `assets/check-outward-writes.mjs` |

The issue named the first three groups. The merge rule arrived with #213 after
the issue was filed, and `show` turned up while this was being done.

The merge rule was held together only by shared test cases. Test cases cover the paths somebody wrote down, which is the weakness
ADR 0031 chose a text comparison to avoid.

## Decision

**Each group is a marked region of its own, `// BEGIN <name>` to `// END
<name>`, with a `// <name> stamp: sha256 <16 hex>` line under the `BEGIN`.**
`scripts/command-reader.test.mjs` lists every region in one table, and for each
it checks three things in every copy: the code, whole-line comments aside, is
the same as the first copy's; the stamp matches that code; and the region, lifted
out and imported, still declares the names it is meant to hold. Each helper
group also has a few pinned cases, which gives `canonical` and `samePath` a
test of their own for the first time.

**Separate regions, not a wider reader region.** Two reasons, and the first
decides it.

1. The groups live in different sets of files. The path helpers are in two
   files that carry no reader at all, `gitArguments` is not in this
   repository's merge guard, and the merge rule is not in the guest gate. One
   region could only cover them by shipping unused code into the files that
   lack a group.
2. The reader's stamp is the line a host repository already compares. A
   change to a helper should not tell a host that its reader moved.

The cost is that a host compares more than one line. The shipped guards say
which lines, beside each region.

`scripts/guard-merge.mjs`'s `ghArguments` stays outside its group on purpose.
It compares the raw token where the other two call `commandName`, and ADR 0031
records that as a difference in the rules.

## Consequences

`samePath` in `check-setup.mjs` moved up beside `canonical`, because a region
has to be contiguous. It is a function declaration, so where it sits changes
nothing about when it can be called.

A helper copied into a new asset is unwatched again until somebody adds it to
the table. The table is the one place to look, which is more than there was.
