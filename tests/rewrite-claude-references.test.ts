import { describe, expect, it } from "bun:test";

import { rewriteClaudeReferences } from "../src/utils/text.js";

describe("rewriteClaudeReferences", () => {
  it("does not rewrite CLAUDE.md family paths inside inline backticks", () => {
    const input =
      "Read `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, and `packages/api/CLAUDE.md` for filenames; " +
      "also edit CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md, and packages/api/CLAUDE.md in prose.";

    const { content } = rewriteClaudeReferences(input, [
      { from: "packages/api/CLAUDE.md", to: "packages/api/AGENTS.md" },
    ]);

    expect(content).toContain(
      "Read `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, and `packages/api/CLAUDE.md`",
    );
    expect(content).toContain(
      "also edit AGENTS.md, AGENTS.override.md, .agents/AGENTS.md, and packages/api/AGENTS.md in prose.",
    );
  });

  it("still rewrites non-Claude path references inside inline backticks", () => {
    const input = "See `.claude/skills/release/SKILL.md` for the skill.";
    const { content } = rewriteClaudeReferences(input, []);
    expect(content).toBe("See `.agents/skills/release/SKILL.md` for the skill.");
  });

  it("does not rewrite CLAUDE.md inside fenced code blocks", () => {
    const input = [
      "Use CLAUDE.md at the repo root.",
      "",
      "```",
      "CLAUDE.md",
      "```",
      "",
      "Done.",
    ].join("\n");

    const { content } = rewriteClaudeReferences(input, []);
    expect(content).toContain("Use AGENTS.md at the repo root.");
    expect(content).toMatch(/```\nCLAUDE\.md\n```/);
  });
});
