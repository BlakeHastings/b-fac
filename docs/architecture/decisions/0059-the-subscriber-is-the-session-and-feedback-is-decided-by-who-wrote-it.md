# 0059. The subscriber is the session, and feedback is decided by who wrote it

Status: accepted

Issue #79, which was blocked on #28. ADR 0021 is why it only reads. ADR 0037 is
where its state lives.

## Context

The owner, on 2026-09-23:

> we should just monitor all of the pull requests that we've created, so
> whenever there's feedback or there's a change request on it or something like
> that, we take action and resolve the problem and take it through our standard
> loop of fixing the problem, the blind PR reviews, etc. So monitors kind of
> re-trigger flows.

and the cost of not having it: "Right now, I have to go to the factory and kind
of reprompt it to go look over the pull requests."

#79 asked for this in general a month earlier and was labelled `blocked` on
#28, on its own advice: a subscription needs a subscriber, and whether the
factory had a long-running process at all was #28's question. For pull
requests, that question has an answer that needs no process of ours. **Claude
Code's Monitor tool runs a command in the background and turns each line it
prints into a notification that wakes the session.** The orchestrating session
is the subscriber. There is no daemon to decide about, so #28 does not block
this case, whatever it decides for the rest of #27.

## Decision

**Poll, from a script whose output is the event stream.** `watch-prs.mjs` runs
`gh pr list` and two `gh api` GETs per repository per minute, diffs the answer
against what it has already reported, and prints one line per new thing. The
interface is a line per event, which is the shape a subscription would have, so
the mechanism behind it can change without the loop noticing. #79 said this
would be "polling wearing a subscription's clothes", and it is.

**Feedback is decided by who wrote it, and the operator's login is not
feedback.** Measured on a real repository's six most recent merged pull
requests: the orchestrator's review records, its replies and the owner's rulings
all carried the operator's login; change requests came from a teammate's
`CHANGES_REQUESTED` reviews; CI posted plans as `github-actions`. So anything
authored by another login is feedback, a bot's comment is not, and a bot's
review is. The owner reaches the factory from the shared login by opening a
comment with `/factory`.

This is the loop guard, and it is a rule about authorship rather than content
for a reason. A guard that recognised the factory's own replies by a marker in
the body would need every post, by every agent, through every path, to carry the
marker, and one that did not would wake the factory to answer itself. Authorship
needs nothing from the writer.

**State lives in the git common directory and survives the session.** A pull
request seen for the first time reports what arrived after the operator last
commented or pushed, marked `(before watch)`. Without that, arming the watch in
a new session would baseline away exactly the feedback the owner had to reprompt
for.

**One watcher per repository.** Two sharing the state file would split the
events and each would believe it had everything. The file names a holder, and a
second watcher refuses while that holder's process is alive and its heartbeat is
recent. The refusal doubles as the liveness answer, the same shape ADR 0027 gave
the guard.

**It ends itself inside Monitor's thirty-minute ceiling** and prints the command
that re-arms it, so the expiry arrives in the channel the feedback does.

## Rejected

- **Webhooks.** They need a public endpoint a laptop does not have, and
  registering one on a repository you are a guest in is an outward write. #79
  made both arguments.
- **A GitHub Actions workflow that pushes a notification.** Owned mode only, and
  it notifies somewhere other than the session that has to act.
- **A routine fired by a GitHub event** (Claude Code's remote triggers can
  attach one). It runs in the cloud, without the worktrees, the agents it would
  need to resume, or the session's context, and it would be a second
  orchestrator. It is the likely answer for the hours when no session is
  running, and it is not this.
- **Recurring cron prompts inside the session.** They fire only while the
  session is idle, on a fixed clock, re-reading everything each time. They
  remain the fallback for a harness with no Monitor, through `--once`.
- **Reading `gh api graphql`.** One query could have returned everything,
  including each author's type, but guest mode's gate refuses GraphQL because a
  query and a mutation are the same call. `gh pr list` and REST GETs are
  unambiguous reads.

## Consequences

**It only sees while a session is running.** Feedback that arrives overnight is
reported by the first watch the next morning, late but not lost. That gap is
the one the rejected routine would close.

**Claude Code gets the push, and every other harness gets `--once`.** The
script is portable, and waking the session is not. That matches the order the
owner set: reliable on Claude Code first.

**A push from this machine is invisible to `pushed`**, whoever made it, because
the only discriminator available is whether the commit is in the local object
store. Recorded rather than worked around.

**#79 stays open for everything that is not a pull request of ours**: an issue
being commented on, a pull request of someone else's we are reviewing, a
release. The same script shape extends to them, and none of them was asked for.
