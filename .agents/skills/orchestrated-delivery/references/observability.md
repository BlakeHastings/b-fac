# Seeing what the factory is doing

The loop externalises its decisions on purpose. Constraint 5 puts them in
issues, ADRs and a gotchas file, so *what the factory has done* is answerable
from the repository by anyone, with no instrumentation at all.

Two things are not in the repository. **What it is doing right now** exists only
in the orchestrator's context window, which is the one thing a compaction
destroys without failing. And **what is waiting on the owner** exists in the
escalation channel, half of which is an item with a label and half of which is
prose at the end of a turn that nothing can query.

This chapter is about those two. Read it when you want a front end, when a
question has been sitting unanswered and nobody noticed, or before wiring any
observability of your own, because the trap below is not obvious.

## The trap, stated first

**An observability layer fails silently by construction.** Every other layer in
this skill fails towards noise: a red check, a refused merge, an audit that
exits 1. This one fails towards an empty page, and an empty page is what a quiet
factory looks like too.

That is not hypothetical here. `references/enforcement.md` records a merge guard
that was never loaded into a single process for two days, while its script was
correct the whole time, and nothing anywhere said the layer was absent. Repeat
that with the observer and the failure is worse, because the thing that would
have told you is the thing that is broken.

So the first requirement of anything in this chapter is that it can say whether
it is running. Not whether somebody switched it on. Whether it has fired.

## The three tiers, by how much each trusts the model

**Derived.** The repository and the forge, read directly: open items by label,
open pull requests by age and check state, what merged. Trusts nothing, needs no
instrumentation, and answers "what has it done" and half of "what is waiting on
me". This is aggregation work rather than observability work, and none of it is
what the CLI below does.

**Emitted.** Hooks, writing lifecycle events to a log. Trusts the harness and
not the model, because a hook fires whether or not anybody remembered it. This
is what the shipped observer is.

**Reported.** The model's own account of its state. The two lines "Before you
stop" already mandates are exactly this, and so is `factory ask`.

**The third tier is only worth having because the first two check it.** A
dashboard showing what the factory said about itself is a dashboard of layer 0.
The whole design below is the second tier reading the third and the disagreement
being visible.

## What ships

A CLI at `cli/factory.mjs`, five slash commands, and a hook on five lifecycle
events. `plugin.json` wires the last two; nothing is installed into the repo
being worked on, and nothing is written inside it.

```
factory status              Is it on, and has it actually fired
factory on                  Record this project
factory off [--session ID]  Stop, or mute one session
factory ui [--port N]       The front end, on 127.0.0.1
factory ask "<question>"    File something that needs an answer
factory needs               What is waiting, oldest first
factory resolve <id>        Close one
```

The slash commands are `/factory`, `/factory-on`, `/factory-off`, `/factory-ui`
and `/factory-ask`, and each one runs the corresponding command and reports.

**It is off until somebody says otherwise, and the switch is a file rather than
a change to the wiring.** That distinction is the whole reason it can be
switched at all: a hook entry is snapshotted when a session starts, so installing
one reaches nothing already running, while the script it names is re-read on
every fire. `/factory on` therefore takes effect in a session that has been
running for days. ADR 0057.

## Severity is about what the loop can still do

Not about how urgent it feels. The three levels map onto the `Blocked on:` and
`Meanwhile:` lines the skill already asks for:

| Severity | Means |
| --- | --- |
| `blocking` | Nothing can proceed. Rare, and if you can name unaffected work it is not this |
| `blocks-work` | Names what it holds up while the loop continues elsewhere |
| `fyi` | Wants an answer eventually and holds up nothing |

An adjective scale would have let every question be urgent. This one is checkable
against the rest of the turn: a `blocking` need beside a `Next:` line that
dispatches something is a contradiction somebody can see.

**Filing a need is not a stopping point.** The rule that a prose question ending
a turn is the same stop wearing different clothes applies unchanged to a filed
one. File it, put it in `Blocked on:`, dispatch what is unaffected.

## The number nobody had before

**How long each question has been waiting.** The escalation channel was already
two channels, one durable and one not, and neither carried an age. The mined
evidence for why that matters is in "Before you stop": twenty-one turns ended
with a status update while unblocked work sat there, the longest gap over four
hours of wall clock. Nothing in the loop surfaced either number while it was
happening.

The front end leads with open needs sorted oldest first for that reason, and
`factory needs` prints the same order.

## Declared and derived, and why both are kept

A need arrives two ways and they are not merged.

- **Declared** is `factory ask`. Durable, carries severity and blast radius,
  stays open until resolved, survives a compaction.
- **Derived** is the `Stop` hook parsing `Blocked on:`. Lives only while the
  loop keeps restating it, which is the semantics the format already has.

Keeping both is what makes the third tier checkable. A declared need nobody
restates is a question the loop forgot it filed. A derived blocker nobody
declared is the CLI being skipped, which is an instruction failing exactly where
this repository has already measured that instructions fail. ADR 0058, and
finding 12 of the subagent research.

## What it does not cover

**Individual tool calls.** There is no `PreToolUse` wiring, deliberately, so
nothing here shows which commands ran or whether another hook fired. That was
bought back for not spawning a process on every shell call in every session on
the machine, including sessions belonging to people who never asked for any of
this.

**Anything before the plugin was installed.** A session started earlier has no
hook in its snapshot and will never record, however long it runs. `factory
status` says so in as many words when the switch is on and nothing has ever
fired, which is the probe this chapter opened by demanding.

**Assistant prose.** Only the two mandated lines and the fields around them are
read. In guest mode recording the rest would move a host repository's material
into a user-level log outside the tree, which the write boundary forbids.

**Two orchestrators in one project, before the fact.** The switch is per project
because no session id reaches a command. They are separable afterwards, since
every event carries its session, and one can be muted by id.

**Anything outside this machine.** The store is a local file and the front end
binds loopback. There is no collector, no exporter and no account.

## If you want telemetry instead

Claude Code exports OpenTelemetry metrics, logs and beta traces, and for a fleet
question, cost attribution or latency, that is the better instrument by a wide
margin. It is the wrong one here for two specific reasons rather than as a
matter of taste. `CLAUDE_CODE_ENABLE_TELEMETRY` is read when the process starts,
so no slash command can toggle it, and it wants a collector somebody operates.
The requirement was a page the owner opens with nothing to deploy.

Those reasons are both about the deployment and neither is about the data, so if
you already run a collector and do not need the switch, exporting as well costs
nothing and answers questions this cannot.
