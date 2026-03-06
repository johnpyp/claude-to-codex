import type { ClaudeReferenceRewriter, GeneratedFile, NormalizedClaudeDoc } from "../core/types.js";
import { buildRewriteInfo } from "./rewrite-info.js";

export function convertClaudeDoc(
  doc: NormalizedClaudeDoc,
  rewriter: ClaudeReferenceRewriter,
): GeneratedFile {
  const rewritten = rewriter.rewrite(doc.source.rawContent);

  return {
    absolutePath: doc.targetAbsolutePath,
    relativePath: doc.targetRelativePath,
    content: rewritten.content,
    encoding: "utf8",
    sourcePaths: [doc.source.relativePath],
    infos: buildRewriteInfo(
      doc.source.relativePath,
      doc.targetRelativePath,
      rewritten.replacements,
    ),
    generator: "claude-doc",
  };
}
