# 0029. Guest mode gets a gate, and it lives outside the tree

Status: accepted

Parent epic #60, issue #76. ADR 0021 defines the boundary this one enforces.
ADR 0025 supplies the two nouns, ADR 0004 the argument for a shape over a
stronger sentence, ADR 0027 the probe, and `references/enforcement.md` the
layers.

## Context

ADR 0021 chose to define guest mode as a **write boundary** rather than as a
list of features switched off, on the grounds that "guest mode performed no
external writes" is a claim something can check while "guest mode is more
careful" is a disposition. Its last-but-one consequence then says the quiet
part:

> **Nothing enforces this yet.** The boundary is assertable, which is not the
> same as asserted ... until it exists guest mode is an instruction shaped like
> a control.

That is layer 0, which `references/enforcement.md` lists for completeness with
the note that an instruction is not a control, and which ADR 0004 is this
repository's own record of the worth of. Guest mode's central promise was layer
0 and nothing else.

Underneath it sat a sharper problem. The documented home for a `PreToolUse` hook
is `.claude/settings.json` **in the repository**, which in guest mode is a write
to a repository you are a guest in. The one control that exists could not be
installed where it is documented to live.

Two beliefs were carried into this and both turned out to be wrong, which is
why they are written down rather than quietly skipped.

**"Only Claude Code has a pre-execution hook, so a gate cannot be the portable
answer."** Checked against each harness's live documentation on 2026-08-12:

| Harness | Pre-execution surface | Can deny | Configurable from inside the repo | Untracked repo-level variant |
| --- | --- | --- | --- | --- |
| Claude Code | `PreToolUse` hook | Yes | `.claude/settings.json` | **Yes**, `.claude/settings.local.json` |
| Copilot CLI 1.0.79 | `preToolUse` hook | Yes, fail-closed on error | `.github/hooks/*.json`, `.github/copilot/settings.json`, and it documents reading `.claude/settings*.json` too | **Yes**, `.github/copilot/settings.local.json` |
| Codex CLI 0.147.0 | `PreToolUse` hook, plus `forbidden` policy rules | Yes | `.codex/hooks.json`, when the project layer is trusted | None documented |
| Gemini CLI 0.55.1 | `BeforeTool` hook | Yes | `.gemini/settings.json` | None documented |
| opencode 1.18.16 | `tool.execute.before` plugin, plus `permission` deny globs | Yes | `.opencode/plugins/`, `opencode.json` | None documented |

So a gate is not Claude-only. **The constraint that actually binds is the last
column, not the second.** On three of the five, wiring the gate means editing a
tracked file in somebody else's repository, which is the boundary violating
itself to enforce itself.

**"A check is the portable layer, then: record outward writes and report them at
publish."** A recorder needs the same pre-execution surface a refuser needs.
Where the surface exists, refusing is cheaper and stronger; where it does not,
there is nothing to record with either. Check-versus-gate and portable-versus-
Claude-only are independent axes, and a check buys nothing here that a gate does
not buy more of.

## Decision

**Guest mode gets a gate.** `assets/guard-guest-writes.mjs` denies, before the
command runs: a push to a remote, every `gh` verb that is not a read, a `gh api`
call carrying a write method or a payload, a `git config --global` or
`--system`, and the two beads commands that write tracked files into a host
repo. Reads are unrestricted, because pulling the host's ticket in is the normal
case.

