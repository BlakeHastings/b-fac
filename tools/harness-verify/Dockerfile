# The harnesses this repo claims to support, at pinned versions, with no
# credentials anywhere in the image. See docs/process/harness-verification.md.
#
# Versions are pinned rather than floated on `@latest` so that a rebuild tests
# the same thing twice. Bumping one is a deliberate commit, and the version that
# went red is recoverable from git log. The machine this was written on had
# codex-cli 0.55.0 installed, 92 releases behind, with no skills support at all —
# which is exactly the confusion a pin prevents.
FROM node:22-slim

# ripgrep is not needed by the probe, but gemini prints a fallback warning on
# every invocation without it, and a check whose normal output contains a
# warning trains people to ignore its output.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates ripgrep \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
      @openai/codex@0.147.0 \
      @google/gemini-cli@0.55.1 \
      @github/copilot@1.0.79 \
      opencode-ai@1.18.16 \
 && npm cache clean --force

COPY probe.mjs /opt/harness-verify/probe.mjs

# /repo is the read-only mount of the repository under test. The probe copies it
# to a writable /work so it can delete the skill for the negative control.
CMD ["node", "/opt/harness-verify/probe.mjs"]
