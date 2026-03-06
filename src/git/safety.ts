import { CliError } from "../core/errors.js";
import type { CliOptions, RepoContext } from "../core/types.js";

export function enforceSafety(context: RepoContext, options: CliOptions): void {
  if (!options.write) {
    return;
  }

  if (!context.isGitRepo && !options.dangerousNoGitBackup) {
    throw new CliError("Writing outside a git repository requires --dangerous-no-git-backup.");
  }

  if (context.isGitRepo && context.dirty && !options.dangerousAllowDirtyGit) {
    throw new CliError("Writing in a dirty git worktree requires --dangerous-allow-dirty-git.");
  }
}