**It is installed into untracked project-local files, and never into the
operator's home directory.** `node <skill>/assets/guard-guest-writes.mjs
--install` copies the gate to `.factory/`, writes the machine record beside it,
wires `.claude/settings.local.json`, and appends both paths to
`.git/info/exclude`. Afterwards `git status --porcelain -uall` in the host repo
is byte-for-byte what it was before, which is asserted by a test rather than
claimed here.

User-level `~/.claude/settings.json` is the tempting answer and is refused
twice over. Writing to the owner's home directory is theirs to do and not ours —
issue #34 is a live example of a stale copy there that several agents correctly
declined to fix. And a user-level hook follows the operator into every other
repository on the machine, including the owned ones, where every command it
refuses is a false positive by construction. An operator who wants it there can
lift the same JSON block; this repository will not put it there for them.

**The gate reads the command line and nothing else. The mode is declared by
installing it.** The obvious alternative — read the write boundary out of the
machine record on every command — was rejected on this repository's own
evidence. `references/enforcement.md` already says a `PreToolUse` hook cannot
know where its command will run, and the measurement behind that sentence is the
merge guard's `git rev-parse` clause answering `allow` inside a worktree on a
command the main checkout denied. A gate that consults the filesystem to decide
whether to be a gate has a way to be silently wrong; one that is either wired or
not does not. The machine record and the hook are layer 0 and layer 2 of the
same fact, which is the shape this repository already uses everywhere, not two
competing sources of truth.

**The machine record now has a writer.** ADR 0021 specified where machine facts
live and nothing in the repository ever wrote one, so a guard reading the mode
would have read an absent file. `--install` writes `.factory/machine.md`,
carrying the write boundary, the backlog tool, and the probe command.

**A new asset rather than an extension of `guard-merge.mjs`.** The two differ in
what they are about (landing code versus writing outward), where they install
(`scripts/`, tracked, permanent, versus `.factory/`, untracked, gone when the
checkout is), and which mode they belong to. Extending the merge guard would
also have meant extending the copy in `assets/`, which is still the pre-#58
text-scanning version, so the reader would have had to be rewritten there
anyway. The honest cost is that the command reader now exists twice in the
payload directory and three times in the repository. The cheap fix, a shared
module, is refused because an asset is copied into a host repo on its own and a
two-file asset is a setup step that gets half done, which is the failure
`check-setup.mjs` exists to catch.

**The probe and the rule are the same file.** `--probe` runs the gate's own
script, and the gate refuses that invocation by name. ADR 0027 established why a
gate needs one: it is the only kind of layer whose silence is ambiguous. There
it took two files agreeing on a filename, and the ADR notes that a rename would
silently turn the answer into a permanent "inert". One file cannot disagree with
itself.

## Consequences

**The one command the gate refuses is the one step guest mode reserves for the
owner, and a hook cannot see the owner's terminal.** That reads like the gap in
the layer and it is actually the design: publish is a deliberate step taken
outside the agent session, so the gate has nothing to add to it and nothing to
get wrong about it.

**`gh` is denied by default and allowed by verb.** A read verb missing from the
list is a false positive — loud, immediate, and fixed by adding a word. A write
verb missing from a deny list is an outward write that already happened. This
repository's standing rule is that false positives are the likelier failure and
the more expensive one, and this is the one place that rule is deliberately not
followed, because the boundary has to fail toward refusing.

**Nothing in this repository changed.** This repository is owned, so the gate
ships and is never installed here; `npm run check` exercises it and no hook of
ours moved. That also means **the gate has never been observed denying anything
in a live session.** It was verified through its tests, in both directions, plus
the owned-mode direction, and through the reasoning above, because
`docs/process/orchestrating.md` records that a hook change cannot be verified
live on its own branch: `$CLAUDE_PROJECT_DIR` resolves to the main checkout, so
a worktree's copy of a script is not the one the session runs. The first real
guest run is where somebody watches it fire, and the probe is what they ask.

**Guest mode on Codex, Gemini and opencode is still a declaration.** Their hooks
can deny; their configuration is tracked. Wiring one means asking the host repo's
owner for a file, or the operator installing it at user level themselves, which
is their call about their machine. Left as follow-up rather than guessed at here.

**Three copies of a command reader now exist.** `scripts/guard-merge.mjs` has
the hardened one, `assets/guard-merge.mjs` still ships the pre-#58 text-scanning
one, and this asset carries a second hardened copy with one bug fixed that the
first still has: a closing `)` with no `$(` open is a subshell's, and
`(cd repo && gh pr merge)` is allowed by `scripts/guard-merge.mjs` today while
the bare form is denied. Filed rather than fixed in passing, because the merge
guard is the layer this repository's own merge discipline rests on and it
deserves a change of its own.
