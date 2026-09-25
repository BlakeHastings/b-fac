# 0064. A GraphQL merge is read from its query, and an unreadable query is refused

Status: accepted

Issue #210. Builds on ADR 0062 (`ghApiCall` in the stamped region) and ADR 0061
(the reader stamp).

## Context

After #208 the merge guards refused a write to a REST merge endpoint however
the call was spelled. They allowed `gh api graphql -f query='mutation{
mergePullRequest(...)}'`, which merges. Its endpoint is `graphql` and its method
is POST, the same as every GraphQL read, so nothing the guards looked at could
tell the two apart.

The verb is in the `query` field, which `ghApiCall` skipped as a flag's value.
That was right for `-f body=...`, where a comment quoting a merge endpoint must
stay a comment, and it is the reason the GraphQL form got through.

## Decision

**`ghApiCall` returns the fields and `--input` as well.** It is still one
reading in three copies, and the stamp moves. A `-F`/`--field` value starting
with `@` is read from a file by gh, so the reader gives that field's value as
null. `-f` never reads a file.

**The merge guards refuse a GraphQL query that calls a merge mutation.** The
list comes from GitHub's schema, read by introspection on 2026-09-25:
`mergePullRequest`, `enablePullRequestAutoMerge`, `enqueuePullRequest` and
`mergeBranch`. Auto-merge and the merge queue land the pull request later with
nobody present, which is the same act on a delay. `mergeBranch` is the REST
`merges` endpoint that #208 already refuses.

**The query is lexed rather than searched.** Comments and strings are removed,
and a name followed by `:` (an alias) or after `$` (a variable) is not a call.
So a search, an `addComment` body or a comment that names `mergePullRequest` is
allowed. When the text does not lex cleanly, the guard matches the bare word
instead. That covers a string left open and a backslash outside a string, which
is how PowerShell writes `\"`, and where this bash-shaped reader's strings are
not the ones GitHub parses.

**A GraphQL call whose query the guard cannot read is refused.** That is
`-F query=@file`, `@-`, `--input`, and a `$(...)` in the query. The cost was
measured first: no script, doc or skill file in this repository runs `gh api
graphql` at all. The refusal says how to put the query inline, which is always
possible.

**The REST rule also refuses `pulls/<n>/merge-async`.** GitHub's own
description of `mergePullRequest` recommends it, and it is a different path
segment from `merge`, so the rule did not match it.

## Consequences

The guest gate needed no rule change. It already refused every GraphQL call,
reads included, and still does.

A query held in a shell variable, `-f query="$Q"`, is read as the text `$Q` and
allowed. This is the variable case the guard's header already leaves open.
Refusing `$` would refuse every query that uses GraphQL variables.

A merge mutation added to GitHub's schema later is not on the list until
somebody adds it.
