import type { Command } from "cac";

import type { CliOptions } from "../core/types.js";

export function registerCliOptions(target: Command): Command {
  return target
    .option("--dry-run", "Plan changes without writing files")
    .option("--write", "Write the planned changes")
    .option("--json", "Print machine-readable output")
    .option("--emit-report", "Write codex-migration-report.json after a successful write")
    .option("--root-dir <path>", "Explicit conversion root")
    .option(
      "--dangerous-allow-dirty-git",
      "Allow writes when the git worktree has unrelated changes",
    )
    .option(
      "--dangerous-no-git-backup",
      "Allow writes without git-backed rollback safety",
    );
}

export function toCliOptions(options: Record<string, unknown>): CliOptions {
  return {
    dryRun: Boolean(options.dryRun) || !Boolean(options.write),
    write: Boolean(options.write),
    json: Boolean(options.json),
    emitReport: Boolean(options.emitReport),
    rootDir: typeof options.rootDir === "string" ? options.rootDir : undefined,
    dangerousAllowDirtyGit: Boolean(options.dangerousAllowDirtyGit),
    dangerousNoGitBackup: Boolean(options.dangerousNoGitBackup),
  };
}
