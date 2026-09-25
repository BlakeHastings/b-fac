# 0062. `gh api` is read inside the stamped region, and a merge endpoint is refused wherever it sits

Status: accepted

Issue #199. Builds on ADR 0029 (no shared module), ADR 0031 (the reader test)
and ADR 0061 (the reader stamp).

## Context

Each guard worked out a `gh api` call's endpoint for itself, in a function
called `apiEndpoint` that sat outside the marked reader region. There were
three copies. The two merge guards held one version, which returned the first
argument containing a `/`. The guest gate held another, which returned the
first argument of any kind, because it only asked whether that was `graphql`.
No test compared them.

Both versions made the same assumption: every flag before the endpoint takes a
value. `--silent`, `--paginate` and four other flags in `gh api --help` take
none, and a flag like that swallowed the endpoint. `gh api --silent
repos/o/r/pulls/1/merge -X PUT` was allowed by both merge guards, and it
merges. The guest gate worked out the method separately and had its own holes:
it stopped at the first `-X`, while gh uses the last, and it matched whole
tokens, so it missed `-XPUT`.

## Decision

**How a `gh api` call reads is part of the reader region.** `ghApiCall`
returns the call's method and its positional arguments. Every guard calls it,
the region's text test keeps the three copies identical, and the stamp moves
with it. A host that compares stamps is now told its copy is behind.

**The table lists the flags that take a value, taken from `gh api --help` on gh
2.101.0.** Any other flag is treated as taking no value. With that choice, a
flag gh adds later that does take a value leaves its value among the
positional arguments. The worst that value can do is look like a second
endpoint. With the opposite choice, the flag swallows the real endpoint, which
is the #199 hole again.

**The merge rule refuses a call that writes and has a merge endpoint anywhere
among its positional arguments.** It no longer tries to decide which one is the
endpoint. gh accepts exactly one positional, so on a command gh would actually
run, checking all of them is the same as checking the endpoint. The method
comes from gh's rules: the last `-X`/`--method` wins, gh upper-cases it, and a
call with a field or `--input` and no method is a POST. GET, HEAD and OPTIONS
are reads.

## Consequences

A GET of `pulls/<n>/merge` asks whether a pull request is merged. It used to be
refused, and now it is allowed.

The guest gate uses the same reading for its write test and its `graphql` test.
`-XPUT`, `-X GET -X PUT` and `--method GET --silent graphql` are now refused
there. The only newly refused method is one that is none of GET, HEAD, OPTIONS,
POST, PATCH, PUT or DELETE, which no read uses.

A host repository that copies only the region into an older merge guard gets
`ghApiCall` next to an old rule that still calls `apiEndpoint`. The two names do
not collide, so nothing breaks, but the hole stays open until the rule is
replaced too. The asset's rule says so.
