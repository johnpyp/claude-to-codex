import type { GeneratedFile, NormalizedArtifact, NormalizedClaudeDoc, ReportItem } from "../core/types.js";
import { isSymlinkTo } from "../utils/fs.js";

export async function buildUnsymlinkFiles(
  normalizedArtifacts: NormalizedArtifact[],
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  for (const artifact of normalizedArtifacts) {
    if (artifact.kind !== "claude-doc") {
      continue;
    }

    const unsymlinked = await buildDocSourceUnsymlinkFile(artifact);
    if (unsymlinked) {
      files.push(unsymlinked);
    }
  }

  return files;
}

async function buildDocSourceUnsymlinkFile(
  doc: NormalizedClaudeDoc,
): Promise<GeneratedFile | undefined> {
  if (!(await isSymlinkTo(doc.source.absolutePath, doc.targetAbsolutePath))) {
    return undefined;
  }

  const info: ReportItem = {
    code: "unsymlink-path",
    message: `${doc.source.relativePath}: symlink to ${doc.targetRelativePath} will be replaced with a concrete file.`,
    sourcePath: doc.source.relativePath,
    targetPath: doc.targetRelativePath,
  };

  return {
    absolutePath: doc.source.absolutePath,
    relativePath: doc.source.relativePath,
    content: doc.source.rawContent,
    encoding: "utf8",
    sourcePaths: [doc.source.relativePath],
    infos: [info],
    generator: "unsymlink",
  };
}
