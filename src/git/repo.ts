import { spawn } from "node:child_process";
import path from "node:path";

import { CliError } from "../core/errors.js";
import type { RepoContext } from "../core/types.js";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

export async function resolveRepoContext(
  cwd: string,
  explicitRootDir?: string,
): Promise<RepoContext> {
  if (explicitRootDir) {
    const rootDir = path.resolve(cwd, explicitRootDir);
    const gitInfo = await inspectGit(rootDir);
    return {
      cwd,
      rootDir,
      rootDirRelativeToCwd: path.relative(cwd, rootDir) || ".",
      gitRoot: gitInfo.gitRoot,
      isGitRepo: gitInfo.isGitRepo,
      isGitRootInvocation: rootDir === gitInfo.gitRoot,
      dirty: gitInfo.dirty,
    };
  }

  const gitInfo = await inspectGit(cwd);
  if (!gitInfo.isGitRepo || !gitInfo.gitRoot) {
    throw new CliError("Not inside a git repository. Pass --root-dir <path> to run outside git.");
  }

  if (path.resolve(cwd) !== gitInfo.gitRoot) {
    throw new CliError(`Run from the git root (${gitInfo.gitRoot}) or pass --root-dir explicitly.`);
  }

  return {
    cwd,
    rootDir: gitInfo.gitRoot,
    rootDirRelativeToCwd: ".",
    gitRoot: gitInfo.gitRoot,
    isGitRepo: true,
    isGitRootInvocation: true,
    dirty: gitInfo.dirty,
  };
}

async function inspectGit(cwd: string): Promise<{
  gitRoot?: string;
  isGitRepo: boolean;
  dirty: boolean;
}> {
  const rootResult = await runCommand("git", ["rev-parse", "--show-toplevel"], cwd);
  if (rootResult.code !== 0) {
    return { isGitRepo: false, dirty: false };
  }

  const gitRoot = path.resolve(rootResult.stdout);
  const statusResult = await runCommand("git", ["status", "--porcelain"], gitRoot);

  return {
    gitRoot,
    isGitRepo: true,
    dirty: statusResult.stdout.length > 0,
  };
}

export async function isGitIgnored(rootDir: string, relativePath: string): Promise<boolean> {
  const result = await runCommand("git", ["check-ignore", "-q", relativePath], rootDir);
  return result.code === 0;
}
