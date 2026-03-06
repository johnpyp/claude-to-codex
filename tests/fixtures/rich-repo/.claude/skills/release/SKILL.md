---
name: release
description: Run the project release workflow.
argument-hint: "[version]"
disable-model-invocation: true
allowed-tools: Read, Bash
model: sonnet
context: fork
agent: Explore
hooks:
  post-run: echo done
---

Use `CLAUDE.md` for the high level workflow.
Read `.claude/skills/release/references/checklist.md` before starting.
If you need a reviewer, see `.claude/agents/reviewer.md`.
Do not rewrite `.claude/rules/testing.md`.
Run `${CLAUDE_SKILL_DIR}/scripts/release.sh` with `$ARGUMENTS`.
