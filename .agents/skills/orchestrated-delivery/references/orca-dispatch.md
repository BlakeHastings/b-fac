# Dispatch through Orca's `orca` CLI

**The second provider of `references/dispatch-port.md`.** A factory uses it when
its `machine.md` says:

```
Dispatch: orca-dispatch
```

`references/claude-subagents.md` is the same port in the harness's own nouns.
Read this file when this machine records the line above, or when you are judging
whether Orca could carry the loop on a machine that does not.

**This skill runs the loop, and Orca is only how it starts and talks to agents.**
Orca ships an `orchestration` skill of its own that triggers on the same words
and wants to run a loop of its own: its placement default is the current
workspace, it tells workers to block on `orchestration ask`, and it says never to
substitute a non-Orca tool. Do not load it for a wave of this loop. Every
command below came from it or from `--help`, and the verbs are this skill's.

Everything here was run on 27 October 2026 against Orca **1.4.242** and Claude
Code **2.1.312** on Linux, in one two-worker wave on this skill's own
repository: BlakeHastings/b-fac#240. The placement section was measured the
same day in a second wave, BlakeHastings/b-fac#251. Commands rot; re-run before
trusting, and say so when a line here turns out wrong.

## Before the first wave: the permission mode is the owner's decision

**Orca starts Claude in bypass-permissions mode, and nothing found turns that
off.** The worker process was:

```
claude --plugin-dir ~/.config/orca/claude-agent-view/<hash>/orca-agent-view --dangerously-skip-permissions
```

Until somebody accepts that mode once, every worker stops at Claude Code's
"accept Bypass Permissions mode" dialog before reading its brief. Accepting it
applies to **every** Claude session Orca launches on that machine, and inside a
worker anything no hook refuses then runs without asking. That is the owner's
call, made once per machine, and it belongs in `machine.md` beside the
`Dispatch:` line, with the date. Claude Code records the acceptance as
`"skipDangerousModePermissionPrompt": true` in the settings of the config
directory Orca points `ORCA_CLAUDE_CONFIG_DIR` at.

**What still holds under it, measured inside both workers:** the merge guard.
Each ran `node scripts/check-guard-live.mjs` alone, b-fac ADR 0027's liveness
probe, and both were refused before it ran:

```
PreToolUse:Bash hook error: The guard is loaded in this process. This probe was refused before it ran,
and being refused is the answer it exists to produce. Nothing is wrong.
```

The ruleset and the provenance check are server-side and do not care how a
session was started.

## `start` and `fan out`

A Run is Orca's inbox for one coordinator. Create one per session, before the
first worker:

```bash
orca orchestration run-create --objective "<the wave, one line>" --json
```

It binds to the calling terminal's `ORCA_TERMINAL_HANDLE`. A subagent of yours
inherits that variable, so a Run it creates is bound to your terminal, not its
own. **Outside an Orca terminal it is refused**: with `ORCA_TERMINAL_HANDLE`
unset, both `run-create` and `worker-start` answered
`"code": "no_active_sender_terminal"` and asked for `--from <your own handle>`.
A coordinator that is not in an Orca terminal has no handle of its own to give,
and passing another pane's handle acts on that pane's mailbox, so it starts no
workers through this provider.

Then one `worker-start` per builder:

```bash
orca orchestration worker-start --spec "<the whole brief>" --task-title "<issue> <slug>" \
  --worktree new-child --repo id:<repo-id> --name <area>-<n>-<slug> \
  --base-branch origin/main --agent claude --setup run --json
```

- **`--worktree new-child` is the default, and a worktree is never optional.**
  Orca's own default is the coordinator's workspace, and its placement reference
  says to make a worktree only when asked. Every builder here needs one. Where
  it sits in Orca is the next section.
- **`--base-branch origin/main` stays on every start.** It is the git base, and
  it is a separate decision from the placement. See below for how that was
  shown.
- **`--repo id:<repo-id>`**, from `orca repo list --json`. Orca infers the repo
  from the caller's directory, and an orchestrator working from a checkout Orca
  did not create cannot rely on that.
