---
allowed-tools: Bash(gh issue view:*), Bash(gh issue comment:*), Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr list:*), Bash(git checkout:*), Bash(git fetch:*), Bash(git rev-parse:*), Bash(git status:*), Bash(git worktree:*), Bash(git pull:*), Bash(git log:*), Bash(git diff:*), Bash(bun install:*), Bash(bun run fix:*), Bash(bun run check:*), Skill, Task
description: Fix a GitHub issue - resumes existing branch/PR with code review handling, or creates a new branch and opens a PR.
argument-hint: [issue-number] [additional instructions...]
---

Resume or create the issue workflow.
Use `.claude/commands/review.md` before opening a PR.
