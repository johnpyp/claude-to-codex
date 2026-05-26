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

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

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
          to: path.posix.join(artifact.targetDirRelativePath, "SKILL.md"),
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
        to: path.posix.join(artifact.targetDirRelativePath, "SKILL.md"),
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

function isClaudeMarkdownFamilySourcePath(from: string): boolean {
  return (
    from === "CLAUDE.md" ||
    from === "CLAUDE.local.md" ||
    from === ".claude/CLAUDE.md" ||
    from.endsWith("/CLAUDE.md") ||
    from.endsWith("/CLAUDE.local.md")
  );
}

/**
 * Splits markdown into alternating spans of prose vs inline (`...`) and fenced (```...```) code,
 * preserving the exact original string when rejoined.
 */
function splitMarkdownInlineAndFencedCode(
  content: string,
): Array<{ code: boolean; value: string }> {
  const parts: Array<{ code: boolean; value: string }> = [];
  let i = 0;
  const n = content.length;

  const push = (code: boolean, value: string): void => {
    if (value.length === 0) {
      return;
    }
    const last = parts.at(-1);
    if (last && last.code === code) {
      last.value += value;
    } else {
      parts.push({ code, value });
    }
  };

  while (i < n) {
    const atLineStart = i === 0 || content[i - 1] === "\n";

    if (atLineStart) {
      let j = i;
      let indent = 0;
      while (indent < 3 && j < n && (content[j] === " " || content[j] === "\t")) {
        indent += 1;
        j += 1;
      }
      if (j + 2 < n && content[j] === "`" && content[j + 1] === "`" && content[j + 2] === "`") {
        let k = j + 3;
        while (k < n && content[k] !== "\n") {
          k += 1;
        }
        const bodyStart = k < n ? k + 1 : k;
        let search = bodyStart;
        let closeStart = -1;
        while (search < n) {
          let lineEnd = search;
          while (lineEnd < n && content[lineEnd] !== "\n") {
            lineEnd += 1;
          }
          const line = content.slice(search, lineEnd);
          if (/^[\t ]*```[\t ]*$/.test(line)) {
            closeStart = search;
            break;
          }
          if (lineEnd >= n) {
            break;
          }
          search = lineEnd + 1;
        }
        if (closeStart >= 0) {
          let closeEnd = closeStart;
          while (closeEnd < n && content[closeEnd] !== "\n") {
            closeEnd += 1;
          }
          if (closeEnd < n) {
            closeEnd += 1;
          }
          push(true, content.slice(i, closeEnd));
          i = closeEnd;
          continue;
        }
        push(false, content.charAt(i));
        i += 1;
        continue;
      }
    }

    if (content[i] === "`") {
      if (i + 2 < n && content[i + 1] === "`" && content[i + 2] === "`") {
        push(false, content.charAt(i));
        i += 1;
        continue;
      }
      let end = i + 1;
      while (end < n && content[end] !== "`") {
        end += 1;
      }
      if (end < n) {
        push(true, content.slice(i, end + 1));
        i = end + 1;
        continue;
      }
      push(false, content.slice(i));
      break;
    }

    let next = i;
    while (next < n && content[next] !== "`" && content[next] !== "\n") {
      next += 1;
    }
    if (next < n && content[next] === "\n") {
      push(false, content.slice(i, next + 1));
      i = next + 1;
      continue;
    }
    if (next < n) {
      push(false, content.slice(i, next));
      i = next;
      continue;
    }
    push(false, content.slice(i));
    break;
  }

  return parts;
}

function mergeClaudeReferenceReplacements(
  into: Map<string, ClaudeReferenceReplacement>,
  incoming: ClaudeReferenceReplacement[],
): void {
  for (const replacement of incoming) {
    const key = `${replacement.from}\u0000${replacement.to}`;
    const current = into.get(key);
    if (current) {
      current.count += replacement.count;
    } else {
      into.set(key, {
        from: replacement.from,
        to: replacement.to,
        count: replacement.count,
      });
    }
  }
}

function rewriteClaudeReferencesCore(
  content: string,
  exactReplacements: Array<{ from: string; to: string }>,
  includeClaudeMarkdownPathReplacements: boolean,
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

  const scopedExact = includeClaudeMarkdownPathReplacements
    ? exactReplacements
    : exactReplacements.filter(
        (replacement) => !isClaudeMarkdownFamilySourcePath(replacement.from),
      );

  for (const replacement of scopedExact) {
    applyReplacement(new RegExp(`(?<!@)${escapeRegExp(replacement.from)}`, "g"), replacement.to);
  }

  applyReplacement(/(?<!@)\.claude\/skills\b/g, ".agents/skills");
  applyReplacement(/(?<!@)\.claude\/agents\b/g, ".codex/config.toml and .codex/agents/");
  if (includeClaudeMarkdownPathReplacements) {
    applyReplacement(/(?<!@)\.claude\/CLAUDE\.md/g, ".agents/AGENTS.md");
    applyReplacement(/(?<!@)CLAUDE\.local\.md/g, "AGENTS.override.md");
    applyReplacement(/(?<!@)CLAUDE\.md/g, "AGENTS.md");
  }

  return {
    content: rewritten,
    replacements: [...replacements.values()],
  };
}

export function rewriteClaudeReferences(
  content: string,
  exactReplacements: Array<{ from: string; to: string }> = [],
): ClaudeReferenceRewriteResult {
  const parts = splitMarkdownInlineAndFencedCode(content);
  const merged = new Map<string, ClaudeReferenceReplacement>();
  let rebuilt = "";

  for (const part of parts) {
    const sub = rewriteClaudeReferencesCore(part.value, exactReplacements, !part.code);
    rebuilt += sub.content;
    mergeClaudeReferenceReplacements(merged, sub.replacements);
  }

  return {
    content: rebuilt,
    replacements: [...merged.values()],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
