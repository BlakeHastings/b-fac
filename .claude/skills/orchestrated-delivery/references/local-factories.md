# Local factories shared across harnesses

An established repository may have process records that belong to one operator
and one checkout, rather than to the tracked project. Keep them in a directory
outside the project, such as `~/.b-fac/factories/<repo>`. The directory may be
its own Git repository. Its location is an operator choice, not a property of
Claude Code, Codex, or the B-FAC plugin installation.

## Discovery

From any checkout or linked worktree of the project:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

If `<git-common-dir>/factory-home` exists, read its one absolute path and verify
the directory exists. Read its `README.md` for the entry points, its `machine.md`
for the recorded write boundary and dispatch provider, and its current handoff
and process docs before starting the loop. A `machine.md` with no `Dispatch:`
line means this harness's own subagents (`references/dispatch-port.md`). Do not re-ask settled initialisation questions. Verify the
handoff against the live backlog and pull requests before acting.

The pointer is deliberately in the Git common directory. Every worktree sees
the same file, and it never appears in the project's changes or pull requests.
A fresh clone needs its own pointer and operator-specific machine record. This
external factory does not replace `factory/` inside the Git common directory,
which the portable assets use for their own local state.

Claude Code may load project-specific hooks from that directory through a
launcher using `--settings`. Those hooks are not a portable enforcement layer:
Codex and other harnesses do not load Claude Code's settings file. Read and
follow the local factory's rules in every harness, and describe a control as
enforced only in the harness where its liveness probe actually passes.

## Moving an existing factory

1. Inspect the old factory's Git status, running sessions, pointer, hooks,
   launcher, and absolute path references. Preserve uncommitted files.
2. Create the new parent directory. Move the factory as one directory so its
   Git history and uncommitted files stay together. If sessions still use the
   old absolute path, leave a filesystem redirect from old to new until they
   exit. Do not leave two writable copies that can diverge.
3. Update absolute paths in the hook settings and operational instructions.
   Keep historical evidence and briefs as history. Update the one-line
   `factory-home` pointer only after the new directory and hooks are valid.
4. From the main checkout and a linked worktree, resolve the pointer and read
   the same `machine.md`. Check that a guarded harness loads the new hook
   settings and that its hook commands exist. Separately verify that another
   harness can discover the pointer and read the rules. A hook configuration
   check does not prove a running session loaded it; use a liveness probe only
   if that factory actually provides one. Record any enforcement gap rather
   than assuming a Claude hook runs elsewhere.

If the move or redirect fails, leave the pointer at the old directory. A
half-moved factory is more dangerous than a clearly unmoved one.