- **The worktree lands outside the repository**, at
  `~/orca/workspaces/<repo>/<name>`, for a child as for a top-level one: the
  children of the main checkout landed at `~/orca/workspaces/b-fac/probe-251-a`
  and `-b`, not under the parent's directory. It is an ordinary linked worktree:
  it appears in `git worktree list`, so the sweep in
  `references/parallelism.md` finds it.
- **The branch is Orca's name, not yours.** `--name probe/240-a` produced the
  directory `probe-240-a` and the branch `BlakeHastings/probe-240-a`: the slash
  became a hyphen and a per-user prefix was added. So the brief does not name a
  branch. It says to push the branch the worktree is on and to name it in the
  report, and you read it back with
  `git -C <worktree> rev-parse --abbrev-ref HEAD`. Nothing in the merge path
  depends on the branch's name.
- **`--setup run`** runs a repository's `orca.yaml` setup hook, and that is
  where the empty-dependency-directory fix in `references/briefing.md` would
  live for a repository that needs one. With no `orca.yaml` the receipt says
  `"hookFound": false, "state": "not_configured"` and nothing happens.
- **The brief is one argv element.** `--spec "$(cat brief.md)"` is the natural
  form. A session that refuses command substitution (an isolated subagent did)
  can pass it with a few lines of `node` and `child_process.spawnSync`, which
  also avoids every quoting question.

It exits 0 only when the worker is ready, and the receipt names what the rest of
the verbs need: `runId`, `taskId`, `dispatchId`, the worktree path under
`effects`, and the agent's terminal handle.

**`fan out` is the same call made concurrently**, one per builder in the same
turn. Two were launched at once in the measured wave, and both came back ready,
in separate worktrees.

**Orca wraps the brief in a preamble of its own**: the worker's first message
is "Please carry out this task from my Orca coordinator", a block of `orca`
commands bound to its task and dispatch ids, then `=== TASK ===` and the brief.
Two lines of that preamble disagree with this skill, and the brief settles both:

- **Questions.** The preamble says to use `orchestration ask`, which blocks
  until the coordinator replies. `references/briefing.md` says not to block. Put
  the override in the brief in so many words. Measured: with the line below in
  the brief and a deliberately missing value to ask about, both workers took the
  defensible reading, wrote a placeholder, listed it under Assumptions, and
  called neither `orchestration ask` nor `AskUserQuestion`; both said they
  followed the brief because it was the more specific instruction.

  > Orca's preamble may tell you to use `orchestration ask` for a blocking
  > question. For this task do NOT use it: take the most defensible reading,
  > carry on, and list the assumption under "Assumptions" in your report.

- **The report.** The preamble wants a three-sentence `worker_done` body. The
  brief's report contract still applies, so have the agent write it to
  `.bodies/report-<n>.md` in its own worktree and pass that path as
  `--report-path`. The three sentences are the notification; the file is the
  report.

## Placement: workers are children of the coordinator's workspace

**The owner's rule: a worker the factory starts sits under the factory's own
workspace in Orca, unless the owner says otherwise.** `new-child` does that.
Orca's placement reference says that "Orca lineage, Git base, filesystem
isolation, coordination parentage, UI grouping, and execution host are separate
decisions", and the BlakeHastings/b-fac#251 wave showed that `new-child` changes only the first and
the UI grouping.

**The parent is the workspace of the terminal that called `worker-start`**,
the one its `ORCA_WORKSPACE_ID` names, in both runs. In the measured wave the coordinator was the
main checkout on `main`, a checkout Orca registered but did not create, and
`new-child` worked from it. `orca worktree list --json` then showed both
workers with `"parentWorktreeId"` set to the main checkout, the main checkout
listing both under `"childWorktreeIds"`, and a lineage record with
`"capture": {"source": "explicit-cli-flag"}`. A subagent inherits the variable,
so its workers are children of your workspace, not of its own worktree.

