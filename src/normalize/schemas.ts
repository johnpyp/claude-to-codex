import { z } from "zod";

import type { McpServerConfig, ReportItem } from "../core/types.js";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());
const nonEmptyStringSchema = z.string().trim().min(1);
const stringListSchema = z
  .union([nonEmptyStringSchema, z.array(nonEmptyStringSchema)])
  .transform((value): string[] =>
    Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean)
      : value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
  );
const booleanSchema = z.boolean();
const numberSchema = z.number();
const stringArraySchema = z.array(nonEmptyStringSchema);
const permissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "dontAsk",
  "bypassPermissions",
  "plan",
]);
const mcpServerInlineSchema = z
  .object({
    args: z.array(z.string()).optional(),
    bearer_token_env_var: z.string().optional(),
    command: z.string().optional(),
    cwd: z.string().optional(),
    enabled: z.boolean().optional(),
    enabled_tools: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    env_http_headers: z.record(z.string(), z.string()).optional(),
    env_vars: z.array(z.string()).optional(),
    http_headers: z.record(z.string(), z.string()).optional(),
    required: z.boolean().optional(),
    startup_timeout_ms: z.number().optional(),
    startup_timeout_sec: z.number().optional(),
    tool_timeout_sec: z.number().optional(),
    url: z.string().optional(),
  })
  .catchall(z.unknown());
const mcpServersSchema = z.union([
  z.array(nonEmptyStringSchema),
  z.record(z.string(), mcpServerInlineSchema),
]);

export interface ParsedSkillLikeFrontmatter {
  name?: string;
  description?: string;
  disableModelInvocation?: boolean;
  issues: ReportItem[];
}

export interface ParsedAgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  permissionMode?: z.infer<typeof permissionModeSchema>;
  maxTurns?: number;
  skills?: string[];
  mcpServers?: string[] | Record<string, Record<string, unknown>>;
  hooks?: unknown;
  memory?: string;
  background?: boolean;
  isolation?: string;
  issues: ReportItem[];
}

export function parseFrontmatterRecord(
  value: unknown,
  sourcePath: string,
): { frontmatter: Record<string, unknown>; issues: ReportItem[] } {
  const parsed = frontmatterRecordSchema.safeParse(value);
  if (parsed.success) {
    return {
      frontmatter: parsed.data,
      issues: [],
    };
  }

  return {
    frontmatter: {},
    issues: [
      {
        code: "frontmatter-invalid-shape",
        message: `${sourcePath}: frontmatter must parse to an object; invalid frontmatter was ignored.`,
        sourcePath,
      },
    ],
  };
}

export function parseSkillLikeFrontmatter(
  frontmatter: Record<string, unknown>,
  sourcePath: string,
): ParsedSkillLikeFrontmatter {
  const issues: ReportItem[] = [];

  return {
    name: parseOptionalField(frontmatter, "name", nonEmptyStringSchema, sourcePath, issues),
    description: parseOptionalField(
      frontmatter,
      "description",
      nonEmptyStringSchema,
      sourcePath,
      issues,
    ),
    disableModelInvocation: parseOptionalField(
      frontmatter,
      "disable-model-invocation",
      booleanSchema,
      sourcePath,
      issues,
    ),
    issues,
  };
}

export function parseAgentFrontmatter(
  frontmatter: Record<string, unknown>,
  sourcePath: string,
): ParsedAgentFrontmatter {
  const issues: ReportItem[] = [];

  return {
    name: parseOptionalField(frontmatter, "name", nonEmptyStringSchema, sourcePath, issues),
    description: parseOptionalField(
      frontmatter,
      "description",
      nonEmptyStringSchema,
      sourcePath,
      issues,
    ),
    tools: parseOptionalField(frontmatter, "tools", stringListSchema, sourcePath, issues),
    disallowedTools: parseOptionalField(
      frontmatter,
      "disallowedTools",
      stringListSchema,
      sourcePath,
      issues,
    ),
    model: parseOptionalField(frontmatter, "model", nonEmptyStringSchema, sourcePath, issues),
    permissionMode: parseOptionalField(
      frontmatter,
      "permissionMode",
      permissionModeSchema,
      sourcePath,
      issues,
    ),
    maxTurns: parseOptionalField(frontmatter, "maxTurns", numberSchema, sourcePath, issues),
    skills: parseOptionalField(frontmatter, "skills", stringArraySchema, sourcePath, issues),
    mcpServers: parseOptionalField(frontmatter, "mcpServers", mcpServersSchema, sourcePath, issues),
    hooks: frontmatter.hooks,
    memory: parseOptionalField(frontmatter, "memory", nonEmptyStringSchema, sourcePath, issues),
    background: parseOptionalField(frontmatter, "background", booleanSchema, sourcePath, issues),
    isolation: parseOptionalField(
      frontmatter,
      "isolation",
      nonEmptyStringSchema,
      sourcePath,
      issues,
    ),
    issues,
  };
}

export function filterSupportedMcpFields(value: Record<string, unknown>): Record<string, unknown> {
  const parsed = mcpServerInlineSchema.safeParse(value);
  if (!parsed.success) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed.data).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function parseOptionalField<T>(
  frontmatter: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  sourcePath: string,
  issues: ReportItem[],
): T | undefined {
  if (!(key in frontmatter)) {
    return undefined;
  }

  const parsed = schema.safeParse(frontmatter[key]);
  if (parsed.success) {
    return parsed.data;
  }

  const detail = parsed.error.issues.map((issue) => issue.message).join("; ");

  issues.push({
    code: "frontmatter-invalid-field",
    message: `${sourcePath}: frontmatter field ${key} is invalid and was ignored${detail ? ` (${detail})` : ""}.`,
    sourcePath,
  });

  return undefined;
}
