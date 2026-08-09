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

REPO = "OWNER/NAME"  # SETUP
STATE_FILE = os.path.join(os.path.dirname(__file__), "issues-created.json")

# Appended verbatim to every leaf issue. Linking to the review doc instead of
# inlining this does not work: an agent that has to follow a link to learn what
# done means will sometimes not follow it.
DOD = """
### Definition of done
Per `docs/process/review.md`. Mechanical checks (typecheck, lint, tests, build,
migrations) are CI's job. This issue is done when a reviewer has:

- **Functionality** driven the running app and confirmed the happy path plus one
  realistic failure path, with no console errors and no new error-level logs.
- **Code** explained what the change does in their own words without asking the
  author.
- **Architecture** accounted for new patterns, dependencies and duplication. Any
  new pattern gets a short ADR in `docs/architecture/decisions/`.
"""

# (key, title, labels, body). Epics carry prose context only: no scope bullets,
# no definition of done. They exist to group and to explain why work exists.
EPICS = [
    (
        "E1",
        "Epic: Platform foundations",
        ["epic", "area:platform"],
        "Everything that has to exist before feature work can run in parallel: "
        "the development environment, CI, and the review gates.",
    ),
]

# (key, epic_key, title, labels, body). Body gets DOD appended.
ISSUES = [
    (
        "F1",
        "E1",
        "Set up CI with the mechanical gates",
        ["area:platform", "foundation"],
        """Typecheck, lint, tests and build run on every pull request, so no
reviewer spends judgment on them.

### Scope
- One workflow, one job per independently-failing concern.
- Job names are stable: the merge wrapper matches on them exactly.

### Watch out for
- Collision checks only mean something against the MERGE RESULT. Verify the
  checkout is the merge commit, by actually producing a collision.

### Not in scope
- End-to-end tests on pull requests. That is #N.""",
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


def save_state(state, dry):
    # A dry run must not write state. It records 0 for every key, and because
    # the resume check tests the VALUE rather than the key, a poisoned file
    # turns the real run into a silent no-op that prints "exists as #0" for
    # everything and creates nothing.
    if dry:
        return
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
        if state.get(key):
            print(f"  {key} exists as #{state[key]}")
            continue
        number = create_issue(title, body, labels, args.dry_run)
        print(f"  {key} -> #{number}")
        state[key] = number
        save_state(state, args.dry_run)

    print("Issues")
    for key, epic_key, title, labels, body in ISSUES:
        if state.get(key):
            print(f"  {key} exists as #{state[key]}")
            continue
        parent = state.get(epic_key, 0)
        # A plain parent line as well as the API link: it survives API changes
        # and reads fine in a terminal.
        full = body + "\n" + DOD + (f"\n\nParent: #{parent}\n" if parent else "")
        number = create_issue(title, full, labels, args.dry_run)
        print(f"  {key} -> #{number}")
        state[key] = number
        save_state(state, args.dry_run)

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
        save_state(state, args.dry_run)


if __name__ == "__main__":
    main()
