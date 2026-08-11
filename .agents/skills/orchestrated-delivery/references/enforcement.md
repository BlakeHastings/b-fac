# Enforcement without branch protection

Branch protection needs a paid plan on a private repository, and making the repo
public is not always an option. This is the substitute.

Its design principle is that **every layer states what it does not cover**,
because a layer whose limits are undocumented gets trusted for more than it
does.

## The layers, weakest first

**0. The instruction in every brief and process doc.** Listed for completeness.
An instruction is not a control.

**1. The merge wrapper.** Reads the PR's check rollup, refuses unless every
required check is green, always squash merges.
*Does not cover:* anyone who does not type it. A tool, not a gate.

**2. The PreToolUse guard.** Denies `gh pr merge`, merges through `gh api`,
pushes to the default branch, and bare `git push`/`git merge` while standing on
it, before the command runs.
*Does not cover:* any process the harness did not load it into at startup, and
everything that process spawns for as long as it lives; any human at a terminal;
and CI. A net, not a guarantee, and one whose absence is silent.

**3. The provenance audit.** On every push to the default branch, asks the API
which pull requests each new commit belongs to and fails when none was merged. A
squash merge is associated with its PR; a direct push is associated with
nothing.
*Does not cover:* prevention. By the time it fails, the commit has landed. It
also cannot tell whether checks were green when the merge was taken.

**Detection is what makes the other two honest.** Prevention can be bypassed,
and a bypassed preventive layer is silent by construction. Detection runs on the
result, which is the one thing a bypass cannot avoid producing.

## Installed is not a state you can assume

Copying these assets into a repo is not installing them, and a directory listing
cannot tell the two apart. `assets/check-setup.mjs` reports the layers above by
number against the repo you are standing in, so its output is this section
rendered rather than recalled. Run it before you install anything and again
afterwards, and keep both. A layer whose script is present and whose wiring is
absent reports as absent rather than partial, on layer 0's reasoning: a control
nothing invokes is an instruction.

It reads files, so the principle this chapter applies to each layer applies to
the check itself. What it does not cover:

- **A hook written into settings, which is not a hook that runs.** There are
  three states and the check can only see the first. The hook is *written into
  `.claude/settings.json`*. The hook was *loaded by this process*, which was
  decided once at startup, before any of today's work. The hook *fires on the
  command in front of you*, which is the only one of the three that denies
  anything. **The middle state is invisible from inside**, so do not write a
  status update that treats it as observed: a live guard and an inert one read
  the same to you, to the agent, and to this check. Only a denial somebody
  watched happen distinguishes them. The startup snapshot below is what makes
  that middle state so easy to lose.
- **Anything at GitHub's end.** Rulesets, required contexts, bypass actors, who
  can push at all: invisible to a check that reads the working tree. That cuts
  both ways. On a repo that already has protected branches, most of these layers
  should be deleted rather than reported absent, which is the revisit trigger at
  the end of this chapter.
- **Whether the guard's rules are right.** It checks that the matcher names
  every shell tool and that `DEFAULT_BRANCH` matches this repo's actual default.
  It does not read the patterns. Whether the guard denies what it should and
  allows what it should is answered only by its own tests, in both directions,
  and the allow direction is the one nobody writes.

Green here means the layers are present and wired. It does not mean anything was
prevented.

## Wiring

