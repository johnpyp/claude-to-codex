# Plan: Migrate Claude Repo Artifacts to Codex-Native Equivalents

## Goal

Build a non-interactive Bun-based CLI that scans a repository for Claude Code configuration and converts it into Codex-native artifacts, preferring shared repo formats that Codex documents as standard:

- `CLAUDE.md` -> `AGENTS.md`
- `.claude/skills` -> `.agents/skills`
- `.claude/commands` -> `.agents/skills`
- `.claude/agents` -> Codex multi-agent config in `.codex/config.toml` plus role TOML files

The converter should be safe by default, deterministic, and explicit about anything it cannot translate 1:1.

## Guiding Decisions

- Prefer Codex-native shared formats over Claude-compatible shims.
- Do not symlink `CLAUDE.md` to `AGENTS.md`; always write a real copied file.
- Keep Claude source artifacts as input; write Codex artifacts as output.
- Use one typed intermediate representation for all Claude inputs before emitting Codex outputs.
- Preserve unsupported metadata verbatim when the target file format can carry it; warn only when behavior must be dropped or approximated.
- Treat this as a one-way sync: replacing previously generated Codex outputs is normal behavior and should not require a dangerous override.
- Treat all Codex-side artifacts produced or targeted by this tool as disposable outputs; preserving hand-written Codex files is out of scope.
- Do not create, modify, or delete files that are gitignored, because those changes are not safely reversible through git.
- By default, require the current working directory to be the git root; error otherwise.
- Require explicit `--dangerous-*` flags only for cases that are not safely recoverable via git, or where the repo state makes safe rollback ambiguous.
- Keep the implementation fully deterministic. No AI-assisted rewriting, summarization, or inference-heavy content transformation should occur during conversion.

## Primary Docs

### Codex docs

- `AGENTS.md` discovery and precedence:
  - https://developers.openai.com/codex/guides/agents-md.md
  - https://developers.openai.com/codex/concepts/customization.md
- Skills:
  - https://developers.openai.com/codex/skills.md
- Multi-agent roles and project config:
  - https://developers.openai.com/codex/multi-agent.md
  - https://developers.openai.com/codex/concepts/multi-agents.md
  - https://developers.openai.com/codex/config-basic.md
  - https://developers.openai.com/codex/config-reference.md
- Models and reasoning effort:
  - https://developers.openai.com/codex/models.md
- Why not use custom prompts for repo-shared command migration:
  - https://developers.openai.com/codex/custom-prompts.md

### Claude docs

- `CLAUDE.md` and `.claude/rules` behavior:
  - https://code.claude.com/docs/en/memory.md
- `.claude/rules` reference behavior, explicitly out of scope for automatic migration:
  - https://code.claude.com/docs/en/memory.md
- Skills and legacy commands:
  - https://code.claude.com/docs/en/skills.md
  - https://code.claude.com/docs/en/features-overview.md
- Subagents:
  - https://code.claude.com/docs/en/sub-agents.md
- Claude model aliases:
  - https://code.claude.com/docs/en/model-config.md
- Supplemental legacy command/plugin details:
  - https://code.claude.com/docs/en/plugins-reference.md

## Canonical Feature Mapping

| Claude source | Codex target | Notes |
| --- | --- | --- |
| `CLAUDE.md` | `AGENTS.md` | Copy content, do not symlink, and rewrite Claude-specific references in the copy. |
| `.claude/CLAUDE.md` | `.agents/AGENTS.md` | Preserve the hidden-scope form by targeting `.agents/AGENTS.md`. |
| `CLAUDE.local.md` | `AGENTS.override.md` | Local override content should map to the Codex override filename. |
| `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | Prefer the Codex repo skill location. |
| `.claude/commands/<name>.md` | `.agents/skills/<name>/SKILL.md` | Codex custom prompts are deprecated and user-local; repo-shared commands should become skills. |
| `.claude/agents/*.md` | `.codex/config.toml` + `agents/*.toml` | Emit Codex multi-agent role definitions and per-role config files. |
| `.claude/rules/**/*.md` | None | Rules are out of scope for automatic migration because they are not 1:1 with Codex rules. |

## Output Layout

The generated Codex artifacts should default to this repo-controlled layout:

```text
AGENTS.md
AGENTS.override.md
.agents/
  AGENTS.md
  skills/
    <skill-name>/
      SKILL.md
      agents/openai.yaml        # when needed
      scripts/...
      references/...
      assets/...
