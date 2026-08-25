# 0053. A scan says how far it looked, and pinning the known findings is refused

Status: accepted

Issue #165, found as a side note by the agent working #163. ADR 0050 built the
scan this corrects; ADR 0049 is where the knob refused below is refused.

## Context

`check-bodies.mjs` reads the most recent 50 issues and 50 pull requests. That
bound was a reasonable choice: an unbounded scan is slow, and a detector nobody
runs detects nothing, which is the failure this family of tools exists to avoid.

The bound had a consequence nobody chose. **The findings age out.** This
repository's seven standing positives sat inside that window while issues kept
being filed, and #87 was four issues from the edge when this was written: the
default scan reached back to #82. As issues accumulate the seven leave the
window and the script exits 0 with nothing repaired.

That matters more than a stale scan usually would, for two reasons.

**Exit 0 read as "nothing is wrong" while it meant "nothing is wrong in the last
fifty".** Those are different claims and only one of them is an all-clear.

**#163's deliverable was that exit code**, so its success condition was reachable
by waiting. A success condition that can be met by doing nothing is not one, and
green would have arrived looking exactly like a repair.

It is also this week's shape a fourth time: a check that scans nothing passes, a
guard that never loaded is silent, a conflicting branch's CI reads as a queue,
and now a detector whose scope shrinks out from under its own findings.

## Decision

**Every run says how far it reached, in both directions.** Not only when it is
clean, because the window is also why a given finding was the last one.

```
Scanned the 50 most recent issues (back to #82) and the 50 most recent pull
requests (back to #42).

Scanned the whole history of this repository: every issue (104) and every pull
request (62).
```

Exhaustiveness is measured rather than assumed: a list that comes back shorter
than it was asked for is the whole of it. Exactly `limit` items is reported as
bounded even where the repository happens to hold exactly that many, which errs
toward claiming less than was read.

**`--all` reads the whole history**, and its exit 0 is the one that means the
repository rather than a window. Measured here: 5 seconds, two calls, 322 stored
bodies against the default window's 201. The bound stays the default, because
the run somebody does by habit should be the fast one.

**A clean bounded run says so in a second line**: clean as far as it looked, not
an all-clear, and where to get the other one.

**The exit code stays binary.** A second non-zero for "I only read a window"
would be red on a healthy repository every ordinary run, and a report that is
always red is a report nobody reads, which is the disease this whole layer is
being defended from (#156, #102, #58). The distinction is carried by wording,
which costs nothing and is read at the same moment.

### Pinning the known findings is refused

The proposal was a list of artifacts that must keep being reported, so the seven
cannot age out. The defence offered for it was real and worth answering: a list
that can only make the tool **noisier** is arguably the opposite of an allowlist,
which can only make it quieter, so ADR 0049's objection may not reach it.

**The defence inverts rather than survives.** For a layer that prevents, the
dangerous direction is quieter: a knob that suppresses a true positive is how a
guard stops guarding. For a layer that only reports, the dangerous direction is
louder. ADR 0050 says it in its own terms: a scan that reports things that are
fine is a scan somebody stops running. So "it can only make the tool noisier" is
the reason to refuse it, not the reason it is safe.

**And the version that is not noisy is not pinning.** A list that forces a
*look* rather than a *report* is just a hand-maintained set of artifact ids that
duplicates the findings, must be pruned by hand after each repair, and requires
knowing in advance which artifacts are suspicious. Not needing to know that is
the property ADR 0050 gives as the reason this layer is worth having: it does
not care which call wrote the artifact, only what the artifact holds. `--all`
gets the same coverage without a list and without anyone knowing the answer
first.

The reason the seven stand is now in the script's header, where somebody running
it meets it, which is what #163 asked for and what its own brief made
impossible.

## Consequences

**A green that arrived by attrition is now visible in the same breath as the
green.** The scope line names the oldest artifact reached, so a reader who knows
the findings sat on #87 can see #82 or #94 in the output and draw the right
conclusion. This does not prevent the trap; it makes it legible, and prevention
is `--all`.

**#163's success condition is corrected rather than rescued by this.** Its
deliverable is the seven artifacts each verified as carrying their repair text,
named individually, with the exit code as corroboration. That correction is the
owner's, on the issue, and this ADR is the reason it was needed.

**`check:bodies` stays outside `npm run check`.** It reaches the network and
needs a token; the mechanical gate stays hermetic. Nothing here changes that,
and `--all` makes the out-of-gate run more worth doing rather than less.

**`--all` is a number, not a promise.** It asks `gh` for more issues than this
repository will plausibly hold and lets it stop when the history runs out. If it
ever were not enough, the scope line would say the window rather than claim a
history it did not read, which is the same property the default has.
