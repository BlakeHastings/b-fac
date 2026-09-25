# Surviving your own compaction

Every other chapter assumes the orchestrator still remembers what it was doing.
This one is about the event that ends that assumption without failing.

When the context window fills, the harness replaces the conversation with a
summary. Nothing errors, no tool refuses, the loop carries on. What is gone is
the specifics: which agent is on which issue, what the owner said an hour ago
and in what words, which assumption a brief was written under, why an issue was
parked. A summary keeps the shape of all of that and loses the content, and the
loop then continues confidently on a smoothed-over version of its own state.

This is not the same problem as a session ending. A session that ends leaves the
transcript on disk and the next orchestrator knows it is new. A compaction
leaves an orchestrator that believes it is the same one.

## Two facts fix the shape of the answer

**You choose where compaction happens, and a hook can see it coming.**
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` sets the percentage at which automatic
compaction fires. It can only lower the threshold, never raise it.
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets the window it is a percentage of. No hook
payload carries usage, but every one carries `transcript_path`. The last
main-thread assistant entry's `message.usage` there gives the context in use.
Measured on 2.1.282 (ADR 0060).

**A hook cannot write the handoff.** It is a shell command with stdout, stderr
and an exit code. No tool calls, and no slash commands. The model cannot run
`/compact` either, since no tool reaches it. So only the conversation can write
prose, and a hook's vocabulary here is **refuse**, **inject** and **warn**. The
design is what you can build out of those.

## Continuous, not boundary-triggered

The obvious design is that the boundary produces the document: the context fills,
a hook fires, the orchestrator writes the handoff, compaction proceeds. Do not
build that one. It fails twice over.

**It is written by the most degraded version of the orchestrator.** At the
boundary, the conversation is at its longest and least distinct, under pressure,
about work it can barely still see. The worked example this skill came from was
written at a *calm* moment, at a natural stopping point, and its largest claim
was false within the hour because eight issues closed underneath it. It was
rewritten from scratch the same day. That is the good case.

**And the boundary that matters cannot be gated.** Automatic compaction is the
one that fires in a long orchestration session, and a hook must never refuse it
— see the measurements below. Manual compaction is the only refusable one, and
an orchestrator that never types `/compact` never meets the gate. A boundary
trigger is therefore unavailable for the case it exists to cover.

So: **the orchestrator tops the handoff up as part of the loop**, and the
compaction hooks become a staleness check and a way across the boundary rather
than the thing that produces the document. The failure mode moves from "wrote it badly under
pressure" to "was told to top it up", which is a failure you can see.

**And it is told, because being expected to was not enough.** In the owner's
sessions the top-up did not happen unprompted. Every compaction on record was
one they typed, after asking for the handoff first. So a warning now arrives
ten points before the threshold, once per climb: top the handoff up now, while
you can still see the detail. That is the calm moment the argument above wants.
It arrives at a point you chose rather than one you remembered to find. It is a
prompt and not a control (`references/enforcement.md`). The control is the
threshold.

## What the handoff is, which is nothing new

**Do not invent a document type for this.** Four records already carry
continuity and each is better at its job than a fifth would be: the backlog
carries what is left to do, the decision records carry why things are the way
they are, `orchestrating.md` carries what is different about this repo, and the
review record on each pull request carries what was actually verified. Anything
durable belongs in one of those.

The handoff is the residue: **where the work stopped, and what the next
orchestrator would otherwise have to reconstruct.** One file, kept current, with
four properties that the worked example earned the hard way.

- **A snapshot, not a source of truth.** Say so in the file, in its first
  paragraph. Where it disagrees with the repository the repository is right.
- **A decay note.** When it was written, at which commit, and that it rots
  quickly. An undated handoff reads as current for ever.
- **The sequence, not the summary.** The most useful part of the worked example
  was a runnable block of commands with the traps beside them. A paragraph
  saying work is "well advanced" is worth nothing.
- **What needs the owner and what does not**, itemised, with who can answer.

No template, for the reason `references/refinement.md` gives about specs: a form
with headings invites completion instead of thought.

**One more record was added after this list, deliberately, and it is not this
file's.** A fan-out keeps a resume record so its queue survives every agent
dying in the same instant, and it lives in `factory/` beside the handoff. The
line between them is that the resume record is per-fan-out and disposable, where
the handoff is per-session and durable, so a resume record still being topped up
after its fan-out ended has quietly become a second handoff.
`references/parallelism.md` has what goes in it and what the artifacts answer
instead; ADR 0044 has why it is separate rather than folded in here.

## The threshold and the hooks

`assets/handoff-hooks.mjs` is one file wired to every event. It decides which it
is from the payload, because a mode flag in the command line is a setup step
that gets copied wrong. With everything wired, the sequence is:

1. **`PostToolUse`** reads the context in use and, once per climb, warns ten
   points before the threshold. It skips any payload with `agent_id`.
2. **`PreCompact` `auto`** refuses nothing. It prints what the summariser should
   keep.
3. **`SessionStart` `compact`** prints the handoff back, with the resume
   instruction: reload the skill if it is gone, re-read the process docs, audit
   the real issue and PR state, and continue.

```json
{
  "env": {
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "85"
  },
  "hooks": {
    "PostToolUse": [
      { "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/handoff-hooks.mjs\"",
            "timeout": 15 } ] }
    ],
    "PreCompact": [
      { "matcher": "auto",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/handoff-hooks.mjs\"",
            "timeout": 15 } ] }
    ],
    "SessionStart": [
      { "matcher": "compact",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/handoff-hooks.mjs\"",
            "timeout": 15 } ] }
    ]
  }
}
```

**The `env` block in project settings is enough, and nothing needs exporting.**
Measured on 2.1.282 with nothing set in the shell. A project `.claude/settings.json`
carrying a window of 100000 and an override of 60 made the harness log
`effectiveWindow=80000` and `thresholdSource=env`. It compacted with 51K in use,
where the default for that window is about 67K. The same entries reached the
hooks' environment, which is how the warning reads them. The two numbers are
therefore set once, for the harness and the hook together.

**Set the window to your model's.** The percentage is of the window less 20,000
tokens that the harness keeps for the summary. That is measured, not documented:
windows of 100K, 200K and 1M logged 80000, 180000 and 980000. The harness caps a
window larger than the model's and the hook cannot see that happen. A 1M setting
on a model served at 200K compacts at 85% of 180K, and the warning, dividing by
980K, never fires first. Where either variable is unset, the hook says once that
nothing is being watched and warns nothing. It does not guess a window from the
model id, because the same id is served at 200K and at 1M.

**The override applies to subagents too.** A set window makes a 200K subagent
compact proactively at the percentage rather than reactively at its limit. That
is the better side of the trade, since reactive compaction is how an agent dies
of `Prompt is too long`.

**The `auto` matcher is there to talk, not to refuse.** On `auto` the file
prints summary instructions and exits 0 on every path, unconditionally. Its
stdout reached the summariser in three runs out of three. That is undocumented,
so nothing depends on it, and the handoff is printed back afterwards either way.

**The manual refusal is optional wiring.** Add `"matcher": "manual"` to
`PreCompact` and a stale handoff refuses a typed `/compact`. This repository
does not wire it; #141 decides that.

**`SessionStart` uses only the `compact` matcher.** On `startup` and `resume`
the file is on disk and can be read. After a compaction the model holds a
summary that does not know the file exists, which is the one case where
injecting it is the only thing that works.

**The warning is cheap on purpose,** since it runs on every tool call of every
agent. It reads the transcript from the tail and exits on `agent_id` before
opening anything. Against a 50 MB transcript it took about 50 ms, against 41 ms
for a bare `node` start.

Hooks are read once at process start, so **restart after wiring these** — and
note that the *script* is read off disk every time, so a change to what it
decides is live in every running session immediately. That asymmetry is
`references/enforcement.md`'s and it applies here unchanged.

## What "stale" is measured against, and why it is not the file's timestamp

Two thresholds, either of which is enough: hours since the handoff was written,
and commits on the default branch since. Both need one instant to count from,
and the obvious one is wrong.

**A checkout writes the committed bytes out with today's timestamp.** So
`git worktree add`, `git clone` and any branch switch that changes the file
reset its mtime without anybody touching it. Take the age from mtime and a
twelve-day-old handoff reads as written minutes ago — measured, on the same
bytes in two directories:

```
main checkout : below is docs/process/handoff.md verbatim, 288h old, 5 commits on main since.
a worktree    : below is docs/process/handoff.md verbatim, under an hour old, 0 commits on main since.
```

Both numbers go fresh together, because the count is taken since that same
instant. **The reader most likely to be in a worktree is a dispatched
implementation agent**, which is the reader least able to check, and a fresh
clone is the same defect on the first run for whoever just installed this.

So the asset asks git which clock applies rather than picking one. A checkout
only writes files git tracks, and only ever writes the committed content, so:
a file git does not track here was written where it stands (that is guest mode,
and an uncommitted first draft); a tracked file that differs from `HEAD` was
written here too (that is the mid-session top-up, which is the normal state);
and a tracked file identical to `HEAD` is dated by the commit that wrote it,
because its timestamp is evidence about the last checkout instead.

**Where git cannot be asked, both hooks say they cannot tell and refuse
nothing.** Not a number with a caveat, because the caveat would be the whole of
the answer. And **nothing is parsed out of the handoff's own prose** — a date in
the text is a format the document has to satisfy, and it is written by the same
hand the mechanism exists to check. ADR 0055, revising one sentence of ADR 0040.

What none of this sees: a handoff topped up in the morning and merged in the
evening is dated by the merge, in the commit and in the pull alike. The commit
count is what is left to notice a busy day with.

## The asymmetry, which is the load-bearing part

`PreCompact` exiting 2 blocks the compaction. Measured on Claude Code 2.1.228,
and the two triggers give opposite answers.

| Trigger | Refusing it | Verdict |
| --- | --- | --- |
| `manual` | Refused, harness prints the hook's stderr, `/compact` again works once the handoff is written | A gate whose only cost is doing what it asked |
| `auto` | Refused, session keeps growing, every later request fails `Prompt is too long`, and the hook goes on refusing | **A gate that cannot be satisfied.** Never do this |

The wedge is not theoretical. Eleven fills into a 100K window, the eleventh and
every turn after it failed identically, and the hook logged a refusal for each
one. The gate cannot be satisfied from inside because the model cannot be
reached to satisfy it: the handoff the hook is asking for is prose, and no
prompt gets through to write it.

**Current documentation does not relax this.** It says blocking a *proactive*
automatic compaction only skips it. Blocking a *reactive* one, the recovery
from a context-limit error, still fails the request. The payload does not say
which kind it is, so the rule stays unconditional.

There is one escape, and it only exists because of the asymmetry: **a manual
`/compact` still works on a wedged session**, provided the manual rule allows it
at that moment. Measured. A hook that blocked both would have no way out at all.

*Auto-compaction can also be switched off outright — `autoCompactEnabled: false`
in settings, or the `DISABLE_AUTO_COMPACT` environment variable, both documented
and both measured to work here. That is not an escape from the wedge, it is a
way to arrive at it sooner: with no automatic compaction the session runs
straight into the same `Prompt is too long` with nothing to catch it.*

## The far side works, up to 10,000 characters

`SessionStart` stdout is added to the resumed context. Measured: a marker
injected before a compaction was read back verbatim after it. **Above 10,000
characters it is not.** On 2.1.282 the harness saves anything longer to a file
and injects the path with a 2KB preview. Plain stdout and `additionalContext`
behave the same. With a 23KB and a 22.5KB block, the first line arrived and the
middle and last did not.

So the hook prints the handoff whole when the block fits, and **not at all when
it does not**. In that case it names the file and tells the reader to Read it
first. A handoff that silently lost its second half would be worse than one
that was never injected, because the reader has no way to tell the two apart.
What the reader must act on (who the file is for, and what to do next) comes
before the handoff, so it is inside the cap either way.

**Keep the handoff well under the cap anyway.** The harness has a thrash
breaker. If the context refills to the threshold within three turns of a
compaction, three times running, it ends the turn. A block under 10,000
characters is about 2,500 tokens and cannot do that alone. A handoff that
outgrows the cap is also carrying more than where the work stopped, and the
durable part belongs in the backlog or a decision record.

That injection is also the only honest answer to whether these hooks are loaded.
`--probe` prints the verdict the *rules* would give, which is the written state
and not the loaded one, and it says so. There is no equivalent of
`guard-merge.mjs`'s probe here: that one works by being refused, and `PreCompact`
never sees a command line to refuse. What works instead costs nothing — **after
any compaction, look for the injected block in your own context.** It is either
in this compaction's context or it is not, and unlike a heartbeat file there is
nothing there to go stale.

## Subagents compact too, and the block you inject reaches them

Established by measurement.

- A subagent's context compacts **independently** of the orchestrator's.
- `PreCompact` **does** fire for it, with `trigger: "auto"`, and the payload
  **does not say whose context it is**. No `agent_id`, no `agent_type` —
  `SubagentStart` carries both, `PreCompact` carries neither. Its `prompt_id` is
  not the field either: that is the parent *turn's*, shared by everything
  dispatched inside it, so it narrows a compaction to a wave and not to an agent.
- `SessionStart` with `source: "compact"` **does** fire afterwards, and **its
  stdout lands in the subagent's context, not yours.** Measured: three
  compactions in one agent's transcript, three injections 0.4s later, in a
  session whose own context never compacted, and the marker the hook printed came
  back inside the agent's report. This payload names no agent either.
- **You are told nothing.** No event, nothing in your own transcript, nothing on
  the tool result. The agent knows, and the record knows.
- A subagent's *tool calls* do say whose they are. `PostToolUse` carries
  `agent_id` and `agent_type` inside a subagent and neither on the main thread.
  That is how the warning skips them.

So a blocking `auto` rule does not merely risk wedging your session: it kills
implementation agents. Measured — a `general-purpose` subagent reading twelve
files died with `Agent terminated early due to an API error: Prompt is too long`
while the parent was untouched. That is a second, independent reason the rule is
unconditional. (A subagent can die that way with nothing blocking anything, when
one tool result crosses the ceiling in a single step. Refusing is sufficient to
kill it, not necessary.)

**This is why the injected block is addressed to two readers.** The asset cannot
tell which one it is talking to, and the wrong guess is expensive in one
direction: an implementation agent handed your handoff as though it were its own
state will start doing your next steps, and it is the reader least able to
notice, having just lost its brief. So the block says whose the file is before
printing it, tells a dispatched agent not to act on it, and tells it what it
actually lost: its brief, which is in the issue, which it can re-read.

It is the only thing that arrives in time, and it is a prompt rather than a
mechanism. Measured across three runs: an agent handed the addressed block did
not pick up the orchestrator's work, which is what the wording is for, and it
did not re-read its brief either, in a run where the summariser happened to keep
the evidence bar and the report met it anyway. **An agent that does not feel
lost will not go and look.** So keep briefs recoverable so the block has
somewhere to point (`references/briefing.md`), and keep the reliable half of
this where it does not depend on anyone's judgment: the record, below.

*This corrects the earlier finding that `SessionStart` does not fire for a
subagent. It came from a run in which the compaction never completed: the agent
died of `Prompt is too long` and the `SubagentStart` seconds later was the
parent's retry, not the same agent continuing. A compaction that fires and then
kills the agent looks identical in a hook log and leaves no boundary in the
transcript. ADR 0042.*

## Finding out afterwards that an agent compacted

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

**This is a check and not a gate.** It reports; nothing refuses. Weigh it as
`references/reviewing.md` says: it does not make the work wrong, it makes the
report's silences worth less.

**No hook is wired to it, deliberately.** `SubagentStop` carries `agent_id`,
`agent_type` and an `agent_transcript_path` pointing at exactly that file, so
one is easy to write, and the measurements say not to. Its stdout does not reach
you, so it could only write a file you must remember to read, which is what the
command above already is. Its exit 2 *does* reach the agent and the agent obeys,
which makes it a gate on the report rather than a check, arriving after the work
instead of during it. And it never fires for the case that matters most: an
agent that dies of `Prompt is too long` produces no `SubagentStop` at all, while
its transcript is still on disk. ADR 0042.

**Ask in the report contract as well.** The agent can tell: the summary it is
holding opens with "This session is being continued from a previous conversation
that ran out of context". Treat its answer as a cross-check against the
transcript rather than as the detection, because the report is the artefact
under suspicion.

## Where the file lives, in a repo that is not yours

`HANDOFF` at the top of the asset is a path relative to the session's directory,
and in owned mode `docs/process/handoff.md` beside the other process docs is the
answer.

**In guest mode it is not**, and this chapter invents nothing, because the
question was already answered. A handoff is not committable in a repository you
are a guest in, which makes it the same question as where the machine record and
the discovered checks live, and **ADR 0037 settled that**: per-repository state
that must not be committed goes in `factory/` inside the **git common
directory**, which is one path from the main checkout and from every linked
worktree alike.

So point `HANDOFF` there. It takes an absolute path, and the one to use is
`factory/handoff.md` under whatever this prints:

```bash
git rev-parse --path-format=absolute --git-common-dir
```

**Setting it is a step somebody takes, not one this asset performs.** Deriving
that path automatically is what an installer would do, and the hard half of an
installer here is not the path: hook *registration* cannot live in the common
directory either, because the harness reads project settings from the directory
a session starts in and nowhere else. `assets/guard-guest-writes.mjs` solves that
with a machine-wide block behind a `--scope` argument. Whether these hooks want
the same treatment is a decision on its own, and it is not made here.

## Revisit trigger

If a hook payload ever carries context usage or the window size, read it from
there. The transcript tail and the two environment variables are the
workaround, and the 20K reserve they depend on is undocumented. Do not take a
better signal as a reason to produce the handoff at the boundary. The argument
in "continuous, not boundary-triggered" is about *who writes the document and
in what condition*, and the warning exists to serve it.

If the warning is seen ignored twice, the next layer is a `Stop` hook returning
`decision: "block"` with a reason. It was measured to make the model carry on
and do what the reason says. It is deliberately not built yet.

If `PreCompact` ever gains a field naming the agent whose context is being
compacted, the subagent hole becomes addressable and this chapter is wrong about
its own ceiling. Check the payload rather than this paragraph.
