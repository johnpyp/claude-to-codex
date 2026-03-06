---
name: planner
description: Research the codebase before implementation.
tools: Read, Grep, Glob
model: haiku
permissionMode: plan
maxTurns: 6
skills:
  - release
memory: project
background: true
isolation: worktree
hooks:
  post-task: echo done
mcpServers:
  - sharedDocs
---

Map the codebase without editing files.
