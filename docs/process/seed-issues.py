#!/usr/bin/env python3
"""Seed a GitHub issue graph: epics, leaf issues, and real sub-issue links.

Run once. Resumable: every created number is recorded in STATE_FILE, so a rerun
after a failure links what exists rather than duplicating half the backlog.

Epics and issues reference each other by KEY, not by number, because numbers do
not exist at authoring time.

    python seed-issues.py --dry-run     # print what would be created
    python seed-issues.py               # create it

Keep this file in the repo afterwards. It documents the original shape of the
work and is the fastest way to seed the next project.
"""

import argparse
import json
import os
import subprocess
import sys

REPO = "BlakeHastings/b-fac"
STATE_FILE = os.path.join(os.path.dirname(__file__), "issues-created.json")

# Appended verbatim to every leaf issue. Linking to the review doc instead of
# inlining this does not work: an agent that has to follow a link to learn what
# done means will sometimes not follow it.
DOD = """
### Definition of done
Per `docs/process/review.md`. Mechanical checks are CI's job (`npm run check`
plus `claude plugin validate`). This issue is done when a reviewer has:

- **Functionality** loaded the skill in a harness and used it, not read it.
  `claude --plugin-dir .` for Claude Code. A green `plugin validate` says the
  JSON parses; a SKILL.md containing only a file path validates perfectly.
- **Code** explained what the change does in their own words without asking the
  author. For prose, that means the paragraph says what it appears to say.
- **Architecture** accounted for new patterns, dependencies and duplication. Any
  new pattern gets a short ADR in `docs/architecture/decisions/`, using the
  number assigned in this issue.
"""

# (key, title, labels, body). Epics carry prose context only: no scope bullets,
# no definition of done. They exist to group and to explain why work exists.
EPICS = [
    (
        "E1",
        "Epic: Harness coverage",
        ["epic", "area:harness"],
        "The README claims every harness except Claude Code is untested, and "
        "that claim is currently true. This epic is about making the table "
        "honest in the other direction: actually running the skill in each "
        "harness and writing down what happened. A confirmation is as valuable "
        "as a bug here, because the whole promise of the repo is portability "
        "and nobody has tested it.",
    ),
    (
        "E2",
        "Epic: Skill effectiveness",
        ["epic", "area:skill"],
        "The loop is supposed to change. An orchestrator running it exactly as "
        "written a month from now has stopped observing. This epic is the "
        "evidence-led side of that: mining real sessions for where the skill "
        "misled an agent or failed to prevent something, and routing each fix "
        "to the cheapest layer that actually holds. Change it when the same "
        "thing has been seen twice, not once.",
    ),
    (
        "E3",
        "Epic: Distribution",
        ["epic", "area:distribution"],
        "Getting the plugin into other people's hands, and keeping it working "
        "once it is there. Versioning, release mechanics, and any decision "
        "about listing it somewhere other people browse.",
    ),
]

