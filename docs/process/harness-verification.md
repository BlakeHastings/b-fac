# Verifying the skill in harnesses other than Claude Code

`scripts/check-plugin-load.mjs` proves the Claude Code loader finds this repo's
skill. ADR 0003 stakes the whole layout on the claim that roughly forty other
harnesses read `.agents/skills/` from a plain clone with no glue. That claim was
research. This is the observation.

```bash
npm run check:harnesses
```

It builds a container with four harness CLIs at pinned versions, mounts the
repository read-only, and asks each one what it discovered. Green looks like
this:

```
  codex     b-fac:orchestrated-delivery  orchestrated-delivery/SKILL.md  body not reported
  gemini    orchestrated-delivery        orchestrated-delivery/SKILL.md  body not reported
  copilot   orchestrated-delivery        orchestrated-delivery           body not reported
  opencode  orchestrated-delivery        orchestrated-delivery/SKILL.md  14447 bytes

4 harnesses discovered orchestrated-delivery under .agents/skills/ with no credentials,
and none of them still saw it once the skill trees were deleted.
```

The first build installs four CLIs and takes a few minutes. Later runs are
seconds. Docker is required and there is no host fallback, deliberately: see
"Why a container" below.

## The asymmetry this rests on

Every harness here has two ways to be asked about a skill. Running it costs
credentials. Asking it what it discovered does not, because discovery happens
against the filesystem before any model is contacted.

| Harness | Credential-free discovery | Runs inference, needs auth |
| --- | --- | --- |
| Codex CLI | `codex debug prompt-input` | `codex exec` |
| Gemini CLI | `gemini skills list` | `gemini -p` |
| Copilot CLI | `copilot skill list --json` | `copilot -p` |
| opencode | `opencode debug skill` | `opencode run` |

This is the same asymmetry `check-plugin-load.mjs` is built on, where
`claude plugin details` answers freely and `claude -p` does not. Without it a
container would not help at all, because auth inside a container is still auth.

Codex's is the strongest of the four. `codex debug prompt-input` renders the
model-visible prompt as JSON, skills block included, so it does not answer "the
CLI can enumerate a directory" but "this is the text the model would have
received".

Gemini's needs one piece of setup. It skips project skills in an untrusted
folder and says so on stderr rather than failing, so without a trust entry the
probe would get a confident, clean, wrong "no skills discovered". The probe
writes `/root/.gemini/trustedFolders.json` inside the container. The documented
alternative, `--skip-trust`, is not usable: it routes through a code path that
demands `GEMINI_API_KEY` before it will list anything.

## What this does not cover

**Cursor.** Not testable this way. Cursor is a GUI editor with no headless mode,
and its official CLI, `cursor-agent`, has no skills surface at all: its
subcommands are `mcp`, `plugin`, `worker`, `status`, `models`, `bedrock`,
`about`, `update`, `create-chat`, `generate-rule`, `agent`, `ls` and `resume`.
There is nothing to ask. Verifying Cursor means a human opening the editor.

**The VS Code extension.** Also not testable this way, for the same reason. What
is covered is the Copilot CLI, which documents the same discovery roots the
extension uses (`.github/skills/`, `.agents/skills/`, `.claude/skills/`), so it
is good evidence about the roots and no evidence about the editor.

**Whether the model picks the skill,** or whether the prose is any good. A
loader finding a file is not an agent choosing to read it.

**Whether the body loaded, for three of the four.** Only opencode reports the
skill text it is holding, so only opencode gets a size floor. Proven rather than
assumed: against a `SKILL.md` cut down to its frontmatter and one line, codex,
gemini and copilot each reported it exactly as they report the real skill, while
opencode reported 31 bytes and went red.

## Why a container

Two reasons, and the second is the one that matters.

The harnesses are not installed on most machines, and installing four CLIs
globally to run a check is not a reasonable ask.

More importantly, a developer machine is the worst possible place to test
discovery. The machine this was written on has 53 skills across
`~/.claude/skills` and `~/.agents/skills`, every one of which these harnesses
also load, so "the skill was found" there says nothing about the repository. In
the container the only skills on disk are the harnesses' own built-ins and this
repo's. This is the same class of problem as the shadowing check in
`check-plugin-load.mjs`: the expensive way to be wrong is a green that came from
somewhere other than the thing under test.

## It cannot silently stop checking

Every run probes twice. Once against the repository, once against the same tree
with `.agents/skills/` and `.claude/skills/` deleted. The sentinel must be in the
first answer and out of the second.

