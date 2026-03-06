# claude-to-codex

A Bun-based CLI that converts repo-scoped Claude Code artifacts into Codex-native outputs.

## What it migrates

- `CLAUDE.md` to `AGENTS.md`
- `CLAUDE.local.md` to `AGENTS.override.md`
- `.claude/CLAUDE.md` to `.agents/AGENTS.md`
- `.claude/skills/**` to `.agents/skills/**`
- `.claude/commands/**` to `.agents/skills/**`
- `.claude/agents/**` to `.codex/config.toml` and `agents/*.toml`

`.claude/rules/**` are discovered only indirectly through copied text and are not converted.

## Install

```bash
bun install
```

## Run

Dry-run is the default:

```bash
bun run index.ts --json
```

Write changes:

```bash
bun run index.ts --write
```

Useful flags:

- `--dry-run`
- `--json`
- `--write`
- `--root-dir <path>`
- `--dangerous-allow-dirty-git`
- `--dangerous-no-git-backup`

## Safety model

- Requires git-root invocation by default.
- Requires `--root-dir` to run outside git or from a non-root location.
- Requires `--dangerous-allow-dirty-git` before writing in a dirty worktree.
- Requires `--dangerous-no-git-backup` before writing outside git.
- Never writes to gitignored target paths.
- Leaves unrelated existing Codex outputs in place instead of deleting them.

## Verification

```bash
bun run check
bun test
```