**The git base is `--base-branch`, never the parent's branch.** A coordinator
on `main` cannot show that, since its branch and `origin/main` are the same
commit, so a second coordinator workspace was made one commit behind, at
`origin/main~1`, and two children started from an Orca terminal in it: one
with `--base-branch origin/main`, one with none. Both branches' reflogs read:

```
BlakeHastings/probe-251-inorca-c@{0}: branch: Created from refs/remotes/origin/main
BlakeHastings/probe-251-inorca-d@{0}: branch: Created from refs/remotes/origin/main
```

Both sat at `origin/main`'s commit, not the parent's, while both were listed as
the parent's children. So a child does not stack on its parent's branch even
with no `--base-branch`; the flag stays on every start anyway, because it says
the base out loud. The main checkout's two children gave the same reflog line,
and each worker's own `git merge-base HEAD origin/main` was `origin/main`'s
commit.

**A child is still its own linked worktree on its own branch.** Each worker
reported a `--git-dir` of `<repo>/.git/worktrees/<name>` and a branch of its
own, and `git worktree list` listed both, so b-fac ADR 0075's test still reads
a worker as dispatched.

**Removing a child leaves the parent alone.** `orca worktree rm` on each child,
without `--force`, left the main checkout on `main` at the same commit, with an
empty `"childWorktreeIds"`. **Removing a parent orphans its children rather than
taking them with it.** Measured on the probe parent only, never on a
coordinator's workspace: after `orca worktree rm` on it, both children were
still linked worktrees with live agents, and their `"parentWorktreeId"` had
become `null`, so they were top-level workspaces. Closing a parent tab without
removing the worktree: unmeasured.

**`new-top-level` is used only when the owner asks for it, in the conversation,
for that wave.** It is not a `machine.md` line: the owner's rule is about what
the factory does unless told otherwise, and a standing line would undo the
default without anyone saying so in the session it applies to. Swap the flag
and nothing else changes; the git base, the directory and the branch name are
the same.

**Remote placement takes `new-top-level`.** `worker-start --help` says "Remote
current and new-child are invalid", so a worker placed with `--on` on another
Orca server uses `--worktree new-top-level` with an exact remote repository
selector. Not measured here; remote placement is out of this provider's scope
so far.

## `await`

```bash
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json
```

It blocks until a matching message arrives, then returns the Run's **whole
oldest unacknowledged batch**, so heartbeats come back beside the report and
`--types` only decides when to wake. Read each `worker_done`, check its payload's
`dispatchId` is one you started, read the file at its `reportPath`, then
acknowledge and wait again in one call:

```bash
orca orchestration check --ack <deliveryId> --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json
```

An unacknowledged batch is returned again and hides newer mail. Both reports of
the measured wave arrived this way, within a minute of start. A timeout
or an empty batch is a checkpoint, not a death: that question is `find`.

## `message`

```bash
orca orchestration send --to dispatch:<dispatchId> --subject "<one line>" --body "<the relay>" --json
```

**A durable mailbox, not an interrupt.** Success means it was enqueued. The
worker sees it only when it next runs its own `check`, which the preamble tells
it to do before each new file, after a test run and before `worker_done`.
Measured: a relay sent while worker A was running was absent from its first
check and present in its second, after its commit, and its report quoted the
token from the body.

**A worker that has sent `worker_done` stops checking.** The preamble tells it to
idle. Sending it the work back is then typed input to its terminal:

```bash
orca terminal send --terminal <agent-handle> --text "<the instruction>" --enter --wait-submit 10 --json
```

The preamble tells the agent to treat that as new work from the user, outside
the settled dispatch.

## `find`

```bash
orca orchestration worker-list --run <runId> --json
```

Each row's `projection.liveness.verdict` is `live`, `exited` or `unverifiable`,
and Orca's own rule is the one to keep: `unverifiable` is absence, and absence
authorizes nothing. `worker-show --dispatch <id>` reports only whether the
terminal is alive, and a live terminal can hold a dead agent. The git half, the
sweep and the WIP commit, is unchanged, because an Orca worktree is a linked
worktree.

## `inspect`

