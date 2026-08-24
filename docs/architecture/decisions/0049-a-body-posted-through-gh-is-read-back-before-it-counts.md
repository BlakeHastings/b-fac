# 0049. A body posted through `gh` is read back before it counts as posted

Status: accepted

Issue #143. ADR 0004 is this repository's record of what a stronger sentence is
worth against a shape, and ADR 0027 and ADR 0038 are the two nearest cases of
building a mechanism that answers by refusing rather than by reminding.

## Context

`gh` will take a body it cannot read, store something else, print a URL and exit
0. Three times here, in three different ways:

1. Backticks inside a double-quoted `--body` ran as command substitution and ate
   filenames.
2. The same again, within the hour, after it had been written down.
3. `--body @-` with a quoted heredoc. `@-` is a `curl` and `gh api -f`
   convention; `gh issue comment` and `gh pr create` store the two characters
   literally. In one session this wrote **seven artifacts empty**: four agent
   briefs, a measurement on #87, the body of PR #140, and the body of #141, an
   issue whose entire purpose was to carry a question to the owner.

The instruction that would have prevented all three was already in
`references/reviewing.md`, in the section a reader reaches at exactly the moment
they need it, and it already carried its own note that it had been walked into
again after being written. It failed a second time anyway, in a new way it did
not describe, and the third failure was the orchestrator's own.

**What makes this class expensive is that it is silent in both directions.** The
writer gets a URL and exit 0, which is positive confirmation of a write that
stored two bytes. The reader gets `gh issue view <n> --comments` rendering `@-`
with nothing to say that anything is wrong. Three agents were dispatched at
briefs that did not exist, and the only reason this was found at all is that one
of them noticed a two-byte brief was implausible and asked the API for its
length. A brief nobody can read looks exactly like an agent that ignored one.

**Not derivable from the repository.** A reader who finds this file will see a
script and a pointer, and will not see that the note existed, was correct, was
read, and did not work, three times. That is the only reason to build the
mechanism, so it is recorded here.

## Decision

**`scripts/post-body.mjs` posts the body and then reads the artifact back, and a
divergence is a non-zero exit.** It takes `<kind>:<number>` and a file, covering
a comment on an issue or a pull request and the body of either. The flag choice
is gone rather than documented: nobody assembling a `gh` call is being asked to
remember anything, because they are not assembling one.

**It compares against the source file, never against a length.** The obvious
guard is a minimum-body floor, and it is the wrong one. A legitimate one-line
"ship it" is short, so a floor refuses real work on its first outing and is then
switched off, which is #102's failure and the reason #58 exists. Comparing
content catches the two-byte case and every other divergence with no number
anyone has to tune. The one refusal that is not a comparison is an empty source
file, which is never a body anybody meant to send.

**The read-back cannot share the failure mode it guards, and that is a property
worth stating rather than a coincidence.** The write is `--body-file`; the read
is a `view` subcommand that carries no body argument of any kind, so there is
nothing for an argument convention to be misread as. It asks for `--json` and
parses the result in Node rather than reading the rendered view, because the
rendered view is the half that said nothing was wrong. Every call goes through
`execFileSync` with an argument array, so no shell sees the body and the body
never appears on a command line at all. A read-back through the same broken flag
would confirm nothing, which is the trap this shape exists to avoid.

**The note in `references/reviewing.md` is replaced, not joined.** It now points
at the mechanism and states the incident, which is the part not derivable from
the code. A note beside a mechanism is a maintenance cost pretending to be
safety, and this repository deletes notes as readily as it adds them.

**It is not a `gh` front end and it never lands anything.** It posts bodies to
artifacts that already exist; creating an issue or a pull request stays `gh`'s,
followed by setting the real body through this. Landing is
`scripts/merge-pr.mjs` and stays there.

## Consequences

**Creation is the gap, and it is the gap that hurt most.** `gh issue create
--body ...` is still an unguarded body-carrying call, and the worst of the seven
artifacts was exactly that: an escalation issue's body, wrong with nobody
waiting on it. A brief has an agent about to read it and complain; a question to
the owner can sit empty for ever. The answer here is the two-step (create with
a placeholder, then set the body through the script) plus `--check`, which
compares an artifact against a file without posting and is the programmatic
version of what the finding agent did by hand. Widening the script to wrap
`create` was rejected as the front end this ADR refuses.

**It lives in `scripts/` and does not ship as an asset yet.** Every repository
running this workflow posts bodies, so by this repository's own logic it belongs
in `assets/` beside the guards. ADR 0038 is the precedent for not doing that in
the same change: a mechanism that a stranger installs wants a week of use here
first. Until then `references/reviewing.md` tells a repository without the
script to build the read-back rather than to write the note again, which is the
mechanism-level answer and not a fourth copy of the failed one.

**`--check` is a mode, and modes grow.** It earns its place by being the only
way to answer the question for an artifact somebody else wrote, which is the
question seven artifacts needed asked of them and nobody could ask. If a second
mode is ever proposed, that is the moment to re-read the front-end paragraph
above.
