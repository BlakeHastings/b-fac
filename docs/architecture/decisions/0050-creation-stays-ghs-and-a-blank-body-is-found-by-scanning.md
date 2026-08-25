# 0050. Creation stays `gh`'s, and a blank body is found by scanning what is stored

Status: accepted

Issue #149, which split the gap out of #143 rather than leaving it as a
paragraph in ADR 0049. ADR 0049 is the mechanism this extends and, in one place,
corrects.

## Context

ADR 0049 gave four body-carrying targets a read-back. All four are writes to an
artifact that already exists. `gh issue create --body ...` is a fifth
body-carrying call with the same failure mode and it is not covered, and it is
the call that produced the worst artifact of the incident: an issue opened to
carry a question to the owner, whose body stored as the two characters `@-`. It
sat blank. A brief is missed within the hour by the agent that needed it; a
question to the owner has nobody waiting on it at all.

ADR 0049 answered creation with a two-step, in prose: create with a placeholder,
then set the real body through the verified path. **That is an instruction, and
#143's entire finding was that an instruction had failed three times.** Closing
one instruction-shaped hole by opening a smaller one is defensible. #149 exists
so that it is a decision somebody made rather than a side effect, and this is
that decision.

## Decision

### A `create` target is still rejected, and the reason is now the code

ADR 0049 rejected it as the `gh` front end this repository has a specific reason
to avoid (#58, and `guard-merge.mjs`). #149 asked, correctly, whether that
distinction survives contact with a single `create` code path rather than a
wrapper around `gh issue create`'s full surface. It does not, for two reasons
that are about the shape of the thing rather than about the principle.

**`TARGETS` cannot express it.** Each of the four is four lines because the
artifact's number is an *input*: `write(number, file)`, `read(number)`, `pick`.
Creation's number is an *output*, and it needs a title, which is neither an
input of that shape nor a body. So `create` is not a fifth row in that table. It
is a second mechanism sharing a name and a file, with its own branch through
`run()` and its own error paths, and the four-line table stops being the reason
the script is easy to read.

**It would guard the body and hand the title back to the shell.** The property
in `post-body.mjs`'s header is that the body never appears on a command line at
all. A `create` target takes a title, and a caller types the title on their own
command line, where the first two failures of this class happened: backticks
inside a double-quoted argument running as command substitution. Guarding one
half of a call and exposing the other half to the exact mechanism that ate the
first two bodies is worse than not appearing to guard it.

### The two-step loses its placeholder, which removes the window it had

`gh issue create --body-file <path>` is the same flag every write in
`post-body.mjs` already uses, so the create call is not the unsafe part. The
missing part is only the read-back, and `--check` is that, with no new code:

```bash
gh issue create --title "..." --body-file body.md      # prints the number
node scripts/post-body.mjs issue-body:<n> body.md --check
```

Measured, on #155: created from a file, `--check` verified 477 characters and
exited 0. If the check ever disagrees, the repair is the same command without
`--check`.

**The placeholder form is strictly worse and should not be used.** Between the
two commands it leaves an artifact carrying placeholder text, and an agent that
dies, is compacted, or is refused permission on the second command leaves that
behind with no reader and no error anywhere, which is the same "nobody is
waiting on it" property that made the escalation issue the expensive one. The
form above has a window too, but the artifact in it carries the real body, so
the same death leaves something correct and merely unverified.

The counter-evidence is recorded rather than left out: the placeholder two-step
was run three times on 2026-08-24 (#151, #152, #153) and worked three times. It
is not broken. It is dominated, at no cost, by a form that has one fewer way to
end badly.

### The residual is closed by detection, because prevention has run out

Every remaining answer for creation is another instruction, and this repository
has three records of instructions in this exact class failing. SKILL.md's fourth
constraint is the way out: whatever prevention you have, add detection.
`scripts/check-bodies.mjs` reads the stored body of every recent issue, pull
request and comment, and reports the shapes a body-carrying call leaves behind
when it eats the body: the literal `@-`, the `@<path>` half of the same `curl`
convention, and an empty body.

**Its important property is that it needs no source file.** That is what lets it
cover creation, where there is often no file kept, and a session that died, and
a human at a terminal, and any harness. It does not care which call wrote the
artifact, only what the artifact holds.

**There is no length floor here either**, for ADR 0049's reason. A scan that
reports things that are fine is a scan somebody stops running, which is the
detection-layer version of a guard being switched off (#102, #58). Every shape
it names is an exact literal or a pattern a real body cannot match: a GitHub
login is alphanumeric and hyphens, so an `@` token carrying `.`, `/` or `\` is
not a mention anybody meant to post. Measured against this repository's whole
history: 293 stored bodies, seven reported, zero of them a false positive.

**It is a separate script and not a second mode of `post-body.mjs`.** ADR 0049
says modes grow, and that a second one is the moment to re-read its front-end
paragraph. Read: this asks a different question (of every artifact, with no file
to compare against) and takes no file, so it is not a mode of something whose
every argument is a file.

## Consequences

**#143's seven were eight, and this is how that was found.** The first real run
reported a blanked brief on #128 that neither #143 nor ADR 0049 lists among the
seven. It was noticed at the time and reposted by hand, with a note saying the
first attempt had landed as the literal characters, and the count in the record
was never corrected. Nothing was checking. That is the argument for this script
in one line, and it turned up before the script had been used in anger once.

**The check is red on this repository the day it lands**, with seven findings:
six two-byte comments left in place from the incident, each superseded by a
later comment carrying the real text, and one deliberate reproduction on PR #148
kept as evidence and explained by the comment directly beneath it. None is a
defect in the script and none is a false positive. Clearing them is a decision
about the record rather than about the code, so it is left to the owner rather
than taken here: deleting a comment is not reversible and no agent should do it
on its own judgment.

**`--body ""` reaches the same place, so the class is wider than one flag.**
Measured: `gh issue edit <n> --body ""` stores an empty body, prints a URL and
exits 0. `post-body.mjs` refuses an empty source file, but only for bodies that
go through it, and that refusal cannot see a blank that arrived any other way.
The scan can.

**It only detects when somebody runs it**, and it is not in `npm run check`
because that gate is hermetic and this needs a token and the network. That is a
real cost and naming it is better than pretending a check that nobody runs is a
control. `AGENTS.md` puts it beside the other out-of-gate checks, to be run
after a session that wrote outward.

**The payload half is deliberately not in this change.**
`references/reviewing.md` tells a reviewer to post through something that reads
the artifact back, and says nothing about creating an artifact, so the corrected
two-step above is not yet reachable by anyone outside this repository. That is a
change to shipped payload, which needs a version bump, and the version line is
serialising payload branches at the moment. It is filed separately rather than
held here.
