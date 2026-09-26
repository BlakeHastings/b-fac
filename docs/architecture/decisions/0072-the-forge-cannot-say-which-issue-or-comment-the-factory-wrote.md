# 0072. The forge cannot say which issue or comment the factory wrote

Status: accepted

Issue #130. Closes the follow-up ADR 0041 left open, and replaces its last
paragraph. ADR 0021 made the promise, ADR 0041 kept one clause of it, and ADR
0071 (#189) is the neighbouring case where a mark *does* work, which is worth
reading beside this one for why it does not work here.

## Context

`check-outward-writes.mjs` checks *no branch pushed* and leaves *no issue
opened* and *no comment posted* to the operator, because `gh` keeps no local
record of a write. The one route left was to ask the forge what this account
authored, and #130 named four costs of that route (credentials, noise from the
operator's own activity, the window, a network call at publish). Before paying
any of them there is a prior question: **does anything on the forge distinguish
an item the factory created from one the operator created?** If nothing does,
the query is a list of the account's activity, and ADR 0041 already says what a
detection layer that accuses the operator is worth.

This repository is the right place to ask, because it holds both kinds and it
was all written through the same machinery the factory ships.

## What was measured

Every issue, pull request, issue or PR comment, review comment and review in
BlakeHastings/b-fac on 2026-09-25, read-only:

```
gh api --paginate --slurp 'repos/BlakeHastings/b-fac/issues?state=all&per_page=100'
gh api --paginate --slurp 'repos/BlakeHastings/b-fac/issues/comments?per_page=100'
gh api --paginate --slurp 'repos/BlakeHastings/b-fac/pulls/comments?per_page=100'
gh api --paginate --slurp 'repos/BlakeHastings/b-fac/pulls/<n>/reviews?per_page=100'   # each PR
```

and, for each artifact, `user.login`, `author_association`,
`performed_via_github_app`, `labels`, and whether the body contains
`Generated with [Claude Code]`.

| | count | author | `performed_via_github_app` | footer |
| --- | --- | --- | --- | --- |
| issues | 131 | BlakeHastings 130, bhastings-t3 1 | null on all | 4 |
| pull requests | 97 | BlakeHastings 97 | null on all | 28 |
| issue and PR comments | 233 | BlakeHastings 233 | null on all | **0** |
| review comments, reviews | 0 | | | |

**The account.** Every artifact but one was written by the owner's account with
the owner's OAuth token (`gh auth status` shows a `gho_` token, not an app
installation token). The exception, #193, is the owner too, from a second
account signed in on the same machine. So the author field says which of the
operator's accounts was active, and nothing about who or what was driving it.

**App attribution.** `performed_via_github_app` is null on all 461. It is the
only field the forge itself sets that could attribute a write to something
other than a person, and nothing here has ever written through an app.

**Labels.** Issues carry area and state labels (`area:skill`, `needs-owner`,
`bug`, ...). None says who wrote the item, and pull requests carry no labels at
all. A label is also something the writer chooses to add, which is the problem
with the footer below.

**The footer.** It is the only body convention the factory leaves, and it
fails three ways, each measured:

- **It is not on comments.** 0 of 233. Comments are the largest class and one
  of the two clauses in question, so for *no comment posted* there is no mark
  at all to look for.
- **It is not reliable where it does appear.** 0 of the first 69 pull requests
  carry it and 28 of the 49 from #129 on do; 4 of 131 issues (#185 to #188). It
  is text a model is asked to append, not something the forge or `gh` adds, and
  it is dropped often.
- **It marks Claude Code, not the factory.** It comes from Claude Code's own
  attribution, which is a harness default (no `attribution` setting exists in
  the owner's user or project settings) and applies to every session the
  operator starts by hand exactly as it does to an agent. The four footered
  issues also carry a `claude.ai/code/session_...` link, all from one session;
  nothing on the forge says whether that session was dispatched by an
  orchestrator or opened by the operator to file four issues. **An operator who
  also uses Claude Code by hand leaves the same mark**, so a present footer
  cannot separate the two, and an absent one is what the operator typing in a
  browser, a comment, and most agent-written items all look like.

## Decision

**Outcome (b): no mark distinguishes them, and none can be introduced cheaply
enough to be a check.** The *no issue opened* and *no comment posted* clauses
stay the operator's to state, and `check-outward-writes.mjs` gains no remote
half and no fourth state.

**Why introducing a mark does not rescue it.** The two ways to make one are a
convention the factory writes (a footer, a label, a trailer) and a separate
identity (a GitHub App installation token for the factory's writes). Both mark
the writes that go through the route that marks. **In guest mode that route has
no legitimate traffic**: the factory is meant to write nothing on the host's
tracker, so every write this check exists to find is an accident, and an
accident goes out through whatever credential is ambient, which is the
operator's own `gh` login, unmarked. The mark would sit on zero legitimate
items and be absent from the accidental ones, which is to say absent from
everything.

That is exactly the difference from ADR 0071. There, every legitimate landing
goes through `merge-pr.mjs`, so the trailer is on all of them, and **its
absence** is the finding. Here the legitimate count is zero, and the absence of
a mark is what the operator's own work and an accident both look like. A mark
that works by being absent needs a route that is always taken.

The app token has a second cost of its own in a guest repository: installing an
app is an administrative act on somebody else's system, which the operator
usually cannot perform and which guest mode exists to avoid.

## Consequences

**The publish sentence keeps its shape.** Three clauses remain somebody's word,
and now two of them for a measured reason rather than a deferred one. The
reference's guest section says so in one sentence.

**A `--remote` query of "what did this account author" stays unbuilt.** It
would be a list of the operator's activity on the host's tracker, reported as
findings. ADR 0041's rule about one false accusation applies unchanged.

**What would reopen this.** The factory writing through its own identity *and*
the operator's credential being unavailable to it, so that an accidental write
fails rather than going out as the operator. That is a credential-isolation
change to how agents are run, not a check, and it is out of this ADR's scope.
