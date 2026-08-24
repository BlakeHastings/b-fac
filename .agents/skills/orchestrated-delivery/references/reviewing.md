# Reviewing what comes back

The three lenses that define "done" live in the process doc agents read
(`assets/review.md`, installed as `docs/process/review.md`). This file is the
part that is yours: judging a returned claim.

Mechanical checks are not a lens. They are the price of admission and they run
in CI. If a mechanical check is missing, adding it is cheaper than reviewing for
it forever.

## Verify the central claim yourself

Not everything. The one thing that, if false, makes the change worthless or
dangerous. Reports are usually honest, and honest is not the same as verified.

How real claims were actually checked:

| Claim | How it was checked |
| --- | --- |
| "An electrical-only applicant answers 45 of 69" | Recomputed from the spec |
| "The invariant checks fail on violation" | Ran them against violations and checked **exit codes**, not console output |
| "The sensitive-field tests have teeth" | Deleted the `sensitive` flag and confirmed 4 tests across 3 files went red |
| "No answers leak on a later visit" | Read what the loader returns. The type has no field for them |
| "The palette meets contrast" | Ran the audit, then recomputed two ratios by hand |
| "The reveal does not speak the value" | Read where the announcement string is set. The value never reaches it |
| "The leading zero survives now" | Re-ran the exact probe that had proved the bug |
| "The blank template is blank" | It was not. Three dropdowns shipped pre-filled |
| "The permit search answers in 600ms" | Re-timed at the boundary. The 600ms was the reviewer's own HTTP tool finishing a TLS handshake, not the search |
| "The intake form loads cold in 8.4s" | Timed from cold container to first byte: 23.6s. The 8.4s had started the clock once the container was already up |

The pattern across all of them: check the property, not the artifact that claims
it. A test name is not a test. A green suite is not a working app. The one time
a check was done loosely it measured `tail`'s exit code instead of the script's,
and proved nothing.

The blank-template row matters most. The evidence had been sitting in a day-one
extraction, read as harmless noise. An agent read the same bytes and saw a
document that would tell an inspecting authority a contractor held an
endorsement they had waived.
**Being the reviewer does not mean you saw it first.**

### A measurement is not a discrete check

Every row above except the last two is discrete: a test is red or it is not, a
type has a field or it does not. Discrete checks survive a sloppy instrument.
Measurements do not, and in one session three of them came back wrong in the
same direction, the flattering one. None of the three was careless. Each number
was obtained in a reasonable way with the nearest instrument, and the nearest
instrument is the one that measures the wrong boundary, usually on the generous
side of it.

Three rules, cheapest and most valuable first.

**State the instrument beside the number.** "23.6s from cold container to first
byte" can be argued with. "8.4s" cannot, so it is not yet a claim, it is a
figure. Refuse the bare figure in an agent's report and refuse it in your own.

**Measure at the boundary the applicant meets.** They wait for a rendered page,
not for a handler to return. Warm caches, in-process timings and a connection
you already had open all move the number the same way, which is why the bias has
a direction.

**Prefer an instrumented run to a convenient one-liner.** Yours is usually the
worse instrument, because yours is whatever was already to hand. Constraint 3
still stands: verify the central claim yourself. When that claim is a number,
verifying it means naming the boundary and the instrument you would accept,
then reading the run that used them, rather than reaching for a faster copy of
the same wrong probe.

Refusing a bare figure here is the round trip an evidence bar exists to save. If
the central claim is going to be a number, put the boundary and the instrument
in the brief instead, as `references/briefing.md` says to do with any bar.

## Check whether the agent still had its brief

A long-running agent's context compacts, and when it does the summariser keeps
the shape of its brief and loses the evidence bar, the out-of-scope list and the
artefact it was told to check. Nothing errors and nothing tells you. The report
you are reading may be a good-faith answer to a smoothed-over version of what
you asked.

It is on the record, per agent:

```bash
grep -c '"subtype":"compact_boundary"' \
  ~/.claude/projects/<slug>/<session_id>/subagents/agent-*.jsonl
```

