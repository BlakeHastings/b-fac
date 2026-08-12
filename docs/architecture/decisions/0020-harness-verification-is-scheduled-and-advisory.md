# 0020. Harness verification runs on a schedule, advisory, and watches its own pins

Status: accepted

Extends ADR 0019, which built the check and deliberately left where it runs
open.

## Context

`tools/harness-verify/` observes four harness CLIs discovering the skill from
`.agents/skills/`, credential-free, with a negative control in the same run. It
was consumed by nothing: no npm script, no CI.

It builds a 2.01 GB image with four CLIs in it, against a `Checks` job whose
every other step finishes in about eleven seconds. That sounds decisive and is
not: measured on a GitHub runner, a cold build plus a full probe is **47
seconds**, 29 of them building. Locally the first build takes minutes, because a
laptop does not have a runner's npm bandwidth. So the honest position is that
putting this on every pull request would be affordable, and the argument against
it has to be made on something other than cost.

That argument is that this repo's own diffs are almost never what breaks harness
discovery. The sentinel name and the canonical layout are already gated by
`check:plugin-load` and `check:sync`. What actually breaks the answer is a
harness changing under us, on the harnesses' release calendar, which is not an
event a pull request can be triggered by. A check re-run on every pull request
that could only have changed on someone else's schedule is ceremony however fast
it is.

Cost still decides the second question. The required check contexts on `main`
are already three copies of one fact — the job `name:`, the `REQUIRED` array in
`scripts/merge-pr.mjs`, and the ruleset — which `docs/process/orchestrating.md`
records as a known cost, and a required context here would also make every merge
wait on a container build.

## Decision

**A second workflow, `harnesses.yml`, on `schedule` and `workflow_dispatch`, not
on `pull_request` generally.** Weekly, Monday 06:17 UTC. The signal it carries
is about the outside world, so it is sampled on a clock rather than on our
commits.

**Neither job is a required check.** They are advisory. A red run means "go and
look", not "this branch may not land", and `merge-pr.mjs` already reports the
merge state as `UNSTABLE` and proceeds when something outside `REQUIRED` is red.
This also means the ruleset is untouched, so no fourth copy of a job name
appears.

**One narrow `pull_request` path filter, on `tools/harness-verify/**`.** A
change to the probe's parsers is the one diff whose correctness nothing else can
judge, and `docs/process/harness-verification.md` asks for exactly that check by
hand on every edit. `docs/process/working-an-issue.md` says a manual check done
every time belongs in CI. An ordinary pull request touches nothing under that
path and never sees this workflow.

**A second job, `check-pins.mjs`, watches the pinned versions age.** Without it
the scheduled run tests the same four binaries for ever and a green means only
that a pin is a pin. It reads the pins out of the `Dockerfile` rather than
restating them, asks the npm registry when each was published, and fails past 90
days. **It measures age, not releases behind.** Measured on 2026-08-12, with
every pin sitting on `latest`, `@openai/codex` already had 65 versions published
after its own `latest` and `opencode-ai` had 28, because both ship prereleases
continuously. A releases-behind check would be red within hours of a bump. The
`codex-cli 0.55.0` pin that made Codex look unverifiable was 275 days old; 90 is
comfortably inside that and still survives ordinary neglect.

## Consequences

A scheduled green notifies nobody, so the pins job failing is the only thing
this arrangement will ever actively tell anyone. That is intended: it is the one
signal that changes over time on its own.

GitHub disables a scheduled workflow after 60 days without a commit to the
repository. If this stops running, that is the likely reason and it is silent
apart from one email.

Advisory means ignorable. A red `Harness discovery` can sit there indefinitely
with nothing refusing anything, which is the price of not spending five minutes
of every pull request on it. The alternative was a required context, and this
repo has already decided what those cost.

`check-pins.mjs` reaches the network, which nothing else in this repo does. It
fails loudly on a bad response rather than shrugging, because a network check
that swallows an error reports green having asked nothing — the exact shape of
the vocabulary check that scanned twelve files and missed the whole payload.
