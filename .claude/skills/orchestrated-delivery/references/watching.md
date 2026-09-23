# Watching your pull requests

A pull request the factory opened is not finished when it is opened, and the
loop used to lose track of it at exactly that point. A reviewer requested
changes, a check went red, a branch fell behind, and nothing happened until the
owner came back and asked the factory to go and look. The feedback had been on
the forge the whole time. Nobody was asking.

`assets/watch-prs.mjs` asks. It polls every open pull request the operator's
login authored and prints one line per thing somebody has to act on. **Each line
restarts the loop on that pull request**, from review onwards. It is not a
notification to acknowledge. ADR 0059 has why it polls, why it is keyed on who
wrote something, and what was rejected.

## Arm it

In Claude Code, as the command of the Monitor tool, with the longest timeout it
allows:

```
Monitor({
  command: 'node <this skill>/assets/watch-prs.mjs',
  description: 'feedback on my open pull requests',
  timeout_ms: 1800000,
})
```

Run it from the repository, where it finds the repo, the operator's login and
its state file for itself. `--repo=owner/name`, repeated, watches several.

**Arm it when the first pull request of a session exists, or at the start of a
session that has any open.** Its first line is `watching N open PRs ... #a #b`.
Read that line: a pull request missing from it is not being watched.

**It ends itself after 28 minutes**, because Monitor kills a command at thirty,
and its last line is `watch-ended ... Re-arm now: <command>`. That line is an
event like any other, so re-arm it when it arrives. Nothing is lost across the
gap: what has been reported is saved in the git common directory, and the next
run starts from there.

**Other harnesses** have no Monitor. `--once` polls once, prints, and exits, so
it runs on whatever scheduler the harness has: a `/loop`, a cron, or a line at
the top of every turn. The state file makes each run report only what is new.

## What a line means and what it starts

A line is a pointer, not the feedback. It carries the first 140 characters and
a link. **Read the whole thing before acting**, and read the pull request as it
stands rather than the one line: a reviewer who requested changes has often left
three more inline comments and a reply by the time you look.

| Line | What it starts |
| --- | --- |
| `changes-requested`, `reviewed`, `comment`, `inline-comment` | A fix round, below. `reviewed` and `comment` may only be a question, in which case the round is an answer |
| `directive` | The same, from the owner. They opened a comment on their own login with `/factory` |
| `checks-failed` | Read the failing job's log. Route it to the builder with the log, not your theory of it |
| `conflict`, `behind` | Send it back to the builder to rebase. Resolving it yourself is authoring the change you are about to review |
| `pushed` | Someone committed to the branch from somewhere other than this machine. Read what they changed before anything of yours lands on top of it |
| `checks-passed` | Green on a new head. If it followed a fix round, the fix is ready for your review; if it followed approval, it is ready to land |
| `approved` | Whatever the repo's landing path is, if every check is green and your own review is posted |
| `merged`, `closed` | It has left the watch. A close you did not do is a question for whoever closed it, not something to reopen |
| `watch-error` | The watch cannot see. Fix the cause; five in a row ends it |
| `watch-refused` | Another process is already watching this repository. Leave it; two would split the events |

`(before watch)` on a line means it arrived while nothing was watching, after
the operator last commented or pushed. That is the backlog this exists to clear,
not stale history.

### The fix round is the loop you already run

Feedback on a pull request is a brief that arrived from outside, and it goes
through the same steps as one you wrote:

1. **Classify it before routing it.** A question gets an answer. A change you
   agree with gets a fix. A change you disagree with gets a reply saying why,
   on the pull request, and the reviewer decides; **never comply silently and
   never ignore it**. A request outside the pull request's purpose gets a
   follow-up issue and a reply that links it.
2. **Route the fix to the agent that built it**, resumed with the feedback
   quoted verbatim rather than paraphrased. The reviewer's wording is what they
   will check the fix against. If that agent is gone, a fresh builder on the same
   branch, briefed from the issue and the review, per `references/briefing.md`.
   Constraint 1 holds here as everywhere: you do not write the fix.
3. **Review the fix as you reviewed the original.** `references/reviewing.md`:
   verify the claim the reviewer made, not the builder's report that it is
   fixed, and verify the merge result. Whatever independent or blind review the
   repo runs before a pull request is ready runs again on the new head.
4. **Reply on the pull request** through the repo's read-back path, naming the
   commit that fixed each point. Leave the reviewer's threads for the reviewer to
   resolve; closing their own question is theirs.

Several lines on one pull request in one notification are one round, not
several. Several pull requests at once are a wave, batched by collision surface
like any other.

## Who counts, which is the loop guard

The factory posts as the operator's login, and so does the operator. So the
watch treats that login's words as its own and ignores them, and that is what
stops it waking to answer itself. Everything else counts, with one exception:
a bot's *comment* (a plan, a coverage report) is not feedback unless you pass
`--include-bots`, while a bot's *review* is, because a review is a request by
construction.

**The owner's way in, from the shared login, is to open a comment with
`/factory`.** Tell them so the first time you arm a watch in their repo. A reply
the factory posts can only start with that word by mistake, which is the one way
to build a loop, so do not.

## Waiting on a watch is not stopping

"Before you stop" still applies, and an armed watch changes what an honest
`Next:` can say. A turn may end with every open pull request waiting on a
reviewer, provided the watch is armed and the line says so:

```
Next: nothing until review. #41 and #43 wait on the reviewer; watch armed.
Blocked on: nothing
```

It is only true while the watch is. A turn that says "watch armed" about a watch
that ended an hour ago, with no re-arm, is the stop the format exists to catch.

## Asking whether it is alive

Run `--once` by hand. **Being refused is the answer you want**: `watch-refused`
means another process holds the repository and has written a heartbeat within
three intervals. If it prints anything else, nothing was watching, and whatever
it printed is what the watch would have told you.

## What it does not see

- **An edited comment.** Identity is the comment id, so a reviewer who edits
  their comment to add a blocker is not reported again.
- **A pending review.** GitHub returns nothing until the reviewer submits it.
- **Who pushed.** `pushed` means the commit is not in this machine's object
  store. A push from this machine, by anyone, is silent.
- **Any time no session is running.** The first run afterwards reports what
  arrived, as `(before watch)`, so nothing is lost; it is only late.
- **Pull requests authored by another login**, including ones the factory is
  working on for someone else. `--author` names one login per watch.

## Guest mode

Every call is a read (`gh pr list`, `gh pr view`, `gh api` GETs), so the guest
gate allows the watch. Pull requests only exist after a publish, and the replies
and pushes a fix round produces are outward writes that wait for the next one.
