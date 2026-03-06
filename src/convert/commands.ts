import path from "node:path";

import type { ClaudeReferenceRewriter, GeneratedFile, NormalizedCommand } from "../core/types.js";
import { buildRewriteInfo } from "./rewrite-info.js";
import { stringifyFrontmatterDocument, parseFrontmatterDocument } from "../utils/frontmatter.js";
import { parseSkillLikeFrontmatter } from "../normalize/schemas.js";
import { renderYaml } from "../emit/yaml.js";

export function convertCommand(
  command: NormalizedCommand,
  rootDir: string,
  rewriter: ClaudeReferenceRewriter,
): GeneratedFile[] {
  const skillPath = path.join(command.targetDirAbsolutePath, "SKILL.md");
  const parsed = parseFrontmatterDocument(command.source.rawContent);
  const rewrittenBody = rewriter.rewrite(parsed.content);
  const content =
    stringifyFrontmatterDocument(
      rewrittenBody.content.trimStart(),
      parsed.data,
    ).trimEnd() + "\n";
  const parsedFrontmatter = parseSkillLikeFrontmatter(
    command.source.frontmatter,
    command.source.relativePath,
  );

  const files: GeneratedFile[] = [
    {
      absolutePath: skillPath,
      relativePath: path.relative(rootDir, skillPath),
      content,
      encoding: "utf8",
      sourcePaths: [command.source.relativePath],
      infos: buildRewriteInfo(
        command.source.relativePath,
        path.relative(rootDir, skillPath),
        rewrittenBody.replacements,
      ),
      generator: "command",
    },
  ];

  if (parsedFrontmatter.disableModelInvocation) {
    const policyPath = path.join(command.targetDirAbsolutePath, "agents", "openai.yaml");
    files.push({
      absolutePath: policyPath,
      relativePath: path.relative(rootDir, policyPath),
      content: renderYaml({
        policy: {
          allow_implicit_invocation: false,
        },
      }),
      encoding: "utf8",
      sourcePaths: [command.source.relativePath],
      infos: [],
      generator: "command",
    });
  }

  return files;
}
