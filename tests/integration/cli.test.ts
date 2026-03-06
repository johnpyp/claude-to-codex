import { parse as parseToml } from "@iarna/toml";
import { afterAll, describe, expect, it } from "bun:test";
import { cp, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..", "..");
const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "rich-repo");
const tempRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tempRoots.map((target) => rm(target, { recursive: true, force: true })));
});

describe("claude-to-codex CLI", () => {
  it("shows help through cac", async () => {
    const workspace = await createWorkspace({ git: true });
    const result = runCli(workspace, ["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("claude-to-codex");
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("--write");
    expect(result.stdout).toContain("--emit-report");
    expect(result.stdout).toContain("--root-dir");
  });

  it("shows the full non-json plan output", async () => {
    const workspace = await createWorkspace({ git: true });
    const result = runCli(workspace, ["--dry-run"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("create .codex/agents/reviewer.toml");
    expect(result.stdout).toContain("create .codex/agents/builder.toml");
    expect(result.stdout).toContain("create .agents/skills/plain/SKILL.md");
    expect(result.stdout).toContain("overwrite .codex/config.toml");
    expect(result.stdout).toContain("Info:");
    expect(result.stdout).toContain("rewrote Claude path references in AGENTS.md");
    expect(result.stdout).toContain("CLAUDE.md -> AGENTS.md");
    expect(result.stdout).not.toContain(
      "rewrote Claude path references in .agents/skills/plain/SKILL.md",
    );
    expect(result.stdout).toContain("command frontmatter is missing");
  });

  it("plans the full migration in dry-run mode", async () => {
    const workspace = await createWorkspace({ git: true });
    const result = runCli(workspace, ["--dry-run", "--json"]);

    expect(result.status).toBe(0);

    const output = JSON.parse(result.stdout);
    const operationByPath = new Map(
      output.plan.operations.map((operation: { relativePath: string; type: string }) => [
        operation.relativePath,
        operation.type,
      ]),
    );

    expect(operationByPath.get("AGENTS.md")).toBe("overwrite");
    expect(operationByPath.get(".agents/AGENTS.md")).toBe("create");
    expect(operationByPath.get("packages/api/AGENTS.md")).toBe("create");
    expect(operationByPath.get(".agents/skills/release/SKILL.md")).toBe("create");
    expect(operationByPath.get(".agents/skills/issue/SKILL.md")).toBe("create");
    expect(operationByPath.get(".agents/skills/plain/SKILL.md")).toBe("create");
    expect(operationByPath.get(".agents/skills/release/agents/openai.yaml")).toBe("create");
    expect(operationByPath.get(".agents/skills/nested-audit/agents/openai.yaml")).toBe("create");
    expect(operationByPath.get(".codex/agents/invalid.toml")).toBe("create");
    expect(operationByPath.get(".codex/agents/reviewer.toml")).toBe("create");
    expect(operationByPath.has(".agents/skills/no-frontmatter/SKILL.md")).toBeFalse();
    expect(operationByPath.has("agents/stale.toml")).toBeFalse();
    expect(operationByPath.has(".agents/skills/stale/SKILL.md")).toBeFalse();
    const warningCodes = new Set(
      output.plan.warnings.map((warning: { code: string }) => warning.code),
    );
    expect(warningCodes.has("agent-mcp-server-reference")).toBeTrue();
    expect(warningCodes.has("frontmatter-invalid-field")).toBeTrue();
    expect(warningCodes.has("command-frontmatter-missing")).toBeTrue();

    const infoCodes = new Set(output.plan.infos.map((item: { code: string }) => item.code));
    expect(infoCodes.has("claude-reference-rewrite")).toBeTrue();
    const rootRewriteInfo = output.plan.infos.find(
      (item: { targetPath?: string }) => item.targetPath === "AGENTS.md",
    );
    expect(rootRewriteInfo?.details?.replacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "CLAUDE.md",
          to: "AGENTS.md",
        }),
      ]),
    );
    expect(
      output.plan.infos.some(
        (item: { targetPath?: string }) => item.targetPath === ".agents/skills/plain/SKILL.md",
      ),
    ).toBeFalse();

    const droppedCodes = new Set(
      output.plan.droppedBehaviors.map((item: { code: string }) => item.code),
    );
    expect(droppedCodes.has("agent-max-turns")).toBeTrue();
    expect(droppedCodes.has("agent-permission-dont-ask")).toBeTrue();
    expect(droppedCodes.has("agent-permission-bypass")).toBeTrue();

    const approximatedCodes = new Set(
      output.plan.approximatedBehaviors.map((item: { code: string }) => item.code),
    );
    expect(approximatedCodes.has("agent-permission-accept-edits")).toBeTrue();
    expect(approximatedCodes.has("agent-tools-read-only")).toBeTrue();
  });

  it("writes migrated files and emits the report only when requested", async () => {
    const workspace = await createWorkspace({ git: true });
    const dryRunResult = runCli(workspace, ["--dry-run", "--json"]);
    const writeResult = runCli(workspace, ["--write", "--emit-report", "--json"]);

    expect(dryRunResult.status).toBe(0);
    expect(writeResult.status).toBe(0);

    const dryRun = JSON.parse(dryRunResult.stdout);
    const written = JSON.parse(writeResult.stdout);

    expect(
      dryRun.plan.operations.map((operation: { relativePath: string; type: string }) => ({
        path: operation.relativePath,
        type: operation.type,
      })),
    ).toEqual(
      written.plan.operations.map((operation: { relativePath: string; type: string }) => ({
        path: operation.relativePath,
        type: operation.type,
      })),
    );
    expect(written.execution.reportPath).toBe("codex-migration-report.json");

    const rootAgents = await readFile(path.join(workspace, "AGENTS.md"), "utf8");
    expect(rootAgents).toContain("AGENTS.md");
    expect(rootAgents).toContain("AGENTS.override.md");
    expect(rootAgents).toContain(".agents/AGENTS.md");
    expect(rootAgents).toContain(".agents/skills");
    expect(rootAgents).toContain(".codex/agents/reviewer.toml");
    expect(rootAgents).toContain(".claude/rules/testing.md");

    const hiddenAgents = await readFile(path.join(workspace, ".agents", "AGENTS.md"), "utf8");
    expect(hiddenAgents).toContain(".agents/skills/lint-docs/SKILL.md");
    expect(hiddenAgents).toContain(".codex/config.toml and .codex/agents/");

    const releaseSkill = await readFile(
      path.join(workspace, ".agents", "skills", "release", "SKILL.md"),
      "utf8",
    );
    expect(releaseSkill).toContain("disable-model-invocation: true");
    expect(releaseSkill).toContain(".codex/agents/reviewer.toml");
    expect(releaseSkill).toContain("AGENTS.md");
    expect(releaseSkill).toContain(".claude/rules/testing.md");

    const issueSkill = await readFile(
      path.join(workspace, ".agents", "skills", "issue", "SKILL.md"),
      "utf8",
    );
    expect(issueSkill).toContain("argument-hint:");
    expect(issueSkill).toContain("[issue-number] [additional instructions...]");
    expect(issueSkill).toContain("allowed-tools:");

    const openAiYaml = await readFile(
      path.join(workspace, ".agents", "skills", "release", "agents", "openai.yaml"),
      "utf8",
    );
    expect(openAiYaml).toContain("allow_implicit_invocation: false");

    const configToml = parseToml(
      await readFile(path.join(workspace, ".codex", "config.toml"), "utf8"),
    ) as Record<string, any>;
    expect(configToml.features.multi_agent).toBeTrue();
    expect(configToml.agents.max_threads).toBe(10);
    expect(configToml.agents.reviewer.config_file).toBe("agents/reviewer.toml");

    const reviewerToml = parseToml(
      await readFile(path.join(workspace, ".codex", "agents", "reviewer.toml"), "utf8"),
    ) as Record<string, any>;
    expect(reviewerToml.model).toBe("gpt-5.4");
    expect(reviewerToml.model_reasoning_effort).toBe("medium");
    expect(reviewerToml.sandbox_mode).toBe("read-only");
    expect(reviewerToml.mcp_servers.docs.url).toBe("https://example.com/mcp");

    const plannerToml = parseToml(
      await readFile(path.join(workspace, ".codex", "agents", "planner.toml"), "utf8"),
    ) as Record<string, any>;
    expect(plannerToml.model_reasoning_effort).toBe("low");
    expect(plannerToml.sandbox_mode).toBe("read-only");

    const builderToml = parseToml(
      await readFile(path.join(workspace, ".codex", "agents", "builder.toml"), "utf8"),
    ) as Record<string, any>;
    expect(builderToml.model_reasoning_effort).toBe("high");
    expect(builderToml.sandbox_mode).toBeUndefined();

    const invalidToml = parseToml(
      await readFile(path.join(workspace, ".codex", "agents", "invalid.toml"), "utf8"),
    ) as Record<string, any>;
    expect(invalidToml.sandbox_mode).toBe("read-only");

    const report = JSON.parse(
      await readFile(path.join(workspace, "codex-migration-report.json"), "utf8"),
    );
    expect(report.discoveredSourceArtifacts).not.toContain("CLAUDE.local.md");
    expect(report.discoveredSourceArtifacts).toContain(".claude/commands/no-frontmatter.md");
    expect(
      report.infos.some((info: { code: string }) => info.code === "claude-reference-rewrite"),
    ).toBeTrue();
    expect(
      report.infos.some(
        (info: { details?: { replacements?: Array<{ from: string; to: string }> } }) =>
          info.details?.replacements?.some(
            (replacement) => replacement.from === "CLAUDE.md" && replacement.to === "AGENTS.md",
          ) ?? false,
      ),
    ).toBeTrue();
    expect(
      report.infos.some(
        (info: { targetPath?: string }) => info.targetPath === ".agents/skills/plain/SKILL.md",
      ),
    ).toBeFalse();
    expect(
      report.emittedTargetArtifacts.some(
        (item: { path: string }) => item.path === ".agents/skills/no-frontmatter/SKILL.md",
      ),
    ).toBeFalse();
    expect(
      report.warnings.some((warning: { code: string }) => warning.code === "gitignored-target"),
    ).toBeFalse();

    expect(await pathExists(path.join(workspace, "agents", "stale.toml"))).toBeTrue();
    expect(
      await pathExists(path.join(workspace, ".agents", "skills", "stale", "SKILL.md")),
    ).toBeTrue();
  });

  it("does not emit the report by default", async () => {
    const workspace = await createWorkspace({ git: true });
    const writeResult = runCli(workspace, ["--write", "--json"]);

    expect(writeResult.status).toBe(0);

    const written = JSON.parse(writeResult.stdout);
    expect(written.execution.reportPath).toBeUndefined();
    expect(await pathExists(path.join(workspace, "codex-migration-report.json"))).toBeFalse();
  });

  it("unsymlinks paired Claude and Codex docs in both directions", async () => {
    const workspace = await createWorkspace({ git: true });

    await rm(path.join(workspace, "AGENTS.md"), { force: true });
    await symlink("CLAUDE.md", path.join(workspace, "AGENTS.md"));

    const packageClaudePath = path.join(workspace, "packages", "api", "CLAUDE.md");
    const packageAgentsPath = path.join(workspace, "packages", "api", "AGENTS.md");
    await writeFile(packageAgentsPath, await readFile(packageClaudePath, "utf8"), "utf8");
    await rm(packageClaudePath, { force: true });
    await symlink("AGENTS.md", packageClaudePath);

    const dryRun = runCli(workspace, ["--dry-run", "--json"]);
    expect(dryRun.status).toBe(0);

    const plan = JSON.parse(dryRun.stdout).plan;
    const operationByPath = new Map(
      plan.operations.map((operation: { relativePath: string; type: string }) => [
        operation.relativePath,
        operation.type,
      ]),
    );

    expect(operationByPath.get("AGENTS.md")).toBe("overwrite");
    expect(operationByPath.get("packages/api/CLAUDE.md")).toBe("overwrite");
    expect(
      plan.infos.filter((item: { code: string }) => item.code === "unsymlink-path"),
    ).toHaveLength(2);
    expect(
      plan.infos.some(
        (item: { code: string; targetPath?: string; sourcePath?: string }) =>
          item.code === "unsymlink-path" && item.targetPath === "AGENTS.md",
      ),
    ).toBeTrue();
    expect(
      plan.infos.some(
        (item: { code: string; sourcePath?: string }) =>
          item.code === "unsymlink-path" && item.sourcePath === "packages/api/CLAUDE.md",
      ),
    ).toBeTrue();

    const writeResult = runCli(workspace, ["--write", "--dangerous-allow-dirty-git", "--json"]);
    expect(writeResult.status).toBe(0);

    expect((await lstat(path.join(workspace, "AGENTS.md"))).isSymbolicLink()).toBeFalse();
    expect((await lstat(packageClaudePath)).isSymbolicLink()).toBeFalse();
  });

  it("fails when invoked from a git subdirectory without --root-dir", async () => {
    const workspace = await createWorkspace({ git: true });
    const result = runCli(path.join(workspace, "packages", "api"), ["--dry-run"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Run from the git root");
  });

  it("requires explicit root and non-git backup override outside git", async () => {
    const workspace = await createWorkspace({ git: false });
    const withoutRoot = runCli(workspace, ["--dry-run"]);
    expect(withoutRoot.status).toBe(1);
    expect(withoutRoot.stderr).toContain("Pass --root-dir");

    const withoutDangerous = runCli(workspace, ["--root-dir", ".", "--write"]);
    expect(withoutDangerous.status).toBe(1);
    expect(withoutDangerous.stderr).toContain("--dangerous-no-git-backup");

    const withDangerous = runCli(workspace, [
      "--root-dir",
      ".",
      "--write",
      "--dangerous-no-git-backup",
      "--json",
    ]);
    expect(withDangerous.status).toBe(0);
  });

  it("bases write safety on the explicit root", async () => {
    const dirtyCaller = await createWorkspace({ git: true });
    await writeFile(path.join(dirtyCaller, "CLAUDE.md"), "# caller is dirty\n", "utf8");

    const cleanTarget = await createWorkspace({ git: true });
    const cleanTargetWrite = runCli(dirtyCaller, ["--root-dir", cleanTarget, "--write", "--json"]);

    expect(cleanTargetWrite.status).toBe(0);

    const nonGitTarget = await createWorkspace({ git: false });
    const blocked = runCli(cleanTarget, ["--root-dir", nonGitTarget, "--write"]);

    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("--dangerous-no-git-backup");
  });

  it("requires a dirty git override before writing", async () => {
    const workspace = await createWorkspace({ git: true });
    await writeFile(path.join(workspace, "CLAUDE.md"), "# changed\n", "utf8");

    const blocked = runCli(workspace, ["--write"]);
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("--dangerous-allow-dirty-git");

    const allowed = runCli(workspace, ["--write", "--dangerous-allow-dirty-git", "--json"]);
    expect(allowed.status).toBe(0);
  });

  it("preserves binary skill assets", async () => {
    const workspace = await createWorkspace({ git: true });
    const binaryAssetPath = path.join(
      workspace,
      ".claude",
      "skills",
      "release",
      "references",
      "sample.bin",
    );
    const binaryAsset = Uint8Array.from([0, 255, 16, 32, 65, 66, 67]);

    await writeFile(binaryAssetPath, binaryAsset);

    const result = runCli(workspace, ["--write", "--dangerous-allow-dirty-git", "--json"]);
    expect(result.status).toBe(0);

    const copiedAsset = await readFile(
      path.join(workspace, ".agents", "skills", "release", "references", "sample.bin"),
    );
    expect([...copiedAsset]).toEqual([...binaryAsset]);
  });

  it("rewrites command and agent references to their emitted targets", async () => {
    const workspace = await createWorkspace({ git: true });

    await writeFile(
      path.join(workspace, ".claude", "commands", "Review_Docs.md"),
      [
        "---",
        "name: ops-review-docs",
        "description: Review ops docs.",
        "---",
        "",
        "Review docs carefully.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workspace, ".claude", "agents", "platform-guide.md"),
      [
        "---",
        "name: general-purpose",
        "description: Handle platform-wide tasks.",
        "---",
        "",
        "Coordinate platform changes.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workspace, "CLAUDE.md"),
      [
        await readFile(path.join(workspace, "CLAUDE.md"), "utf8"),
        "- Extra command: `.claude/commands/Review_Docs.md`.",
        "- Extra agent: `.claude/agents/platform-guide.md`.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = runCli(workspace, ["--write", "--dangerous-allow-dirty-git", "--json"]);
    expect(result.status).toBe(0);

    const agentsDoc = await readFile(path.join(workspace, "AGENTS.md"), "utf8");
    expect(agentsDoc).toContain(".agents/skills/review-docs/SKILL.md");
    expect(agentsDoc).not.toContain(".agents/skills/Review_Docs/SKILL.md");
    expect(agentsDoc).toContain(".codex/agents/worker.toml");
    expect(agentsDoc).not.toContain(".codex/agents/platform-guide.toml");
  });
});

async function createWorkspace(options: { git: boolean }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "claude-to-codex-"));
  tempRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });

  if (options.git) {
    runChecked("git", ["init"], root);
    runChecked("git", ["config", "user.email", "test@example.com"], root);
    runChecked("git", ["config", "user.name", "Test User"], root);
    runChecked("git", ["config", "commit.gpgsign", "false"], root);
    runChecked("git", ["add", "."], root);
    runChecked("git", ["commit", "-m", "fixture"], root);
  }

  return root;
}

function runCli(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", ["run", path.join(projectRoot, "index.ts"), ...args], {
    cwd,
    env: process.env,
    encoding: "utf8",
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runChecked(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || `Failed: ${command} ${args.join(" ")}`);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await readFile(targetPath, "utf8");
    return true;
  } catch {
    return false;
  }
}
