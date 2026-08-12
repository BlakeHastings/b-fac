# 0033. The shipped guard keeps the push rule and loses the branch lookup

Status: accepted, and amended by issue #104 in the last consequence, which is
where this ADR said the probe was still missing.

Issue #102, split out of #93. ADR 0001 is the decision this one is measured
against, ADR 0029 the one it declines to reopen, ADR 0031 the mechanism that
replaces it, and `references/enforcement.md` the text that has to stay true.

## Context

`assets/guard-merge.mjs` is what a repository installing this skill gets as its
only preventive layer. It was the pre-#58 text scanner: it matched patterns
against the text of the command line rather than asking what each command in
that line invokes. Measured against `main`, it failed in both directions at
once. `gh --repo o/r pr merge 42` walked straight through, because a global flag
sits between `gh` and its subcommand. `git commit -m "Deny gh pr merge before it
runs"`, `echo "gh pr merge 1"` and `git merge-base HEAD origin/main` were all
refused.

**The false positives are the dangerous half**, and this repository knows it by
having lived it: within seconds of its own guard firing for the first time, the
guard denied a `gh issue comment` describing the guard. A guard that obstructs
routine work gets worked around, and then it protects nothing.

Porting the reader is mechanical. What is not mechanical is that
`scripts/guard-merge.mjs` and `assets/guard-merge.mjs` **are not the same
guard**, and the diff between them is not only staleness. Two differences are
deliberate, and copying one file over the other would have deleted both without
anyone deciding to.

## Decision

**The reader is ported, inside the `// BEGIN command reader` markers, and the
asset joins `scripts/command-reader.test.mjs`.** ADR 0031 introduced the markers
and the test for two copies; the third one was outside both, and it was the copy
that ships. The markers enclose the reader only, which is what makes the next
two paragraphs possible: the rules sit outside the region and are free to
differ.

**`DEFAULT_BRANCH` stays, as a setup knob.** `SKILL.md`'s asset table lists it as
the one thing an installer edits, and `check-setup.mjs` greps this file for
`const DEFAULT_BRANCH = '...'` in order to report a guard protecting a branch
the repository does not have. This repository's copy has that knob resolved away
because this repository's default branch is not a variable. A test pins the
declaration to the shape `check-setup.mjs` reads, because they are two files
agreeing on a form and nothing else was holding them together.

**The push rule stays, and ADR 0001's deletion of it does not transfer.** ADR
0001 removed the push-to-default-branch cases from *this* repository's guard
because the ruleset on `main` refuses a direct push with no bypass actors, so
the rule was unreachable here. **The repository installing this skill has no
ruleset** — the whole premise of the substitute stack is that branch protection
needs a paid plan on a private repo — so there the rule is the only thing
between an agent and a commit on `main`. Removing it by copying would have
silently deleted a layer from every future install.

It is rewritten to read what the command invokes, like everything else: the
arguments after `push`, first positional treated as the remote, and each
remaining refspec's destination half compared whole against `DEFAULT_BRANCH`.
So `git push origin HEAD:main` and `git push origin :main` are refused and
`git push origin main-fix` is not.

**A dry run is allowed**, matching `assets/guard-guest-writes.mjs`, which has
excluded `--dry-run` and `-n` from its own push rule since it was written. It
contacts the remote and changes nothing, so a rule about landing code has
nothing to act on, and two guards disagreeing about the same command for a
reason neither can state is how a reader stops trusting both. Review of this
change caught it shipping without the allowance, which is the wrong shape for a
change whose entire argument is that false positives are the dangerous half.

The short form is matched as a whole token, and that was checked rather than
assumed: `git push -h` lists exactly one `-n` and it is `--dry-run`, so the
token cannot mean anything else in a push. What it does not catch is a bundled
cluster, since git's parser accepts `git push -nq`. That stays denied, which is
the harmless direction, and widening the match to any cluster containing `n`
would be the harmful one: `-on` is `-o n`, a push option, and reading it as a
dry run would allow a real push to the default branch. The guest gate has the
identical residual, so the two still agree.

**The branch lookup goes, and that half of ADR 0001's reasoning does
transfer.** The earlier asset shelled out to `git rev-parse --abbrev-ref HEAD`
and denied a bare `git push` or any `git merge` when the answer was the default
branch. ADR 0001 gave two reasons for deleting those; the first was local (the
ruleset) and the second is not:

> they worked by shelling out to `git rev-parse` to learn the current branch,
> which references/enforcement.md itself calls unsound — a PreToolUse hook runs
> before the command, so a `cd` in that command has not happened yet and the
> branch it reads may not be the branch the command acts on.

