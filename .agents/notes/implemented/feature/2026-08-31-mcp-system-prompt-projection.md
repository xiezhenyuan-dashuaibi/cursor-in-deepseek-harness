# Agent Note: MCP system-prompt projection

Status: implemented

English | [中文](2026-08-31-mcp-system-prompt-projection.zh.md)

## Problem

Cursor is the coding agent. Its own system prompt already covers file, shell, search, todo, web, plan, goals, AGENTS.md, and generic coding hygiene. Native `ctx.systemPrompt.assemble()` still prepends DeepSeek Harness identity, persona, cwd, and those overlapping tool sections. Serving that full assembly over MCP would teach a second `dsh_read` / `dsh_bash` catalog next to Cursor's tools and waste tokens on rules Cursor already injected.

## Decision

[`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) renders a condensed projection for MCP clients. Native `assemble()` is unchanged.

The projection keeps extra-tool rules Cursor does not own: `dsh_skill` plus the live model-invocable skill catalog (name and capped description). The catalog entries and load-guidance sentences are owned by [`dsh-tool-skill`](../../../../packages/skill/tool-skill/README.md); [the MCP skill-catalog note](../bug-fix/2026-09-04-mcp-skill-catalog-projection.md) owns publishing them on this bus. Same-session goal tools are on the omit list because Cursor already exposes goal tools. The DSH subagent control plane (spawn, query, message, interrupt, job board) is omitted together because Cursor Task owns parent-side delegation; [the control-plane omit note](../architecture/2026-09-04-mcp-omit-dsh-subagent-control-plane.md) owns that filter. Workflow and Ralph are omitted because their children call the DSH LLM; [the LLM-child omit note](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md) owns that filter. MCP-only prose states that this server is DSH extras (initialize name `dsh`), that Cursor keeps overlapping tools (including goals and subagents), that wire names are `dsh_*` and may carry a client prefix, that compaction is recovered with `dsh_system_prompt`, and that DSH sandbox and approval still apply on these MCP calls.

This checkout's Cursor-in-DSH identity, start-of-work MCP connection check, and standing-order reminder live in [`.cursor/rules/dsh-cursor-in-dsh.mdc`](../../../../.cursor/rules/dsh-cursor-in-dsh.mdc). The MCP projection does not repeat them.

MCP-only prose also states that a denied extra-tool write must not be retried through Cursor file or shell tools, git apply, patch, python, or a preload/hook edit. That rule is workspace-generic: the projection does not name this checkout's spine prefixes.

Omitted from the projection: native harness identity (`You are an AI agent powered by DeepSeek Harness.`), persona, cwd, `harness:source`, `app:web-surface`, file/shell/search/todo/ask-user/web/plan/goal sections, deliverable-file-reference UI, and contributor `AGENTS.md` (Cursor already loads workspace instructions).

There is no enter/exit DSH mode. MCP presence is using DSH tools. The server does not guess that the model forgot the instructions; the client re-fetches `dsh_system_prompt` (or initialize instructions) after compaction.

## Alternatives considered

**Rewrite native `assemble()` into this subset.** Rejected — headless, ACP, and Code Mode still need the full DSH prompt, including file and shell guidance.

**Serve `assemble()` output over MCP unchanged.** Rejected — it duplicates Cursor's rules and re-exposes `dsh_read` / `dsh_bash` clones the product already forbade.

**Paraphrase extra-tool guidance for a shorter MCP prompt.** Rejected — those paragraphs are behavior. A second wording would drift from the owning plugins; tests grep the owner sources so native edits fail this package until the constants update.

**Cursor project rule plus enter/exit skills.** Rejected — skills are the wrong bus for JSON tool calling, and a mode flag is redundant once MCP tools are on the request. The enter/exit skills and `@deepseek-ai/dsh-cursor-dsh-mode` are deleted; MCP is the only extra-tool path; do not resurrect them. The rejected experiment is the archived [`cursor-cli-dsh-mode-skills`](../../archived/feature/2026-08-31-cursor-cli-dsh-mode-skills.md); this projection is what an MCP server returns.

**Guess “forgotten” and push the prompt.** Rejected — the model re-fetches. The server must not infer compaction from silence.

## Consequences

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) imports `renderMcpSystemPrompt()` and filters `ctx.tools.schemas()` against the omit list. This package stays a prompt library and is not in the web-app roster. Cursor may prefix tool names (`mcp__dsh__dsh_skill`); reminder text talks about a client prefix rather than one vendor's pattern. Model-facing names remain `dsh_*` per [the prefix Agent Note](../architecture/2026-08-31-model-facing-tool-names-dsh-prefix.md).

## Testing

Package tests snapshot the empty rendered prompt against the README fence, require every listed extra-tool name, forbid omitted names, this-checkout spine prefixes, and the project-rule identity sentence, grep the skill owning plugin for tool-description and catalog-string alignment, and pin a non-empty `<available_skills>` block to the shared formatter.
