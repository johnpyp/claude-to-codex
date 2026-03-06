import type { ParsedArtifact, SourceArtifact } from "../core/types.js";
import { parseFrontmatterRecord } from "../normalize/schemas.js";
import { parseFrontmatterDocument } from "../utils/frontmatter.js";
import { discoverClaudeReferences, discoverImports } from "../utils/text.js";
import { readArtifactUtf8 } from "./read-file.js";

export async function parseArtifact(source: SourceArtifact): Promise<ParsedArtifact> {
  const rawContent = await readArtifactUtf8(source.absolutePath);
  const parsed = parseFrontmatterDocument(rawContent);
  const { frontmatter, issues } = parseFrontmatterRecord(parsed.data, source.relativePath);

  return {
    ...source,
    rawContent,
    body: parsed.content,
    hasFrontmatter: parsed.hasFrontmatter,
    frontmatter,
    frontmatterIssues: issues,
    importedPaths: discoverImports(rawContent),
    claudeReferences: discoverClaudeReferences(rawContent),
  };
}