A non-zero count is not a finding and it does not make the work wrong. What it
changes is how much a **silence** in the report is worth. An agent that never
mentions the constraint you set may have met it, or may no longer have been able
to see it, and those two are indistinguishable from the report alone. So verify
the central claim as usual, and then check the parts of the brief the report
does not mention: the bar, the bounds, the artefact you named.

Asking for it in the brief is the cheap half (`references/briefing.md`), and a
report that says "no compaction" against a transcript that shows four is its own
kind of signal. `references/continuity.md` has the mechanics and ADR 0042 has
why this is a check and not a gate.

## Verify the merge result, not the branch

An agent verifies against the branch point it started from. By the time you
review, that is usually not what it will land on, and **its verification has
quietly expired**.

Cheap version: diff the file lists of the branch point against the default
branch. No overlap means the agent's own run still means something. Overlap
means re-run it or send it back.

One PR had passed 51 tests on its own branch four merges earlier, one of which
renamed a type its surfaces render through. Nothing turned out to be wrong, but
nothing had tested the combination either, and that combination is what ships.

If end-to-end tests do not run on pull requests, a green CI is not evidence the
default branch stays green. Run them yourself before merging.

## The lenses are about one change

Everything above judges one returned claim on one branch, and so do the three
lenses. Two passes run when a queue emptied found defects that no reviewer of a
single pull request was in a position to reach.

> A stack is not the sum of its PRs, and nobody is assigned to the union.

`references/parallelism.md` reasons about collision surface *before* dispatch.
This is the same concern afterwards, and only one of the two was written down.

### The adversarial pass

Every implementing agent had proved its own change worked. Nobody had tried to
break one. "Does it do what it says" and "what does it now permit" are different
questions, and only the first has an owner: the author asks it, the reviewer
asks it again, and the answer is yes both times.

Told to construct specific failures rather than to review, one pass built three,
including a sequence nobody had reasoned about: a recovery guard counting one
thing while the catalogue counted another, so a particular order of grants and
deactivations satisfied the guard and locked every user out.

**What it reaches that the lenses do not is the path nobody chose to walk.** The
lenses follow the change: its diff, its tests, its journey. An attack starts
from the state you want to reach and works backwards to whether the code will
let you get there, across branches, files and features that no diff puts next to
each other. Brief it as attacks to construct rather than as a review, or you get
taste. `references/briefing.md` has the shape.

### The union pass

Merge every open branch into a scratch worktree, reconcile the conflicts by
hand, run the suite. Seven pull requests, each written by an agent that could
see only its own branch, produced two branches whose convention documents are
each wrong about the other, a test invariant one branch disproves that two
others assert, and a deploy that silently revokes access.

**None of those exists on any branch.** Each is a property of the combination,
so none was available to a reviewer of any single PR, however careful. That is
the justification, and it is not that the union is a better review: it is the
only review with the defect inside its field of view. It boots things, so it
gets a worktree like anything else that does.

**The reconciliation is the pass. The suite run is not.** A union pass that ends
"the suite is green" has done the half CI already does, one branch at a time, on
every merge commit. The findings above came out of resolving a conflict and
asking what each side believed: two documents describing one convention
differently is not a test failure, because nothing reads either of them. Report
which branches disagreed and about what. If the only thing you can say is the
exit code, the pass has not happened yet.

### When to budget them

The field trigger was "there is nothing else to dispatch". Keep it as a floor
rather than the rule: it fires on the state of your queue, and the defect is in
the stack.

Above the floor, count the stack. **Branches say what it costs; shared surface
says whether it is needed**, and the second is the trigger. Seven branches in
seven directories is a merge. Two branches editing one convention is a union
pass, whatever else is dispatchable.

```bash
gh pr list --json number --jq '.[].number' | while read -r p; do
  gh pr diff "$p" --name-only | sed "s|^|#$p |"
done | sort -k2 | uniq -f1 -D
```

That prints every file touched by more than one open pull request, grouped, with
the PRs touching it. Any output at all is a stack with a union in it. **What it
cannot see is the case that produced the findings above**: branches that share
no file and disagree about a claim. So read it beside two questions it does not
answer, and treat either as the same trigger.

