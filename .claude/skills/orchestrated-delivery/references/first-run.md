# The first hour, in a repo that had nothing

`SKILL.md`'s setup section is a checklist. This is the same setup as a sequence,
from one repo that ran it: `github.com/BlakeHastings/b-fac`, which packages this
skill and is also run by it. Every commit, issue, pull request and ADR named
below is public, so nothing here has to be taken on trust.

Read it for the ordering and for what went wrong. How to work an issue once the
loop is running is in `assets/working-an-issue.md`, and what each enforcement
layer is worth is in `references/enforcement.md`. Neither is repeated here.

**This is the owned-and-ours corner of the two axes in `SKILL.md`**, and it was
that corner by construction: the repo was minutes old, so the factory could
write anywhere and there was nothing to defer to. "When the repo is not yours"
at the end says what moves in the other three, and it is a set of substitutions
into this sequence rather than a second sequence.

## What it took

Empty repo at 10:35, seeded backlog at 11:09, first agent pull request three
hours later.

| Time | Commit | What landed |
| --- | --- | --- |
| 10:35 | `f3b8a7a` | Every asset copied in, unedited: two process docs, the PR template, the seeder, all three enforcement scripts |
| 10:47 | `2ff792e` | The enforcement layer edited for this repo, ADRs 0001 and 0002, the check that holds 0002, and CI |
| 10:59 | `dadeae4` | `AGENTS.md`, ADR 0003, the skill payload itself, two more checks |
| 11:03 | `e67a110`, PR #1 | The guard hook wired into `.claude/settings.json`, and `orchestrating.md` |
| 11:09 | `18f6138`, PR #2 | The backlog, generated from the seeder |

**That is not the order `SKILL.md` lists**, and the differences are the useful
part of this document.

## Copy everything first, unedited

The scaffold commit is a plain copy. No edited constant, no adjusted path, no
ADR. The edits arrive twelve minutes later in the commit that also records why
they were made.

That split is worth keeping. An ADR written before the copy is an opinion about
files nobody has read in place. An ADR written a day after the edits is a
reconstruction. What worked was: copy, read them where they now sit, then decide
and edit and record the decision in one commit. ADR 0002 shipped in the same
commit as `check-vocabulary.mjs`, the script that holds it, which is the fifth
constraint applied at the smallest scale it fits.

## The first real decision is what to delete

ADR 0001 is entirely about which of the three enforcement layers this repo does
**not** need. It is public, so a ruleset is free, and the answer came out one
deletion rather than two. The provenance audit went, because with no bypass
actors the commit it detects cannot exist. The guard stayed, because a ruleset
cannot stop an agent merging its own pull request. The merge wrapper stayed too,
demoted from a control to a convenience, because its refusal says which check is
red where a merge button does not.

Do that arithmetic in the first half hour, layer by layer rather than as one
verdict on the set. Installing all three into a repo that needs two is the shape
of setup nobody ever revisits, and every layer you keep is one more thing
claiming to protect something. `enforcement.md` has the revisit trigger and the
argument.

## The step now listed first did not exist

`assets/check-setup.mjs` is the first row of the setup table and the sentence
above it says to run it before installing anything. It was written on **day
three**, in PR #39, from issue #19, "Installing the enforcement layer is an
instruction, not a step".

Its first run against the repo that commissioned it found
`scripts/check-main-provenance.mjs` present, still holding
`REPLACE_WITH_BASELINE_COMMIT_SHA`, invoked by no workflow and no script, while
ADR 0001 asserted it had been deleted. The deletion had failed silently: a shell
parse error killed the block containing the `git rm`, and the next `git add -A`
committed the file straight back. The false claim survived eight merged pull
requests and every review in between. The check found it in under a second, and
the correction is appended to ADR 0001 rather than edited into it. Filed as #40,
fixed in #42.

So the row is first in the table because it was learned last. Run it first, and
keep the failing output: the before and after is the only thing that
distinguishes an installed layer from a copied one.

## Answer the boundary question here too, not only in somebody else's repo

The first thing that run prints is `Write boundary: NOT RECORDED`, and for a
long time that was the only thing an owned repo could ever print, because the
one writer of `.factory/machine.md` was the guest gate's installer and it only
ever writes `guest`. This repo printed it on every run from the day the report
learned to read the mode until #100 gave the other answer a writer.

```bash
node <this skill>/assets/check-setup.mjs --record-owned
```

