# 0031. The duplicated command reader is held together by a test, not by a module

Status: accepted

Issue #97. ADR 0029 is the decision this one sits under; #93 is the open
question it deliberately does not answer.

## Context

`scripts/guard-merge.mjs` and
`.agents/skills/orchestrated-delivery/assets/guard-guest-writes.mjs` carry the
same command reader (the parser that asks what each command in a line *invokes*
rather than what its text contains) in two copies. ADR 0029 accepted
that cost with a reason: an asset is copied into a host repo on its own, and a
two-file asset is a setup step that gets half done.

The copies have since drifted twice. #90's closing-`)` fix landed in one and not
the other, and #96's reserved words sat in the merge guard for nine hours before
#98 put them in the guest gate. **Both times what caught it was an agent reading
a file it had been told not to touch.** Nothing in the repository would have
noticed either one, and the second copy is the one that ships to other people's
repositories.

ADR 0029 named the duplication as a cost. It did not leave anything watching it.

## Decision

**The two readers are delimited by `// BEGIN command reader` and
`// END command reader`, and `scripts/command-reader.test.mjs` compares them.**
Two assertions, because they fail on different things:

1. **The marked region, whole-line comments aside, is identical in both files.**
   Text, not behaviour, on purpose: a corpus only covers the paths it happens to
   walk, and both drifts so far were in a path nobody had written a line for.
   Comments are free to differ, and should: the guest gate explains itself to
   somebody reading it in a repository that is not ours.
2. **Both readers, lifted out and run over one corpus, produce the same
   segments**, and produce the expected segments for the cases #97 turns on.
   This is what proves the marked region is really the reader; a marker moved to
   enclose nothing fails here rather than shrinking assertion 1 to nothing.

**What is compared is the reader, not the verdicts.** The two guards' rules
differ and are meant to: #98 measured `\git push`, `/usr/bin/gh pr create` and
`git.exe push` denied by the guest gate and allowed by the merge guard, because
every rule there goes through `commandName` while `ghArguments` in the merge
guard compares the raw token. Asserting equal verdicts would assert a fiction.
Segmentation is the part that is genuinely one thing.

**Neither guard can be imported**, since both read stdin at the top level and
one of them installs itself, so the test builds a module from the marked region
and imports it as a `data:` URL.

## Consequences

**This is not the shared module ADR 0029 refuses, and the distinction is the
whole point.** ADR 0029's reason is distribution: what a host repo is handed has
to be one file. It still is. The module here is assembled at test time, in this
repository, out of the two files that ship, and nothing an installer receives
changes. **ADR 0029 stands.**

**It does not answer #93 either.** Whether three copies should become one is
still open, and this makes the status quo survivable rather than correct. It
sharpens the question by pricing it: two copies now cost a pair of markers and a
test file, and the third copy (`assets/guard-merge.mjs`, still the pre-#58
text-scanning reader) is outside the markers and outside this test, which is now
the most visible thing about it.

**The markers are load-bearing comments**, which is a thing this repository does
not otherwise have. A guard is refactored past them and the test fails loudly
rather than passing on a shrunken region, so the failure mode is the safe one.

**A trailing comment inside the region has to appear in both copies**, because
the stripper only removes whole comment lines. Reaching inside a line to find a
`//` is the kind of cleverness that eventually mistakes a string for a comment,
and the cost of not doing it is one duplicated remark.
