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
*Does not cover:* any session the harness did not load it into, any human at a
terminal, and CI. A net, not a guarantee.

**3. The provenance audit.** On every push to the default branch, asks the API
which pull requests each new commit belongs to and fails when none was merged. A
squash merge is associated with its PR; a direct push is associated with
nothing.
*Does not cover:* prevention. By the time it fails, the commit has landed. It
also cannot tell whether checks were green when the merge was taken.

**Detection is what makes the other two honest.** Prevention can be bypassed,
and a bypassed preventive layer is silent by construction. Detection runs on the
result, which is the one thing a bypass cannot avoid producing.

## Wiring

`.claude/settings.json`, with `if` clauses so the hook only fires on relevant
commands:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs\"",
            "if": "Bash(git *)", "timeout": 15 },
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-merge.mjs\"",
            "if": "Bash(gh *)", "timeout": 15 }
        ]
      }
    ]
  }
}
```

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
