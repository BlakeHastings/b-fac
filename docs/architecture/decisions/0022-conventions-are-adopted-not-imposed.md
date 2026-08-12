# 0022. Convention authority is a second axis: adopt, do not impose

Status: accepted

Parent epic #60. ADR 0021 defines the write boundary. This is the other axis,
and the two are independent.

## Context

Asked whether a single unit of work in an existing repository means the factory
installs nothing, the owner answered with neither of the two options in the
question:

> the default inclination is to create ADRs. But the patterns of the repository
> should be respected whenever we are running in a repository that was not set
> up initially as a factory.

> we should attempt to use all the processes that we already have in that sense,
> but in respect to the existing repository.

That is adopt rather than impose, and it is not a point on the owned/guest
scale. Whether the factory *may* write outward is a permission question about
the developer's authority. Whose patterns govern is a judgment question about
the repository's history. They correlate and they are not the same.

The combination that settles it: **an existing side project the owner fully
controls is owned on the first axis and largely theirs on the second**, because
it already has habits worth keeping. A one-axis model has no way to express
that, and it is probably the commonest case after a work repository.

## Decision

**A second axis, convention authority, with values ours and theirs.**

**The rule is: conform where the host repository has a convention, fall back to
ours where it does not.** Not install-everything, and not install-nothing.

**Absence of a convention is not a decision against it.** A repository with no
decision-record directory has not rejected writing decisions down. The default
inclination to record a decision survives; only its shape and location are
negotiable. Adopting the host's conventions changes **where the record lives,
never whether one exists** — the three lenses still apply to work the factory
does in a repository with no review discipline of its own. Dropping a process
because the host lacks it is how a guest becomes a worse factory rather than a
politer one.

**Convention authority is established by reading, once, at initialisation, and
reported. It is not built as detection logic.** `docs/adr/`, `docs/decisions/`
and `doc/arch/` are one convention wearing three names, and half a dozen more
layouts mean the same thing. Finding none of them does not mean the project
rejects the idea. Where the signal is ambiguous this belongs in the escalation
category, because a brittle detector that guesses wrong is worse than a question
asked once: the question costs a turn, and the wrong guess is invisible
afterwards.

**Read artifacts, not the documents describing them.** The last fifty commit
subjects, the last twenty remote branch names, the most recently merged pull
request, and whatever the CI workflow actually invokes. A contribution guide
that has drifted from the log is the normal state of a contribution guide.

**The adoption order is written down per installable thing** —
decision records, process docs, PR template, branch naming, commit style, check
entry point, enforcement layer, backlog — as a table in
`references/first-run.md`, next to the greenfield sequence it substitutes into.

**Branch naming and commit style are called out as the two that bite.** They are
visible in every pull request the owner shows a colleague, and getting them
wrong is the difference between a change that looks native and one that looks
machine-generated. Everything else in the table is recoverable in review; those
two are read at a glance by people who were never asked.

## Consequences

`references/first-run.md` was written as the greenfield narrative and now says
so explicitly, with the substitutions for the other corners at the end. A
sibling document was considered and rejected: it would have duplicated the whole
sequence to change eight rows of it, and two copies of one sequence drift.

The factory now has a corner it cannot get to purely by reading the repository.
Owned-and-theirs is a fact about the owner's relationship to a project, so both
axes are asked rather than derived, and the initialisation conversation is two
questions rather than one.

Nothing here is mechanically enforced, and by design nothing can be. A check
that verified "the factory adopted the host's branch naming" would be the
brittle detector this ADR refuses. The detection layer is the pull request:
conventions adopted wrongly are visible in the diff to the person who knows the
repository, which is the reviewer this mode exists to serve.

This axis has no bearing on what the factory may write to. A repository whose
conventions the factory adopts wholesale may still be one it owns completely,
and one whose conventions it sets may still be one it may not push to.
