# Dispatch through the harness's own subagents

The first provider of `references/dispatch-port.md`, and the default: a factory
whose `machine.md` records no `Dispatch:` line uses this. Everything below is
what the skill said about Claude Code's subagents before the port existed,
moved here rather than reworded. The sections are named for the port's verbs.

## `start` and `fan out`

Implementation agents: `subagent_type: "general-purpose"` with
`isolation: "worktree"`, launched as several tool calls in one message so they
run concurrently. Each gets its own worktree and branch, so agents never see
each other's uncommitted work and a rebase is contained.

## `message`

`SendMessage` resumes an agent with its context intact. Much cheaper than
re-briefing, and the agent already knows why it made its choices. Used for
rebase instructions, relays, mid-flight steers, collision warnings, corrections,
and resuming from a preserved commit.

## `inspect`

**The transcript says so, and it says whose.** Each subagent gets a transcript
file of its own beside the session's, and a compaction writes an entry into it:

```
~/.claude/projects/<slug>/<session_id>.jsonl              yours
~/.claude/projects/<slug>/<session_id>/subagents/
    agent-<agent_id>.jsonl                                one per subagent
```

```bash
grep -c '"subtype":"compact_boundary"' \
  ~/.claude/projects/<slug>/<session_id>/subagents/agent-*.jsonl
```

A non-zero count against an agent whose pull request you are about to review
means that agent worked from a summary of its brief for part of the run. Your
own compactions land in the session file instead, with `"isSidechain": false`
and no `agentId`, so the two never mix. The entry carries `compactMetadata` with
the trigger and the token count that was discarded.

**No hook is wired to it, deliberately.** `SubagentStop` carries `agent_id`,
`agent_type` and an `agent_transcript_path` pointing at exactly that file, so
one is easy to write, and the measurements say not to. Its stdout does not reach
you, so it could only write a file you must remember to read, which is what the
command above already is. Its exit 2 *does* reach the agent and the agent obeys,
which makes it a gate on the report rather than a check, arriving after the work
instead of during it. And it never fires for the case that matters most: an
agent that dies of `Prompt is too long` produces no `SubagentStop` at all, while
its transcript is still on disk. b-fac ADR 0042.

What reaches a subagent while it compacts, and what the hooks can and cannot
tell about whose context it is, is in `references/continuity.md` "Subagents
compact too, and the block you inject reaches them".

## Not yet written down here

`await`, `find` and `release` were never described in this skill as Claude Code
mechanisms, so nothing moved for them. What the loop does for each is in the
port's table and in `references/parallelism.md`. When one of them is found to
need something specific to this provider, it goes here.
