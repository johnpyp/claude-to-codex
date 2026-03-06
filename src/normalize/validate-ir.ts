import path from "node:path";

import type {
  McpServerConfig,
  NormalizedAgent,
  ParsedArtifact,
  ReportItem,
} from "../core/types.js";
import { normalizeRoleId } from "../utils/text.js";
import { filterSupportedMcpFields, parseAgentFrontmatter } from "./schemas.js";

export function normalizeAgent(rootDir: string, artifact: ParsedArtifact): NormalizedAgent {
  const sourcePath = artifact.relativePath;
  const warnings: ReportItem[] = [];
  const droppedBehaviors: ReportItem[] = [];
  const approximatedBehaviors: ReportItem[] = [];
  const parsedFrontmatter = parseAgentFrontmatter(artifact.frontmatter, sourcePath);
  parsedFrontmatter.issues.forEach((item) => warnings.push(item));

  const frontmatterName = parsedFrontmatter.name ?? path.basename(artifact.absolutePath, ".md");
  const builtInMapping = mapBuiltInRoleName(frontmatterName, sourcePath);
  const roleId = builtInMapping.roleId ?? normalizeRoleId(frontmatterName, "agent");

  const description = parsedFrontmatter.description;

  let sandboxMode: "read-only" | "workspace-write" | undefined;
  const permissionMode = parsedFrontmatter.permissionMode;

  if (builtInMapping.warning) {
    approximatedBehaviors.push(builtInMapping.warning);
  }

  if (builtInMapping.forceReadOnly) {
    sandboxMode = "read-only";
  }

  if (permissionMode === "plan") {
    sandboxMode = "read-only";
  } else if (permissionMode === "dontAsk") {
    droppedBehaviors.push({
      code: "agent-permission-dont-ask",
      message: `${sourcePath}: permissionMode=dontAsk was not converted; review approval_policy manually.`,
      sourcePath,
    });
  } else if (permissionMode === "bypassPermissions") {
    droppedBehaviors.push({
      code: "agent-permission-bypass",
      message: `${sourcePath}: permissionMode=bypassPermissions is unsupported and was dropped.`,
      sourcePath,
    });
  } else if (permissionMode === "acceptEdits") {
    approximatedBehaviors.push({
      code: "agent-permission-accept-edits",
      message: `${sourcePath}: permissionMode=acceptEdits has no direct Codex role mapping and was approximated by inheritance.`,
      sourcePath,
    });
  }

  const tools = parsedFrontmatter.tools;
  const disallowedTools = parsedFrontmatter.disallowedTools;

  if (tools && !includesWritableTool(tools)) {
    sandboxMode = "read-only";
    approximatedBehaviors.push({
      code: "agent-tools-read-only",
      message: `${sourcePath}: tool allowlist was approximated as sandbox_mode=read-only.`,
      sourcePath,
    });
  } else if (
    disallowedTools &&
    disallowedTools.some((tool) => WRITABLE_TOOLS.has(tool.toLowerCase()))
  ) {
    sandboxMode = "read-only";
    approximatedBehaviors.push({
      code: "agent-tools-disallowed-read-only",
      message: `${sourcePath}: disallowedTools was approximated as sandbox_mode=read-only.`,
      sourcePath,
    });
  } else if (tools || disallowedTools) {
    warnings.push({
      code: "agent-tools-dropped",
      message: `${sourcePath}: per-agent tool restrictions were dropped because Codex role allowlists are not documented.`,
      sourcePath,
    });
  }

  const { model, modelReasoningEffort } = mapClaudeModel(parsedFrontmatter.model);

  const mcpServers = parseMcpServers(
    parsedFrontmatter.mcpServers,
    sourcePath,
    approximatedBehaviors,
    warnings,
  );

  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    parsedFrontmatter.maxTurns,
    "agent-max-turns",
    "maxTurns is unsupported and was dropped.",
  );
  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    parsedFrontmatter.skills,
    "agent-skills",
    "skills preload is unsupported and was dropped.",
  );
  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    artifact.frontmatter.hooks,
    "agent-hooks",
    "hooks are unsupported and were dropped.",
  );
  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    parsedFrontmatter.memory,
    "agent-memory",
    "memory is unsupported and was dropped.",
  );
  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    parsedFrontmatter.background,
    "agent-background",
    "background is unsupported and was dropped.",
  );
  addDroppedIfPresent(
    droppedBehaviors,
    sourcePath,
    parsedFrontmatter.isolation,
    "agent-isolation",
    "isolation is unsupported and was dropped.",
  );

  return {
    kind: "agent",
    source: artifact,
    roleId,
    description,
    roleConfig: {
      roleId,
      description,
      configFileAbsolutePath: path.join(artifact.scopeDir, ".codex", "agents", `${roleId}.toml`),
      configFileRelativePath: path.relative(
        rootDir,
        path.join(artifact.scopeDir, ".codex", "agents", `${roleId}.toml`),
      ),
      model,
      modelReasoningEffort,
      sandboxMode,
      developerInstructions: artifact.body.trim(),
      mcpServers,
    },
    droppedBehaviors,
    approximatedBehaviors,
    warnings,
  };
}

