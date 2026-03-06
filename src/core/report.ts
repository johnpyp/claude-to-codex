import type {
  ConversionIntent,
  ConversionPlan,
  ConversionPlanOperation,
  ExecutionResult,
} from "./types.js";

export interface MigrationReport {
  rootDir: string;
  discoveredSourceArtifacts: string[];
  normalizedArtifacts: Array<{ kind: string; sourcePath: string }>;
  emittedTargetArtifacts: Array<{ path: string; operation: string }>;
  skippedFiles: Array<{ path: string; reason: string }>;
  infos: ConversionPlan["infos"];
  droppedBehaviors: ConversionPlan["droppedBehaviors"];
  approximatedBehaviors: ConversionPlan["approximatedBehaviors"];
  warnings: ConversionPlan["warnings"];
  manualFollowUps: string[];
  execution?: ExecutionResult;
}

export function buildMigrationReport(
  intent: ConversionIntent,
  plan: ConversionPlan,
  execution?: ExecutionResult,
): MigrationReport {
  return {
    rootDir: intent.rootDir,
    discoveredSourceArtifacts: intent.sourceArtifacts.map((artifact) => artifact.relativePath),
    normalizedArtifacts: intent.normalizedArtifacts.map((artifact) => ({
      kind: artifact.kind,
      sourcePath: artifact.source.relativePath,
    })),
    emittedTargetArtifacts: plan.operations
      .filter((operation) => operation.type !== "skip")
      .map((operation) => ({
        path: operation.relativePath,
        operation: operation.type,
      })),
    skippedFiles: plan.operations
      .filter((operation) => operation.type === "skip")
      .map((operation) => ({
        path: operation.relativePath,
        reason: operation.reason ?? "skipped",
      })),
    infos: plan.infos,
    droppedBehaviors: plan.droppedBehaviors,
    approximatedBehaviors: plan.approximatedBehaviors,
    warnings: plan.warnings,
    manualFollowUps: plan.manualFollowUps,
    execution,
  };
}

export function summarizePlan(plan: ConversionPlan): string {
  const lines = [
    `Root: ${plan.rootDir}`,
    `Operations: create=${plan.summary.create}, overwrite=${plan.summary.overwrite}, skip=${plan.summary.skip}`,
  ];

  const notable = collectNotableOperations(plan.operations);
  if (notable.length > 0) {
    lines.push("Planned changes:");
    lines.push(...notable.map((line) => `- ${line}`));
  }

  if (plan.infos.length > 0) {
    lines.push("Info:");
    lines.push(...plan.infos.map((info) => `- ${info.message}`));
  }

  if (plan.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...plan.warnings.map((warning) => `- ${warning.message}`));
  }

  return lines.join("\n");
}

function collectNotableOperations(operations: ConversionPlanOperation[]): string[] {
  return operations
    .filter((operation) => operation.type !== "skip")
    .map((operation) => `${operation.type} ${operation.relativePath}`);
}
