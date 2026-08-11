# 0015. No `.github/copilot-instructions.md`; `AGENTS.md` covers the Copilot surfaces this repository meets

Status: accepted

## Context

Copilot reads two kinds of repository instruction file, and not every surface
reads both. Which surface reads which was taken from the vendor's current
support matrix on 2026-08-11, not from memory.

**Source:** <https://docs.github.com/en/copilot/reference/custom-instructions-support>.
That page renders lists per environment; the two entries that matter are, in the
docs' own words, "**Repository-wide** instructions (using the
`.github/copilot-instructions.md` file)" and "**Agent** instructions (using
`AGENTS.md`, `CLAUDE.md` or `GEMINI.md` files)" — some rows carry a narrower
variant, "**Agent** instructions (using an `AGENTS.md` file)". Flattened to the
question this ADR is about:

| Surface | `.github/copilot-instructions.md` | `AGENTS.md` |
| --- | --- | --- |
| github.com — Copilot Chat | yes | **no** |
| github.com — cloud agent | yes | yes |
| github.com — code review | yes | **yes** |
| VS Code — Chat | yes | yes |
| VS Code — cloud agent | yes | yes |
| VS Code — code review | yes | **no** |
| Visual Studio — Chat, code review | yes | **no** |
| JetBrains — Chat, code review | yes | **no** |
| JetBrains — cloud agent | yes | yes |
| Eclipse — Chat | yes | **no** |
| Eclipse — cloud agent | yes | yes |
| Eclipse — code review | none supported | none supported |
| Xcode — Chat, code review | yes | **no** |
| Xcode — cloud agent | yes | yes |
| Copilot CLI | yes | yes |

**This corrects the premise the issue was filed on.** The argument for the file
was that it is "what Copilot uses for PR review". On github.com — where PR
review on this repository would actually happen — the code review row lists
agent instructions, so `AGENTS.md` is read there today. What is genuinely
`copilot-instructions.md`-only is Chat on github.com, and Chat and code review
inside Visual Studio, JetBrains, Eclipse and Xcode: the "older IDEs" half of the
issue is right, the "PR review" half is not.

**Both files are sent when both exist, so a copy is paid for on every request.**
GitHub lists an order — "Personal instructions take the highest priority.
Repository instructions come next, and then organization instructions are
prioritized last. However, all sets of relevant instructions are provided to
Copilot" (<https://docs.github.com/en/copilot/concepts/prompting/response-customization>),
with `.github/copilot-instructions.md` above "**Agent** instructions (for
example, in an `AGENTS.md` file)" inside the repository tier. VS Code documents
no winner at all: "If you have multiple instruction files in your project, VS
Code combines and adds them to the chat context, no specific order is
guaranteed" (<https://code.visualstudio.com/docs/copilot/customization/custom-instructions>).
So the concatenation the issue warned about is real and documented, not
theoretical.

`AGENTS.md` here is 2,905 bytes and deliberately thin, because ADR 0003 took the
ETH Zurich finding that context files raise inference cost by over 20% for a few
points of task success. Sending the same 2,905 bytes twice spends that cost
again and buys nothing.

## Decision

**Add nothing.** `AGENTS.md` stays the single repository instruction file.

The surfaces that would read a `copilot-instructions.md` and not `AGENTS.md` are
Chat on github.com and the IDE surfaces of Visual Studio, JetBrains, Eclipse and
Xcode. This repository is markdown and Node scripts, worked by agents in
worktrees driven from Claude Code; nobody opens it in Xcode. The automated
Copilot surfaces that could plausibly touch a pull request here — code review
and the cloud agent on github.com — already read `AGENTS.md`. The gap is real
and it is empty.

**Rejected: a pointer file** (`.github/copilot-instructions.md` saying "read
`AGENTS.md`"). It costs little in bytes but it makes a third file claim to be
the entry point to this repository's conventions, and it ships to every plugin
installer (ADR 0014). Against that, its benefit is unverifiable: it only pays
off if a surface that cannot see `AGENTS.md` chooses to go and open it, which
the vendor documents nowhere and which nobody here can test on Eclipse or Xcode.
An unverifiable benefit is not worth a new file, and `docs/process/review.md`
says to delete a gate that has never caught anything rather than add one that
never will.

**Rejected: a generated copy with a drift check.** It is the option with a real
mechanism behind it, and it is the most expensive. It adds a second generator
beside `scripts/sync-harnesses.mjs` and a second drift gate — a new pattern, per
lens 3 — and unlike the `.claude/skills/` mirror it has no clone-and-contribute
case to justify it. Worse, the generated copy is not inert: it is *loaded*
alongside the original, so every VS Code chat request in a consuming repository
carries the same guidance twice. Duplication that only costs disk is cheap;
duplication that costs tokens on every request is not.

## Consequences

Someone using Copilot Chat in Visual Studio, JetBrains, Eclipse or Xcode against
this repository gets no repository guidance. That is a soft failure — Copilot
answers from the code instead of from the conventions — and it stops nothing.

The matrix above is a snapshot with a date on it, and Copilot's support has
moved more than once. **Revisit when either of these becomes true:**

- someone actually contributes here from one of those IDEs, which changes the
  gap from theoretical to measured; or
- agent instructions leave the github.com code-review row in the support matrix,
  which removes the reason this decision is safe.

Should either happen, the answer is the pointer file, not the generated copy.
Re-check the matrix at that link before acting rather than trusting this table.