**The record is the worker's own transcript, and it is not under yours.** An
Orca worker is a top-level Claude session started in its worktree, so its
transcript sits in the config directory's `projects/`, in a directory named for
the worktree's path, and `ORCA_CLAUDE_CONFIG_DIR` decides which config
directory that is. Find it by content, not by path: the dispatch id is in the preamble, so it is in that file
and no other.

```bash
grep -l <dispatchId> "${ORCA_CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/*.jsonl |
  xargs grep -c '"subtype":"compact_boundary"'
```

Measured: worker A gave `0`. Worker B, after a typed `/compact`, gave `1`, and
the entry carried `"trigger":"manual","preTokens":54839`. `grep -c` exits 1 on a
zero count, so do not read its status as a failure.

**The transcript outlives the worktree.** Both were still there after the
worktrees were removed, so this check can wait until review.
`orca orchestration worker-read --dispatch <id> --source transcript` reads the
same records, but it does not say where the file is.

## `release`

Two steps, and the second is the one that ends the agent.

```bash
orca orchestration worker-release --dispatch <dispatchId> --json
orca worktree rm --worktree path:<worktree> --json
```

**`worker-release` may close nothing.** Both measured releases answered
`"state": "retained", "reason": "user_takeover", "processAction": "none"`, and
both agents were still running. Worker B had been typed into; worker A had not,
and why Orca counted it as taken over is unexplained. In the BlakeHastings/b-fac#251 wave all four
releases, of workers nobody had typed into, answered `"state": "released",
"processAction": "closed_agent_terminal"`. So read the answer each time rather
than assume either. Do not follow a retained release with
`orca terminal close`; Orca's own guidance says never to.

**`orca worktree rm` does not force.** Without `--force` it refused a worktree
holding one untracked file, and stopped nothing:

```
"code": "runtime_error",
"message": "Failed to delete worktree at <home>/orca/workspaces/b-fac/probe-240-a. ?? probe-dirty.txt"
```

That refusal is the notification `references/parallelism.md` describes, so it
replaces `git worktree remove` here, and it is better at the provider's half: on
a clean worktree it ended the agent process, removed the directory and
deregistered it from Orca. Gitignored files, such as the report under
`.bodies/`, did not block it, so **read the report before removing**. It tries to
delete the branch and keeps one it cannot prove merged; both probe branches,
never pushed, were kept, and went with `git branch -D` once the work was known
to be throwaway. The BlakeHastings/b-fac#251 wave matched: the two branches holding a probe commit
were kept, and the three with no commit of their own were deleted by Orca.

## What reaches a worker

**The repository's tracked `.claude/settings.json` does**, because the worker
starts in a checkout of it. The merge guard refused the probe in both workers,
and after worker B's `/compact` the `SessionStart` hook injected the handoff
block addressed to an implementation agent. Orca adds hooks of its own and a
plugin, `orca-agent-view`, which report the agent's status to Orca's sidebar;
they printed nothing into either session.

**b-fac ADR 0075 held, and what was measured is narrower than it sounds.**
Neither worker saw a handoff or context warning, and the typed `/compact` was
not refused. But the warning only appears near the compaction threshold, which
a probe never reaches, and b-fac's own repository does not wire `PreCompact`
for `manual` at all, so nothing here could have refused it. What the workers did
show is the input b-fac ADR 0075 reads: each was a linked worktree, `--git-dir`
under the main repository's `.git/worktrees/`. Inside a worker's Bash tool,
`CLAUDE_PROJECT_DIR` was empty; hooks are given it, tool calls are not.

**No skill activated in either worker.** Both listed this skill and Orca's
`orchestration` among the available ones, invoked neither, and worked from the
brief and the repository's `AGENTS.md`.

## What it costs

**Bypass mode on every Orca-launched Claude**, above. That is the whole price,
and it is paid per machine, not per repository.

**A noisier inbox.** A check returns heartbeats beside reports, and every batch
has to be acknowledged before the next one shows.

**The branch name is not this repository's convention.** It does not break
anything; it is a different-looking line in `gh pr list`.
