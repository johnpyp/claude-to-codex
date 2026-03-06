import { globby } from "globby";
import path from "node:path";

import type { ArtifactKind, SourceArtifact } from "../core/types.js";

const IGNORE_PATTERNS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.agents/**",
  "**/.codex/**",
  "**/agents/*.toml",
];

export async function findArtifacts(rootDir: string): Promise<SourceArtifact[]> {
  const patterns: Array<{ pattern: string; kind: ArtifactKind }> = [
    { pattern: "**/CLAUDE.md", kind: "claude-md" },
    { pattern: "**/CLAUDE.local.md", kind: "claude-local-md" },
    { pattern: "**/.claude/CLAUDE.md", kind: "claude-hidden-md" },
    { pattern: "**/.claude/skills/**/SKILL.md", kind: "skill" },
    { pattern: "**/.claude/commands/**/*.md", kind: "command" },
    { pattern: "**/.claude/agents/**/*.md", kind: "agent" },
  ];

  const matches = await Promise.all(
    patterns.map(async ({ pattern: globPattern, kind }) => {
      const paths = await globby(globPattern, {
        cwd: rootDir,
        dot: true,
        gitignore: true,
        onlyFiles: true,
        ignore: IGNORE_PATTERNS,
      });

      return paths
        .filter(
          (relativePath) => !(kind === "claude-md" && relativePath.split("/").includes(".claude")),
        )
        .map((relativePath) => buildSourceArtifact(rootDir, relativePath, kind));
    }),
  );

  return matches.flat().sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function buildSourceArtifact(
  rootDir: string,
  relativePath: string,
  kind: ArtifactKind,
): SourceArtifact {
  const absolutePath = path.join(rootDir, relativePath);
  const scopeDir = resolveScopeDir(rootDir, relativePath, kind);

  return {
    kind,
    absolutePath,
    relativePath,
    scopeDir,
  };
}

function resolveScopeDir(rootDir: string, relativePath: string, kind: ArtifactKind): string {
  const absolutePath = path.join(rootDir, relativePath);

  if (kind === "claude-hidden-md" || kind === "skill" || kind === "command" || kind === "agent") {
    const parts = relativePath.split(path.sep);
    const claudeIndex = parts.indexOf(".claude");
    if (claudeIndex > -1) {
      return path.join(rootDir, ...parts.slice(0, claudeIndex));
    }
  }

  return path.dirname(absolutePath);
}
