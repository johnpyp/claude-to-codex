# claude-to-codex

> [!WARNING]
> This project was primarily vibe-coded with GPT-5.4. It works, but review the output before trusting it blindly.

Convert Claude Code repo artifacts into Codex-native equivalents. Run it once to migrate your project's `CLAUDE.md` files, skills, commands, and agent configs to the Codex format.

## What it converts

| Claude Code | Codex | Details |
| --- | --- | --- |
| `CLAUDE.md` | `AGENTS.md` | Content copied with all internal path references rewritten. Works at any directory depth. |
| `CLAUDE.local.md` | `AGENTS.override.md` | Same as above. |
| `.claude/CLAUDE.md` | `.agents/AGENTS.md` | Same as above. |
| `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | Entire skill directory is copied. Binary files preserved verbatim, text files have path references rewritten. YAML frontmatter (`name`, `description`) is preserved. |
| Skill frontmatter `disable-model-invocation: true` | `.agents/skills/<name>/agents/openai.yaml` | Generates a policy file with `allow_implicit_invocation: false`. |
| `.claude/commands/<name>.md` | `.agents/skills/<name>/SKILL.md` | Commands are converted to skills. Nested paths are flattened (e.g. `sub/cmd.md` → `sub-cmd/`). Frontmatter preserved. Commands without frontmatter are skipped with a warning. |
| `.claude/agents/*.md` | `.codex/config.toml` | Central config enabling `multi_agent` and registering all agent roles with descriptions and config file paths. |
| `.claude/agents/<name>.md` | `.codex/agents/<name>.toml` | Per-agent role file with `developer_instructions` (from markdown body), `model`, `model_reasoning_effort`, `sandbox_mode`, and `mcp_servers`. |
| Agent frontmatter `model: opus` | `model = "gpt-5.4"`, `model_reasoning_effort = "high"` | `sonnet` maps to `medium`, `haiku` maps to `low`. |
| Built-in role `Explore` | Role ID `explorer` | Direct mapping. |
| Built-in role `general-purpose` | Role ID `worker` | Approximated — warning emitted. |
| Built-in role `Plan` | Role ID `planner` | Forced to `sandbox_mode = "read-only"`. |
| Agent `permissionMode: plan` | `sandbox_mode = "read-only"` | Direct mapping. |
| Agent `permissionMode: acceptEdits` | _(inherited)_ | Approximated by inheritance — warning emitted. |
| Agent `permissionMode: dontAsk` | _(dropped)_ | Manual `approval_policy` review needed. |
| Agent `permissionMode: bypassPermissions` | _(dropped)_ | Unsupported in Codex. |
| Agent `tools` (no writable tools) | `sandbox_mode = "read-only"` | If allowlist lacks `Edit`/`Write`, inferred as read-only. |
| Agent `disallowedTools` (blocks writable tools) | `sandbox_mode = "read-only"` | Same inference as above. |
| Agent inline `mcpServers` definitions | `[mcp_servers.<name>]` in role TOML | Inline definitions (`command`, `args`, `url`, `env`, etc.) are converted. Name-only references are skipped. |
| Agent `maxTurns` | _(dropped)_ | No Codex equivalent. |
| Agent `skills` (preload) | _(dropped)_ | No Codex equivalent. |
| Agent `hooks` | _(dropped)_ | No Codex equivalent. |
| Agent `memory` | _(dropped)_ | No Codex equivalent. |
| Agent `background` | _(dropped)_ | No Codex equivalent. |
| Agent `isolation` | _(dropped)_ | No Codex equivalent. |
| Path references in all text content | Rewritten | `CLAUDE.md` → `AGENTS.md`, `CLAUDE.local.md` → `AGENTS.override.md`, `.claude/CLAUDE.md` → `.agents/AGENTS.md`, `.claude/skills/` → `.agents/skills/`, `.claude/agents/` → `.codex/config.toml and .codex/agents/`. Exact artifact paths are mapped first, then generic patterns. |
| Symlinked `CLAUDE.md` ↔ `AGENTS.md` | Concrete file | Symlinks pointing at the conversion target are replaced with a concrete file. |

## Usage

The quickest way to run it is with `npx` (or your preferred package runner):

```bash
# Preview what would change (dry-run is the default)
npx claude-to-codex@latest

# Preview with machine-readable output
npx claude-to-codex@latest --json

# Apply changes
npx claude-to-codex@latest --write
```

Works with any Node package runner:

```bash
bunx claude-to-codex@latest --write
pnpm dlx claude-to-codex@latest --write
```

### Options

```
--dry-run                     Plan changes without writing files (default)
--write                       Write the planned changes
--json                        Print machine-readable output
--emit-report                 Write codex-migration-report.json after a successful write
--root-dir <path>             Explicit conversion root
--dangerous-allow-dirty-git   Allow writes when the git worktree has uncommitted changes
--dangerous-no-git-backup     Allow writes without git-backed rollback safety
```

### Migration report

Pass `--emit-report` with `--write` to generate a `codex-migration-report.json` at the repo root. The report includes all discovered source artifacts, normalized mappings, created/overwritten/skipped files, dropped behaviors, approximations, warnings, and manual follow-up items.

## Safety

`claude-to-codex` is cautious by default:

- Runs from the git root automatically; use `--root-dir` to override.
- Refuses to write in a dirty worktree unless you pass `--dangerous-allow-dirty-git`.
- Refuses to write outside a git repo unless you pass `--dangerous-no-git-backup`.
- Never writes to gitignored target paths.
- Skips writing files that are already up to date (content-equal check).
- Leaves unrelated existing Codex outputs in place — it won't delete files it didn't create.

## License

MIT
