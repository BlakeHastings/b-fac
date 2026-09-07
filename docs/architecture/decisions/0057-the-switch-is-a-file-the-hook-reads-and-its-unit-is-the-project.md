# 0057. The switch is a file the hook reads, and its unit is the project because no session id reaches a command

Status: accepted

`references/enforcement.md` measured the snapshot asymmetry this is built on.
ADR 0037 established that `--git-common-dir` is the identity that answers the
same from every checkout. ADR 0021 is why the store is outside the tree.

## Context

The requirement was that the observer be switchable from a slash command, so a
session doing something unrelated is not recording, and that installing the
plugin not change how the harness behaves for anyone who has not asked for it.

The obvious implementation is to write the hook entry into settings when the
factory is switched on and remove it when it is switched off. **That
implementation cannot work, and the measurement saying so is already in this
repository.** A hook entry is snapshotted when the process starts, so adding one
reaches nothing already running, including everything that process later spawns,
for as long as it lives. An orchestration session is long by design. Switching
on would do nothing until the next session and switching off would do nothing at
all.

The same measurement supplies the way out. What is snapshotted is the entry, not
the file it names: the script is read off disk on every fire, so what the script
*decides* is live in every running session the moment it lands, with no restart
and no staging. That was found the expensive way, when a guard sat inert for two
days while its script was fine the whole time.

The second question is what the switch is keyed on. Per session is what was
asked for. Per session is not available:

| Where | What identifies the session |
| --- | --- |
| A hook | `session_id`, in the JSON payload on every event |
| A Bash tool call | Nothing. `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_EFFORT`, none of which name the session |

So a command the agent or the operator runs cannot say "this session", because
it has no way to refer to one. Walking the process tree to find the harness that
spawned it was considered and rejected on the rule this repo already holds: a
rule that is right or wrong depending on something it cannot reliably see is
worse than an absent one, because it is trusted.

## Decision

**The hook is installed permanently by the plugin and asks a file, on every
fire, whether it should do anything.** Turning the factory on writes that file.
A session that has been running since before the plugin existed picks the change
up on its next lifecycle event, which is the property no wiring change has.

**The unit is the project, identified by the parent of `git rev-parse
--git-common-dir`.** That answers identically from every checkout of a
repository, which matters more here than anywhere else it has been used: the
factory dispatches agents into worktrees, and keying on the working directory
would file an agent's events under a different project from the orchestrator
that dispatched it, so one run would appear as two unrelated ones. There is a
test asserting a worktree and its main checkout resolve together.

**Enabling is per project and muting is per session, and the asymmetry is the
point.** Enabling has to be done by a command, which cannot name a session.
Muting happens after events exist, so the ids are on the page and in `factory
status`, and the operator can point at one. That recovers most of what per
session was wanted for without inventing an identifier nothing supplies.

**`factory ask` writes whether or not the switch is on, and says so.** The
switch governs ambient observation: hooks recording what happened because they
fire, not because anyone asked. Filing a need is a deliberate act, and dropping
it on a flag would lose the one record nobody can reconstruct from the
repository afterwards.

## Consequences

**Two sessions in one project both record, and cannot be separated before the
fact.** Every event carries its `session_id`, so the front end and `factory
status` separate them afterwards, and muting closes the case where one is
genuinely unwanted. A reader expecting the switch to be per session will find
this surprising, which is why it is the ADR title.

**The observer's absence is invisible without a probe, so there is one.** A
session that predates the plugin has no hook in its snapshot, so `/factory on`
in that session succeeds, writes the file, and nothing will ever be recorded.
That is the two-day guard failure repeating itself in the layer whose entire job
is visibility, and it is worse there, because an empty page reads as a quiet
factory rather than as a broken observer. The hook stamps `lastSeen` on every
fire, and `factory status` and the front end both call out enabled-with-no-stamp
in as many words. `enabled` is a thing somebody typed; only the stamp is
evidence.

**A stale mute survives forever.** Session ids are not reused, so the muted list
grows by one entry per muted session and nothing prunes it. Cheap, and worth
knowing before somebody reads a long list as a problem.

**The switch file is a plain JSON file a human can edit or delete**, which is
deliberate and is also the way to recover from anything this design gets wrong.
