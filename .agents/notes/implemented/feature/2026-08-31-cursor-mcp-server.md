# Agent Note: Cursor MCP server for extra DSH tools

Status: implemented

English | [中文](2026-08-31-cursor-mcp-server.zh.md)

## Problem

Cursor is the coding agent. Extra DeepSeek Harness tools (skill, workflow, Ralph) must be callable as JSON MCP tools, not as enter/exit skills. [`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) already renders the instruction projection, but no server returned it or executed `ctx.tools`.

## Decision

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) is a Cordis namespace plugin and a `dsh --profile cursor-mcp` bundle over `dsh-base`. It speaks MCP on stdio: initialize `instructions` and no-arg `dsh_system_prompt` both return `renderMcpSystemPrompt({ skillCatalog })` after snapshotting the owner Agent's model-invocable skills. `tools/list` filters `ctx.tools.schemas()` with `MCP_OMITTED_TOOL_NAMES` and always includes `dsh_system_prompt`. `tools/call` maps JSON arguments to `ctx.tools.execute()` on one owner Agent. `tools/change` emits MCP `listChanged`. The server never infers that the model forgot the prompt.

MCP `serverInfo.name` is `dsh`. Wire names stay `dsh_*`; Cursor may prefix (`mcp__dsh__dsh_skill`). The DSH subagent control plane is omitted from this catalog; [the control-plane omit note](../architecture/2026-09-04-mcp-omit-dsh-subagent-control-plane.md) owns that filter. Workflow and Ralph are omitted because their children call the DSH LLM; [the LLM-child omit note](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md) owns that filter. File/shell/search/todo/ask-user/web/plan/goal clones are omitted and refused even if still registered.

The web overlay still boots `--profile web`. Cursor CLI and the IDE read [`.cursor/mcp.json`](../../../../.cursor/mcp.json), which launches [`bin/stdio.mjs`](../../../../packages/cursor/mcp-server/bin/stdio.mjs) so the child always chdirs to the workspace root before `dsh --profile cursor-mcp`. That child is not the web GUI process.

## Alternatives considered

**MCP Resources instead of `dsh_system_prompt`.** Rejected — Cursor clients invoke tools more reliably than Resources; the no-arg tool is the fetch the model can repeat after compaction.

**Allow-list `MCP_TOOL_NAMES` only.** Rejected — the locked contract filters the omit list so a new extra tool appears without editing the server.

**Serve MCP from the web process.** Rejected — MCP owns stdout; the web GUI already uses HTTP. A second composition keeps the overlay TUI and the stdio server from sharing a stream.

**Put the package in `packages/mcp/`.** Rejected — this server is Cursor-facing (name prefix, overlay `mcp.json`, omit list vs Cursor tools). `mcp-client` remains the generic bridge the other direction.

**Resurrect enter/exit DSH-mode skills as the product path.** Rejected — MCP presence is using DSH tools. Those skills and the `dsh-cursor-dsh-mode` package are removed; they did not execute `ctx.tools`; do not resurrect them. The rejected experiment is the archived [`cursor-cli-dsh-mode-skills`](../../archived/feature/2026-08-31-cursor-cli-dsh-mode-skills.md).

**Guess “forgotten” and push the prompt.** Rejected — the model re-fetches. Same decision as [the projection note](2026-08-31-mcp-system-prompt-projection.md).

## Consequences

When a Loader is present, plugin `apply` returns before `loader.await()` so this fiber does not deadlock waiting on its own settlement; MCP connects after the rest of `dsh-base` is up. The IDE Agent can list and call extra DSH tools once `.cursor/mcp.json` is present and Settings → Tools & MCP has `dsh` enabled; an IDE chat that started before the server mounted keeps an empty catalog until a new chat (or a toggle / full Cursor restart). The web overlay spawns the official CLI with `--approve-mcps --trust` so the TUI session loads project `dsh` without a per-session approval prompt; `agent mcp enable dsh` still adds the server to the local approved list. Overlay Cursor CLI still needs `agent login`. Extra-tool execute does not show in the web session. Approval `ask` has no widget on stdio. Native `assemble()` is unchanged. The prompt package remains the owner of the projection markdown.

## Testing

Package tests cover Loader `unwrapExports` (no default export), the invariant companion, omit-list catalog plus `dsh_system_prompt`, InMemory MCP initialize/list/call/`listChanged`, omitted `dsh_read` without execute, JSON argument coercion, content-block mapping, owner Agent create/dispose, `apply` connect-failure rollback, and live skill-catalog disclosure (including last-good on incomplete snapshot).
