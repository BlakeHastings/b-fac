# 0075. A session started in a linked worktree is a dispatched agent

Status: accepted

Issue #239, parent epic #237. Extends ADR 0060, whose warning skipped a payload
with `agent_id` and nothing else, and keeps ADR 0040's unconditional `auto`
rule and ADR 0042's two-reader block unchanged.

## Context

`handoff-hooks.mjs` told the orchestrator from an implementation agent by one
test: a payload with `agent_id` is a subagent. An agent started as a top-level
session (an Orca worker, a headless `claude -p` in a worktree) has no
`agent_id`, so the hook treated it as the orchestrator. It was warned to top up
a handoff that is not its own, and a manual `/compact` could be refused for that
handoff's age.

Measured on 2026-10-26, Orca 1.4.242, Claude Code 2.1.311, by reading
`/proc/<pid>/environ` and `/proc/<pid>/cwd` of both `claude` processes: the
orchestrator, typed into an Orca terminal, and one agent launched with `orca
agent launch --agent claude` into a fresh `orca worktree create` checkout.

- **Orca's environment does not separate them.** Both carry the same `ORCA_*`
  set, `ORCA_TERMINAL_HANDLE`, `ORCA_WORKTREE_ID` and `ORCA_PANE_KEY` included,
  with different values. Only the launched agent had `ORCA_AGENT_LAUNCH`,
  `ORCA_AGENT_LAUNCH_TOKEN` and `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`; only the
  orchestrator had the two `ORCA_OMP_*` variables. Those mark how a session was
  started (Orca's agent launcher), not what it was started to do, and an
  orchestrator opened from the same launcher would carry them too. Unmeasured,
  and Orca-only either way.
- **Where it started does.** The orchestrator's directory was the main checkout,
  whose `.git` is a directory. The agent's was
  `/home/blake/orca/workspaces/b-fac/probe-239-env`, whose `.git` reads
  `gitdir: /home/blake/source/repos/b-fac/.git/worktrees/probe-239-env`.
- **`$CLAUDE_PROJECT_DIR` is where a session started, and a hook's `cwd` is not.**
  Hook processes forked by the orchestrator's `claude` all had
  `CLAUDE_PROJECT_DIR=/home/blake/source/repos/b-fac`, while one of them ran
  with its working directory in the worktree of the agent whose tool call fired
  it.

The launched agent's own hook payload was not captured. Orca starts Claude with
`--dangerously-skip-permissions`, and the session stopped at the dialog asking
to accept that mode. Accepting it is the owner's decision, so the probe was
exited at the dialog instead.

## Decision

**A session whose `$CLAUDE_PROJECT_DIR` (the payload's `cwd` where that is
unset) is a linked worktree, `--git-dir` differing from `--git-common-dir`, is a
dispatched agent.** It gets no context warning, no "not being watched" note, and
its manual `/compact` is never refused. It still gets `KEEP_IN_THE_SUMMARY` and
the `SessionStart` block, which already address an agent.

Chosen over an Orca variable because every dispatch mechanism this loop has or
plans (subagent worktrees, Orca worktrees, `claude -p` in a worktree) puts the
agent in a linked worktree, and the next provider would otherwise need its own
rule. Chosen over a marker file because nothing writes one yet, and the dispatch
port (#238) is where that would have to start.

Where git cannot be asked, the answer is "not a worktree", which is the
behaviour before this change.

## Consequences

**An orchestrator started in a linked worktree is read as an agent**, and loses
the warning and the manual refusal without being told. `continuity.md` says to
start it in the main checkout. Nothing else is lost: automatic compaction is
never refused for anyone, and the injected block reaches both readers.

**An agent working in a separate clone rather than a worktree is still read as
the orchestrator.** No dispatch here does that today.

**One `git rev-parse` per main-thread tool call**, measured at 2 to 6 ms on top
of about 40.

**Revisit** if a hook payload ever names the session's role, if an orchestrator
is seen running from an Orca worktree, or if the dispatch port grows a marker
it writes for every provider.
