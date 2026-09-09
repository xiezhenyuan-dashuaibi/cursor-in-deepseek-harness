# Agent Note: Omit DSH subagent control plane from Cursor MCP

Status: implemented

English | [中文](2026-09-04-mcp-omit-dsh-subagent-control-plane.zh.md)

## Problem

Cursor Task already owns parent-side delegation. Putting DSH `dsh_subagent` on the Cursor MCP catalog duplicates that. The companions only exist to drive those DSH children: `dsh_subagent_fork` (one-shot spawn onto the DSH job board), `dsh_list_agents` (query), `dsh_send_message` (follow-up), `dsh_interrupt_agent` (interrupt), and `dsh_job_list` / `dsh_job_output` / `dsh_job_kill` (collect or stop fork jobs). Omitting spawn while leaving query, message, interrupt, or the job board advertises a control plane with nothing to control.

Native headless, ACP, and web still need the full suite. Workflow and Ralph are omitted from Cursor MCP because they spawn DSH LLM children; [the LLM-child omit note](2026-09-04-mcp-omit-dsh-llm-child-tools.md) owns that filter.

## Decision

[`MCP_SUBAGENT_CONTROL_PLANE`](../../../../packages/cursor/mcp-prompt/src/prompt.ts) lists those eight names. [`MCP_OMITTED_TOOL_NAMES`](../../../../packages/cursor/mcp-prompt/README.md) includes that list next to the Cursor-owned file/shell/search/todo/web/plan/goal clones. [`listMcpTools`](../../../../packages/cursor/mcp-server/src/catalog.ts) hides them; [`executeMcpCall`](../../../../packages/cursor/mcp-server/src/execute.ts) refuses them without `ctx.tools.execute`. The catalog stays an omit list, not an allow list, so a new extra tool still appears without editing the server.

[`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) describes `dsh_skill`. Omitted wire names must not appear as substrings in the projection. Cursor Task is parent-side subagents.

Native `packages/subagent/` and the job tools stay loaded in `dsh-base`; this filter is Cursor MCP only. [The MCP server note](../feature/2026-08-31-cursor-mcp-server.md) and [the projection note](../feature/2026-08-31-mcp-system-prompt-projection.md) record the current catalog facts.

## Alternatives considered

**Omit only `dsh_subagent`.** Rejected — query, message, interrupt, fork, and the job board become tools with no spawn path on this catalog.

**Keep the job board for workflow and Ralph.** Rejected — those MCP tools run in the foreground and do not return a job id. The job board existed to collect `dsh_subagent_fork`.

**Delete `packages/subagent` or unload the tools from `dsh-base`.** Rejected — headless, ACP, and web still register them. Cursor MCP hides and refuses; it does not delete the harness capability.

**Filter `tools/list` with `MCP_TOOL_NAMES` as an allow list.** Rejected — [the MCP server note](../feature/2026-08-31-cursor-mcp-server.md) already rejected that so a new extra appears without editing the server. This omit list is the same mechanism as the file/shell clones.

## Consequences

Cursor Task is the overlay's parent-side subagent. Workflow and Ralph are omitted from this catalog ([LLM-child omit](2026-09-04-mcp-omit-dsh-llm-child-tools.md)); this MCP process does not require `DEEPSEEK_API_KEY`. The process-scoped `mcp-<uuid>` owner Agent still exists so remaining extras share one DSH session. A live `dsh` MCP process that started before this omit list must be toggled or restarted; existing chats keep the old catalog. The extra-tool smoke log's spawn/list/job rows are historical.

## Testing

Package tests require every `MCP_SUBAGENT_CONTROL_PLANE` name on the omit list, forbid those names as substrings in `renderMcpSystemPrompt()`, drop them from `listMcpTools`, and refuse `executeMcpCall` without running a registered execute. Native job and subagent owner sources still contain their shipped guidance strings; the MCP projection does not quote them.
