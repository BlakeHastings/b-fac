# GitHub as the work queue

**One implementation of the backlog port, and the one this repo uses.**
`references/backlog-port.md` says what the loop needs from any task store, and
why: in guest mode the host's tracker is not yours to write to, so the verbs
have to survive the tool changing underneath them. Read that first if your
backlog is not GitHub's. Read this if it is.

It also says what a portable backlog does *not* buy you, which is the part
easiest to overclaim: the merge gate, the checks and the ruleset stay GitHub.

Everything below is GitHub mechanics. The port's `create`, `read`, `list`,
`comment`, `close`, `link` and `label` are what each section is an instance of.

## Shape

**Epics** carry prose context only: no scope bullets, no definition of done.
They exist to group and to explain why a body of work exists.

**Leaf issues** carry the full anatomy and are what agents get briefed from.
Prose context, scope, a "watch out for" section, what is deliberately out of
scope with its issue number, and the definition of done appended verbatim.

Appending the definition of done beats linking to it. An agent that has to
follow a link to learn what done means will sometimes not follow it. The text is
in `assets/seed-issues.py`.

**Labels** worth having: one per area of the system, plus `epic`, something for
work that unblocks other work, and something for anything waiting on the owner.
The specific names matter less than that "waiting on a human" is visible at a
glance in the list.

## Real sub-issue links, not just labels

A label convention does not give you a tree you can read. This is the port's
`link` verb, and it is the requirement that disqualifies candidate tools rather
than merely inconveniencing them: a task store with no parent concept cannot
carry this loop. GitHub's answer is sub-issues. The API wants the numeric issue
**id**, not the issue number, which is the part that trips people:

```bash
gh api --method POST repos/{owner}/{repo}/issues/<parent>/sub_issues \
  -F sub_issue_id=<child_id>
```

Keep a plain `Parent: #N` line in the body too. It survives API changes and
reads fine in a terminal.

## Seeding

Write a one-shot generator rather than creating issues by hand. Epics and issues
as data, referencing parents **by key** rather than by number, because numbers
do not exist at authoring time. Then three phases: create epics, create issues,
link children.

Make it resumable. Record created numbers to a state file and short-circuit
anything already created, so a rerun after a failure does not duplicate half the
backlog. `assets/seed-issues.py` is a working starting point.

Keep the generator in the repo afterwards. It documents the original shape of
the work and is the fastest way to seed the next project.

Later issues will be filed ad hoc, by agents mid-task and by you reacting to
what CI found. That is the expected pattern, not a failure of the seeding.

## Open questions belong in an issue

Anything only the owner can answer becomes an issue labelled for it, with your
recommendation and what it costs. **This is the escalation channel**, not a
place to file questions you have already asked some other way: the point of
putting the question here is that filing it costs you nothing and you keep
working. A question that stopped the loop was not escalated, it was a halt.

When the owner answers, record the outcome **in the artifact it affects** (the
spec, the ADR) rather than leaving it in the issue thread. The decision is then
findable from the thing it decided, and nobody relitigates it.

The label is what makes this work at a glance. A question filed without it is a
question nobody knows is waiting, and the owner finds it a week later.

**In guest mode this issue is not filed on the host's tracker.** Escalating is a
backlog write, and the boundary does not make an exception for a question. It
goes in the local store with everything else and travels at the publish step, or
it is asked in prose at the end of a turn, which costs nothing and waits for
nobody. `references/backlog-port.md`.

## Housekeeping

Small, and it decays fast if skipped.

- Close epics when their children are done, so the list shows real state.
- Deduplicate, keeping the better framing and closing the other into it.
- Link orphan issues to their epic. `gh issue create` does not, so anything
  filed mid-flight is an orphan until you say otherwise.
- `gh issue list` and `gh pr list` default to 30. Any count taken without
  `--limit` is wrong the moment the project passes thirty of anything.
