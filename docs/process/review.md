# Definition of Done and the review process

An issue is done when it passes **three lenses**. Mechanical checks are not one
of the lenses: they are the price of admission, they run in CI, and no human or
agent should spend judgment on them.

> Template. Replace the bracketed parts with this repo's real commands, then
> delete this note.

## Gate 0: mechanical (automated, no judgment)

CI runs these. If they are red, the work is not ready for review.

- typecheck, lint, format
- unit and integration tests
- production build succeeds
- database migrations apply cleanly to an empty database and are reversible

Never ask a reviewer to run these by hand. If a mechanical check is missing,
adding it is cheaper than reviewing for it forever.

## Lens 1: functionality, proven by interaction

**The reviewer drives the running app.** Not the tests, the app.

```bash
[bring up the environment]
[run the end-to-end suite]
```

Run the end-to-end suite first: what it covers, you do not have to re-check.

Then exercise **the change itself** as the actual user would, since no suite
covers what landed today. Confirm:

- the happy path works end to end
- one realistic failure path behaves sanely (bad input, expired link, network drop)
- no console errors, no unhandled promise rejections
- no new error-level logs or failed spans

"Tests pass" is not evidence of functionality. A green suite over an app that
does not load is a common and embarrassing outcome. Say what you actually did
and what you actually saw.

## Lens 2: code quality, proven by comprehension

**The reviewer must be able to explain what the code does without asking the
author.** If they cannot, that is the finding. Unclear code is a defect even
when it is correct.

Specifically reject:

- code whose shape mimics a pattern elsewhere without the reason that motivated it
- abstractions with exactly one caller and no second caller in sight
- names that restate the type (`dataObject`, `handleThing`, `utils`)
- comments explaining *what* a line does rather than *why* it is that way
- swallowed errors, `any`, and suppression directives without an adjacent reason
- defensive code for conditions that cannot occur

Prefer deleting code to adding a flag. The best review outcome is a smaller diff.

## Lens 3: architecture, proven by entropy accounting

Every change either uses an existing pattern or introduces a new one.
**Introducing a new pattern is a decision that must be named and justified**,
not something that happens quietly in a feature PR.

Ask on every change:

1. Does this duplicate something we already have? Search before adding.
2. Does it add a dependency? What did we get, and what does it cost to remove later?
3. Does it put logic in a new layer or a new place? Why is the existing place wrong?
4. Would a new engineer find this where they would look for it?
5. Is the project's single source of truth still single, or did a parallel one
   just get born?

If a change introduces a new pattern deliberately, record it in
`docs/architecture/decisions/` as a short ADR. Three sentences is a fine ADR.
The point is that the decision is findable later, not that it is ceremonious.

Take the next number after everything on the default branch **and** everything
in an open pull request. Work runs in parallel here, so the next free number on
your branch is usually already claimed on someone else's.
`npm run check:collisions` fails a duplicate, and CI runs it on the merge
commit, so a collision that does not exist on your branch yet still turns the PR
red.

## Recording the review

Post the outcome on the issue or PR with these headings. Be specific and honest:

```
## Functionality
What I ran, what I clicked, what I saw. Include failures found.

## Code
What this code does, in my own words. Concerns, if any.

## Architecture
New patterns introduced, dependencies added, duplication found.

## Verdict
Ship / Ship with follow-ups (linked) / Needs work (specific changes)
```

An empty section is a signal the lens was skipped. Say "not applicable, this is
a docs-only change" rather than leaving it blank.

## This process is itself reviewable

If a gate is producing ceremony instead of signal, **change it**. Open an issue
against this document, say which gate wasted effort and what it should be
instead, and edit it. A review process nobody believes in is worse than none,
because it launders unreviewed work as reviewed.

Bias: automate anything mechanical, keep human and agent judgment for the three
lenses, and delete any step that has never once caught a real problem.
