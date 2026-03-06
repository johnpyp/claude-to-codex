# Claude Code to Codex CLI

A node cli for keeping claude code skills, CLAUDE.md files, subagents, commands, and more in sync with codex across a repo.

## Coding

- Always use bun install / bun run for stuff, but keep all the code node compatible so it will work in the end with `npx` / `pnpm dlx` / etc.
- Always type check your code.
- No casts or anys. Use zod for validation from unstructured places.
- For tests prefer integration/e2e tests with fixture workspaces to test on instead of unit tests
- Always look up the docs for the respective platforms
- Use `cac` for the cli framework
- Should run non-interactively, but safely. For example, we require `--dangerous-...` overrides for running in a git workspace that is dirty.
- Architecture: well-separated concerns. For example, there should be a section of the code that is entirely "reading all of the Claude related configuration comprehensively into a single unified, well-typed datastructure", *then* pass that to the conversion code. Don't mix the concerns.

## Reference

Codex docs:
- https://developers.openai.com/codex/llms.txt

Claude code docs:
- https://code.claude.com/docs/llms.txt

Follow the links and always fetch the `.md` version of pages