# (key, epic_key, title, labels, body). Body gets DOD appended.
ISSUES = [
    (
        "H1",
        "E1",
        "Verify the skill loads and runs in Codex CLI",
        ["area:harness"],
        """Codex reads `.agents/skills/` natively, so this should work from a
plain clone with no glue. Nobody has run it.

### Scope
- Copy `.agents/skills/orchestrated-delivery/` into a scratch repo, open Codex
  there, and confirm the skill is listed and activates.
- Actually use it for something small, such as writing one issue brief. Loading
  is not the same as working.
- Update the support table in `README.md` with what you found, either way.

### Watch out for
- Invocation is `$skill-name` in Codex, not `/skill-name`.
- `~/.codex/skills` is a widely repeated but wrong location. The live docs say
  `.agents/skills`.
- Codex caps loaded context at `project_doc_max_bytes`, 32 KiB by default. The
  skill plus five references may exceed that if it ever reads them eagerly.
- Report a null result honestly. "It works" with no detail is not evidence.

### Not in scope
- Fixing anything you find. File it, unless it is a one-line frontmatter fix.""",
    ),
    (
        "H2",
        "E1",
        "Verify the skill loads and runs in Cursor",
        ["area:harness"],
        """Cursor scans `.agents/skills/`, plus `.claude/skills/` for
back-compat, so both paths in this repo should resolve.

### Scope
- Confirm which of the two Cursor actually picks up when both are present,
  since this repo ships both.
- Use the skill for one small task.
- Update the support table in `README.md`.

### Watch out for
- If Cursor loads BOTH copies it will see the skill twice with identical
  descriptions. That is a real finding and would argue for gitignoring the
  mirror rather than committing it. Say which happened.

### Not in scope
- Cursor `.mdc` rules. This repo deliberately ships no per-harness rule files.""",
    ),
    (
        "H3",
        "E1",
        "Verify the skill loads and runs in VS Code / Copilot",
        ["area:harness"],
        """VS Code scans `.github/skills`, `.claude/skills` and `.agents/skills`.

### Scope
- Confirm it loads, use it once, update the support table.
- Note whether `chat.agentSkillsLocations` needed touching.

### Watch out for
- Copilot reads `AGENTS.md` directly, so do not add
  `.github/copilot-instructions.md` as part of this. Whether that file is worth
  having is H5.

### Not in scope
- Copilot code review configuration.""",
    ),
    (
        "H4",
        "E1",
        "Verify the skill loads and runs in Gemini CLI",
        ["area:harness"],
        """Gemini is the odd one out on invocation and the likeliest to need
work.

### Scope
- Confirm `.gemini/settings.json` in this repo does what it claims for
  `AGENTS.md` pickup.
- Confirm the skill appears under `/skills` and can be enabled.
- Update the support table.

### Watch out for
- Gemini does NOT invoke skills as `/skill-name`. They activate through an
  `activate_skill` tool and are managed with `/skills list|enable|disable`. A
  reviewer expecting a slash command will wrongly conclude it is broken.
- The settings key is nested `context.fileName`, not a flat `contextFileName`.
  The flat form exists only in `gemini-extension.json` and is a common
  mistake.

### Not in scope
- Shipping a `gemini-extension.json`. Decide that separately if the settings
  approach proves insufficient.""",
    ),
    (
        "H5",
        "E1",
        "Decide whether Copilot warrants .github/copilot-instructions.md",
        ["area:harness"],
        """Copilot reads `AGENTS.md`, so a `copilot-instructions.md` would be a
second copy of content we already have. It is not pointless though: that file
is what Copilot uses for PR review and in older IDEs that do not read
`AGENTS.md`.

### Scope
- Establish, from live docs rather than memory, exactly which Copilot surfaces
  read `AGENTS.md` and which read only `copilot-instructions.md`.
- Recommend either a pointer file, a generated copy with a drift check, or
  nothing at all. Say what each costs.
- If the answer is a generated copy, that is a new pattern and needs an ADR.

### Watch out for
- No vendor documents a winner between `AGENTS.md` and
  `copilot-instructions.md` in VS Code; the files are simply combined. Two
  copies of the same guidance being concatenated is a real cost, not a
  theoretical one.

### Not in scope
- Implementing it. This issue produces a recommendation and an ADR.""",
    ),
    (
        "S1",
        "E2",
        "Mine existing orchestrated-delivery sessions for what actually goes wrong",
        ["area:skill", "foundation"],
        """The skill was distilled from one project. Since then it has been run
many times, and those sessions are the only real evidence about where it
misleads an agent or fails to prevent something. This is the highest-value
issue in the backlog and everything else in E2 depends on it.

### Scope
- Locate the session transcripts and say where they are, in the issue, so the
  next person does not repeat the search.
- Read for FAILURES, not for successes: places an agent misread a brief, rebuilt
  a decision already made, merged something it should not have, or where the
  orchestrator had to correct the same thing twice.
- Produce a findings document with one entry per observation, each carrying
  evidence by session and quote rather than a summary.
- Classify each: does the fix belong in CI, a linter, the reading order of a
  brief, a relay, or the skill text?

### Watch out for
- **Change the loop when you have seen a thing twice, not once.** Once is an
  incident. Twice is a property of the system. A findings list that proposes a
  skill edit per incident will bloat the skill and make it worse.
- Auditor-shaped agents die before reporting. Scope this narrowly and write to
  a file incrementally rather than holding findings in context.
- Survivorship bias: the sessions that went well are also evidence, and a
  proposed change that would have broken them is a bad change.

### Not in scope
- Editing the skill. This issue produces findings. The edits are separate
  issues so each can be argued on its own evidence.""",
    ),
    (
        "S2",
        "E2",
        "Add a worked first-run example to the skill",
        ["area:skill"],
        """The skill tells you what a good brief contains and shows one
annotated example. It does not show the first five minutes: taking a repo with
nothing in it and getting to a dispatched agent.

### Scope
- A short walkthrough, as a new reference file, of the setup path the skill's
  own table describes.
- Use this repository as the worked example, since it was built that way and
  the artifacts are public and inspectable.

### Watch out for
- Skill bodies stay under about 500 lines and this belongs in `references/`,
  not in `SKILL.md`. Add one row to the reference table.
- The examples must stay in the municipal permitting domain. See ADR 0002 and
  `npm run check:vocabulary`.
- Do not restate `working-an-issue.md`. If the walkthrough starts duplicating a
  process doc, link instead.

### Not in scope
- A video, or anything that cannot live in version control.""",
    ),
    (
        "D1",
        "E3",
        "Define the release and version-bump process",
        ["area:distribution"],
        """`plugin.json` carries `version` and nothing enforces that it moves
when the payload changes. Installers update against it.

### Scope
- Decide how a release is cut and write it down in `docs/process/`.
- A check that the version changed when `.agents/skills/` did, if that is the
  chosen answer.
- Decide whether `marketplace.json` should carry a duplicate `version`. It
  currently does not, on purpose.

### Watch out for
- Claude Code always uses the `plugin.json` value and `claude plugin validate`
  warns only once the two files DRIFT. Adding the duplicate creates a failure
  mode that does not exist today.
- `claude plugin tag` exists and may do some of this already. Check before
  building.

### Not in scope
- Automated publishing. Manual and understood beats automated and surprising
  at this size.""",
    ),
    (
        "D2",
        "E3",
        "Decide whether to list in a third-party marketplace",
        ["area:distribution", "needs-owner"],
        """Community marketplaces exist that aggregate plugins, and listing
would make this discoverable to people who are not told the repo URL.

### Scope
- Lay out the options, what each requires, and what each commits us to.
- Recommend one, with the cost.

### Watch out for
- This is the owner's call, not the orchestrator's. The repo being public is
  not permission to promote it. See `docs/process/orchestrating.md`.
- Listing invites scrutiny of the examples. Confirm ADR 0002's sanitisation is
  something we are happy to defend before recommending it.

### Not in scope
- Doing it. This issue ends in a recommendation on the issue thread.""",
    ),
]


