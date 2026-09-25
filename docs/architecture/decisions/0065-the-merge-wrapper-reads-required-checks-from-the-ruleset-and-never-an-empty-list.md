# 0065. The merge wrapper reads required checks from the ruleset, and never an empty list

Status: accepted

Issue #205. Amends the `REQUIRED` row of ADR 0063's table.

## Context

Both copies of `merge-pr.mjs` judged a pull request against a hard-coded
`REQUIRED` array. The ruleset on the base branch already holds the same list,
so a job rename had three copies to keep in step: the workflow's `name:`, the
ruleset, and the array. Miss the array and every merge read "never ran".

`gh api repos/{owner}/{repo}/rules/branches/<base>` returns every active rule
on that branch, with the ordinary token. Read for this repository on
2026-09-25, it answered four rules from one ruleset (`deletion`,
`non_fast_forward`, `pull_request`, `required_status_checks`), and the last one
carries `parameters.required_status_checks: [{context: "Checks"}, {context:
"Plugin"}]`.

## Decision

**The wrapper reads the names from the ruleset**: every `context` under every
`required_status_checks` rule for the PR's base, deduplicated, so rules from
several rulesets add up. When that answers, `REQUIRED` is not read.

**`REQUIRED` is the fallback, never an empty list.** It is used when the lookup
fails (a `gh` error, an answer that is not JSON, one that is not a list) and
when the ruleset requires no check at all. The second case matters most: read
literally, a ruleset with no required checks is an empty list, and an empty list
passes every merge. The wrapper says which source it used on every run, and on
a failure prints the `gh` error and the call to rerun.

The asset keeps its placeholders. Where a host has a ruleset naming checks, they
go unread. Everywhere `REQUIRED` is read, they still refuse every merge, and
`check-setup.mjs` still reports them, because the fallback is still the host's
to set.

## Consequences

- A rename now needs the workflow and the ruleset to agree, which GitHub
  demands anyway before it will merge. A stale `REQUIRED` blocks nothing while
  the ruleset answers.
- A ruleset that names the wrong checks is now trusted. It was already the
  control here; the wrapper stops second-guessing it with an older copy.
- One page of 100 rules, not `--paginate`, whose multi-page output is not one
  JSON value.
- A check pinned to an app (`integration_id`) is still matched by name only, as
  before.
- Only a ruleset in active enforcement is measured. Whether the endpoint returns
  rules from a ruleset in `evaluate` mode was not tried.
- `scripts/merge-pr.test.mjs` proves the decisions against a stub that returns
  the response above, and one opt-in test (`MERGE_PR_LIVE=1`) sends the
  ruleset read, and only that call, to GitHub.
