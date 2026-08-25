# 0055. git says which clock dates the handoff, and the file's own date is still not parsed

Status: accepted

Issue #145, and #141 depends on it. ADR 0040 built these hooks and set the
constraint this revisits. ADR 0027 supplies the argument that a false
measurement is worse than silence. ADR 0037 is why the guest-mode handoff sits
outside the worktree, which turns out to be one of the cases this has to get
right.

## Context

`readHandoff` took the handoff's age from `stat.mtimeMs`, and passed the same
timestamp to `mergesSince` as the point to count commits from. One clock, read
twice.

**A checkout writes the committed bytes out with today's timestamp.**
`git worktree add`, `git clone` and any branch switch that changes the file all
do it, to a file nobody has touched. So both numbers went fresh at once.
Measured on a twelve-day-old handoff, the same bytes in two directories:

```
main checkout : below is docs/process/handoff.md verbatim, 288h old, 5 commits on main since.
a worktree    : below is docs/process/handoff.md verbatim, under an hour old, 0 commits on main since.
a fresh clone : below is docs/process/handoff.md verbatim, under an hour old, 0 commits on main since.
```

Two things make this worse than an inaccuracy. The reader most likely to be in a
worktree is a dispatched implementation agent, which is the reader least able to
check, having just lost its brief. And the clone case is what everybody
installing this gets: a handoff committed months ago reads as written minutes
ago, on the first run, for a stranger.

#141 asks whether the `PreCompact` refusal should be wired into this
repository's tracked settings. A gate resting on this measurement would fire in
the main checkout and never in a worktree, which is ADR 0040's own "never fired,
so delete it" case arriving by construction rather than by disuse.

## Decision

**Ask git which clock applies, rather than choosing one.** The question is one
line long: *could a checkout have written these bytes?* A checkout only ever
writes files git tracks, and it only ever writes the committed content.

| git says | Could a checkout have written this? | Dated by |
| --- | --- | --- |
| not tracked here | No | the file's mtime |
| tracked, differs from `HEAD` | No | the file's mtime |
| tracked, identical to `HEAD` | Yes, and nothing records whether it did | the commit that wrote it |

The first row is guest mode, where the handoff lives in the git common directory
outside the worktree (ADR 0037) and no checkout of the host repository ever
touches it, and it is also a first draft nobody has committed. The second row is
the mid-session top-up, which the loop asks for continuously and which is
therefore the normal state rather than the edge.

**`git log -1 --format=%ct` was rejected on the issue and is used here anyway,
because the objection was about a case it now never sees.** The objection is
sound: last-commit is not last-edit, and against an uncommitted top-up the
commit clock is wrong in the opposite direction. That is exactly row two, where
git has already said the bytes are not the commit's.

**The handoff's own commit is not a commit since the handoff.** With the commit
clock, a `--since` window opened at that commit's own timestamp includes it, so
a handoff committed a minute ago would read as one merge behind itself and the
threshold would arrive a merge early ever after. Where there is a commit, the
count is a range from it; where there is only a timestamp, it stays a window.

**Where git cannot be asked at all, the hooks say they cannot tell.** Not a
number with a caveat attached: the whole content of the caveat would be that the
number may be a checkout's, which is the false confidence being removed. Both
numbers go together, because an unknown instant makes the count unknown rather
than zero, and zero is the reading that says nothing has happened. Nothing is
refused on a cannot-tell, which is the rule ADR 0040 already holds.

**Nothing is parsed out of the handoff's text, and ADR 0040's refusal stands.**
It was reconsidered rather than assumed, because that file now opens with a
written-on date and reading it would have been the shortest patch here. It is
still the wrong one: a date in the prose is a format the document has to satisfy,
it silently becomes wrong the moment somebody edits around it, and it is written
by the same hand whose confidence the whole mechanism is a check on. git's answer
is not a claim the handoff makes about itself.

## Consequences

**The number can still overstate freshness by the length of a review.** A
handoff topped up at 09:00 and squash-merged at 18:00 is dated 18:00 by the
commit that carries it, and by the pull that lands it in the main checkout. Both
clocks read the merge. Nothing available here can see through that, and it is
the one direction that matters, so it is recorded rather than hidden. The commit
count is the partial answer: a busy nine hours shows up there.

**Up to four `git` invocations per hook run**, on `SessionStart` after a
compaction and on a manual `PreCompact`, against a 15 second timeout. None of
them is on the automatic path, which exits before any of this is reached.

**A shallow clone is unchanged and still a floor.** It can date the handoff, and
it undercounts what has landed since, which was already true and already said.

**`scripts/handoff-hooks.mjs` moved with the asset**, byte for byte, and the
test asserting they are the same file is what made that non-optional (#146).

**#141's recommendation is no longer blocked by this.** The measurement it would
gate on now gives the same answer in a worktree, a clone and the main checkout,
which was the objection. Whether the refusal should be wired here is still that
issue's to decide.
