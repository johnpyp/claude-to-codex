import type { ClaudeReferenceReplacement, ReportItem } from "../core/types.js";

export function buildRewriteInfo(
  sourcePath: string,
  targetPath: string,
  replacements: ClaudeReferenceReplacement[],
): ReportItem[] {
  if (replacements.length === 0) {
    return [];
  }

  const replacementSummary = replacements
    .map((replacement) =>
      replacement.count > 1
        ? `${replacement.from} -> ${replacement.to} (${replacement.count}x)`
        : `${replacement.from} -> ${replacement.to}`,
    )
    .join("; ");

  return [
    {
      code: "claude-reference-rewrite",
      message: `${sourcePath}: rewrote Claude path references in ${targetPath}: ${replacementSummary}.`,
      sourcePath,
      targetPath,
      details: {
        replacements,
      },
    },
  ];
}
