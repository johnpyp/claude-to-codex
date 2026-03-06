import type {
  ConversionIntent,
  GeneratedFile,
  NormalizedAgent,
  NormalizedArtifact,
  ParsedArtifact,
} from "../core/types.js";
import { convertAgents } from "./agents.js";
import { convertClaudeDoc } from "./claude-md.js";
import { convertCommand } from "./commands.js";
import { convertSkill } from "./skills.js";
import { buildUnsymlinkFiles } from "./unsymlink.js";
import { createClaudeReferenceRewriter } from "../utils/text.js";

export async function buildConversionIntent(
  rootDir: string,
  parsedArtifacts: ParsedArtifact[],
  normalizedArtifacts: NormalizedArtifact[],
  warnings: ConversionIntent["warnings"],
  droppedBehaviors: ConversionIntent["droppedBehaviors"],
  approximatedBehaviors: ConversionIntent["approximatedBehaviors"],
  manualFollowUps: string[],
): Promise<ConversionIntent> {
  const generatedFiles: GeneratedFile[] = [];
  const rewriter = createClaudeReferenceRewriter(normalizedArtifacts);

  for (const artifact of normalizedArtifacts) {
    if (artifact.kind === "claude-doc") {
      generatedFiles.push(convertClaudeDoc(artifact, rewriter));
      continue;
    }

    if (artifact.kind === "skill") {
      generatedFiles.push(...(await convertSkill(artifact, rootDir, rewriter)));
      continue;
    }

    if (artifact.kind === "command") {
      generatedFiles.push(...convertCommand(artifact, rootDir, rewriter));
    }
  }

  const agentsByScope = new Map<string, NormalizedAgent[]>();
  for (const artifact of normalizedArtifacts) {
    if (artifact.kind !== "agent") {
      continue;
    }

    const current = agentsByScope.get(artifact.source.scopeDir) ?? [];
    current.push(artifact);
    agentsByScope.set(artifact.source.scopeDir, current);
  }

  for (const agents of agentsByScope.values()) {
    generatedFiles.push(...convertAgents(agents, rootDir));
  }

  generatedFiles.push(...(await buildUnsymlinkFiles(normalizedArtifacts)));

  const infos = generatedFiles
    .flatMap((file) => file.infos)
    .sort((left, right) => left.message.localeCompare(right.message));

  return {
    rootDir,
    sourceArtifacts: parsedArtifacts,
    normalizedArtifacts,
    generatedFiles,
    infos,
    warnings,
    droppedBehaviors,
    approximatedBehaviors,
    manualFollowUps,
  };
}
