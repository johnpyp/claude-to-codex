import path from "node:path";

import { buildMigrationReport } from "../core/report.js";
import type {
  ConversionIntent,
  ConversionPlan,
  ConversionPlanOperation,
  ExecutionResult,
  GeneratedFile,
  ReportItem,
  RepoContext,
} from "../core/types.js";
import { isGitIgnored } from "../git/repo.js";
import {
  bytesEqual,
  ensureParentDir,
  isSymlinkPath,
  pathExists,
  readBytes,
  readUtf8,
  writeBytes,
  writeUtf8,
} from "../utils/fs.js";

export class ConversionPlanExecutor {
  async createPlan(intent: ConversionIntent, context: RepoContext): Promise<ConversionPlan> {
    const operations: ConversionPlanOperation[] = [];
    const planInfos: ReportItem[] = [];
    const planWarnings = [...intent.warnings];

    for (const file of intent.generatedFiles) {
      operations.push(await this.planGeneratedFile(file, context, planInfos, planWarnings));
    }

    operations.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return {
      rootDir: intent.rootDir,
      sourceArtifacts: intent.sourceArtifacts,
      normalizedArtifacts: intent.normalizedArtifacts,
      operations,
      infos: planInfos,
      droppedBehaviors: intent.droppedBehaviors,
      approximatedBehaviors: intent.approximatedBehaviors,
      warnings: planWarnings,
      manualFollowUps: intent.manualFollowUps,
      summary: {
        create: operations.filter((operation) => operation.type === "create").length,
        overwrite: operations.filter((operation) => operation.type === "overwrite").length,
        skip: operations.filter((operation) => operation.type === "skip").length,
      },
    };
  }

  async execute(
    plan: ConversionPlan,
    intent: ConversionIntent,
    write: boolean,
    emitReport: boolean,
  ): Promise<ExecutionResult | undefined> {
    if (!write) {
      return undefined;
    }

    const result: ExecutionResult = {
      created: [],
      overwritten: [],
      skipped: [],
    };

    for (const operation of plan.operations) {
      if (operation.type === "skip") {
        result.skipped.push(operation.relativePath);
        continue;
      }

      await ensureParentDir(operation.absolutePath);
      await this.writeOperation(operation);

      if (operation.type === "create") {
        result.created.push(operation.relativePath);
      } else {
        result.overwritten.push(operation.relativePath);
      }
    }

    if (emitReport) {
      const reportPath = path.join(plan.rootDir, "codex-migration-report.json");
      const report = buildMigrationReport(intent, plan, result);
      await writeUtf8(reportPath, JSON.stringify(report, null, 2) + "\n");
      result.reportPath = path.relative(plan.rootDir, reportPath);
    }

    return result;
  }

  private async planGeneratedFile(
    file: GeneratedFile,
    context: RepoContext,
    planInfos: ReportItem[],
    planWarnings: ReportItem[],
  ): Promise<ConversionPlanOperation> {
    if (context.isGitRepo && (await isGitIgnored(context.rootDir, file.relativePath))) {
      const warning = {
        code: "gitignored-target",
        message: `${file.relativePath} is gitignored and was left untouched.`,
        targetPath: file.relativePath,
      };
      planWarnings.push(warning);

      return {
        type: "skip",
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        generator: file.generator,
        sourcePaths: file.sourcePaths,
        reason: "target is gitignored",
        infos: [],
        warnings: [warning],
      };
    }

    const targetIsSymlink = await isSymlinkPath(file.absolutePath);
    const alreadyHasUnsymlinkInfo = file.infos.some((info) => info.code === "unsymlink-path");
    const unsymlinkInfo = targetIsSymlink
      && !alreadyHasUnsymlinkInfo
      ? [
          {
            code: "unsymlink-path",
            message: `${file.relativePath}: symlink will be replaced with a concrete file.`,
            targetPath: file.relativePath,
          } satisfies ReportItem,
        ]
      : [];

    if (!(await pathExists(file.absolutePath))) {
      planInfos.push(...file.infos, ...unsymlinkInfo);
      return {
        type: "create",
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        generator: file.generator,
        content: file.content,
        encoding: file.encoding,
        sourcePaths: file.sourcePaths,
        infos: [...file.infos, ...unsymlinkInfo],
        warnings: [],
      };
    }

    if (await this.hasMatchingContent(file) && !targetIsSymlink) {
      return {
        type: "skip",
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        generator: file.generator,
        sourcePaths: file.sourcePaths,
        reason: "already up to date",
        infos: [],
        warnings: [],
      };
    }

    planInfos.push(...file.infos, ...unsymlinkInfo);
    return {
      type: "overwrite",
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      generator: file.generator,
      content: file.content,
      encoding: file.encoding,
      sourcePaths: file.sourcePaths,
      infos: [...file.infos, ...unsymlinkInfo],
      warnings: [],
    };
  }

  private async hasMatchingContent(file: GeneratedFile): Promise<boolean> {
    if (file.encoding === "utf8") {
      return typeof file.content === "string"
        && (await readUtf8(file.absolutePath)) === file.content;
    }

    return file.content instanceof Uint8Array
      && bytesEqual(await readBytes(file.absolutePath), file.content);
  }

  private async writeOperation(operation: ConversionPlanOperation): Promise<void> {
    if (operation.encoding === "binary") {
      await writeBytes(
        operation.absolutePath,
        operation.content instanceof Uint8Array ? operation.content : new Uint8Array(),
      );
      return;
    }

    await writeUtf8(
      operation.absolutePath,
      typeof operation.content === "string" ? operation.content : "",
    );
  }
}
