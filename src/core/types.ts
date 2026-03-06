export type ArtifactKind =
  | "claude-md"
  | "claude-local-md"
  | "claude-hidden-md"
  | "skill"
  | "command"
  | "agent";

export type OperationType = "create" | "overwrite" | "skip";

export type BehaviorSeverity = "warning" | "error";

export type SandboxMode = "read-only" | "workspace-write";

export type GeneratedFileEncoding = "utf8" | "binary";

export interface SourceArtifact {
  kind: ArtifactKind;
  absolutePath: string;
  relativePath: string;
  scopeDir: string;
}

export interface ParsedArtifact extends SourceArtifact {
  rawContent: string;
  body: string;
  hasFrontmatter: boolean;
  frontmatter: Record<string, unknown>;
  frontmatterIssues: ReportItem[];
  importedPaths: string[];
  claudeReferences: string[];
}

export interface NormalizedClaudeDoc {
  kind: "claude-doc";
  source: ParsedArtifact;
  targetAbsolutePath: string;
  targetRelativePath: string;
}

export interface NormalizedSkill {
  kind: "skill";
  source: ParsedArtifact;
  sourceDirAbsolutePath: string;
  sourceDirRelativePath: string;
  targetDirAbsolutePath: string;
  targetDirRelativePath: string;
  skillName: string;
}

export interface NormalizedCommand {
  kind: "command";
  source: ParsedArtifact;
  targetDirAbsolutePath: string;
  targetDirRelativePath: string;
  skillName: string;
}

export interface McpServerConfig {
  key: string;
  value: Record<string, unknown>;
}

export interface AgentRoleConfig {
  roleId: string;
  description?: string;
  configFileAbsolutePath: string;
  configFileRelativePath: string;
  model?: string;
  modelReasoningEffort?: string;
  sandboxMode?: SandboxMode;
  developerInstructions: string;
  mcpServers: McpServerConfig[];
}

export interface NormalizedAgent {
  kind: "agent";
  source: ParsedArtifact;
  roleId: string;
  description?: string;
  roleConfig: AgentRoleConfig;
  droppedBehaviors: ReportItem[];
  approximatedBehaviors: ReportItem[];
  warnings: ReportItem[];
}

export type NormalizedArtifact =
  | NormalizedClaudeDoc
  | NormalizedSkill
  | NormalizedCommand
  | NormalizedAgent;

export interface ReportItem {
  code: string;
  message: string;
  sourcePath?: string;
  targetPath?: string;
  severity?: BehaviorSeverity;
  details?: Record<string, unknown>;
}

export interface ClaudeReferenceReplacement {
  from: string;
  to: string;
  count: number;
}

export interface ClaudeReferenceRewriteResult {
  content: string;
  replacements: ClaudeReferenceReplacement[];
}

export interface ClaudeReferenceRewriter {
  rewrite(content: string): ClaudeReferenceRewriteResult;
}

export interface GeneratedFile {
  absolutePath: string;
  relativePath: string;
  content: string | Uint8Array;
  encoding: GeneratedFileEncoding;
  sourcePaths: string[];
  infos: ReportItem[];
  generator:
    | "claude-doc"
    | "skill"
    | "command"
    | "agent-config"
    | "agent-role"
    | "unsymlink"
    | "report";
}

export interface ConversionIntent {
  rootDir: string;
  sourceArtifacts: ParsedArtifact[];
  normalizedArtifacts: NormalizedArtifact[];
  generatedFiles: GeneratedFile[];
  infos: ReportItem[];
  droppedBehaviors: ReportItem[];
  approximatedBehaviors: ReportItem[];
  warnings: ReportItem[];
  manualFollowUps: string[];
}

export interface ConversionPlanOperation {
  type: OperationType;
  absolutePath: string;
  relativePath: string;
  generator?: GeneratedFile["generator"];
  content?: string | Uint8Array;
  encoding?: GeneratedFileEncoding;
  sourcePaths: string[];
  reason?: string;
  infos: ReportItem[];
  warnings: ReportItem[];
}

export interface ConversionPlan {
  rootDir: string;
  sourceArtifacts: ParsedArtifact[];
  normalizedArtifacts: NormalizedArtifact[];
  operations: ConversionPlanOperation[];
  infos: ReportItem[];
  droppedBehaviors: ReportItem[];
  approximatedBehaviors: ReportItem[];
  warnings: ReportItem[];
  manualFollowUps: string[];
  summary: {
    create: number;
    overwrite: number;
    skip: number;
  };
}

export interface ExecutionResult {
  created: string[];
  overwritten: string[];
  skipped: string[];
  reportPath?: string;
}

export interface CliOptions {
  dryRun: boolean;
  write: boolean;
  json: boolean;
  emitReport: boolean;
  rootDir?: string;
  dangerousAllowDirtyGit: boolean;
  dangerousNoGitBackup: boolean;
}

export interface RepoContext {
  cwd: string;
  rootDir: string;
  rootDirRelativeToCwd: string;
  gitRoot?: string;
  isGitRepo: boolean;
  isGitRootInvocation: boolean;
  dirty: boolean;
}
