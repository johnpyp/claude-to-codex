import { cac } from "cac";
import process from "node:process";

import { CliError } from "../core/errors.js";
import type { CliOptions } from "../core/types.js";
import { registerCliOptions, toCliOptions } from "./args.js";
import { buildConversionIntent } from "../convert/plan.js";
import { parseArtifact } from "../discover/parse-frontmatter.js";
import { findArtifacts } from "../discover/find-artifacts.js";
import { summarizePlan } from "../core/report.js";
import { ConversionPlanExecutor } from "../emit/write-files.js";
import { resolveRepoContext } from "../git/repo.js";
import { enforceSafety } from "../git/safety.js";
import { toIntermediateRepresentation } from "../normalize/to-ir.js";

export function createCli() {
  const cli = cac("claude-to-codex");
  const defaultCommand = cli.command(
    "",
    "Convert Claude Code repo artifacts to Codex-native outputs",
  );

  cli
    .usage("claude-to-codex [options]")
    .help()
    .example("claude-to-codex --dry-run --json")
    .example("claude-to-codex --write --dangerous-allow-dirty-git");

  registerCliOptions(defaultCommand).action(async (options: Record<string, unknown>) => {
    await executeCli(toCliOptions(options));
  });

  return cli;
}

export async function executeCli(options: CliOptions): Promise<void> {
  const cwd = process.cwd();
  const repoContext = await resolveRepoContext(cwd, options.rootDir);

  enforceSafety(repoContext, options);

  const sourceArtifacts = await findArtifacts(repoContext.rootDir);
  const parsedArtifacts = await Promise.all(sourceArtifacts.map((artifact) => parseArtifact(artifact)));

  const normalized = toIntermediateRepresentation(repoContext.rootDir, parsedArtifacts);
  const intent = await buildConversionIntent(
    repoContext.rootDir,
    parsedArtifacts,
    normalized.normalizedArtifacts,
    normalized.warnings,
    normalized.droppedBehaviors,
    normalized.approximatedBehaviors,
    normalized.manualFollowUps,
  );

  const executor = new ConversionPlanExecutor();
  const plan = await executor.createPlan(intent, repoContext);
  const execution = await executor.execute(plan, intent, options.write, options.emitReport);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          plan,
          execution,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write(summarizePlan(plan) + "\n");
}

export async function runCli(argv: string[]): Promise<void> {
  const cli = createCli();
  cli.parse(argv, { run: false });

  try {
    await cli.runMatchedCommand();
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(error.message + "\n");
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}