const WRITABLE_TOOLS = new Set(["edit", "write"]);

function includesWritableTool(tools: string[]): boolean {
  return tools.some((tool) => WRITABLE_TOOLS.has(tool.toLowerCase()));
}

function mapClaudeModel(model: string | undefined): {
  model?: string;
  modelReasoningEffort?: string;
} {
  switch ((model ?? "inherit").toLowerCase()) {
    case "opus":
      return { model: "gpt-5.4", modelReasoningEffort: "high" };
    case "sonnet":
      return { model: "gpt-5.4", modelReasoningEffort: "medium" };
    case "haiku":
      return { model: "gpt-5.4", modelReasoningEffort: "low" };
    default:
      return {};
  }
}

function parseMcpServers(
  value: string[] | Record<string, Record<string, unknown>> | undefined,
  sourcePath: string,
  approximatedBehaviors: ReportItem[],
  warnings: ReportItem[],
): McpServerConfig[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    warnings.push({
      code: "agent-mcp-server-reference",
      message: `${sourcePath}: referenced MCP server names were not converted because the concrete Codex config is unavailable.`,
      sourcePath,
    });
    return [];
  }

  if (typeof value !== "object") {
    warnings.push({
      code: "agent-mcp-unsupported",
      message: `${sourcePath}: unsupported mcpServers format was dropped.`,
      sourcePath,
    });
    return [];
  }

  const results: McpServerConfig[] = [];

  for (const [key, serverConfig] of Object.entries(value)) {
    if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
      warnings.push({
        code: "agent-mcp-unsupported-entry",
        message: `${sourcePath}: MCP server ${key} could not be converted cleanly.`,
        sourcePath,
      });
      continue;
    }

    const normalized = filterSupportedMcpFields(serverConfig);
    if (Object.keys(normalized).length === 0) {
      warnings.push({
        code: "agent-mcp-empty",
        message: `${sourcePath}: MCP server ${key} has no supported Codex fields and was dropped.`,
        sourcePath,
      });
      continue;
    }

    approximatedBehaviors.push({
      code: "agent-mcp-converted",
      message: `${sourcePath}: MCP server ${key} was converted to Codex mcp_servers.${key}.`,
      sourcePath,
    });

    results.push({ key, value: normalized });
  }

  return results;
}

function addDroppedIfPresent(
  droppedBehaviors: ReportItem[],
  sourcePath: string,
  value: unknown,
  code: string,
  message: string,
): void {
  if (value === undefined) {
    return;
  }

  droppedBehaviors.push({
    code,
    message: `${sourcePath}: ${message}`,
    sourcePath,
  });
}

function mapBuiltInRoleName(
  name: string,
  sourcePath: string,
): {
  roleId?: string;
  forceReadOnly?: boolean;
  warning?: ReportItem;
} {
  switch (name.trim().toLowerCase()) {
    case "explore":
      return {
        roleId: "explorer",
      };
    case "general-purpose":
      return {
        roleId: "worker",
        warning: {
          code: "built-in-general-purpose-role",
          message: `${sourcePath}: built-in general-purpose was approximated as the Codex worker role.`,
          sourcePath,
        },
      };
    case "plan":
      return {
        roleId: "planner",
        forceReadOnly: true,
        warning: {
          code: "built-in-plan-role",
          message: `${sourcePath}: built-in Plan was approximated as a read-only planner role.`,
          sourcePath,
        },
      };
    default:
      return {};
  }
}
