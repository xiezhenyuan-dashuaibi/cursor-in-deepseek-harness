# Agent Note: Workflow and Ralph surface failed-child turn/end diagnostics

Status: implemented

English | [中文](2026-09-04-workflow-child-failure-diagnostic.zh.md)

## Problem

[One-shot subagent settlement](2026-09-03-subagent-turn-end-error-diagnostic.md) already copies a child's last `turn/end` `error.message` onto `SubagentResult.diagnostic` and into job/foreground subagent results. Workflow `agent()` still resolved `null` with no reason, and Ralph's round-failed error said only that the child failed before a structured report. Cursor MCP extra-tool smoke hit both on `MISSING_CREDENTIAL`: `dsh_workflow` returned `{ "text": null }`, and `dsh_ralph` hid the credential message. `agent()` remaining `null` is the script contract; the parent-facing tool text was stripping the recorded failure.

## Decision

The worker-thread engine copies a non-empty `SubagentResult.diagnostic` onto the host→worker `ChildResult` and onto `workflow/agent-end` when `outcome` is `failed`. `agent()` still returns `null`. `dsh_workflow` lists those strings as `childDiagnostics` on a successful script result and as a `Child failures:` block in Native text, in child-start order. `dsh_ralph` appends the last failed child's diagnostic to the round-failed error. Completed and cancelled ends omit the field. Cursor MCP omits those parent tools ([LLM-child omit](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md)). Missing `DEEPSEEK_API_KEY` remains a native headless/ACP/web deployment fact.

## Alternatives considered

**Throw from `agent()` when diagnostic is present.** Rejected — scripts `.filter(Boolean)` on ordinary child failure; a throw would kill the whole workflow.

**Persist one MCP owner session id across stdio respawns.** Rejected here — concurrent MCP processes for one workspace must not share an owner. Process-scoped `mcp-<uuid>` stays the MCP contract; document it on the MCP server README.

**Put diagnostic only on `log()`.** Rejected — Cursor MCP has no workflow UI observer; the parent tool text is what the model sees.

## Consequences

- A failed workflow child still yields `null` inside the script; the parent tool text names the turn/end message.
- Ralph round-failed errors include that message when the engine recorded one.
- `tool-workflow/agent-end` session records stay outcome-only; the model-visible text lives on the tool result.

## Testing

Package tests cover host `ChildResult` forwarding, worker `workflow/agent-end.diagnostic`, `dsh_workflow` `Child failures:` rendering, and Ralph round-failed error text. Cursor MCP does not advertise those tools.
