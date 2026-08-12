# 0017. `main` is the release channel, and a tag is not the last step of a merge

Status: accepted

## Context

`docs/process/releasing.md` said two things under one heading. The first,
"Every merged payload change is a release", required the version in
`.claude-plugin/plugin.json` to move in the pull request that changes the
payload. The second, "Tag from `main` after the squash merge", required a tag
per merged payload change. Both were presented as halves of one rule.

One half held perfectly and the other failed three times in a row (#52).

**The version has never once been wrong.** Every payload change that reached
`main` moved the number with it, because `scripts/check-version-bump.mjs` fails
the build otherwise. The whole history is one command:

```
$ git log origin/main -L '/"version":/,+1:.claude-plugin/plugin.json' \
    --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M'

5e2799f 2026-08-11 11:58 Show the first hour of setup as a sequence, not a table (#50)
-  "version": "0.5.0",
+  "version": "0.6.0",
e256f3a 2026-08-11 11:43 An evidence bar names what it forbids, and the setup check names what it cannot see (#47)
-  "version": "0.4.0",
+  "version": "0.5.0",
9f62530 2026-08-11 11:23 Ask the merge wrapper about the merge result, and the version check about now (#43)
-  "version": "0.3.0",
+  "version": "0.4.0",
3d75941 2026-08-11 11:04 Make installing the enforcement layer produce a result (#39)
-  "version": "0.2.0",
+  "version": "0.3.0",
38afb10 2026-08-10 12:00 Make the plugin version move when the payload does (#35)
-  "version": "0.1.0",
+  "version": "0.2.0",
dadeae4 2026-08-09 10:59 Make the skill harness-agnostic and document how to use it
+  "version": "0.1.0",
```

**The tags are two of five.**

```
$ git ls-remote --tags origin
b36a7b1...  refs/tags/b-fac--v0.2.0
38afb10...  refs/tags/b-fac--v0.2.0^{}
d32a157...  refs/tags/b-fac--v0.6.0
5e2799f...  refs/tags/b-fac--v0.6.0^{}
```

Put those next to each other and the failure stops looking like forgetfulness.
`b-fac--v0.2.0` is on `38afb10`, the **last commit on `main` on 10 August**.
`b-fac--v0.6.0` is on `5e2799f`, the **last commit on `main` on 11 August**. The
three that went untagged — 0.3.0, 0.4.0, 0.5.0 — are mid-session, and they lived
for 19, 20 and 15 minutes respectively before the next merge replaced them.

The owner did not skip a step three times. The owner tagged at the end of each
working session, twice out of two, and the document asked for something else.
**The behaviour was consistent and the rule was not.** A rule that is broken
three times in one hour by the person who wrote it, with no consequence anyone
can point to, is evidence about the rule.

### What the tag was said to be for, and whether that is true

`releasing.md` justified it in one sentence: "The tag is what makes 'which
commit was 0.2.0' answerable later; nothing else records it."

The `git log -L` output above is that answer, for all six versions, including
the three with no tag and the one that predates the rule. The version lives in a
tracked file, every change to it is a commit on `main`, and git will replay the
line's history on demand. **Nothing else records it was simply false**, and it
was the only reason the document gave.

What a tag does still buy is a name. The marketplace source schema takes a
`ref` — "Git branch or tag to use (e.g. `main`, `v1.0.0`). Defaults to
repository default branch" — and a 40-character `sha` alongside it. So a
consumer who wants to pin gets a readable handle from a tag and an unreadable
one from the log. That is worth something for a version somebody might name. It
is worth nothing for a version that existed for nineteen minutes and was
superseded by a strict superset, which nobody was told about and nobody could
have been pointed at.

### Why this is not a case for automation

The obvious fix is to make the tag reliable: cut it from `scripts/merge-pr.mjs`,
or check `main` afterwards and report versions that owe one. Both were
considered and both are the wrong shape here.

Tagging from the merge wrapper makes a command named "merge" push a ref to the
remote, and it covers only the path that was already disciplined — the GitHub
UI can merge and the ruleset permits it. A detector on `main` is honest about
being detection rather than prevention, but under the rule as written it would
have reported three owed tags in one hour, all of them for versions the owner
had deliberately not marked. A check whose first three findings are all things
the operator meant to do is a check that gets switched off, and this repository
has already lost one guard that way (`docs/process/orchestrating.md`).

## Decision

**`main` is the release channel, and the version number is the release.** A
payload change lands and is immediately what a new installer gets; `claude
plugin update` compares `plugin.json` and acts on nothing else. That is the
whole publishing mechanism, and it has never failed.

**The version still moves in the pull request that changes the payload.** ADR
0009 stands unchanged, and `check-version-bump.mjs` stays exactly as it is. This
ADR narrows nothing about the bump.

**A tag is not a step in shipping. It marks a version somebody may need to name
from outside.** Cut one when pointing anyone at a specific version, before
anything published outward, or at the end of a run of work as a fixed point to
come back to — which is what actually happened both times a tag exists. Not once
per merge.

**The three gaps are not backfilled.** They were the right versions to leave
unmarked under this rule, and they are the evidence for it under the old one.
Backfilling would produce a tidy list that argues for the rule it disproves,
which is the mistake ADR 0001's appended correction avoided (#40).

**`releasing.md` says how to answer "which commit was 0.5.0" without a tag**, in
place of the sentence claiming nothing could.

**One thing is mechanised, and it is not a gate.** `scripts/merge-pr.mjs` reads
`plugin.json` on the base branch before and after the merge and prints the
version that just became installable when it moved. No tag is created, no ref is
written, nothing can fail because of it. #52's actual complaint is that three
releases happened and *nothing noticed*; removing the tag obligation without
replacing the announcement would answer that complaint by agreeing to keep not
noticing.

## Consequences

The tag list will stay sparse and its gaps stop being defects. Reading it as a
release history is now wrong in a new way: it is a list of versions someone
chose to mark, not a list of versions that shipped. `plugin.json`'s history is
the list of versions that shipped.

The merge wrapper now makes two extra read-only API calls per merge and prints
two or three lines on a payload merge. It swallows their failure: a merge that
succeeded must never be reported as failed because an announcement could not be
assembled.

The GitHub UI still bypasses that announcement, and this ADR accepts it rather
than closing it. Under the old rule the uncovered path meant a missing artifact;
under this one it means a merge that printed nothing, and `git log -L` answers
the question later either way.

**Revisit when any of these changes:**

- Someone outside this repository pins a version, or the plugin is listed
  anywhere that resolves a `ref`. Then tags are load-bearing for consumers
  rather than convenient for the owner, and the cadence question reopens with a
  real user attached.
- Releases stop being minutes apart. The argument here rests on 0.3.0, 0.4.0 and
  0.5.0 being superseded inside twenty minutes. A version that survives a week
  is a version worth naming, and the "end of a run of work" trigger already
  covers it.
- `claude plugin` gains an install path that resolves versions from tags rather
  than from the default branch. Then an untagged version is genuinely
  uninstallable, which today it is not.

**Rejected: tagging automatically from `merge-pr.mjs`.** A command named for
merging that pushes a ref does more than its name says, and the trust cost of
that outlives the convenience. It also covers only the wrapper, and the wrapper
is the path that was already being followed carefully.

**Rejected: a check on `main` that reports untagged versions.** It is the right
shape for the wrong rule. With the cadence corrected there is nothing for it to
find, and a check that reports the intended state as a finding trains people to
ignore it.

**Rejected: keeping the per-merge tag and adding a reminder to
`working-an-issue.md`.** The rule was already written down, by the person who
then broke it three times, an hour after writing it. Another paragraph is the
answer `AGENTS.md` specifically tells the next person not to reach for.
