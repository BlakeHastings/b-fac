# 0045. A substitution is both a command and an argument, and the reader emits both

Status: accepted

Issue #135. ADR 0031 is why the reader lives in three files and what holds them
together. ADR 0027 is why a probe answers by being refused. ADR 0037 is what
made this shape common. ADR 0038 is the wording this change had to keep honest.

## Context

`$(...)` is two things at once. Its contents are a command the shell runs, and
its output is part of the argument it sits inside. The reader only ever produced
the first: when `$(` opened, it ended the outer command, so

```
node "$(git rev-parse --path-format=absolute --git-common-dir)/factory/guard.mjs" --probe
```

segmented as `node`, then `git rev-parse ...`, then `--probe`. Every rule that
needs a command *and* what it runs — `isLivenessProbe` needs both — could
therefore never see them together, and the line was allowed.

That is not an exotic shape. It is the shape three documents in this repository
use to tell a session how to ask the guest gate whether it is loaded
(`references/enforcement.md`, `references/first-run.md`,
`docs/process/handoff.md`), because ADR 0037 made `git rev-parse --git-common-dir`
the way to locate factory state that lives outside the working tree. The skill
was steering people into the one invocation its own gate could not recognise, and
the failure mode is the one ADR 0027 exists to prevent: the probe runs, prints
"inert", and the reader goes looking for another route while the guard is in
fact denying. A false "inert" is worse than silence because it arrives with the
authority of a measurement.

A derivative factory hit this in the field and fixed it by adding a second test
against the raw, unparsed line. That is #58 reintroduced — matching text rather
than reading what a command invokes — and within a day their guard refused a
heredoc that merely documented the probe. The claim that over-matching here
costs nothing was falsified by the thing it was written to justify.

## Decision

**The reader emits a substitution's contents as their own segment *and* leaves a
placeholder token in the argument it interrupted.** The placeholder is the
literal `$()`, which is the source's own text with the command taken out, so a
line that really contains `$()` reads the same either way and no token is
invented that a shell would not have produced. The outer segment above becomes
`node` `$()/factory/guard.mjs` `--probe`, and `commandName` resolves the file the
way it does for any other path.

**The word in front of a `$(` is also emitted on its own, when there is one.** A
substitution can expand to nothing, and then the word is only that text, so both
readings go out and a rule denies if either matches. Without this the placeholder
*narrows* the guard: `gh pr merge$(true)` stopped being a merge the moment `$()`
joined `merge`, and it was denied before this change. Measured, along with
`gh "pr" merge$(x)` and `bash -c "gh pr merge$(x)"`.

With no word in front of it there is nothing to emit: the vanishing reading is a
bare command name carrying no arguments, and no rule in any of the three files
decides on one. Dropping it is also what leaves the probe's own line reading as a
single command, which the next decision depends on.

**A subshell's `(` pushes a frame of its own.** The frames are a stack now rather
than a list of interrupted quotes, so a `)` has to close the bracket that opened
it. Without that, `echo "$(cd repo && (pwd))"` hands the outer argument back one
bracket early.

**`probeIsTheWholeCall` reads only the outer commands.** ADR 0038 asks whether
refusing the probe costs the caller anything else. A `$(...)` that locates the
probe is how the line names its own script, not a second thing the caller wanted
done, so it costs nothing and the message stays "Nothing is wrong". Telling that
caller to run the rest on its own and then "ask the guard on its own" would send
them in a circle, because the substitution is how the guard is asked at all when
the probe is not in the working directory. A probe *inside* a substitution is the
other way round — `gh issue comment 1 --body "$(node scripts/check-guard-live.mjs)"`
really does lose the comment — and still gets the longer message, because the
`gh` segment is the outer one.

## Consequences

**Three copies, one commit, as ADR 0031 requires.** `scripts/command-reader.test.mjs`
compares the marked region textually and runs all three over one corpus. It was
shown red before the fix — 24 failures across the three copies — and green after,
so the new cases are known to have teeth rather than assumed to.

**Nothing became less refused, and two things became more.** Every line measured
either kept its verdict or moved from allow to deny. The two that moved are the
probe forms this issue is about, plus `gh api "repos/o/r/pulls/$(cat n)/merge"
--method PUT`, which was a working merge before: the endpoint was split at the
`$(` and `apiEndpoint` never saw a path with `/merge` in it. The guest gate gains
the same way for `"$(cat p)/gh" pr create`.

**The reader now has two views, and one of them has a single caller.** `segmentsOf`
is every command the line runs and is what a rule asks; `outerSegmentsOf` is the
commands the line itself runs. Only `scripts/guard-merge.mjs` asks the second, so
the other two copies carry it unused. That is the cost of ADR 0031's textual
comparison rather than a stray abstraction, and #119 is the named second caller:
it brings the two shipped guards' probes to the same two wordings.

**The vanishing reading reaches only as far as the `$(`.** A rule turning on a
token *after* one is not covered by it: `--probe` in `node guard.mjs$(x) --probe`
sits past the split, and did before this change too. Gluing a substitution into
the middle of a word is hiding rather than forgetting, which is the line each
guard's NOT COVERED section already draws for six easier routes.

**The field derivative's raw-line match is not adopted, here or anywhere.** It is
recorded in #135 with the evidence that falsified it, so the next factory that
reaches for it finds the answer rather than the reasoning.

**This is the wiring-and-logic line again.** The script is read off disk on every
invocation, so this reaches every running session the moment it merges, with no
staging, and it cannot be verified live from its own branch because
`$CLAUDE_PROJECT_DIR` resolves to the main checkout. Deny and allow cases before
it lands is the only control that applies.
