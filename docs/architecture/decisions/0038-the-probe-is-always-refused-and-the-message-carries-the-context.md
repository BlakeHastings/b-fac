# 0038. The probe is always refused, and the message carries the context

Status: accepted

Issue #82. ADR 0027 built the probe and says why its answer arrives as a
refusal. ADR 0004 is this repository's record of what a stronger sentence is
worth against a shape.

## Context

`scripts/check-guard-live.mjs` exists in order to be refused, so its denial is
the only denial in `scripts/guard-merge.mjs` that reads as success. A
`PreToolUse` hook refuses the whole tool call rather than the segment it
objected to, so a probe on a compound line takes every other command with it,
and then prints the answer the caller was hoping for.

Twice now that has cost something. #82 was filed after the probe ate a
`gh issue comment`. Its comment records the next orchestrator running
`git pull --ff-only --quiet origin main && node scripts/check-guard-live.mjs`,
believing for several minutes that they were on a commit they were not, and
catching it only because a later test behaved as though a fix were absent. They
had read the warning. There was no error to notice, because the output said the
guard was loaded and that was true.

#82 offered two remedies: tell readers to run the probe alone, or narrow the
rule so it fires only when the probe is the only command in the line. The first
is layer 0, and it had already been tried, in the file the second orchestrator
had read.

## Decision

**The verdict stays unconditional. The probe is refused whatever else is on the
line.** Narrowing the verdict is unsound, and the failure it produces is one
this repository has already shipped twice by other routes. Allowing
`node scripts/check-guard-live.mjs && true` would run the probe in a session
where the guard is loaded, and the probe would report the guard inert: the same
false measurement `GH_TOKEN=x node ...` produced before #97 and `npm run`
produced before #110, arriving a third time by a third route. A false "inert" is
worse than silence, because it has the authority of a measurement and invites
the reader to go looking for another way to merge. The invariant is that the
probe never runs in a process that would have refused it.

**The narrowing is on the wording instead.** The guard now asks whether
refusing the probe costs the caller anything else, and picks one of two
messages. Alone, it still ends "Nothing is wrong", because nothing is. In
company, it says that nothing else on the line ran, that the refusal reads as
success while being half a failure, and to re-run the rest on its own.

That is not the second remedy and it is not the first either. What made the
trap expensive was not that the reader had to remember something, it was that
the mechanism produced no evidence at the moment of the mistake. Now it does,
in the output the caller is already reading, phrased as the loss rather than as
the reassurance.

**The question is asked of the whole tool call, not of the segment.**
`probeIsTheWholeCall` walks the same reader a second time from the top,
descending into shell payloads, because what is lost can sit on either side of a
`bash -c`. A closing `}` is passed over, since `{ node scripts/check-guard-live.mjs; }`
is a real form and loses nothing.

## Consequences

`probe && foo` and `foo && probe` behave identically: denied, with the message
that names the loss. That is deliberate. The caller cannot tell from a refusal
which side ran, because neither did.

**The two shipped guards are not narrowed, and their probes still say nothing is
wrong on a compound line.** `assets/guard-merge.mjs` and
`assets/guard-guest-writes.mjs` both carry a `--probe` and both have the same
trap. Doing all three at once was rejected as too large for #82 and, more to the
point, as the wrong order: the change here is a judgement about wording that
wants a week of use before it is copied into two files a stranger installs.
`references/enforcement.md` warns their readers to run the probe alone in the
meantime, and says in as many words that the warning is the weaker of the two
remedies and that their guard does not have the other one. Filed as #119.

**A second walk of the command line per probe denial.** It runs only on the deny
path of one rule, so the cost lands on a command that is already stopping.

**This is the wrong side of the wiring-and-logic line to be casual about**, and
that is the other half of #82: the script is read off disk on every invocation,
so this change reaches every running session the moment it merges, with no
staging. It landed with deny and allow cases for both messages, which is the
only control that applies.
