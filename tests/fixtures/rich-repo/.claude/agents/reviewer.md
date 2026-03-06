---
name: reviewer
description: Review code for regressions.
model: sonnet
disallowedTools: Edit, Write
mcpServers:
  docs:
    url: https://example.com/mcp
    bearer_token_env_var: DOCS_TOKEN
---

Review code like an owner.
Use `CLAUDE.md` and `.claude/skills/release/SKILL.md` for context.