That is a property of the mechanism, not of any repository's settings, and it
was measured rather than argued: run from inside a git worktree, the clause
answered `allow` on a command the main checkout denied. Same script, opposite
verdict, decided by which tree the hook happened to look at. It is the same
reasoning ADR 0029 used to refuse a gate that reads the write boundary off disk
and ADR 0030 used to draw the line between a report and a gate, so following it
here is consistency rather than a new position.

A rule that is right or wrong depending on something it cannot see is worse than
an absent one, because it is trusted. The `git merge` rule goes with it, since
nothing on the command line distinguishes a dangerous merge from a routine one,
and with it goes the `--ff-only` carve-out that existed only to undo one of the
clause's false positives.

## Consequences

**A bare `git push` while standing on the default branch is no longer refused,
and neither is `git push --all`.** That is a real reduction and it is named in
the asset's own NOT COVERED section rather than left to be discovered. It is
also the case layer 3 exists for: the provenance audit asks the API which pull
request each new commit on the default branch belongs to, and it ships in every
install even though ADR 0001 dropped it here. Prevention that can be bypassed is
made honest by detection, which is the stack's own stated design, and this is
the first time that sentence has had to pay for something.

**Two guards in this repository now differ on purpose in a third way**, after
`commandName` versus the raw token (#98) and the probe. `command-reader.test.mjs`
compares the reader and deliberately not the verdicts, which is exactly why it
could absorb a third copy whose rules are different.

**The shipped guard has tests, in both directions, for the first time.**
`scripts/guard-merge-asset.test.mjs`, modelled on `scripts/guard-merge.test.mjs`
including its weighting of the allow cases. The nine measured lines from #102
are in it, on the side they belong.

**ADR 0029 still stands and #93 is still open.** Nothing here becomes two files.
The third copy makes the duplication more expensive to argue for, and that
argument belongs on #93.

**The shipped guard had no probe when this was written**, so an installing
repository could not observe whether it loaded. That is the exact state ADR 0027
was written about, and the one that cost this repository two days. `assets/` does
not ship `check-guard-live.mjs` either, so there was not even the two-file
version of the answer. Measured: running this repository's own guard corpus
against the shipped asset, **no** allow case was denied and the only lines it
let through that `scripts/guard-merge.mjs` refuses were the four probe
invocations. Filed as #104 rather than fixed here, because a probe is a second
decision about the asset's interface and this change already carried one.

**Amendment, #104: it has one, and it is ADR 0029's shape rather than ADR
0027's.** `node scripts/guard-merge.mjs --probe` is refused by the guard itself,
one file, so the probe and the rule cannot disagree about a filename. Copying
`check-guard-live.mjs` into `assets/` was the other option and is refused for
the reason ADR 0029 refuses a shared module: what a repository is handed has to
be one file, because a two-file asset is a setup step that gets half done, and
here the half that gets skipped turns the answer into a permanent, silent
"inert".

So the four lines measured above **stay allowed**, and that is the decision
rather than a leftover. They name `check-guard-live.mjs`, which lives in this
repository and does not ship; a rule matching a file name that never arrives in
an installing repository would refuse a command nobody there can run while
answering nothing about the guard. They are pinned as allow cases with that
reasoning, so a later reading of this ADR's own measurement cannot turn them
into a rule by mistake.

**`check-setup.mjs` now depends on the asset in a second way**, and is pinned
the same way. Layer 2 already grepped the guard for `const DEFAULT_BRANCH`; it
now also tells the reader to run the probe, which is a path and a flag only that
file answers to. `guard-merge-asset.test.mjs` reads both out of
`check-setup.mjs`'s source, rebuilds the line it prints, and asserts the guard
refuses it. Two files agreeing on a form with nothing holding them together is
what #102 found and pinned once; doing it again unpinned would have been the
same defect with a different constant.

**The probe refuses to report when npm is in the way, and the guest gate's does
not.** ADR 0027 recorded the trap: npm re-invokes a script through a shell of
its own, so the hook is shown `npm run <name>`, the rule never sees the file
name, and the probe runs and reports the guard absent in a session where it is
loaded. An installing repository is the likeliest place for someone to wrap the
line in a package script, so the guard this one ships carries the check.
`guard-guest-writes.mjs` was left alone here rather than edited in passing, so
the two now differ in a fourth way. It is a stated one, and it is a defect in
the gate that lacks the check rather than in the one that has it.

That block was guest-only before this, which meant the owned stack could report
every layer `ok` and offer no way to ask the one gate in it whether it had
loaded. It prints in both modes now, naming whichever gate the write boundary
makes applicable.