That writes the record, appends `/.factory/` to `.git/info/exclude` so it stays
out of the tree, and does nothing else: owned mode has no gate, so there is
nothing to install. It refuses if an answer is already there, and it refuses in
a repo where the guest gate is installed.

**It is worth the ten seconds for the same reason the check itself is.** An
answer nobody records is indistinguishable from a question nobody asked, and
those two want opposite things done next. Once every owned repo can record its
answer, `NOT RECORDED` goes back to meaning the initialisation step was skipped,
which in a repo that turns out not to be yours is the finding that matters most.
ADR 0039.

The record is untracked by definition, so it does not travel with a clone and CI
never has one. Whoever next works this repo on their own machine records it
again, once.

## Seed the backlog after your first pull requests, not before

Issues and pull requests share one number sequence. PR #1 and PR #2 took the
first two here, so the seeded epics begin at #3.

Nothing broke, because the seeder references parents by key rather than by
number, which is `references/github-backlog.md`'s rule paying for itself on day
one. If your backlog data names literal issue numbers anywhere, seed before you
open anything at all, and expect the two conventions to disagree exactly once.

## "Write orchestrating.md last" means last of the setup

It was written at 11:03, before the backlog existed and before one agent had
run, from what the previous 28 minutes had cost. It has been revised twice
since, both times by an agent correcting something that setup got wrong (#18,
#43).

Treat the first version as a record of the traps you personally sprang, which is
what you actually have at that point, rather than as a guide to running the
loop. You have not run it yet.

## Batching by theme reads as batching by collision surface

The first wave was two agents on day one (#17, #18). The second was four issues
opened inside five minutes on day two, one per reference document, which looked
like four clean surfaces.

Three of the four also changed `SKILL.md`, because every reference document is
linked from it. They landed over twenty-two minutes in a different order from
the one they were opened in, #30 having been opened second and merged last. The
file everything links from is a collision surface even when no two issues are
about the same subject. `references/parallelism.md`.

## What went wrong, so you can watch for it

Three failures, all on the record, and the shape they share matters more than
any one of them.

**An invariant outlived the code that was supposed to hold it.** ADR 0001 above.
The skill's own fifth constraint warns against exactly this, and it was broken by
the person writing the warning, in the document recording the decision.

**The guard has never been observed denying anything.** It was wired at 11:03 on
day one. On day three an agent merged its own probe pull request through
`gh api`, which is one of the command forms the guard's own tests prove it
refuses. Either the hook did not fire or it did not match, and #45 is open on
which. Whatever the answer, "the guard is installed" was true from hour one and
load-bearing for none of it. `enforcement.md` explains why a live guard and an
inert one produce identical output from inside the session.

**An evidence bar demanded something the brief had not authorised.** The same
agent created a live ruleset on the repository, because the bar asked for a
branch in a merge state that cannot exist without one, and the brief named
nothing as out of bounds. It took the least destructive route, isolated the
probe, disclosed it unprompted and cleaned up. The defect was in the bar. #44,
and the rule it produced is in `references/briefing.md`.

Two of those three were found by a script and one by a security warning. **None
of them was found by reading**, including by readers who were looking.

## The order to use

Corrected from the above rather than transcribed from it.

1. Copy every asset in one commit, unedited.
2. Run `check-setup.mjs`. Everything reports MISSING, and that output is your
   baseline. Then answer the boundary question with `--record-owned`, because it
   decides which checklist the rest of this list is against. In the other mode
   the same answer is the gate install, below, and it comes before everything.
3. Decide what this repo does not need. Record it as an ADR, with whatever check
   holds it, in the same commit.
4. Edit and wire what is left, then run `check-setup.mjs` again and keep both
   outputs.
5. `AGENTS.md`, then the backlog, then `orchestrating.md` from what the first
   four steps cost you.
6. Dispatch. Re-run `check-setup.mjs` after any change to hook settings or CI
   job names, where these layers go quiet without going away.

Step 2 is the one to insist on, because it is the one this repo skipped and paid
for twice.

## When the repo is not yours

Two things above were free and usually are not: the factory could write outward,
and it had nobody's habits to respect. Change either and the sequence still
holds, with substitutions.

### Read the conventions. Do not detect them.

This is a reading task an agent does once, at initialisation, and reports. The
inputs are the last fifty commit subjects, the last twenty remote branch names,
the most recently merged pull request, `CONTRIBUTING.md`, and whatever the CI
workflow actually invokes. Read the artifacts, not the documents describing
them, because the documents are the half that goes stale.

**Where the signal is ambiguous, ask instead of guessing.** `docs/adr/`,
`docs/decisions/` and `doc/arch/` are one convention wearing three names, and
finding none of them is not evidence the project rejects the idea — the default
inclination to write decisions down survives, and only its shape and location
are up for negotiation. A detector that guesses wrong is worse than a question
asked once, because the guess is invisible afterwards.

| What setup installs | If the repo already has one | If it has none |
| --- | --- | --- |
| Decision records | Theirs: their directory, their numbering, their template, even where you would have chosen otherwise | `docs/architecture/decisions/`, ours |
| The two process docs | Do not install over a contribution guide. Theirs is the contract | Install from `assets/` |
| PR template | Fill theirs in. Never replace it | Install `pull_request_template.md` |
| Branch naming | Theirs, copied from real branch names | `<area>/<number>-<slug>` |
| Commit style | Theirs, copied from real subject lines | Why, not what |
| Check entry point | Theirs, discovered from their task runner and **proved by running it**. Not whatever their CI invokes: that describes an environment you do not have. `references/host-checks.md` | One command, and CI is a thin wrapper on it |
| Enforcement layer | None of the owned four: a ruleset, a required check and a merge wrapper are all changes to their repository. The guest gate below is the exception, because it changes nothing tracked | ADR 0001's arithmetic, layer by layer |
| Backlog | Their tracker, read-only until publish. The factory's working issues stay in its local store | Seed it |

**Branch naming and commit style are the two that actually bite.** They are
visible in every pull request the owner has to show a colleague, and getting
them wrong is the whole difference between a change that looks native and one
that looks like it came out of a machine. Everything else in that table is
recoverable in review; these two are read at a glance by people who were not
asked.

**Adopting their conventions never deletes a process.** If the repo has no
review discipline, the three lenses still apply to what the factory produces.
What moves is where the record lives, not whether one exists. Dropping a process
because the host lacks it is how a guest becomes a worse factory rather than a
politer one.

### Install the boundary before you install anything else

The one step guest mode adds rather than removes. It is first because it is the
only one that protects the host repository from the rest of the sequence:

```bash
node <this skill>/assets/guard-guest-writes.mjs --install
```

It copies the gate to `factory/` **inside the git common directory**, writes
`factory/machine.md` there with the write boundary and the backlog tool in it,
wires `.claude/settings.local.json` in the checkout you ran it from, and appends
that one path to `.git/info/exclude`. Nothing tracked changes, nothing outside
the repository is touched, and nothing but the wiring goes into the working tree
at all. Check that rather than believing it:

```bash
git status --porcelain -uall
```

**Then read the last thing it printed, which is the half that is yours.** The
wiring it just wrote covers sessions started in that one directory, because the
harness reads project settings from the directory a session starts in and from
nowhere else — measured, and true for a linked worktree nested inside the
checkout as well as one beside it. Your subagents work in worktrees. So
`--install` ends by printing a block for `~/.claude/settings.json`, carrying
`--scope`, which reaches every session inside this repository and no session
outside it. It prints it rather than writing it: somebody's home directory is
theirs. Installing it and removing it are a deliberate pair, and the block says
how to do both.

Then **restart the harness**, because settings are read once at process start
and the session that installs a hook runs unguarded to the end. Then ask the
gate whether it is actually loaded, which a gate cannot tell you any other way:

```bash
node "$(git rev-parse --path-format=absolute --git-common-dir)/factory/guard-guest-writes.mjs" --probe
```

Being refused is the answer you want. **Ask it from a worktree too**, once you
have one, because a probe run where the orchestrator is standing says nothing
about the sessions that push branches, and that is precisely how the hole in
#122 survived a run that reported the boundary enforced. Put both outputs in
your first status update, the same way the owned sequence keeps
`check-setup.mjs`'s before and after: the difference between a copied control
and an installed one is the only thing either pair of outputs is for.

`check-setup.mjs` is that same before-and-after here and is worth running in
guest mode too, before and after the install. It reads the machine record, so it
reports the gate as **G** and every owned layer as `n/a` with the mode as the
reason, and it exits 0 once the gate is installed rather than demanding four
layers that must never exist in somebody else's repo. Before the install it
says the boundary has not been recorded, which is exactly the state you are in
until you run it.

**Run it from a worktree as well.** It reports which checkouts of the repository
the gate is actually wired for and names the ones it is not, and until #122 it
could not see the machine record from a worktree at all: it read the boundary as
unrecorded, listed the four owned layers as MISSING, and told you to install a
merge wrapper and a CI workflow into a repository you are a guest in.

`references/enforcement.md` says what the gate covers, what it does not, and why
it is not installed into your home directory.

### Then find out what this repo actually checks, by running it

The step after the boundary, and before any work. Guest mode's gate is the host
repo's own check command, and in a repo the factory did not create nothing
establishes what that command is:

```bash
node <this skill>/assets/discover-checks.mjs          # propose, and write nothing
node <this skill>/assets/discover-checks.mjs --run    # run the proposal, then record
```

It ranks their task runner above the ecosystem manifest, prints their pipeline's
commands as description and **never proposes one**, and records
`factory/checks.md` only for commands it has executed and seen exit 0. Where
the evidence is thin or points two ways it refuses and prints the question to
ask, which is the outcome you want rather than a failure of the step: a wrong
check produces confident red or confident green about the wrong thing.

**Put its output in the same status update as the gate's.** It is the same kind
of evidence: something that was run, rather than something that was read.

`references/host-checks.md` has the tiers, the escalation shape, what is
unhandled by name, and the limit — a local gate runs a subset of their pipeline
and never their environment, so this buys fewer round trips and not a pull
request that will pass.

### What guest mode gives up

Until the publish step there is no pull request, so there is nothing
forge-shaped to hang a review on, and the setup sequence above loses its last
three steps entirely — no backlog seeded outward, no ruleset, no CI.

- **The review record goes to the local store**, one per unit of work, in the
  three-lens shape, and is transcribed into the pull request body at publish.
  Written at the time, not reconstructed at the end.
- **The gate is the host's own check entry point, run locally**, before work
  lands on your integration branch. That reproduces their steps by construction
  and never their environment, which is a real limit and worth saying out loud
  rather than discovering on the pull request. Which command that is comes from
  `discover-checks.mjs` above, and it is not a guess: nothing is recorded that
  was not executed.
- **"Landing" means landing on your own integration branch.** The gate is
  protecting your review time rather than a trunk other people depend on, so a
  lighter gate here is the correct weight and not a compromise. The
  un-bypassable merge gate argument belongs to owned mode.
- **Reads are free and writes wait.** Pulling a ticket in is the normal case.
  The comment you want to leave on it is an outward write, and it waits with
  everything else for the one step the owner asks for.

### Publish, and check the one clause that can be checked

Guest mode is a boundary rather than a list of features left switched off for
one reason, and publish is where it comes due: ADR 0021 chose that shape because
"no external writes happened" is a claim something can check. **One clause of
that sentence is now checked and three are not**, and knowing which is which is
the difference between a publish note and a claim wearing its clothes.

```bash
node <this skill>/assets/check-outward-writes.mjs
```

It reads this repository's remote-tracking reflogs, where a push leaves
`update by push` and a colleague's push arriving by fetch does not, so it can
say a push was **ours**. That catches the push the gate could not refuse: from
`sudo`, from a session the hook never loaded, from a worktree, from a human at a
terminal. It also reads the gate's refusal log, so "the boundary held" stops
reading the same as "the boundary was never tested". Exit 0 is looked and saw
nothing, 1 is found something, and **2 is could not look**, which is not the
same as clean.

Then write the note:

| Clause | Who says it |
| --- | --- |
| no branch pushed | the check said so, and here is its output |
| no item opened on the host's tracker | you |
| no comment posted | you |
| nothing outside this machine touched | you, and nothing can help |

`gh` keeps no local record of what it wrote, measured, so the middle two
cannot be mechanised on this machine at all, and nothing that is neither git nor
gh can be seen by either half. If you cannot say the last three, say precisely
what you did instead.

**Ask the gate `--probe` in the same breath, as its own tool call.** The report
prints the line and will not run it for you: a hook sees tool calls and not the
child processes a script spawns, so an answer collected from inside the report
would say inert in a session where the gate was holding. A gate refuses; it does
not audit; and a report audits without telling you whether anything was
refusing. You want both answers and they are two different claims.

**After a publish the owner authorised, mark it**, or this report is red for
ever from then on:

```bash
node <this skill>/assets/check-outward-writes.mjs --mark
```

It bookmarks the moment and does not hide what is below it, for the reason the
provenance audit refuses to let a baseline move forward to silence a failure.
