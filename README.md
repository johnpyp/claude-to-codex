# claude-to-codex

Convert Claude Code repo artifacts into Codex-native equivalents. Run it once to migrate your project's `CLAUDE.md` files, skills, commands, and agent configs to the Codex format.

## What it converts

| Claude Code                | Codex                                        |
| -------------------------- | -------------------------------------------- |
| `CLAUDE.md`                | `AGENTS.md`                                  |
| `CLAUDE.local.md`          | `AGENTS.override.md`                         |
| `.claude/CLAUDE.md`        | `.agents/AGENTS.md`                          |
| `.claude/skills/**`        | `.agents/skills/**`                          |
| `.claude/commands/**`      | `.agents/skills/**`                          |
| `.claude/agents/**`        | `.codex/config.toml` and `agents/*.toml`     |

`.claude/rules/**` are discovered only indirectly through copied text and are not converted.

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

## Safety

`claude-to-codex` is cautious by default:

- Runs from the git root automatically; use `--root-dir` to override.
- Refuses to write in a dirty worktree unless you pass `--dangerous-allow-dirty-git`.
- Refuses to write outside a git repo unless you pass `--dangerous-no-git-backup`.
- Never writes to gitignored target paths.
- Leaves unrelated existing Codex outputs in place — it won't delete files it didn't create.

## License

MIT