- Do two open branches state a convention, each in its own file? Two documents
  can both be edited without either being the same document.
- Does an open branch touch deployment, permissions or access? Those are
  single-copy surfaces where the last branch to land writes for everybody, which
  is what "a deploy that silently revokes access" was.

### What the union pass costs

About one agent run, and the cost sits in the reconciliation rather than in the
branches: seven that merge cleanly is minutes, two that both rewrote one file is
the whole run. It also **competes with dispatch**, since the hour spent
reconciling is an hour not spent briefing, and unlike a builder it produces
nothing that lands.

Every resolution made in the scratch worktree is thrown away deliberately.
Nothing is pushed, nothing merges out of it, and the fix belongs to the agent
that owns the branch, because resolving a conflict on a change you are about to
review is authoring it (`references/parallelism.md`). Budget the same conflict
being resolved twice, once to find out and once for real.

Skip it when there is nothing to reconcile. Disjoint branches degenerate the
pass into a suite run CI has already done. Where the ruleset requires branches
to be up to date, the union assembles itself as each merge forces the next
rebase; that is cheaper and it is not the same thing, because it gets the text
merged without anyone asking what each side believed. A stack landing within the
hour can wait for that. A stack that will take two days cannot.

### Both are read-only, which is when they are worth most

Neither writes to a branch. The adversarial pass changes nothing and reports.
The union pass writes only into a worktree it deletes.

So they are the work when the environment is broken. One night, container
exhaustion made every browser check impossible and nothing needing a running app
could be verified or dispatched. These two passes were the only useful work
available and they returned more than the blocked checks would have.
**Analysis is not filler.** A broken environment is a reason to change the unit
of review, not a reason to stop.

## Read for what is missing

The strongest reviews find the absence. A confirmation page the user can
navigate back to. An audit log with a column a secret would fit in. A fallback
that quietly undoes the security model.

Ask what the natural, slightly-wrong version of this change looks like, then
check whether that is what you have.

## Prefer unrepresentable to unreached

The best work makes bad states impossible rather than merely avoided: a state
object with no field for the thing that must not leak, a type that cannot
express an approved-but-unsigned permit, an audit table with no column for a
value.

Name it when you see it. It is the pattern you want repeated.

## Send it back for the small thing

One inaccurate comment is worth a round trip. A comment saying the opposite of
what the code does poisons every other comment in the file. Sending one PR back
for a single wrong claim produced three more found by grep, plus a fourth that
had gone stale when an earlier PR landed.

## Never merge known duplication with a plan to fix it after

Hold the second PR until the first lands so the duplicate can be folded rather
than shipped and cleaned up. "We will fix it next PR" is how an invariant
becomes advisory.

## Say what beat the ask

Reviews are the only feedback these agents get. "You proved the claim instead of
asserting it" gets you proof next time.

## Recording it

Post the outcome before merging, in the same three headings the PR uses, plus a
verdict of ship / ship with follow-ups (linked) / needs work. Say what you
independently verified rather than what you accepted, and be specific about how.

**Post it through something that reads the artifact back**, rather than through
a `gh` call you assembled. Here that is
`node scripts/post-body.mjs <kind>:<number> <file>`, which writes the body from
a file, reads the artifact back and exits non-zero when what is stored is not
what was sent.

The read-back is the whole of it, because this failure is silent in both
directions: a body-carrying `gh` call prints a URL and exits 0 having stored
something else, and `gh issue view --comments` then renders the wrong thing
without complaint. It has gone wrong three times here. Backticks inside a
double-quoted `--body` ran as command substitution and ate filenames, then that
again within the hour, then `--body @-`, a `curl` convention `gh` stores as two
literal characters, which blanked seven artifacts in one session
including an escalation issue whose only job was to carry a question to the
owner and which nobody was waiting on. This paragraph used to be the remedy, and
being correct did not make it work. Where you have no such script, build the
read-back; do not write the note again. ADR 0049.
