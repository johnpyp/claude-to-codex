import path from "node:path";

import type {
  ClaudeReferenceReplacement,
  ClaudeReferenceRewriteResult,
  ClaudeReferenceRewriter,
  NormalizedArtifact,
} from "../core/types.js";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".mts",
  ".sh",
  ".text",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

export function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function normalizeRoleId(value: string, fallback: string): string {
  return normalizeIdentifier(value, fallback);
}

export function isLikelyTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function discoverImports(content: string): string[] {
  return [...content.matchAll(/(?:^|\s)@([^\s]+)/gm)].map((match) => match[1] ?? "");
}

export function discoverClaudeReferences(content: string): string[] {
  return [
    ...content.matchAll(
      /(?:CLAUDE(?:\.local)?\.md|\.claude\/(?:skills|agents|commands|CLAUDE\.md|rules))/g,
    ),
  ].map((match) => match[0]);
}

export function createClaudeReferenceRewriter(
  normalizedArtifacts: NormalizedArtifact[],
): ClaudeReferenceRewriter {
  const exactReplacements = normalizedArtifacts
    .map((artifact): { from: string; to: string } => {
      if (artifact.kind === "claude-doc") {
        return {
          from: artifact.source.relativePath,
          to: artifact.targetRelativePath,
        };
      }

      if (artifact.kind === "command") {
        return {
          from: artifact.source.relativePath,
          to: path.join(artifact.targetDirRelativePath, "SKILL.md"),
        };
      }

      if (artifact.kind === "agent") {
        return {
          from: artifact.source.relativePath,
          to: artifact.roleConfig.configFileRelativePath,
        };
      }

      return {
        from: artifact.source.relativePath,
        to: path.join(artifact.targetDirRelativePath, "SKILL.md"),
      };
    })
    .filter((replacement) => replacement.from !== replacement.to)
    .sort((left, right) => right.from.length - left.from.length);

  return {
    rewrite(content: string): ClaudeReferenceRewriteResult {
      return rewriteClaudeReferences(content, exactReplacements);
    },
  };
}

export function rewriteClaudeReferences(
  content: string,
  exactReplacements: Array<{ from: string; to: string }> = [],
): ClaudeReferenceRewriteResult {
  let rewritten = content;
  const replacements = new Map<string, ClaudeReferenceReplacement>();

  const recordReplacement = (from: string, to: string): void => {
    if (from === to) {
      return;
    }

    const key = `${from}\u0000${to}`;
    const current = replacements.get(key);
    if (current) {
      current.count += 1;
      return;
    }

    replacements.set(key, {
      from,
      to,
      count: 1,
    });
  };

  const applyReplacement = (
    pattern: RegExp,
    replacement: string | ((match: string, ...captures: string[]) => string),
  ): void => {
    rewritten = rewritten.replace(pattern, (...args) => {
      const match = args[0] as string;
      const captures = args.slice(1, -2) as string[];
      const next = typeof replacement === "string" ? replacement : replacement(match, ...captures);

      recordReplacement(match, next);
      return next;
    });
  };

  for (const replacement of exactReplacements) {
    applyReplacement(new RegExp(`(?<!@)${escapeRegExp(replacement.from)}`, "g"), replacement.to);
  }

  applyReplacement(/(?<!@)\.claude\/skills\b/g, ".agents/skills");
  applyReplacement(/(?<!@)\.claude\/agents\b/g, ".codex/config.toml and .codex/agents/");
  applyReplacement(/(?<!@)\.claude\/CLAUDE\.md/g, ".agents/AGENTS.md");
  applyReplacement(/(?<!@)CLAUDE\.local\.md/g, "AGENTS.override.md");
  applyReplacement(/(?<!@)CLAUDE\.md/g, "AGENTS.md");

  return {
    content: rewritten,
    replacements: [...replacements.values()],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