def run(cmd, dry):
    if dry:
        print("  would run:", " ".join(cmd))
        return ""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout.strip()


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    return {}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def create_issue(title, body, labels, dry):
    cmd = ["gh", "issue", "create", "--repo", REPO, "--title", title, "--body", body]
    for label in labels:
        cmd += ["--label", label]
    url = run(cmd, dry)
    return int(url.rsplit("/", 1)[-1]) if url else 0


def rest_id(number, dry):
    """GitHub's sub-issue API wants the numeric issue *id*, not its number."""
    out = run(["gh", "api", f"repos/{REPO}/issues/{number}", "--jq", ".id"], dry)
    return int(out) if out else 0


def link_sub(parent_number, child_number, dry):
    run(
        [
            "gh", "api", "--method", "POST",
            f"repos/{REPO}/issues/{parent_number}/sub_issues",
            "-F", f"sub_issue_id={rest_id(child_number, dry)}",
        ],
        dry,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    state = load_state()

    print("Epics")
    for key, title, labels, body in EPICS:
        if key in state:
            print(f"  {key} exists as #{state[key]}")
            continue
        number = create_issue(title, body, labels, args.dry_run)
        print(f"  {key} -> #{number}")
        state[key] = number
        save_state(state)

    print("Issues")
    for key, epic_key, title, labels, body in ISSUES:
        if key in state:
            print(f"  {key} exists as #{state[key]}")
            continue
        parent = state.get(epic_key, 0)
        # A plain parent line as well as the API link: it survives API changes
        # and reads fine in a terminal.
        full = body + "\n" + DOD + (f"\n\nParent: #{parent}\n" if parent else "")
        number = create_issue(title, full, labels, args.dry_run)
        print(f"  {key} -> #{number}")
        state[key] = number
        save_state(state)

    print("Linking sub-issues")
    for key, epic_key, *_ in ISSUES:
        link_key = f"link:{key}"
        if link_key in state:
            continue
        parent, child = state.get(epic_key), state.get(key)
        if not parent or not child:
            continue
        link_sub(parent, child, args.dry_run)
        print(f"  #{child} under #{parent}")
        state[link_key] = True
        save_state(state)


if __name__ == "__main__":
    main()
