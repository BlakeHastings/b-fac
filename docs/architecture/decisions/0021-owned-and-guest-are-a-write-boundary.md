# 0021. Owned and guest are a write boundary, and the factory asks which

Status: accepted

Parent epic #60. ADR 0022 defines the second axis, which this one deliberately
does not cover.

## Context

The skill assumes it may write anywhere. Everything it describes — seeding a
backlog, opening pull requests, configuring CI, applying a ruleset — is what
this repository did to itself in its first hour, and it was allowed to because
the owner owns it.

The owner's other case is a work repository:

> at work where it can't post to GitHub, it can't force change our CI pathway,
> and then it needs to work kind of locally on my machine until we arrive at a
> pull request where I'm then able to submit that to other developers.

The epic originally read that as forge-agnosticism: replace GitHub issues with a
local issue tracker, GitHub Actions with a local runner, the ruleset with a
local hook. That was wrong. The company's tracker still holds the ticket and the
company's CI still runs on the pull request. Neither is being replaced; both are
being left alone. What is wanted is a factory that runs on one machine and emits
a pull request at the end.

Two shapes were available for that second mode. It could be a feature set — a
list of things switched off, and an instruction to be careful with the rest. Or
it could be a boundary — one line, with everything on the far side of it waiting
for a single step.

## Decision

**Two modes, named by what the factory may write to.**

- **Owned.** May write anywhere: create the repository, open issues, push
  branches, open and merge pull requests, configure CI, apply a ruleset.
- **Guest.** May write the working tree and its own local store, and nothing
  else. Reads of external systems are unrestricted. Every outward write waits
  for **one explicit publish step** that the owner asks for.

**Guest is defined as a boundary rather than as disabled features, because a
boundary is assertable.** "Guest mode performed no external writes" is a claim
something can check after the fact: no branch pushed, no issue opened, no
comment posted. "Guest mode is more careful" is a disposition, and ADR 0004 is
this repository's own record of what dispositions are worth. This is the same
move as `Next:` / `Blocked on:` — replace an adjective with a shape.

**Of the four things the workflow needs GitHub for, guest mode uses one.**

| GitHub dependency | Owned | Guest |
| --- | --- | --- |
| Backlog: `gh issue view/create/list` and the sub-issue link | Yes, it is the backlog | No. Read the host tracker; the factory's own working issues live in the local store until publish |
| `merge-pr.mjs` reading `statusCheckRollup` | Yes, the merge gate | No. There is no remote rollup to read. The gate is the host's own check command, run locally |
| Actions | Yes, and CI is a thin wrapper on the local check command | No. The company's CI runs on the pull request, after publish, unchanged |
| The ruleset on `main` | Yes | Never. A ruleset is a change to somebody else's repository |

That table is also the honest size of the epic: a pluggable backlog frees one of
four, not all of them.

**The mode is asked at initialisation, out loud, and confirmed even when the
factory believes it knows.** The asymmetry is the argument. Guessing guest in a
repository the owner controls costs one question. Guessing owned in a work
repository opens issues on a company tracker and pushes branches nobody asked
for, and the damage is already outward by the time anyone notices.

**The mode is never inferred from the repository, and specifically never from a
git remote.** A work repository is on GitHub too. A remote establishes that the
factory *can* write there, which was never the question. Whether it *may* is a
fact about the developer's authority inside their organisation, and no amount of
repository inspection contains it. This is the class of thing the skill's
escalation section already says to ask rather than derive.

**The answer is recorded, split by who it is about.** *Repo facts* — where the
backlog lives, the command that runs the checks — are true for anyone who clones
the repository and are committable in owned mode. *Machine facts* — whether this
operator, on this checkout, may publish outward — are never committed, and are
kept out of the tree with `.git/info/exclude` rather than `.gitignore`, because
editing a tracked ignore file is itself an outward-facing change to a repository
you are a guest in. Splitting them is what stops the mode being re-asked every
session without letting one developer's permission travel to another clone.

## Consequences

**Guest mode has no pull request to hang a review on until publish.** The three
lenses do not lapse, so the review record has to live in the local store and be
transcribed into the pull request body at publish time.
`references/first-run.md` says where.

**The gates differ because the blast radius differs.** In owned mode the merge
gate protects a trunk other work depends on and an un-bypassable gate is worth
building. In guest mode landing means landing on the developer's own integration
branch, which the company's real CI and real reviewers judge later. A lighter
gate there is the correct weight rather than a compromise, and the argument for
un-bypassable local gates belongs to owned mode.

**A local check reproduces steps, never an environment.** Node version, OS and
tooling still differ between a laptop and a runner, so "green locally, red in
CI" remains possible in guest mode and is not a defect in the gate.

**Nothing enforces this yet.** The boundary is assertable, which is not the same
as asserted. This ADR deliberately stops at the model and the initialisation
question; the checkable form is a later issue, and until it exists guest mode is
an instruction shaped like a control.

**Two questions now sit ahead of the loop where there were none.** That is a cost
paid at initialisation only, and it is paid in the direction the failure is
cheap.
