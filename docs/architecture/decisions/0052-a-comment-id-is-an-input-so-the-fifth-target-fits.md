# 0052. A comment id is an input, so the fifth target fits where `create` did not

Status: accepted

Issue #164, found by the agent working #163 when the repair it was asked to make
turned out to be unreachable with the tool it was told to use. ADR 0049 is the
mechanism this extends; ADR 0050 is the decision it has to answer, because that
one rejected a fifth target and the reasons it gave are the test.

## Context

`post-body.mjs` had four targets. `issue-comment` and `pr-comment` run
`gh issue comment --body-file`, which **adds** a comment. `issue-body` and
`pr-body` run an `edit` subcommand, which reaches a body. **Nothing rewrote a
comment that already exists.**

Every artifact `check-bodies.mjs` reports on this repository is a comment. So
#163's repair, "post the real body through `post-body.mjs`", posts an eighth
comment and leaves the two characters exactly where they were. The agent proved
that rather than arguing it: its own blocker note went through the script onto
#163 and the brief above it was untouched, which is the script working correctly
and the repair being impossible in the same observation.

`check-bodies.mjs` printed the same defective advice, naming the four targets at
the moment somebody wants to act. That is worse than printing none, and it is
#156's shape arriving in a second tool.

**`--edit-last` is not the missing flag.** `gh` has it. On five of the six
blanked briefs the current user's most recent comment *is* the superseding
repost carrying the real text, so an "edit the last one" route overwrites the
recovered brief and leaves the `@-` in place. Verified before anything was
proposed, and recorded here because the flag will look obvious to the next
reader too.

## Decision

**A fifth target, `comment:<id>`, which rewrites a comment addressed by its id**,
through `gh api --method PATCH repos/{owner}/{repo}/issues/comments/<id>
--field body=@<file>`, read back through a bare `gh api` GET of the same path.

### Whether ADR 0050's distinction survives contact: it does, and here is the test

ADR 0050 rejected `create` for two reasons about shape rather than principle,
and this candidate has to pass both rather than borrow the conclusion.

**"`TARGETS` cannot express it."** There, the artifact's number was an *output*
and a title was a second argument that is neither an input of that shape nor a
body, so `create` was a second mechanism sharing a file. Here **the comment id
is an input, and it is the only argument besides the file.** The new row is the
same four lines the other four are: `write(id, file)`, `read(id)`, `pick`. No
new branch through `run()`, no new error path, and the table is still the reason
the script is readable. The distinction holds, and it holds because it was about
the shape of the table rather than about how much anyone wanted the feature.

**"It would guard the body and hand the title back to the shell."** A caller of
`create` types a title on their own command line, which is where the first two
failures of this class happened. `comment:<id>` takes a numeric id and a path.
The body still never appears on a command line at all, which is the property
ADR 0049 states, so this half holds too.

**Two further tests it also has to pass, because two reasons that both pass is
how a convenient conclusion looks.**

*ADR 0049's front-end objection.* This is the first `gh api` call in the script,
and `gh api` is the general front end that ADR refuses. What keeps it a target:
the method is fixed, the path is a literal with only the id interpolated, and
there is exactly one field. A caller cannot reach a second endpoint through it,
cannot choose a verb, and is not assembling a `gh` call. Compare the rejected
`create`, which would have wrapped a subcommand's whole surface.

*Whether it is the same question the script already answers.* It is: post a body
to an artifact that exists, then read it back. That is the sentence in
`post-body.mjs`'s header, unchanged. Of the four artifacts that carry a body
here, the comment was the only one that could be added and never corrected,
which makes this row the completion of the table rather than a widening of it.

### `check-bodies.mjs` prints the command per finding, not a list of targets

Each finding now carries its own `Repair:` line, with the target and the number
or id already filled in, because the detector knows which artifact it found and
the caller should not have to translate. The comment id is the last part of the
URL the finding already prints, which is why these two tools join with nothing
to look up. Where no target reaches an artifact, the line says that instead of
naming one that would miss.

### `appends` replaces a test on the kind's name

The mismatch report used to ask whether the kind ended in `-body` to decide
between "delete it and post again" and "re-run this command". A target that
replaces a comment breaks that proxy, and getting it wrong would tell somebody
repairing a comment to delete the artifact they were repairing. The table now
says which targets append.

## Consequences

**A wrong id destroys the wrong comment, and the read-back cannot see it.** This
is ADR 0050's "right file, wrong number" residual, in the place it costs most: a
comment edit replaces bytes with no version anyone can recover, and the
read-back verifies the wrong comment happily, because what is stored there is
what was sent. `--check` does not help, since the point is to replace. What
helps is that the id comes from the finding rather than from a note about it,
and `check-bodies.mjs` prints the id and the stored body in the same block, so
for the case this exists for the destroyed bytes are already on the reader's
screen. Exercised on a throwaway issue (#167) in both directions before use: the
rewrite verified, and a `--check` against a file that was not what the comment
held refused and posted nothing.

**Editing one comment leaves its neighbours untouched, and that had to be shown
rather than assumed**, because #128 and PR #148 each have a comment whose text
refers to the blanked one above it. Measured on #167: comment A rewritten by id,
comment B's `updated_at` unchanged, its stored body still byte-for-byte its
source file, no third comment created, order unchanged.

**The `@` in `--field body=@<file>` is the convention that caused #143**, which
is worth naming rather than hiding. `gh api` is the one command that honours it;
`gh issue comment` does not, which is exactly why #143 happened where it did. It
puts a path on the command line and never the body, so it has the property every
other write here has, and if that ever stopped being true the read-back is what
would say so.

**Review comments and inline review threads are still out of reach.** They live
on a different endpoint. `check-bodies.mjs` does not read them either, so the
two tools are missing the same thing in the same place, which is the honest
version of a gap.

**#163 is unblocked and its repair route now exists.** Its success condition
still needed the separate correction in ADR 0053, because an exit code that
arrives by attrition is not proof that anything was repaired.
