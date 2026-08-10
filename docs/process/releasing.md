# Releasing

There is one version number in this repository that anyone outside it can see:
`version` in `.claude-plugin/plugin.json`. Everything below is about keeping it
honest.

## Every merged payload change is a release

There is no release branch and no release day. A payload change lands on `main`
and is immediately what a new installer gets, so **the version moves in the same
pull request as the change**. Batching bumps for later means `main` spends most
of its life claiming to be a version it is not.

`npm run check:version` enforces this and CI runs it as a step in the `Checks`
job. It compares this branch against `main` and fails when the shipped payload
changed and the version did not move forward.

**The payload is:**

| Path | Why |
| --- | --- |
| `.agents/skills/**` | the skill itself, the thing being installed |
| `.claude/skills/**` | the generated mirror, which ships in the same tree |
| `.claude-plugin/plugin.json` | the manifest, including the blurb users read |

**Not the payload**, and so no bump: `docs/`, `scripts/`, `.github/`,
`package.json`, `AGENTS.md`, `CLAUDE.md`, and `.claude-plugin/marketplace.json`.
The marketplace file is the catalogue entry, read before install and not part of
the installed plugin. A check that demands a version bump for a CI tweak is
noise, and noise gets switched off.

## Which digit moves

`MAJOR.MINOR.PATCH`, against what an agent reading the skill will experience.

- **PATCH**: wording, typos, a clearer example, a tightened sentence. The
  workflow the skill describes is unchanged.
- **MINOR**: new guidance, a new reference file, a new section, a new rule that
  agents will now follow. Someone who upgrades gets behaviour they did not have.
- **MAJOR**: a reference file removed or renamed, a renamed skill, a change that
  breaks a repository already wired to the old shape.

Pre-1.0 does not mean the rules are suspended. `0.x` here means the shape is
still moving, not that the number is decorative.

## After the merge: cut the tag

The CLI does this and validates the manifests agree while it does:

```bash
git checkout main && git pull
claude plugin tag . --dry-run     # prints the tag it would create
claude plugin tag . --push        # creates b-fac--v<version> and pushes it
```

Tag from `main` after the squash merge, never from the branch. The tag is what
makes "which commit was 0.2.0" answerable later; nothing else records it.

Publishing anywhere outward (a third-party marketplace, an announcement) is the
owner's call, not a step in this document. See `docs/process/orchestrating.md`.

## `marketplace.json` carries no version, on purpose

This was tested rather than assumed. Adding `"version": "0.9.9"` to the
marketplace entry while `plugin.json` said `0.1.0` produced:

```
⚠ Found 1 warning:

  ❯ plugins[0].version: Entry declares version "0.9.9" but .claude-plugin\plugin.json
    says "0.1.0". At install time, plugin.json wins (calculatePluginVersion
    precedence) — the entry version is silently ignored. Update this entry to "0.1.0".

✘ Validation failed (--strict treats warnings as errors)
```

So the duplicate buys nothing an installer can use, and costs a second place to
forget. Leaving it out is not an oversight. Do not add it.

## When a bump is wrong

If `check:version` demands a bump you do not believe in, the honest answer is
usually that the branch is carrying a payload edit it did not mean to carry,
often a stale `.claude/skills/` mirror. Check `git diff main...HEAD` before
reaching for the version field. Bumping to silence a check is how the number
stops meaning anything, which is the failure this whole document exists to
prevent.