That control is built in rather than left to whoever remembers to try it,
because this repo has already shipped a check that scanned nothing and reported
green for twelve files. `docs/process/orchestrating.md` tells that story. A
parser that has quietly stopped matching fails the first assertion; a probe
reading a stale cache fails the second.

Both skill trees are deleted, not just the canonical one, because a harness that
fell back to the mirror would otherwise keep the control green for the wrong
reason.

## What the harnesses actually did

Findings worth knowing, each one observable by re-running the check.

**Codex namespaces the skill under this repo's plugin manifest.** It reports
`b-fac:orchestrated-delivery`, not the bare name. Moving `.claude-plugin/` aside
turns it back into `orchestrated-delivery`, so the manifest is the cause. A
Codex user who clones this repo invokes `$b-fac:orchestrated-delivery`. This is
the same trap ADR 0012 documented for Claude Code, in a second harness.

**Codex and Gemini never read `.claude/skills/`.** With the canonical tree
removed and only the mirror left, both reported nothing at all, while Copilot
and opencode resolved the mirror. The mirror really is Claude-only plus those
two.

**Nothing double-loads.** All four see both trees in a normal checkout and each
reported the skill exactly once. The concern in issue #7, that a harness
scanning both paths would see one skill twice with identical descriptions, does
not happen here.

## Adding a harness

Add an entry to `HARNESSES` in `tools/harness-verify/probe.mjs` with a `probe`
that returns `{ name, description, path, body }` per discovered skill, install
the CLI at a pinned version in the `Dockerfile`, and add a `setup` if the
harness needs coaxing the way Gemini does. `body` is null wherever the harness
does not report the loaded text. Nothing in `verify.mjs` needs touching: it
judges whatever the probe reports.

Before trusting a new entry, delete the skill from a scratch copy of the repo
and confirm it goes red. A probe whose parser matches nothing looks exactly like
a harness that found nothing, and both look exactly like a passing check if you
only ever run it against a healthy tree.

## Pinned versions, and noticing when they rot

The `Dockerfile` pins every CLI. A rebuild tests the same thing twice, and a
version that went red is recoverable from the log. Bumping one is a deliberate
commit, and the commit that bumps it should carry a `npm run check:harnesses`
run in its pull request body.

This is worth a section because of how the work started. The machine this was
written on had `codex-cli 0.55.0` installed, with no skills support in the
binary at all, and it was reasonable to conclude from that that Codex could not
be verified. 0.147.0 has the best discovery surface of the four. Check the
version before concluding a harness cannot do something.

The cost of pinning is that `check:harnesses` cannot notice the pins going
stale: that is what a pin is for. So the pins get their own check, which needs
no Docker and takes seconds:

```bash
npm run check:harness-pins
```

It reads the versions out of the `Dockerfile` rather than restating them, asks
the npm registry when each was published, prints the pin against today's
`latest`, and fails when a pin passes 90 days old. It also fails when a pinned
version is not published at all, which means the image cannot be built, and when
a package in the install block is not pinned, which means someone floated one to
a tag.

**It measures age, not releases behind,** although the 0.55.0 story is usually
told as "92 releases stale". Releases do not survive contact with these
registries. On 2026-08-12, with all four pins sitting exactly on `latest`,
`@openai/codex` had 65 versions published after its own `latest` and
`opencode-ai` had 28, both from continuous prereleases; `opencode-ai` has
published 11,865 versions in total. A releases-behind check would go red within
hours of a bump and stay red. In days, the same 0.55.0 pin was 275 days old,
which is what the 90-day threshold is calibrated against.

## In CI: weekly, and advisory

`.github/workflows/harnesses.yml` runs both checks as two jobs, `Harness
discovery` and `Harness pins`, weekly and on `workflow_dispatch`. **Neither is a
required check**, so a red one does not block a merge; `merge-pr.mjs` reports
the merge state as `UNSTABLE` and proceeds. ADR 0020 has the reasoning, in
short: a 2 GB image on every pull request is disproportionate against an
eleven-second gate, and the thing most likely to break these answers changes on
the harnesses' calendar rather than in our diffs.

The one exception is a pull request touching `tools/harness-verify/**`, which
does run both jobs, because a change to the probe's parsers is the only diff
this check is the sole judge of.

Run it by hand after bumping a pin, or when a harness ships something that
sounds like it touches skill discovery:

```bash
gh workflow run harnesses.yml
```
