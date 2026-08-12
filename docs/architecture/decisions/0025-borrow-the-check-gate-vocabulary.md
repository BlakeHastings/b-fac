# 0025. Borrow the check/gate vocabulary, and do not retrofit it

Status: accepted

Parent epic #60, issue #65. The survey is
`docs/research/2026-08-12-local-gating-hooks-and-vocabulary.md`.

## Context

The epic needs a way to say "GitHub Actions is one flavour of a thing that runs
checks", and `references/enforcement.md` had been making that distinction in
substance for a while without nouns for it. Every layer in that chapter already
states what it does not cover, and the difference between layer 2 and layer 3 is
exactly the difference between refusing and reporting. The chapter had also
already reached for the word once, in "a tool, not a gate", without saying what
a gate is.

The vocabulary is standard-backed, so inventing one would have been the
expensive option. Zuul draws the line explicitly, GitHub agrees structurally,
and Gerrit splits the same two slots under different names.

## Decision

**Adopt: an event fires a trigger, which runs a pipeline of jobs and steps on a
runner, producing checks, enforced by a gate. The pluggable implementation is a
driver.** Prefer *pipeline* to *workflow*, since GitHub is close to alone in
saying workflow, and keep *workflow* for the GitHub Actions object of that name.

**Cite Zuul rather than asserting the definitions.** A reader who finds the
split pedantic can go and check that it is not ours.

**Apply it to `references/enforcement.md` only.** A rename across the payload
would be a large diff with no behavioural change, through prose that is
carefully worded and read by agents, so the nouns go where they earn their keep
and the rest follows if it ever wants to. Documents that still say "checks" in
the colloquial sense are not defects to be swept up in one pass.

**Check-versus-gate is not the same axis as written/loaded/fires.** The first is
what a layer does when it sees a violation; the second is whether the layer is
alive at all. They are independent, they already both appear in that chapter,
and collapsing them would lose the case the chapter was written around: a gate
that was configured but never loaded.

## Consequences

The writing cuts against casual usage. People say "the checks are blocking the
merge", and that sentence is now wrong in this chapter. GitHub's own need for
the modifier *required* is the standing argument that the bare noun is
ambiguous.

Nothing enforces this mechanically and nothing should. A check banning
"workflow" would fire on every legitimate reference to a
`.github/workflows/*.yml` file, which is the false positive the enforcement
chapter itself warns gets a guard switched off. The detection layer is review.

The layer facts were not touched. This change adds nouns and four sentences of
consequence to a chapter whose claims were already correct, which is the test of
whether it overreached.
