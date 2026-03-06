import path from "node:path";

import type {
  NormalizedArtifact,
  NormalizedClaudeDoc,
  NormalizedCommand,
  NormalizedSkill,
  ParsedArtifact,
} from "../core/types.js";
import { normalizeIdentifier } from "../utils/text.js";
import type { ParsedSkillLikeFrontmatter } from "./schemas.js";
import { parseSkillLikeFrontmatter } from "./schemas.js";
import { normalizeAgent } from "./validate-ir.js";

export function toIntermediateRepresentation(
  rootDir: string,
  parsedArtifacts: ParsedArtifact[],
): {
  normalizedArtifacts: NormalizedArtifact[];
  warnings: Array<{ code: string; message: string; sourcePath?: string }>;
  droppedBehaviors: Array<{ code: string; message: string; sourcePath?: string }>;
  approximatedBehaviors: Array<{ code: string; message: string; sourcePath?: string }>;
  manualFollowUps: string[];
} {
  const normalizedArtifacts: NormalizedArtifact[] = [];
  const warnings: Array<{ code: string; message: string; sourcePath?: string }> = [];
  const droppedBehaviors: Array<{ code: string; message: string; sourcePath?: string }> = [];
  const approximatedBehaviors: Array<{ code: string; message: string; sourcePath?: string }> = [];
  const manualFollowUps = new Set<string>();

  for (const artifact of parsedArtifacts) {
    artifact.frontmatterIssues.forEach((item) => warnings.push(item));

    if (
      artifact.kind === "claude-md" ||
      artifact.kind === "claude-local-md" ||
      artifact.kind === "claude-hidden-md"
    ) {
      normalizedArtifacts.push(normalizeClaudeDoc(rootDir, artifact));
      continue;
    }

    if (artifact.kind === "skill") {
      const parsedFrontmatter = parseSkillLikeFrontmatter(
        artifact.frontmatter,
        artifact.relativePath,
      );
      parsedFrontmatter.issues.forEach((item) => warnings.push(item));
      normalizedArtifacts.push(normalizeSkill(rootDir, artifact, parsedFrontmatter));
      continue;
    }

    if (artifact.kind === "command") {
      if (!artifact.hasFrontmatter) {
        warnings.push({
          code: "command-frontmatter-missing",
          message: `${artifact.relativePath}: skipped because legacy command frontmatter is missing and the new skill frontmatter cannot be inferred.`,
          sourcePath: artifact.relativePath,
        });
        continue;
      }

      const parsedFrontmatter = parseSkillLikeFrontmatter(
        artifact.frontmatter,
        artifact.relativePath,
      );
      parsedFrontmatter.issues.forEach((item) => warnings.push(item));
      normalizedArtifacts.push(normalizeCommand(rootDir, artifact, parsedFrontmatter));
      continue;
    }

    const normalizedAgent = normalizeAgent(rootDir, artifact);
    normalizedArtifacts.push(normalizedAgent);
    normalizedAgent.warnings.forEach((item) => warnings.push(item));
    normalizedAgent.droppedBehaviors.forEach((item) => {
      droppedBehaviors.push(item);
      manualFollowUps.add(item.message);
    });
    normalizedAgent.approximatedBehaviors.forEach((item) => approximatedBehaviors.push(item));
  }

  return {
    normalizedArtifacts,
    warnings,
    droppedBehaviors,
    approximatedBehaviors,
    manualFollowUps: [...manualFollowUps].sort(),
  };
}

function normalizeClaudeDoc(rootDir: string, artifact: ParsedArtifact): NormalizedClaudeDoc {
  let targetAbsolutePath: string;

  if (artifact.kind === "claude-hidden-md") {
    targetAbsolutePath = path.join(artifact.scopeDir, ".agents", "AGENTS.md");
  } else if (artifact.kind === "claude-local-md") {
    targetAbsolutePath = path.join(path.dirname(artifact.absolutePath), "AGENTS.override.md");
  } else {
    targetAbsolutePath = path.join(path.dirname(artifact.absolutePath), "AGENTS.md");
  }

  return {
    kind: "claude-doc",
    source: artifact,
    targetAbsolutePath,
    targetRelativePath: path.relative(rootDir, targetAbsolutePath) || ".",
  };
}

function normalizeSkill(
  rootDir: string,
  artifact: ParsedArtifact,
  parsedFrontmatter: ParsedSkillLikeFrontmatter,
): NormalizedSkill {
  const sourceDirAbsolutePath = path.dirname(artifact.absolutePath);
  const skillRootAbsolutePath = path.join(artifact.scopeDir, ".agents", "skills");
  const sourceDirRelativeToSkills = path.relative(
    path.join(artifact.scopeDir, ".claude", "skills"),
    sourceDirAbsolutePath,
  );
  const targetDirAbsolutePath = path.join(skillRootAbsolutePath, sourceDirRelativeToSkills);
  const fallbackName = normalizeIdentifier(path.basename(sourceDirAbsolutePath), "skill");

  return {
    kind: "skill",
    source: artifact,
    sourceDirAbsolutePath,
    sourceDirRelativePath: path.relative(rootDir, sourceDirAbsolutePath),
    targetDirAbsolutePath,
    targetDirRelativePath: path.relative(rootDir, targetDirAbsolutePath),
    skillName: parsedFrontmatter.name ?? fallbackName,
  };
}

function normalizeCommand(
  rootDir: string,
  artifact: ParsedArtifact,
  parsedFrontmatter: ParsedSkillLikeFrontmatter,
): NormalizedCommand {
  const commandRelativePath = path.relative(
    path.join(artifact.scopeDir, ".claude", "commands"),
    artifact.absolutePath,
  );
  const commandBase = commandRelativePath.replace(/\.md$/i, "");
  const skillDirName = normalizeIdentifier(commandBase.replace(/[\\/]+/g, "-"), "command");
  const targetDirAbsolutePath = path.join(artifact.scopeDir, ".agents", "skills", skillDirName);

  return {
    kind: "command",
    source: artifact,
    targetDirAbsolutePath,
    targetDirRelativePath: path.relative(rootDir, targetDirAbsolutePath),
    skillName: parsedFrontmatter.name ?? skillDirName,
  };
}