`.claude/settings.json`. A PreToolUse matcher selects on **tool name**, so it
has to name every shell-capable tool the harness offers, and nothing may narrow
it back to one of them:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs\"",
            "timeout": 15 }
        ]
      }
    ]
  }
}
```

This file used to show `"matcher": "Bash"` with `if` clauses, so the hook fired
only on `git` and `gh`. A session then ran `git push origin main` through a
PowerShell tool and was **not denied**, and a second session measured the same
hole without looking for it. `if` uses permission-rule syntax, which names a
single tool: `Bash(gh *)` cannot fire for a different shell tool, so the filter
reopens the hole the matcher just closed. The guard already reads the command
text and exits on anything it does not care about, so the filter was buying
microseconds at the cost of a bypass. Bad trade.

**That tool list has a shelf life.** Tool names are harness-specific and new
ones ship. Re-read which tools can run a shell whenever you change or upgrade
harness, and keep an assertion beside the guard's own tests so narrowing the
matcher goes red instead of going quiet.

**Hooks are snapshotted at process start, so installing one protects nothing
already running, including everything that process later spawns.** This is not a
brief window around installation. It lasts as long as the process does, and an
orchestration session is long by design.

One run measured the whole shape. The CLI process started at 10:21; the
`PreToolUse` block was first written to `.claude/settings.json` at 13:29 the same
day; the process then ran for two more days. Every subagent it dispatched
inherited the hook-free snapshot, the guard never fired once across the entire
project, and the script was fine the whole time: fed a payload by hand it
returned a correct deny. Nothing anywhere said the layer was absent, because a
guard that was never loaded produces exactly the same output as a guard with
nothing to deny.

So restart after any hook change before relying on it, and never read a
non-denial as evidence about the guard. It says nothing either way.

**That run also priced layer 0, by accident.** With the only preventive layer
inert for two days and roughly fifteen agents dispatched, exactly one merged
anything, and that one was induced by a brief demanding a condition only a merge
could produce, not by the missing guard. The instruction held on its own nearly
everywhere. Read that as a reason to state what each layer is actually worth,
not as a reason to skip the guard: one unsanctioned merge is precisely what the
guard exists to make impossible, and the run offered no way to notice it was
gone.

A hook denies by writing JSON to stdout and exiting 0:

```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}))
```

The wrapper calls the REST merge endpoint rather than `gh pr merge`, precisely
because the guard blocks that by name, and its `gh api` call is a child process
rather than a Bash tool call so the guard does not see it. **Making the safe
path the only working path beats asking nicely.**

## Guards cost more when they are wrong than when they are absent

One guard produced **three false positives in a day**: a commit message that
merely mentioned the default branch, the fast-forward sync that catches local
`main` up after a merge, and a read-only `git merge-base` query. Each blocked
something done constantly.

A guard that obstructs routine work gets worked around, and then it protects
nothing. Two rules follow.

**Test both directions.** A gap lets something through; a false positive gets
the guard disabled. The second is the likelier failure and the one nobody writes
a test for.

**A PreToolUse hook cannot know where its command will run.** It executes
before the command, so a `cd` inside that command has not happened yet, and any
check reading the working directory is reading somewhere else. That is a
property of the mechanism, not a bug, so branch-dependent rules in a hook are
unsound and the durable guards read only command text.

**The shipped guard breaks that rule itself, and it has been caught.** For a
bare `git push` or `git merge` it shells out to
`git rev-parse --abbrev-ref HEAD` and denies only when the answer is the default
branch. Run from inside a worktree, where HEAD is a feature branch, that copy
answered `allow` on a command the main checkout denied. Same script, opposite verdict, decided by
which copy ran. Treat the branch-dependent clause as the weakest thing in the
file: the `gh pr merge` rules beside it read only command text, and they do not
have this problem. Whether to drop the clause or keep it as a net for the common
case is a decision to make deliberately, not one to inherit.

Match on the command's **own arguments**, stopping at the next link in a chain,
rather than scanning the whole line. That single mistake is what read a commit
message mentioning `main` as a push to `main`.

## The provenance baseline

Pin a baseline commit: the one that first made the PR-only rule a control rather
than a sentence, normally the commit adding these scripts. History at or below
it is not judged, because commits pushed directly before the rule existed were
not violations at the time.

**Moving the baseline forward to silence a failure is forbidden, and the script
should say so.** That is how a real violation gets absorbed into "history we
agreed not to look at".

The API lags a merge by seconds, so retry rather than accept a rare false
positive. This check's only output is a red build asserting somebody bypassed
the process, and one false accusation a month is enough for it to stop being
read, at which point it is worse than nothing because it launders the problem as
solved.

Keep it in its own workflow, not as a required check. A job that only runs on
push reads as "never ran" on every pull request and would refuse every merge.

## Two CI checks that pay for themselves under parallelism

**Collision checks.** Parallel branches routinely add a file whose name must be
unique repo-wide: ADR numbers, migration numbers, config files. Neither branch
is wrong alone, nothing conflicts, both merge, and merge order silently decides
which keeps its identity. Two migrations numbered `0003` apply in an order
nobody chose, so the same commit produces different schemas on different
machines.

This only means anything **against the merge result**. A branch adding ADR 0009
is fine in isolation and collides only once the default branch has one too.
Verify your CI checks out the merge commit, by actually producing a collision
rather than assuming.

**Boundary checks against build output.** Assert the property against what
actually ships, not against the source. Scanning a built client bundle for
server-only strings catches an import the type system was happy with.

## Revisit trigger

If the repo moves into an organization or onto a plan with protected branches,
protect the branch and **delete most of this**. The wrapper is worth a second
look rather than automatic deletion, since squash-always in one command is still
convenient, but it stops being load-bearing.

Delete rather than keep out of sentiment. The entire justification is the
absence of the thing that would then exist.
