# 0074. Dispatch is a port in prose, and the provider is a machine fact

Status: accepted

Issue #238, child of epic #237. ADR 0024 is the shape this copies, and ADR 0021
and ADR 0037 draw the repo-fact/machine-fact split it uses.

## Context

Everything the loop does except starting and talking to its agents was already
independent of where those agents run. Dispatch was not: `SKILL.md` step 4 and
`parallelism.md` "Mechanics" said implementation agents *are* the Agent tool's
`general-purpose` with `isolation: "worktree"`, relays and resumes *are*
`SendMessage`, and `continuity.md` and `reviewing.md` found a compaction under
`~/.claude/projects/<slug>/<session>/subagents/`, which exists only because the
agent was a subagent. The owner now runs a second runtime (Orca) that supplies
the same operations in its own nouns, and wants the loop to use it without the
skill depending on it.

## Decision

**`references/dispatch-port.md` defines dispatch as seven verbs**: `start`,
`fan out`, `await`, `message`, `find`, `inspect`, `release`. They were derived
by enumerating every place the skill asks to start, wait for, message, find,
inspect or clean up an agent, with the asking file beside each verb, as
`backlog-port.md` does. The epic's candidate list held; enumeration split its
"start several concurrently" into its own verb because the fan-out section
depends on it dying all at once, and found two verbs (`find`, `release`) that
are mostly git and stay in `parallelism.md`, with only their provider half in
the port.

**`references/claude-subagents.md` is the first provider, moved rather than
reworded.** The Mechanics paragraph, the `SendMessage` paragraph and the
transcript check are there in the words they had. The callers name the verb and
the port, and stop naming the tool.

**The provider is a machine fact.** It is this operator's harness, so it goes on
a `Dispatch:` line in the local factory's `machine.md`, never in `AGENTS.md`. A
record with no such line uses the harness's own subagents. That safe default is
why it is not a third question at initialisation: the owned/guest and
ours/theirs questions have none. `check-setup.mjs` already read `machine.md`, so
it now prints the recorded provider or the default.

**The CLI is not the abstraction yet.** In Claude Code the native verbs are
tools the model calls, not commands a script can run, so a `factory dispatch`
(epic #196) could drive Orca for real and could only describe the native
provider. Moving the port into a command waits until a second provider has been
driven by this loop and shown which verbs held.

## Consequences

**Nothing mechanical holds the verb table to the files it cites**, exactly as
with the backlog port. `check:references` keeps the two new files in the
reference tables and no more.

**A provider file owes three things the old prose never had to say**, because
there was only one provider: where the worktree comes from, which hooks and
guards reach an agent it starts, and whether `inspect` has a record to read.
For Claude Code the second is `continuity.md`'s existing measurements, left in
place because they are about the compaction hooks rather than dispatch.

**`await`, `find` and `release` have nothing in `claude-subagents.md` yet**,
because the skill never described them as Claude Code mechanisms. The Orca
provider (#240) is the first file that will have to.
