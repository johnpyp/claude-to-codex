import YAML from "yaml";

export interface ParsedFrontmatterDocument {
  data: Record<string, unknown>;
  content: string;
  hasFrontmatter: boolean;
}

export function parseFrontmatterDocument(rawContent: string): ParsedFrontmatterDocument {
  const match = rawContent.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return {
      data: {},
      content: rawContent,
      hasFrontmatter: false,
    };
  }

  const rawFrontmatter = match[1] ?? "";
  const content = rawContent.slice(match[0].length);

  return {
    data: parseFrontmatterRecord(rawFrontmatter),
    content,
    hasFrontmatter: true,
  };
}

export function stringifyFrontmatterDocument(
  content: string,
  data: Record<string, unknown>,
): string {
  if (Object.keys(data).length === 0) {
    return content;
  }

  const frontmatter = YAML.stringify(data).trimEnd();
  const normalizedContent = content.replace(/^\n+/, "");

  if (normalizedContent.length === 0) {
    return `---\n${frontmatter}\n---\n`;
  }

  return `---\n${frontmatter}\n---\n\n${normalizedContent}`;
}

function parseFrontmatterRecord(rawFrontmatter: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(rawFrontmatter);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return parseClaudeCompatibleFrontmatter(rawFrontmatter);
  }
}

function parseClaudeCompatibleFrontmatter(rawFrontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  let currentKey: string | undefined;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (!currentKey) {
      return;
    }

    result[currentKey] = parseFieldValue(currentKey, currentLines);
    currentKey = undefined;
    currentLines = [];
  };

  for (const line of lines) {
    const topLevelField = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (topLevelField) {
      flush();
      currentKey = topLevelField[1];
      currentLines = [line];
      continue;
    }

    if (currentKey) {
      currentLines.push(line);
    }
  }

  flush();

  return result;
}

function parseFieldValue(key: string, lines: string[]): unknown {
  const fieldSource = `${lines.join("\n")}\n`;

  try {
    const parsed = YAML.parse(fieldSource);
    if (isRecord(parsed) && key in parsed) {
      return parsed[key];
    }
  } catch {
    // Fall back to tolerant scalar parsing below.
  }

  const header = lines[0]?.match(/^[A-Za-z0-9_-]+:(.*)$/);
  const inlineValue = header?.[1]?.trim() ?? "";

  if (lines.length === 1) {
    return parseScalarValue(inlineValue);
  }

  return inlineValue;
}

function parseScalarValue(value: string): unknown {
  if (value.length === 0) {
    return "";
  }

  try {
    return YAML.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
