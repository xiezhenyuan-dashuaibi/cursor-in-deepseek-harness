# Agent Note: Omit DSH LLM-child tools from Cursor MCP

Status: implemented

English | [中文](2026-09-04-mcp-omit-dsh-llm-child-tools.zh.md)

## Problem

Cursor hosted by DeepSeek Harness is the coding agent. Its model is Cursor's. Extra tools on the `dsh` MCP server must not require a DeepSeek provider key. `dsh_workflow` and `dsh_ralph` spawn DSH children that call DeepSeek through this process's credentials service (`DEEPSEEK_API_KEY` in the MCP spawn environment). Cursor membership is not that key. Advertising those names makes every live extra-tool call fail with `MISSING_CREDENTIAL` while looking like a catalog bug.

[The subagent-control-plane omit](2026-09-04-mcp-omit-dsh-subagent-control-plane.md) kept workflow and Ralph on MCP as the DSH-child path. That path is a DeepSeek-model product, not a Cursor extra.

Native headless, ACP, and web still need workflow and Ralph.

## Decision

[`MCP_DSH_LLM_CHILD_TOOLS`](../../../../packages/cursor/mcp-prompt/src/prompt.ts) is `dsh_workflow` and `dsh_ralph`. [`MCP_OMITTED_TOOL_NAMES`](../../../../packages/cursor/mcp-prompt/README.md) includes that list next to Cursor-owned clones and [`MCP_SUBAGENT_CONTROL_PLANE`](../../../../packages/cursor/mcp-prompt/src/prompt.ts). [`listMcpTools`](../../../../packages/cursor/mcp-server/src/catalog.ts) hides them; [`executeMcpCall`](../../../../packages/cursor/mcp-server/src/execute.ts) refuses them without `ctx.tools.execute`. The catalog stays an omit list, not an allow list.

[`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) describes `dsh_skill`. Omitted wire names must not appear as substrings in the projection. Parent-side fan-out and iteration stay on Cursor Task and Cursor goals. Skill (and other non-omitted extras such as the editor) do not call the DSH LLM.

Native `packages/workflow/` stays loaded in `dsh-base`; this filter is Cursor MCP only. [The MCP server note](../feature/2026-08-31-cursor-mcp-server.md) and [the projection note](../feature/2026-08-31-mcp-system-prompt-projection.md) record the current catalog facts. [The control-plane omit](2026-09-04-mcp-omit-dsh-subagent-control-plane.md) still owns the eight spawn/query/message/interrupt/job-board names.

## Alternatives considered

**Keep workflow and Ralph on MCP and require `DEEPSEEK_API_KEY` in the stdio environment.** Rejected — Cursor-hosted DSH is not a DeepSeek-model product. The key is a trap, not a setup step.

**Route those children through the Cursor Agent SDK or the parent Cursor model.** Rejected — the MCP server would have to call Cursor as an LLM. That inverts the client/server direction, special-cases workflow for one host, and still needs programmatic Cursor credentials.

**Stub or scripted provider inside `cursor-mcp`.** Rejected — the tools would advertise working orchestration that cannot think.

**Leave the names on `tools/list` and fail fast with a credential sentence.** Rejected — the catalog would still invite calls that cannot succeed on this host.

**Unload workflow plugins from the `cursor-mcp` profile.** Rejected — the omit list already hides and refuses; `dsh-base` stays one composition so a new extra still appears without editing the server.

## Consequences

Cursor MCP does not require `DEEPSEEK_API_KEY`. A live `dsh` process started before this omit list must be toggled or restarted; existing chats keep the old catalog. The extra-tool smoke log's workflow/Ralph rows are historical. [Workflow/Ralph child diagnostics](../bug-fix/2026-09-04-workflow-child-failure-diagnostic.md) remain for native compositions. The process-scoped `mcp-<uuid>` owner Agent still exists so remaining extras share one DSH session.

## Testing

Package tests require every `MCP_DSH_LLM_CHILD_TOOLS` name on the omit list, forbid those names as substrings in `renderMcpSystemPrompt()`, drop them from `listMcpTools`, and refuse `executeMcpCall` without running a registered execute. Native workflow and Ralph owner sources still contain their shipped guidance strings; the MCP projection does not quote them.
