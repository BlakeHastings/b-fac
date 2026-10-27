# What the loop needs from whatever starts its agents

Everything the loop does except starting and talking to its agents is already
independent of where those agents run. The backlog is a port
(`references/backlog-port.md`), landing is the merge wrapper, the review record
lives on the pull request, and the handoff and the machine record are files.
**Dispatch was the one place the skill named a harness mechanism as if it were
the loop itself.** This file says what the loop asks of a dispatcher, as verbs,
so the rest of the skill can name the verb and leave the mechanism to a
provider.

`references/claude-subagents.md` is one implementation of them: the harness's
own subagents, which is what this skill described before the port existed and
is what a factory uses when nothing else is recorded. Read this file when a
factory starts its agents some other way, when you are judging whether a
runtime could carry the loop, or when you are about to write a tool's name and
mean a verb.

## The port, as verbs

Derived by enumerating every place the rest of this skill asks to start, wait
for, message, find, inspect or clean up an agent, rather than from any
runtime's command list. The last column is there so the table can be re-derived
instead of remembered.

| Verb | What the loop does with it | Asked for in |
| --- | --- | --- |
| `start` | One agent on one item, with the brief as its first message. A builder gets **its own worktree and branch**, and so does a read-only agent that boots the app; an auditor or a hunting pass that only reads gets none. A fresh agent to rebase a branch whose owner is gone is the same verb | `SKILL.md` step 4 and "Three shapes of agent", `parallelism.md` "Mechanics" and "Rebases are theirs", `briefing.md`, `first-run.md` step 6 |
| `fan out` | Several `start`s that **run concurrently**, launched as one act. A wave is three builders on three items; a fan-out is many agents over one queue, and dies all at once rather than one at a time | `SKILL.md` step 4, `parallelism.md` "Mechanics" and "When the whole fan-out dies at once", `refinement.md` "Refine and dispatch in the same session" |
| `await` | Wait for an agent's **report** and read it. The report is the contract the brief set, and it is the only output a running agent produces, so the loop is told when one arrives rather than polling for it | `SKILL.md` constraint 2 and step 6, `briefing.md` (the report contract), `reviewing.md`, `parallelism.md` "Your own commands are part of what it measures" |
| `message` | Send a running or finished agent something **with its context intact**: a relay, a mid-flight steer, a collision warning, a correction, a rebase instruction, the work sent back, or a resume from a preserved commit. Much cheaper than re-briefing, because the agent already knows why it made its choices | `SKILL.md` constraint 1 and step 7, `parallelism.md` "Relay findings", "Rebases are theirs" and "Resuming and recovering", `reviewing.md` "Send it back for the small thing" |
| `find` | Tell a live agent from a dead one. **A dead agent does not report that it died**, so this is asked for rather than waited for: when an agent goes quiet, and before `Next: nothing` | `parallelism.md` "Resuming and recovering" |
| `inspect` | Say, per agent and after the fact, **whether its context compacted** during the run, from a record the agent did not write. The report's own answer is the cross-check, not the detection | `continuity.md` "Finding out afterwards that an agent compacted", `reviewing.md` "Check whether the agent still had its brief", `briefing.md` "The brief has to survive the agent's own compaction", `SKILL.md` "Surviving your own compaction" |
| `release` | Let a finished agent go and clean up what it was given: stop its environment by path, remove the worktree without `--force`, prune | `parallelism.md` "After an agent finishes" and "Size a dispatch against the machine, too" |

**Two of these are git rather than the provider, and stay that way.** The sweep
that finds an orphaned worktree and the preservation step that saves its work
are `git worktree list` and a WIP commit, and they work whatever started the
agent, which is why they stay in `references/parallelism.md`. What the provider
owes `find` is the half git cannot see: whether the agent behind a worktree is
still running. Likewise `release` is mostly `git worktree remove`; the
provider's half is ending the agent and anything it holds open.

## Which provider a factory uses is a machine fact

It is this operator's harness on this machine. A second person working the same
repository in a different editor still dispatches through their own, so it is
not a repo fact and never goes in `AGENTS.md`. It goes in the local factory's
`machine.md`, beside the write boundary, under the split b-fac ADR 0021 and
b-fac ADR 0037 already draw:

```
Dispatch: claude-subagents
```

The value names a provider file in this directory without its extension.
**A factory with no `Dispatch:` line uses the harness's own subagents**, which is
`references/claude-subagents.md` in Claude Code. That default is why this is
not a third question asked out loud at initialisation: the two questions in
`SKILL.md` have no safe answer to fall back on, and this one does.
`assets/check-setup.mjs` prints the line it read, or the default when there is
none.

## What a provider file owes

One section per verb, saying what the loop runs or calls, and three sentences
more that are easy to leave out:

- **Where the worktree comes from**, and who removes it. A provider that makes
  its own worktree and one that is handed a path need different `release`
  steps.
- **What reaches the agent that the orchestrator's session has.** Hooks, the
  merge guard and the compaction block are wired into a harness's settings, and
  an agent started somewhere else may not load them. Say which do, measured,
  and treat the rest as absent there. `references/local-factories.md` has the
  same rule for a factory read across harnesses.
- **How `inspect` is answered, or that it is not.** A provider with no
  per-agent record of compaction leaves the report as the only signal, and
  `references/reviewing.md` then has to weigh a silence in it accordingly.

## What the port deliberately does not need

**A model, an agent type or a permission mode as a verb.** Those are how a
provider spells `start`, and they live in its file.

**A CLI.** In Claude Code the native verbs are tools the model calls, not
commands a script can run, so a wrapper could drive another runtime for real
and could only describe this one. The port is prose first, the way the
backlog's was. Moving it into a command is a decision for after a second
provider has been driven by this loop for a while and shown which verbs held.
b-fac ADR 0074.

## How this rots

The verb table is a claim about the rest of this skill on the day it was
written. When a reference document changes what it asks of a dispatcher,
re-derive the table from the files rather than editing it from memory. The last
column exists to make that cheap. Nothing mechanical holds it.
