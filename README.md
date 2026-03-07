# claude-to-codex

> [!WARNING]
> This project was primarily vibe-coded with GPT-5.4. It works, but review the output before trusting it blindly.

Convert Claude Code repo artifacts into Codex-native equivalents. Run it once to migrate your project's `CLAUDE.md` files, skills, commands, and agent configs to the Codex format.

## What it converts

- **`CLAUDE.md`** → **`AGENTS.md`** (and `CLAUDE.local.md` → `AGENTS.override.md`, `.claude/CLAUDE.md` → `.agents/AGENTS.md`)
- **`.claude/skills/`** → **`.agents/skills/`** — entire skill directories copied with all supporting files
- **`.claude/commands/`** → **`.agents/skills/`** — commands converted to Codex skills
- **`.claude/agents/`** → **`.codex/config.toml`** + **`.codex/agents/*.toml`** — agent roles, MCP servers, model, sandbox mode
- **Path references** in all text content automatically rewritten to Codex equivalents
- **`disable-model-invocation`** → generates Codex `openai.yaml` policy files
- **Symlinks** between `CLAUDE.md` ↔ `AGENTS.md` replaced with concrete files

## Usage

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

## Details

### Agents

Agent markdown files (`.claude/agents/<name>.md`) are converted into a central `.codex/config.toml` (enabling `multi_agent` and registering all roles) plus per-agent `.codex/agents/<role-id>.toml` files containing `developer_instructions`, `model`, `sandbox_mode`, and `mcp_servers`.

**Converted agent features:**
- Markdown body → `developer_instructions`
- Inline `mcpServers` definitions (`command`, `args`, `url`, `env`, etc.) → `[mcp_servers.<name>]` in role TOML
- `description` → registered in `config.toml`
- Tool restrictions and permission modes → `sandbox_mode` inference (see [Models, Roles & Permissions](#models-roles--permissions))

**Dropped agent features** (no Codex equivalent — warnings emitted):
- `maxTurns`, `skills` (preload), `hooks`, `memory`, `background`, `isolation`
- MCP servers referenced by name only (string array) — concrete config unavailable
- `permissionMode: dontAsk` and `permissionMode: bypassPermissions`

### Paths

All text content (instruction files, skills, commands) is scanned for Claude-specific path references which are rewritten to Codex equivalents:

- `CLAUDE.md` → `AGENTS.md`
- `CLAUDE.local.md` → `AGENTS.override.md`
- `.claude/CLAUDE.md` → `.agents/AGENTS.md`
- `.claude/skills/` → `.agents/skills/`
- `.claude/agents/` → `.codex/config.toml and .codex/agents/`

Exact artifact source-to-target paths are applied first, then generic patterns catch remaining references. Binary files in skill directories are copied verbatim without rewriting.

### Models, Roles & Permissions

**Model mapping:**
- `opus` → `gpt-5.4` with `model_reasoning_effort = "high"`
- `sonnet` → `gpt-5.4` with `model_reasoning_effort = "medium"`
- `haiku` → `gpt-5.4` with `model_reasoning_effort = "low"`

**Built-in role mapping:**
- `Explore` → `explorer`
- `general-purpose` → `worker` (approximated)
- `Plan` → `planner` (forced `read-only` sandbox)

**Permission and sandbox inference:**
- `permissionMode: plan` → `sandbox_mode = "read-only"`
- `permissionMode: acceptEdits` → inherited (approximated)
- `tools` allowlist without `Edit`/`Write` → `sandbox_mode = "read-only"`
- `disallowedTools` blocking `Edit`/`Write` → `sandbox_mode = "read-only"`

## Safety

- Dry-run by default — nothing is written unless you pass `--write`.
- Refuses to write in a dirty worktree unless you pass `--dangerous-allow-dirty-git`.
- Refuses to write outside a git repo unless you pass `--dangerous-no-git-backup`.
- Never writes to gitignored target paths.
- Skips files that are already up to date (content-equal check).
- Never deletes files it didn't create.
- Pass `--emit-report` with `--write` to generate a `codex-migration-report.json` with full details on what was discovered, converted, skipped, dropped, and approximated.

## License

MIT
