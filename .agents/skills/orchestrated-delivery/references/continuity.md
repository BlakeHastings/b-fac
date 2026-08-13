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

**Context usage is not exposed.** Not to hooks, not to the statusline, not
through an environment variable. There is no threshold event of any kind. So
"write the handoff at ninety percent" cannot be built — and it does not need to
be, because `PreCompact` fires at exactly that moment and the harness decides
when it is. No threshold to tune, and none to drift.

**A hook cannot make the model do work.** It is a shell command with stdout,
stderr and an exit code. No tool calls, no slash commands. So a hook cannot
write a handoff; only the conversation can. A hook's entire vocabulary here is
**refuse** and **inject**, and the design is what you can build out of those two
verbs.

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

## The two hooks

`assets/handoff-hooks.mjs` is one file wired to both events. It decides which it
is from the payload, because a mode flag in the command line is a setup step
that gets copied wrong.

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "manual",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/handoff-hooks.mjs\"",
            "timeout": 15 }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/handoff-hooks.mjs\"",
            "timeout": 15 }
        ]
      }
    ]
  }
}
```

**There is deliberately no `auto` matcher in that block.** The file refuses
nothing on `auto` anyway, so registering it would buy a process launch per
compaction and one more line for a future editor to "tidy" into something that
blocks.

**`SessionStart` uses only the `compact` matcher.** On `startup` and `resume`
the file is on disk and can be read. After a compaction the model holds a
summary that does not know the file exists, which is the one case where
injecting it is the only thing that works.

Hooks are read once at process start, so **restart after wiring these** — and
note that the *script* is read off disk every time, so a change to what it
decides is live in every running session immediately. That asymmetry is
`references/enforcement.md`'s and it applies here unchanged.

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

There is one escape, and it only exists because of the asymmetry: **a manual
`/compact` still works on a wedged session**, provided the manual rule allows it
at that moment. Measured. A hook that blocked both would have no way out at all.

*Auto-compaction can also be switched off outright — `autoCompactEnabled: false`
in settings, or the `DISABLE_AUTO_COMPACT` environment variable, both documented
and both measured to work here. That is not an escape from the wedge, it is a
way to arrive at it sooner: with no automatic compaction the session runs
straight into the same `Prompt is too long` with nothing to catch it.*

## The far side works, and it does not truncate

`SessionStart` stdout is added to the resumed context. Measured: a marker
injected before a compaction was read back verbatim after it, and a 1 MB payload
came through with its first, middle and last lines intact. So the hook prints
the handoff whole and summarises nothing. A handoff that silently lost its
second half would be worse than one that was never injected, because the reader
has no way to tell the two apart.

That injection is also the only honest answer to whether these hooks are loaded.
`--probe` prints the verdict the *rules* would give, which is the written state
and not the loaded one, and it says so. There is no equivalent of
`guard-merge.mjs`'s probe here: that one works by being refused, and `PreCompact`
never sees a command line to refuse. What works instead costs nothing — **after
any compaction, look for the injected block in your own context.** It is either
in this compaction's context or it is not, and unlike a heartbeat file there is
nothing there to go stale.

## Subagents compact too, and the far side does not reach them

Established by measurement, because none of it is documented.

- A subagent's context compacts **independently** of the orchestrator's.
- `PreCompact` **does** fire for it, with `trigger: "auto"`.
- The payload **does not say whose context it is**. No `agent_id`, no
  `agent_type` — `SubagentStart` carries both, `PreCompact` carries neither. A
  hook cannot tell an orchestrator's compaction from an implementation agent's.
- `SessionStart` **does not fire** afterwards. A subagent that compacts gets the
  summariser and nothing else.

Two things follow. First, a blocking `auto` rule does not merely risk wedging
your session: it kills implementation agents. Measured — a `general-purpose`
subagent reading twelve files died with `Agent terminated early due to an API
error: Prompt is too long` while the parent was untouched, and the same subagent
finished normally once the rule allowed. That is a second, independent reason
the rule is unconditional.

Second, **a long-running implementation agent can quietly lose its brief.**
Nothing in this chapter fixes that, and nothing here can: the injection half of
the mechanism does not exist for subagents. The available mitigations are the
ordinary ones — a brief that is self-contained, an issue that carries the
context rather than the dispatch message, and scopes small enough that a single
agent does not fill a window.

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

If a harness ever exposes context usage to a hook, or a low-context event
arrives, re-read the "continuous, not boundary-triggered" section rather than
adopting it. The argument there is about *who writes the document and in what
condition*, and a better trigger does not change it. What a threshold would buy
is a warning early enough to be acted on calmly, which is worth having as a
prompt to top the file up — and is still not a reason to produce it at the
boundary.

If `PreCompact` ever gains a field naming the agent whose context is being
compacted, the subagent hole becomes addressable and this chapter is wrong about
its own ceiling. Check the payload rather than this paragraph.
