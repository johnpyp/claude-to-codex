import { globby } from "globby";
import path from "node:path";

import type { ClaudeReferenceRewriter, GeneratedFile, NormalizedSkill } from "../core/types.js";
import { buildRewriteInfo } from "./rewrite-info.js";
import { renderYaml } from "../emit/yaml.js";
import { readArtifactBytes, readArtifactUtf8 } from "../discover/read-file.js";
import { parseSkillLikeFrontmatter } from "../normalize/schemas.js";
import { parseFrontmatterDocument, stringifyFrontmatterDocument } from "../utils/frontmatter.js";
import { isLikelyTextFile } from "../utils/text.js";

export async function convertSkill(
  skill: NormalizedSkill,
  rootDir: string,
  rewriter: ClaudeReferenceRewriter,
): Promise<GeneratedFile[]> {
  const files = await globby("**/*", {
    cwd: skill.sourceDirAbsolutePath,
    dot: true,
    onlyFiles: true,
  });

  const generatedFiles: GeneratedFile[] = [];
  const parsedFrontmatter = parseSkillLikeFrontmatter(
    skill.source.frontmatter,
    skill.source.relativePath,
  );

  for (const relativePath of files.sort((left, right) => left.localeCompare(right))) {
    const sourceAbsolutePath = path.join(skill.sourceDirAbsolutePath, relativePath);
    const targetAbsolutePath = path.join(skill.targetDirAbsolutePath, relativePath);
    const targetRelativePath = path.relative(rootDir, targetAbsolutePath);

    if (relativePath === "SKILL.md") {
      const rawContent = await readArtifactUtf8(sourceAbsolutePath);
      const rewrittenSkillMarkdown = rewriteSkillMarkdownWithInfo(
        skill.source.relativePath,
        targetRelativePath,
        rawContent,
        rewriter,
      );
      generatedFiles.push({
        absolutePath: targetAbsolutePath,
        relativePath: targetRelativePath,
        content: rewrittenSkillMarkdown.content,
        encoding: "utf8",
        sourcePaths: [skill.source.relativePath],
        infos: rewrittenSkillMarkdown.infos,
        generator: "skill",
      });
      continue;
    }

    if (!isLikelyTextFile(relativePath)) {
      generatedFiles.push({
        absolutePath: targetAbsolutePath,
        relativePath: targetRelativePath,
        content: await readArtifactBytes(sourceAbsolutePath),
        encoding: "binary",
        sourcePaths: [skill.source.relativePath],
        infos: [],
        generator: "skill",
      });
      continue;
    }

    const rawContent = await readArtifactUtf8(sourceAbsolutePath);
    const rewrittenContent = rewriter.rewrite(rawContent);
    generatedFiles.push({
      absolutePath: targetAbsolutePath,
      relativePath: targetRelativePath,
      content: rewrittenContent.content,
      encoding: "utf8",
      sourcePaths: [skill.source.relativePath],
      infos: buildRewriteInfo(skill.source.relativePath, targetRelativePath, rewrittenContent.replacements),
      generator: "skill",
    });
  }

  if (parsedFrontmatter.disableModelInvocation) {
    const policyPath = path.join(skill.targetDirAbsolutePath, "agents", "openai.yaml");
    generatedFiles.push({
      absolutePath: policyPath,
      relativePath: path.relative(rootDir, policyPath),
      content: renderYaml({
        policy: {
          allow_implicit_invocation: false,
        },
      }),
      encoding: "utf8",
      sourcePaths: [skill.source.relativePath],
      infos: [],
      generator: "skill",
    });
  }

  return generatedFiles;
}

function rewriteSkillMarkdownWithInfo(
  sourcePath: string,
  targetPath: string,
  rawContent: string,
  rewriter: ClaudeReferenceRewriter,
): Pick<GeneratedFile, "content" | "infos"> {
  const parsed = parseFrontmatterDocument(rawContent);
  const rewrittenBody = rewriter.rewrite(parsed.content);

  return {
    content:
      stringifyFrontmatterDocument(
        rewrittenBody.content.trimStart(),
        parsed.data,
      ).trimEnd() + "\n",
    infos: buildRewriteInfo(sourcePath, targetPath, rewrittenBody.replacements),
  };
}