.codex/
  config.toml
agents/
  <role>.toml
codex-migration-report.json
```

`.claude/rules` are intentionally excluded from the generated output set.

## Implementation Architecture

### Recommended dependencies

Prefer a small dependency surface and use the git CLI for git-specific truth where possible.

- `cac`
  - Required CLI framework.
- a frontmatter parser
  - Needed for Claude skills, commands, and subagents.
  - A small parser such as `gray-matter` is sufficient.
- a YAML parser
  - Needed if frontmatter parsing and `agents/openai.yaml` generation are split.
  - `yaml` is sufficient.
- a TOML parser / writer
  - Needed for `.codex/config.toml` and `agents/*.toml`.
  - Use a library that can reliably stringify TOML; preserving comments is not required for generated files.
- `fast-glob` or equivalent
  - Useful for deterministic repo discovery of Claude artifacts.

Do not add dependencies for:

- markdown AST transformation unless a concrete deterministic rewrite requires it
- git inspection when `git rev-parse`, `git status`, and `git check-ignore` are sufficient
- prompt templating or any AI-facing runtime, since the converter is purely static and deterministic

### Git commands the implementation should rely on

Prefer shelling out to git for these checks instead of reimplementing them:

- `git rev-parse --show-toplevel`
  - Determine repo root and enforce root-only invocation.
- `git status --porcelain`
  - Detect dirty worktrees.
- `git check-ignore -q <path>`
  - Detect gitignored target paths before writing.

### Suggested project structure

```text
src/
  cli/
    main.ts
    args.ts
  core/
    types.ts
    errors.ts
    report.ts
  git/
    repo.ts
    ignore.ts
    safety.ts
  discover/
    find-artifacts.ts
    read-file.ts
    parse-frontmatter.ts
  normalize/
    to-ir.ts
    validate-ir.ts
  convert/
    claude-md.ts
    skills.ts
    commands.ts
    agents.ts
  emit/
    paths.ts
    write-files.ts
    toml.ts
    yaml.ts
  utils/
    fs.ts
    text.ts
tests/
  fixtures/
    <fixture-name>/
  integration/
    *.test.ts
```

The exact filenames can change, but the concern boundaries should remain.

### Separation of concerns

The implementation should be explicitly split into these stages:

1. Environment and safety checks
   - resolve root
   - verify git/root-dir rules
   - verify dirty-worktree and gitignore constraints
2. Discovery
   - find Claude artifacts on disk
   - no conversion logic here
3. Parsing
   - parse frontmatter and file contents
   - no path rewriting or emission logic here
4. Normalization
   - build a single typed IR for all source artifacts
   - surface parse/validation errors here
5. Conversion
   - map IR artifacts to target artifacts deterministically
   - rewrite only supported fields and path references
6. Conversion planning
   - reify the entire conversion into an in-memory plan before any writes happen
   - include creates, overwrites, skips, warnings, deletions, and dropped/approximated behavior
7. Emission planning
   - decide output paths and whether files are writable
   - no actual writes here
8. Writing
   - create/overwrite/delete files
   - no conversion logic here
9. Reporting
   - summarize emitted files, skipped files, dropped behavior, and approximations

Rules for separation:

- readers must not write
- converters must not hit the filesystem
- converters must produce an in-memory conversion plan, not perform writes incrementally
- writers must not parse source files
- safety checks must run before any write planning that assumes a writable target
- report generation should consume structured results from prior stages, not scrape console output

### In-memory conversion plan

The core output of the conversion stage should be a fully materialized in-memory `ConversionPlan`.

That plan should include:

- discovered source artifacts
- normalized IR artifacts
- proposed target files
- target file contents
- per-file operation type:
  - `create`
  - `overwrite`
  - `delete`
  - `skip`
- reasons for each skip
- dropped behaviors
- approximated behaviors
- warnings

This is the key test seam for the project:

- most integration tests should assert against the computed `ConversionPlan`
- the write/execution layer should be thin and mostly concerned with safety and filesystem effects
- dry-run mode should render from the `ConversionPlan` without needing a separate code path

### `ConversionPlanExecutor`

The execution layer should consume a `ConversionPlan` and be the only component allowed to touch the filesystem.

Responsibilities:

- enforce git-root or `--root-dir` rules
- enforce dirty-worktree rules
- enforce gitignored-target rules
- decide whether planned deletes are allowed
- execute creates, overwrites, and deletes in a deterministic order
- produce final execution results for reporting

This centralization matters because it avoids safety logic being duplicated across artifact-specific converters.

### Output ownership model

Generated files should be treated as disposable sync outputs, but ownership decisions should still be centralized.

- One module should decide whether a target path is writable.
- One module should decide whether an existing file is gitignored.
- One module should decide whether a delete is allowed.

Do not spread these decisions across per-artifact converters.

## Detailed Feature Matrix

Status meanings:

- `Yes`: convert automatically with a documented Codex target
- `Partial`: convert only a safe subset, or convert by approximation with a warning
- `No`: do not auto-convert; report as unsupported or out of scope

### `CLAUDE.md` and related memory features

| Source field or feature | Target | Status | Planned handling | Why |
| --- | --- | --- | --- | --- |
| `CLAUDE.md` markdown body | `AGENTS.md` markdown body | Yes | Copy content and rewrite Claude-specific path references. | Codex has first-class `AGENTS.md` support. |
| `.claude/CLAUDE.md` as alternate project file | `.agents/AGENTS.md` | Yes | Copy into `.agents/AGENTS.md` in the same scope. | This preserves the hidden-scope form without colliding with root `AGENTS.md`. |
| Nested `CLAUDE.md` files in subdirectories | Nested `AGENTS.md` files | Yes | Convert each repo-shared nested file to a same-scope `AGENTS.md`. | Codex supports nested `AGENTS.md` files along the project path. |
| `@path/to/import` in `CLAUDE.md` | Unchanged markdown content | No | Leave the import syntax untouched. | The plan does not support synthetic inlining for undocumented Codex behavior. |
| Text references to `CLAUDE.md` files | Text references to `AGENTS.md` | Yes | Rewrite links and prose references in copied output. | The file name changes and the generated docs should stay coherent. |
| Text references to `.claude/skills` / `.claude/agents` paths | `.agents/*` or `.codex/*` references | Yes | Rewrite based on the concrete feature destination. | The user explicitly wants migrated feature paths rewritten in copied output. |
| Text references to `.claude/rules` paths | Unchanged markdown content | No | Leave untouched. | Rules are out of scope for automatic migration. |
| `CLAUDE.local.md` | `AGENTS.override.md` | Partial | Copy into `AGENTS.override.md` in the same scope, but never modify a gitignored target path. | This is the closest Codex override filename, but gitignored targets are non-revertable. |
| `~/.claude/CLAUDE.md` | None | No | Ignore silently. | User-level Claude config is outside repo sync scope. |
| Managed policy `CLAUDE.md` | None | No | Ignore silently. | Machine/org policy is not repo state. |
| `claudeMdExcludes` setting | None | No | Ignore silently. | This is not a repo artifact the sync tool should mutate. |
| Claude auto memory (`MEMORY.md`, `autoMemoryEnabled`) | None | No | Ignore silently. | Auto-memory is outside the repo artifact sync scope. |

### Claude skills and legacy commands: frontmatter matrix

The same matrix applies to `.claude/skills/**/SKILL.md` and `.claude/commands/*.md`, because Claude docs say legacy commands use the same frontmatter surface as skills.

Conversion rule for this section: copy the entire frontmatter first, then mutate only the supported fields below. Unsupported fields stay in place unchanged.

| Source field | Codex target | Status | Planned handling | Why |
| --- | --- | --- | --- | --- |
| `name` | `SKILL.md` `name` | Yes | Copy verbatim unless normalization is needed for filesystem safety. | Both tools use a skill name. |
| `description` | `SKILL.md` `description` | Yes | Copy verbatim. | Both tools use description for discovery. |
| `argument-hint` | Unchanged frontmatter | No | Copy unchanged. | Codex skills docs do not document an argument hint field, but the plan uses selective mutation rather than dropping unknown keys. |
| `disable-model-invocation: true` | `agents/openai.yaml` `policy.allow_implicit_invocation: false` | Yes | Emit `agents/openai.yaml` with `allow_implicit_invocation: false`. | Codex documents this as the supported implicit-invocation control. |
| `user-invocable: false` | Unchanged frontmatter | No | Copy unchanged. | Codex docs do not document a documented mutation for this field. |
| `allowed-tools` | Unchanged frontmatter | No | Copy unchanged. | Current Codex docs do not document a Codex-specific mutation for this field. |
| `model` | Unchanged frontmatter | No | Copy unchanged. | Codex docs do not document per-skill model selection. |
| `context: fork` | Unchanged frontmatter | No | Copy unchanged. | The plan does not define a deterministic skill-to-role synthesis from this field. |
| `agent` | Unchanged frontmatter | No | Copy unchanged. | The plan does not define a deterministic mutation for this field. |
| `hooks` | Unchanged frontmatter | No | Copy unchanged. | Codex skills docs do not document skill-scoped hooks. |
| Markdown body | `SKILL.md` body | Yes | Copy and rewrite migrated path references. | Both tools use markdown instructions as the skill body. |

### Claude skills and legacy commands: runtime features

| Source feature | Codex target | Status | Planned handling | Why |
| --- | --- | --- | --- | --- |
| Supporting files in skill directory | Same files under `.agents/skills/<name>/` | Yes | Copy `scripts/`, `references/`, `assets/`, templates, and linked docs. | Codex skills support the same directory-style packaging model. |
| `$ARGUMENTS` | Unchanged markdown content | No | Copy unchanged. | The plan does not support deterministic placeholder rewriting for skill bodies. |
| `$ARGUMENTS[N]` | Unchanged markdown content | No | Copy unchanged. | No documented Codex equivalent and no deterministic rewrite is planned. |
| `$N` shorthand | Unchanged markdown content | No | Copy unchanged. | No documented Codex equivalent and no deterministic rewrite is planned. |
| `${CLAUDE_SESSION_ID}` | Unchanged markdown content | No | Copy unchanged. | No documented Codex skill variable equivalent. |
| `${CLAUDE_SKILL_DIR}` | Unchanged markdown content | No | Copy unchanged. | The plan does not define a deterministic mutation for this variable. |
| `!` command preprocessing | Unchanged markdown content | No | Copy unchanged. | Codex skills docs do not document command interpolation in `SKILL.md`, and no deterministic rewrite is planned. |
| Commands as repo-shared markdown files | `.agents/skills/<name>/SKILL.md` | Yes | Convert commands into skills instead of Codex custom prompts. | Codex custom prompts are deprecated and user-local. |

### Claude subagents: frontmatter matrix

| Source field | Codex target | Status | Planned handling | Why |
| --- | --- | --- | --- | --- |
| `name` | `[agents.<name>]` role name | Yes | Use as the Codex role id, normalizing only if required for TOML/key safety. | Both systems need a stable role identifier. |
| `description` | `agents.<name>.description` | Yes | Copy verbatim. | Codex roles expose the same concept. |
| Markdown body / `prompt` | `developer_instructions` in `agents/<name>.toml` | Yes | Copy as role-specific instructions. | This is the closest Codex equivalent to a Claude subagent prompt. |
| `tools` | None | Partial | Infer `sandbox_mode = "read-only"` when `Edit` is absent from the allowed tool set; otherwise warn and drop the field. | Codex roles do not document per-role built-in tool allowlists. |
| `disallowedTools` | None | Partial | Infer `sandbox_mode = "read-only"` when `Edit` is absent from the effective tool set or explicitly denied; otherwise warn and drop the field. | Codex roles do not document per-role built-in tool deny lists. |
| `model` | `model` plus `model_reasoning_effort` | Yes | Map Claude aliases to Codex models via the plan’s deterministic mapping table. | Codex roles support `model` and reasoning effort. |
| `permissionMode: default` | Inherit parent config | Yes | Omit explicit override and inherit parent behavior. | This is the closest semantic match. |
| `permissionMode: plan` | `sandbox_mode = "read-only"` | Yes | Convert directly to a read-only role. | Codex documents read-only agent roles and this is the closest safe mapping. |
| `permissionMode: acceptEdits` | None | Partial | Keep writable sandbox only when other signals already require it; otherwise warn and preserve no special approval override. | Codex does not document a direct per-role “auto-accept edits only” mode. |
| `permissionMode: dontAsk` | Possible `approval_policy = "never"` compatibility mode | Partial | Do not auto-convert by default; optionally support a stricter compatibility mode later and warn in the base plan. | Codex approval semantics are similar but not identical. |
| `permissionMode: bypassPermissions` | None by default | No | Do not auto-convert. Report as unsupported unless a future dangerous compatibility flag is introduced. | This would widen authority in a risky way. |
| `maxTurns` | None | No | Report as unsupported. | Codex multi-agent role config does not document a per-role turn limit. |
| `skills` | None | No | Report as unsupported. | Codex multi-agent role docs do not document per-role skill preloading. |
| `mcpServers` | `mcp_servers.*` blocks in role TOML | Partial | Convert when the Claude server definition maps cleanly onto Codex MCP config fields; otherwise warn. | Codex role config can include MCP server config, but the schemas are not guaranteed identical. |
| `hooks` | None | No | Report as unsupported. | Codex multi-agent role docs do not document role-scoped hooks. |
| `memory` | None | No | Report as unsupported. | Codex multi-agent docs do not document per-role persistent memory directories. |
| `background` | None | No | Report as unsupported. | Codex docs do not document a role field for always-run-in-background behavior. |
| `isolation: worktree` | None | No | Report as unsupported. | Codex docs discuss worktrees as workflows, not as a per-role config field. |

### Claude built-in agent names used by skills or subagents

| Claude value | Codex target | Status | Planned handling | Why |
| --- | --- | --- | --- | --- |
| `Explore` | `explorer` role | Yes | Map directly to the Codex `explorer` built-in role name unless overridden. | This is the closest built-in semantic match. |
| `general-purpose` | `worker` or `default` role | Partial | Default to `worker` for implementation-oriented tasks and `default` otherwise; warn when intent is unclear. | Codex built-ins are named differently. |
| `Plan` | Custom `planner` or read-only review role | Partial | Generate a dedicated read-only role if the source relies on `Plan`; do not assume a built-in Codex equivalent exists. | Codex docs do not document a built-in `Plan` role. |

### Claude rules

`.claude/rules` are out of scope for automatic migration in this plan.

Reason:

- Claude `.claude/rules/*.md` are markdown guidance files, often path-scoped.
- Codex `.rules` files are exec-policy configuration.
- The mapping is not 1:1, and the user has explicitly excluded it from scope.

Handling:

- discover them only if needed for reporting or future extension
- do not generate Codex `.rules`
- do not rewrite `.claude/rules` content into `AGENTS.md` or skills
- do not mutate textual `.claude/rules` references in copied markdown

### Behavior that should still produce warnings

- Claude subagent `permissionMode: dontAsk` when no compatibility mode is enabled
- Claude subagent `permissionMode: bypassPermissions`
- Claude subagent `maxTurns`
- Claude subagent `skills`
- Claude subagent `hooks`
- Claude subagent `memory`
- Claude subagent `background`
- Claude subagent `isolation`

## Workstream 1: Discovery and Intermediate Representation

Implement a reader that discovers all Claude artifacts first, then converts from a single normalized model.

Discovery set:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `.claude/CLAUDE.md`
- `.claude/agents/**/*.md`
- `.claude/commands/**/*.md`
- `.claude/skills/**/SKILL.md`

Normalized IR should capture:

- absolute path
- repo-relative path
- artifact kind
- parsed frontmatter
- markdown body
- imported paths or cross-references
- Claude-only fields that may need mapping or warning

Discovery policy:

- `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` can coexist and should be treated as separate source artifacts because they map to different targets.
- User-level and managed Claude artifacts should be ignored silently.
- `.claude/rules` should be ignored for conversion in this implementation.
- The report should focus on emitted files plus behaviors that were dropped or approximated, not on untouched out-of-scope files.

## Workstream 2: `CLAUDE.md` family -> `AGENTS*`

This is the highest-confidence migration and should ship first.

Implementation rules:

- Copy project `CLAUDE.md` content into `AGENTS.md`.
- Copy `.claude/CLAUDE.md` into `.agents/AGENTS.md`.
- Copy `CLAUDE.local.md` into `AGENTS.override.md`.
- Never create symlinks.
- Before writing any target file, check whether the path is gitignored.
- If a target path is gitignored, do not create it, overwrite it, or delete it. Emit a warning instead.
- Rewrite references in the copied content:
  - `CLAUDE.md` -> `AGENTS.md`
  - `.claude/skills` -> `.agents/skills`
  - `.claude/agents` -> `.codex/config.toml` and/or `agents/*.toml` as appropriate
  - `.claude/...` -> `.codex/...` or `.agents/...` based on the concrete Codex feature being referenced
- Preserve Markdown structure, relative links, and literal `@import` syntax as-is.

Recommended scope rule:

- Convert repo-scoped and repo-local project guidance files.
- Do not touch user-local `~/.claude/CLAUDE.md` or managed policy files.

Acceptance criteria:

- The generated `AGENTS.md` is readable as normal Markdown.
- Every direct textual reference to other Claude project docs is rewritten to the Codex equivalent.
- A present, non-empty, gitignored `AGENTS.override.md` is left untouched and reported instead of overwritten.
- A dry-run diff makes the rewrites obvious.

## Workstream 3: `.claude/skills` -> `.agents/skills`

Codex and Claude both support skill directories, but the metadata surface is not identical.

Baseline conversion:

- Copy each Claude skill directory into `.agents/skills/<name>/`.
- Preserve supporting files such as `scripts/`, `references/`, `assets/`, and templates.
- Rewrite Claude-specific intra-skill references to Codex paths when they point at migrated artifacts.
- Copy frontmatter verbatim first, then apply only the deterministic mutations listed in the matrix.

Frontmatter mapping:

- `name` -> keep
- `description` -> keep
- `disable-model-invocation: true` -> generate `agents/openai.yaml` with:
  - `policy.allow_implicit_invocation: false`
- all other frontmatter fields -> preserve unchanged unless a later deterministic mutation is explicitly added

Acceptance criteria:

- Skills land in `.agents/skills`, not `.claude/skills`.
- Frontmatter is copied selectively rather than rebuilt from a whitelist.
- Only behaviors that are actually dropped or approximated appear in the report.

## Workstream 4: `.claude/commands` -> `.agents/skills`

Codex custom prompts are deprecated and user-local, so repo-shared Claude commands should migrate to skills instead.

Conversion strategy:

- Treat each `.claude/commands/<name>.md` file as a skill named `<name>`.
- Emit `.agents/skills/<name>/SKILL.md`.
- Preserve the command file content verbatim, then apply the same deterministic field/path mutations used for Claude skills.

Command classes:

1. Simple instruction commands
   - Convert directly into `SKILL.md`.
2. Commands with arguments/placeholders
   - Copy unchanged into the generated `SKILL.md`.
3. Commands that depend on Claude-only shell injection or command frontmatter
   - Copy unchanged into the generated `SKILL.md` unless a future deterministic transform is explicitly added.

Important rule:

- Do not target `~/.codex/prompts` by default.
- Only consider deprecated Codex custom prompts as a last-resort compatibility mode, because they are not repo-shared and Codex docs explicitly prefer skills.

## Workstream 5: `.claude/agents` -> Codex Multi-Agent Roles

Codex multi-agent roles live in config, not in `.agents/`.

Target shape:

- `.codex/config.toml`
- `agents/<role>.toml`

Project config should include:

```toml
[features]
multi_agent = true

[agents]
max_threads = 6
max_depth = 1

[agents.<role>]
description = "..."
config_file = "agents/<role>.toml"
```

Per-role config files should contain the role-specific settings Codex actually supports, especially:

- `model`
- `model_reasoning_effort`
- `sandbox_mode`
- `developer_instructions`
- optional MCP config when the source agent depended on MCP

Recommended model mapping policy:

- `opus` -> `model = "gpt-5.4"` + `model_reasoning_effort = "high"`
- `sonnet` -> `model = "gpt-5.4"` + `model_reasoning_effort = "medium"`
- `haiku` -> `model = "gpt-5.4"` + `model_reasoning_effort = "low"`
- `inherit` or omitted -> inherit parent session unless a concrete role file is required

Optional optimization mode:

- If the user explicitly opts into speed-optimized mappings and the environment supports it, allow read-heavy explorer-style roles to use `gpt-5.3-codex-spark`.

Field mapping policy:

- Claude `description` -> Codex role `description`
- Claude body/prompt -> Codex `developer_instructions`
- Claude `model` alias -> map via the table above
- Claude read-only / plan-style agents -> `sandbox_mode = "read-only"`
- Claude edit-capable agents -> inherit parent or use `workspace-write` when explicitly requested

Known non-1:1 areas:

- Claude per-agent tool allowlists do not have a direct Codex role equivalent.
- Claude `permissionMode` is not a clean 1:1 fit for Codex approvals and sandbox policy.
- Claude `maxTurns` is not a direct Codex role field.
- Claude agent-local `skills` preload is not documented as a Codex role config feature.

Implementation rule:

- Convert only the supported subset automatically.
- Report only behaviors that must be dropped or approximated.
- Never silently widen permissions compared with the Claude source.

## Workstream 6: Reporting, Dry Run, and Safety Flags

Required CLI behaviors:

- `--dry-run`
- `--json`
- `--write`
- `--root-dir <path>`
- `--dangerous-allow-dirty-git`
- `--dangerous-no-git-backup` or equivalent for writes that are not safely git-revertable

Migration report should include:

- discovered source artifacts
- emitted target artifacts
- skipped files
- gitignored target conflicts
- dropped behaviors
- approximated behaviors
- manual follow-ups

Recommended report files:

- `codex-migration-report.json`
- human-readable console summary

CLI root resolution rule:

- If inside a git repo, the CLI should error unless `cwd` is exactly the repository root.
- `--root-dir <path>` overrides this and sets the conversion root explicitly.
- `--root-dir` is also the only supported way to run outside a git repository.

## Workstream 7: Test Strategy

Prefer integration and fixture-based tests.

Fixture repos should cover:

- single `CLAUDE.md` -> `AGENTS.md`
- `.claude/CLAUDE.md` -> `.agents/AGENTS.md`
- `CLAUDE.local.md` -> `AGENTS.override.md`
- gitignored target paths, especially pre-existing `AGENTS.override.md`
- invocation from a subdirectory of a git repo should error
- invocation outside git should error unless `--root-dir` is passed
- nested skills with supporting files
- legacy `.claude/commands`
- multiple agents with different model aliases
- pre-existing Codex outputs
- dirty git worktree safety behavior

Test assertions:

- generated files match snapshots
- reference rewrites are correct
- copied-but-unmutated metadata remains intact in generated skill files
- gitignored targets are never created, modified, or deleted
- running from a non-root git subdirectory fails without `--root-dir`
- running outside git fails without `--root-dir`
- only dropped or approximated behavior appears in the report
- dry-run output matches write output except for filesystem side effects

Where available in CI or local dev, add smoke verification for:

- TOML parse validity for `.codex/config.toml` and `agents/*.toml`

## Suggested Delivery Order

1. Discovery + IR
2. `CLAUDE.md` -> `AGENTS.md`
3. `.claude/skills` -> `.agents/skills`
4. `.claude/commands` -> `.agents/skills`
5. `.claude/agents` -> multi-agent config
6. reporting polish and safety checks
7. fixture expansion and smoke validation

## Safety Model

The tool should assume one-way synchronization into Codex-native outputs.

Normal behavior:

- overwrite previously generated `AGENTS.md`, `AGENTS.override.md`, `.agents/AGENTS.md`, `.agents/skills/**`, `.codex/config.toml`, and `agents/*.toml`
- delete stale generated Codex outputs when the Claude source no longer produces them
- rewrite generated files in place on every run

Dangerous behavior requiring an explicit override:

- writing generated outputs when the changes are not safely recoverable through git
- writing to gitignored target paths
- operating in a dirty git worktree when the tool cannot distinguish its changes from unrelated user changes
- operating outside a git repository unless the user explicitly accepts non-revertable writes

Implementation guidance:

- If inside a git repo with a clean worktree, overwriting generated files should be allowed without a dangerous flag because the user can revert the sync.
- A gitignored target path should be treated as non-revertable even inside a clean git repo.
- If inside a git repo but `cwd` is not the repo root, fail closed unless the user passes `--root-dir`.
- If outside git, fail closed unless the user passes `--root-dir` and the explicit non-revertable override.

## Definition of Done

The implementation is done when:

- a repo with Claude artifacts can be converted with one non-interactive command
- generated artifacts prefer `AGENTS.md`, `.agents/skills`, and `.codex/config.toml`
- no `CLAUDE.md` migration relies on symlinks
- all rewritten references point at Codex-native destinations
- subagent models map through a documented deterministic policy
- the CLI rejects non-root invocation by default and only allows alternate roots through `--root-dir`
- dropped or approximated behavior is called out in the report, while preserved unsupported metadata is left intact
- fixture-based integration tests cover the main migration paths and failure modes
