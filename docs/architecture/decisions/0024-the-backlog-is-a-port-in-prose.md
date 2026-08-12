# 0024. The backlog is a port described in prose, not an adapter

Status: accepted

Parent epic #60, issue #61. ADR 0021 defines the write boundary this rests on.

## Context

`references/github-backlog.md` was not a document about GitHub. It was the
definition of how the backlog works, written in GitHub's nouns, and the rest of
the skill referred to it that way. Guest mode cannot use it: a work repo's
tracker holds the ticket and is not the factory's to write to, so the loop needs
its working items somewhere else while behaving identically above them.

Research (`docs/research/2026-08-12-local-backlog-and-storage.md`) settled two
things before this decision. A `gh issue` drop-in is impossible rather than
unwise, because a `gh` extension registers as a new top-level command and
nothing can shadow a built-in one. And five surveyed tools independently
converged on roughly `list-ready`, `claim`, `comment`, `close`, `link-pr`,
`dep-add`, which is evidence that a real seam exists at about that size.

The tempting shape was an adapter: a shim the skill calls, with GitHub behind
one driver and a local store behind another. That is a category error here. This
skill is markdown telling an agent what to run. It calls no APIs, so there is
nothing for an adapter to adapt.

## Decision

**`references/backlog-port.md` defines the backlog as seven verbs** — `create`,
`read`, `list`, `comment`, `close`, `link`, `label` — derived by enumerating
what the rest of the skill actually asks for, with the asking file named beside
each verb so the table can be re-derived rather than remembered.
`github-backlog.md` is rewritten as one implementation of them.

**Pluggable means named, not abstracted.** The cost of portability is the port
document plus one line naming the tool a given repo uses. No shim, no driver
registry, no `b-task`. Naming the concrete thing over building the abstraction
is what has worked in this repo repeatedly.

**A real parent/child edge is the disqualifying requirement**, not a nice to
have. Closing an epic when its children are done, adopting an orphan and
batching by collision surface all read that tree, and git-bug was disqualified
partly for having no parent concept at all.

**The ceiling borrows ADR 0025's vocabulary where it is load-bearing and
nowhere else.** The port's ceiling bullets originally called `merge-pr.mjs` "the
merge gate". Under the check/gate split that is wrong rather than merely
old-fashioned: the wrapper is a tool with a gate's shape, and the thing guest
mode actually loses is not a gate at all, because there was never one on that
path. So those three bullets now say merge wrapper, checks, and "the ruleset is
GitHub's driver for a gate". Nothing else was renamed. ADR 0025 refuses a mass
retrofit and this is a correction, not a retrofit.

**The ceiling is stated wherever the port is.** ADR 0021's table already says a
pluggable backlog frees one of four GitHub dependencies. The port document, the
GitHub document and `SKILL.md`'s new paragraph each repeat it, because the
overclaim ("the backlog is portable, so the loop runs anywhere") is exactly the
reading a partial quotation produces.

## Consequences

**The port is smaller than the six converged verbs in one place and larger in
another, and both differences have reasons.** `claim` is absent because work is
assigned by dispatching an agent and the exclusion that matters is the worktree,
not a field on the item; it would start to matter with two orchestrators sharing
one backlog, which this skill does not describe. `create` is the largest verb
here and is in none of the six, because the six describe maintaining a backlog
while this loop seeds one in a generated pass. Confidence rests on those
divergences being explainable rather than on the count: the survey never checked
whether any of the five tools copied another.

**The seam is not ours to invent, which is an argument against building.** beads
already models gates on an item with types `human`, `timer`, `bead`, `gh:run`
and `gh:pr`, enforced at close preflight, so GitHub is one driver behind that
concept in a shipped tool.

**Nothing is adopted.** Choosing the tool is a separate decision that depends on
the owner, and this ADR deliberately does not make it.

**Nothing mechanical holds the verb table to the files it was derived from.**
`check:references` holds the new document to its two tables, and that is all. A
reference document that starts asking the backlog for an eighth thing will
silently disagree with the port, which is what the last column and the "how this
rots" section are for.

**The frontmatter description keeps the word GitHub** and now says "GitHub's by
default" rather than "a GitHub issue backlog". Activation text is a trigger
list, not a definition, and removing the token a user is likeliest to type would
cost discovery to buy accuracy that the body already provides.
