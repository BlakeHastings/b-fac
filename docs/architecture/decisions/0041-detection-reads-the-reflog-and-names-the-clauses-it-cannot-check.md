# 0041. Detection reads the reflog, and names the clauses it cannot check

Status: accepted

Parent epic #60, issue #94. ADR 0021 makes the promise this one keeps part of,
ADR 0029 gives the boundary its gate, ADR 0025 supplies check versus gate, ADR
0030 lets a report read the mode, ADR 0037 makes the repository the scope, and
ADR 0027 is why a probe exists at all.

## Context

ADR 0021 chose to define guest mode as a **write boundary** on one argument,
which it stated in as many words:

> **Guest is defined as a boundary rather than as disabled features, because a
> boundary is assertable.** "Guest mode performed no external writes" is a claim
> something can check after the fact.

ADR 0029 then built prevention. **Nothing was ever built for the sentence
above.** The assertion the whole model was chosen for had never once been
available, and at the end of a session the only answer to *did this touch
anything outside my machine* was "the gate did not refuse anything". That is a
different claim, and it is the one a gate that never loaded also makes.

SKILL.md's fourth constraint is the general form: whatever prevention you have,
add detection, because a bypassed preventive layer is silent by construction.
The gate's own header lists what it cannot see and the list is long and honest:
a process the harness never loaded it into, a human at a terminal, `sudo`,
`env`, `nohup`, a command assembled from a variable, and three of the five
harnesses where it cannot be installed at all. Every one of those is a hole in
prevention, and prevention is a net.

**Two things were measured before anything was designed**, in scratch
repositories with a real remote and real linked worktrees, on git 2.44.0.

**Whether a local artifact distinguishes our push from somebody else's.** This
was the open question in the issue and it decides whether detection is worth
having at all, because a branch existing on a remote cannot answer it.

| What happened | What `refs/remotes/<remote>/<branch>` gains |
| --- | --- |
| we pushed | a reflog entry reading `update by push` |
| we force-pushed | the same, `update by push` |
| a colleague pushed and we fetched | `fetch origin: fast-forward` |
| we cloned | nothing at all |
| we pushed `--dry-run` | no ref, no entry |
| we pushed and the remote already had it | nothing: git logs effective writes |

So the reflog **attributes**. It is also a fact about the repository rather than
about a checkout: reflogs live in the git common directory, so a push made from
a linked worktree reads identically from the main checkout and from every other
worktree. Measured, because ADR 0037 exists precisely because every "does this
repository have X" question turned out to be about a directory.

**Whether anything else on the machine records an outward write.** `gh`'s state
directories were inspected on the owner's machine: a config file, a hosts file,
a device id, an Actions run-log cache, and an HTTP cache holding GET responses.
**No command history, and nothing that records a write.** So an issue opened or
a comment posted leaves nothing behind locally, and no amount of cleverness with
local files will change that.

## Decision

**Guest mode gets a check, and it is a check in ADR 0025's strict sense.**
`assets/check-outward-writes.mjs` reports and nothing about it refuses. It is
run at publish, and it is the sibling of `check-setup.mjs` rather than a layer
inside it: `check-setup.mjs` answers *what is installed*, this answers *what
happened*, and neither is the other's summary.

**The clauses are split in the output, because that is the deliverable.**
`references/first-run.md` ended the publish step with a sentence written by
hand. One clause of it is mechanisable and the rest are not:

| Clause | After this |
| --- | --- |
| no branch pushed | **checked**, from the reflog, and attributably |
| no issue opened | still somebody's word. `gh` keeps no local record |
| no comment posted | still somebody's word, same reason |
| nothing outside this machine touched | not checkable by anything, here or elsewhere |

**So ADR 0021's promise is now kept in part, and the part is named.** A report
that implied it had verified the whole sentence would be worse than the honest
sentence it replaced, because it would be quoted at a code review.

**Three states, and three exit codes.** CLEAR is looked and saw nothing, FOUND
is looked and saw something, UNCHECKED is could not look. They exit 0, 1 and 2.
Collapsing UNCHECKED into either of the others is the failure this repository
already paid for once: `check-vocabulary.mjs` reported green across twelve files
with the whole payload outside its view, and **a check that scans nothing
passes**. A repository with `core.logAllRefUpdates=false` is the concrete case: a
push updates the ref and writes nothing, and reporting that as clear would be a
confident lie in the one direction that matters.

**Anything the reflog says that this file does not recognise is UNCHECKED, not
harmless.** Five messages were measured onto remote-tracking refs; anything
else is printed verbatim and moves the exit code. If a git ever localises those
strings or adds a sixth, the failure is loud rather than a permanent silent
CLEAR.

**The gate records what it refuses, and that is not a recorder.** Until now the
gate knew every outward write it turned down and wrote none of them anywhere, so
"the boundary held" and "the boundary was never tested" produced identical
evidence, which is the ambiguity ADR 0027 built the probe for, one step along. It
now appends to `factory/refusals.log` in the git common directory.

The issue's own constraint was not to build a recorder that intercepts every
command, and this is not one: it records only what was already refused, so it
has exactly the gate's coverage, adds no hook surface, and cannot be wrong about
anything the verdict was not already wrong about. A recorder of *every* command
would need the same pre-execution surface and would inherit every line of WHAT
THIS DOES NOT COVER, for no coverage the gate does not already have. That is ADR
0029's finding about a portable check, arrived at again from the other side.

Three details of it are decisions rather than details.

