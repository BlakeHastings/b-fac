# 0061. The reader carries a stamp, and the test keeps it true

Status: accepted

Issue #185. ADR 0029 refuses a shared module; ADR 0031 holds the copies
together with `scripts/command-reader.test.mjs`.

## Context

The command reader region shipped into every host repository with a comment
saying a test runs "every copy". Inside a host repository that is false: the
installed guard is a fourth copy that no test reads, and dbmd's had fallen a
generation behind while its comment said otherwise.

## Decision

**The comment in the shipped assets says what is true in a host repository**:
the installed copy is unversioned and unwatched, and here is how to check it.

**Each copy of the region carries `// reader stamp: sha256 <16 hex>` under its
`BEGIN` marker**, a hash of the region's code as `codeLines` normalises it:
whole-line comments and blank lines dropped, trailing whitespace trimmed. A host
compares that one line with the skill's asset.

Comments are left out of the hash because they must be. The three copies'
comments differ on purpose, so hashing them would give three stamps for one
reader, and the stamp is itself a comment inside the region it describes.

**The check is a test in `command-reader.test.mjs`**, not a script of its own,
because that file already owns the region and its normalisation, and a second
script would be a second copy of `codeLines`. Changing one byte of reader code
without the stamp is a red `npm test`, and the failure prints the new line.

## Consequences

A stamp says whether a host's reader was the skill's reader, not whether it
still is: an operator who edits the code in their copy keeps the old stamp,
because nothing in their repository recomputes it. The comment says so.

The stamp covers the reader and nothing else. The rules around it are not
stamped. Shipping a check beside the guard, which would cover more, was option 3
on #185 and was left alone.
