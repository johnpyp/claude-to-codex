import path from "node:path";

import type { GeneratedFile, NormalizedAgent } from "../core/types.js";
import { renderToml } from "../emit/toml.js";

export function convertAgents(agents: NormalizedAgent[], rootDir: string): GeneratedFile[] {
  if (agents.length === 0) {
    return [];
  }

  const scopeDir = agents[0]?.source.scopeDir;
  if (!scopeDir) {
    return [];
  }

  const configPath = path.join(scopeDir, ".codex", "config.toml");
  const roleEntries = Object.fromEntries(
    agents
      .sort((left, right) => left.roleId.localeCompare(right.roleId))
      .map((agent) => [
        agent.roleId,
        {
          description: agent.description ?? "",
          config_file: path.relative(path.dirname(configPath), agent.roleConfig.configFileAbsolutePath),
        },
      ]),
  );

  const files: GeneratedFile[] = [
    {
      absolutePath: configPath,
      relativePath: path.relative(rootDir, configPath),
      content: renderToml({
        features: {
          multi_agent: true,
        },
        agents: {
          max_threads: 10,
          max_depth: 1,
          ...Object.fromEntries(
            Object.entries(roleEntries).map(([key, value]) => [key, value]),
          ),
        },
      }),
      encoding: "utf8",
      sourcePaths: agents.map((agent) => agent.source.relativePath),
      infos: [],
      generator: "agent-config",
    },
  ];

  for (const agent of agents.sort((left, right) => left.roleId.localeCompare(right.roleId))) {
    const roleToml: Record<string, unknown> = {
      developer_instructions: agent.roleConfig.developerInstructions,
    };

    if (agent.roleConfig.model) {
      roleToml.model = agent.roleConfig.model;
    }

    if (agent.roleConfig.modelReasoningEffort) {
      roleToml.model_reasoning_effort = agent.roleConfig.modelReasoningEffort;
    }

    if (agent.roleConfig.sandboxMode) {
      roleToml.sandbox_mode = agent.roleConfig.sandboxMode;
    }

    if (agent.roleConfig.mcpServers.length > 0) {
      roleToml.mcp_servers = Object.fromEntries(
        agent.roleConfig.mcpServers.map((server) => [server.key, server.value]),
      );
    }

    files.push({
      absolutePath: agent.roleConfig.configFileAbsolutePath,
      relativePath: agent.roleConfig.configFileRelativePath,
      content: renderToml(roleToml),
      encoding: "utf8",
      sourcePaths: [agent.source.relativePath],
      infos: [],
      generator: "agent-role",
    });
  }

  return files;
}