- **The command line is not written down.** Three tokens of the refused
  segment, truncated, is enough to tell a push from a `gh pr create` and enough
  to prove the gate fired. A full line would put an agent's arbitrary text into
  a file (a `--body`, an assignment prefix that happens to hold a token), and a
  boundary that leaks what it refused is a poor trade for a longer log line.
- **The probe is refused and not recorded.** Counting it would make "the
  boundary was tested" true in a session where the only thing tested was the
  gate.
- **A log that cannot be written never stops a refusal.** The verdict is on
  stdout before the append is attempted, and the append is wrapped.

**`--mark` bounds the window, and does not erase what is below it.** In guest
mode the unbounded question is already bounded, because the answer is meant to
be zero and no marker is needed to say so. What a marker is for is the step
after: the owner authorises one publish, it happens, and without a bookmark this
report is red for ever, which is the permanently red line this repository has
written down three times as the thing that gets a layer switched off. So pushes
before the marker are still counted, still printed, and `--mark` says how many
it is about to put below the line before it writes one. That is
`check-main-provenance.mjs`'s rule about moving a baseline forward to silence a
failure, applied to the mechanism that would otherwise reintroduce it.

**`--remote` is opt-in and can never fail the report.** `git ls-remote` is the
only source that sees a push made by URL, since no remote-tracking ref is
created for one. Measured. It is also the only source that cannot attribute
anything: a colleague pushing a branch whose name matches ours produces the
identical observation. **One false accusation is enough for a detection layer to
stop being read**, which this repository has written down about
`check-main-provenance.mjs`, so this reports and never judges. Opt-in because it
is a network call with credentials behind it, and a publish-time check that
hangs on a proxy is a check that gets skipped.

**The write boundary decides the verdict and never the facts.** The pushes are
gathered and printed the same way whichever answer comes back; the mode decides
only whether one is a finding. Unrecorded is treated as owned, which is
`check-setup.mjs`'s choice and gets a second reason here: accusing a repository
nobody has called a guest is exactly the wolf-crying the paragraph above
forbids. ADR 0030 is the licence for a report reading the mode that a gate may
not.

**The report will not run the probe for you, and says why.** A `PreToolUse` hook
sees tool calls, not the child processes a script spawns, and `merge-pr.mjs`
relies on precisely that to make its own `gh api` call. So a probe this report
collected on your behalf would run unrefused in a session where the gate is
holding and report it inert. **A confident false "inert" is worse than the
ambiguity it claims to resolve**, which is the same reasoning that makes the
gate's own probe refuse to report when it sees npm around it. So the report
prints the line and requires you to run it as your own tool call.

## Consequences

**Detection covers the gate's holes in the git direction and none of the
others.** A push by `sudo`, by `env`, by a human at a terminal, from a session
the hook never loaded, or from one of the three harnesses where the gate cannot
be installed, writes exactly the same reflog entry as a push the gate would have
refused. `curl`, `glab`, `npm publish`, `docker push` and `scp` remain invisible
to both halves. The list in the new file says so in the gate's own register.

**Three routes erase their own evidence, and all three are stated.** A push by
URL updates no remote-tracking ref. `git push --delete` removes the ref, and
deleting a ref deletes its reflog. `git remote rename` replaces every entry with
one `remote: renamed` line. All measured. That is the same threat model the gate
already states: an agent that forgot, not one that is hiding.

**The window is the reflog's, which git expires after 90 days by default.** So
"everything the reflog holds" is a window and not history, and the report says
that on every run rather than in this document only.

**A third file now spells the same `factory/` paths.** The gate, the setup
report and this one. Accepted on ADR 0029's reasoning, that an asset is copied
into a host repo on its own and a two-file asset is a setup step that gets half
done. The cost is real: a rename breaks this quietly, which is what
`scripts/check-outward-writes.test.mjs` installing with the real `--install` is
for.

**One bug was found by a test rather than by reading, and it is the reason to
keep writing the marker cases.** The first implementation timed each push with
`%ct`, which is the committer date of the commit the reflog entry points at
rather than the entry's own time. The two agree to the second in anything
written by hand, so it read correctly in every measurement taken while
designing. A branch committed on Monday and pushed on Friday read as Monday, and
every window comparison was therefore wrong in the direction of hiding a push.
`--date=unix` puts the entry's own time into the selector. There is a test that
backdates a commit by a year.

**The suite was not trusted for passing.** Twenty mutations were applied to the
two implementations one at a time: every reflog entry read as a push and none of
them read as a push, a fetch counted as ours, `update by push` swallowed by the
not-ours list, an unclassified message treated as harmless, reflogs never
considered switched off, the entry time back to the commit time, the mode pinned
each way, the marker hiding what is below it and the marker ignored entirely,
local branch reflogs counted as pushes, UNCHECKED exiting 0, an unreachable
remote read as no branches, a branch on the remote made fatal, the facts read
from the checkout instead of the repository, the probe recorded, the whole
command line logged, a failed log stopping the refusal, and nothing recorded at
all. **Every one was caught**, by between one and nine tests. No mutation
survived.

**What is still only somebody's word is written down as that.** The publish step
gained two commands and lost most of a sentence, and the sentence that remains
is shorter and true. Whether the host's tracker gained an issue or a comment
stays the operator's to state, and the only mechanical route to it, asking the
forge what this account authored recently, is a read of somebody else's system
that needs credentials, a repository identity and a tolerance for noise the
factory may not have. Left as a follow-up rather than guessed at here.
