# Agent Note: 从 Cursor MCP 省略 DSH 子 agent 控制面

Status: implemented

[English](2026-09-04-mcp-omit-dsh-subagent-control-plane.md) | 中文

## Problem

Cursor Task 已经拥有父侧委派。把 DSH 的 `dsh_subagent` 放到 Cursor MCP 目录上会重复该能力。那些附带工具只为驱动这些 DSH 子 agent（智能体）而存在：`dsh_subagent_fork`（一次性 spawn 到 DSH 任务板）、`dsh_list_agents`（查询）、`dsh_send_message`（跟进）、`dsh_interrupt_agent`（中断），以及 `dsh_job_list` / `dsh_job_output` / `dsh_job_kill`（收集或停止 fork 任务）。只省略 spawn、却留下查询、发消息、中断或任务板，等于广告一套没有控制对象的控制面。

原生 headless、ACP 和 web 仍需要完整套件。Workflow 和 Ralph 因会 spawn DSH LLM 子 agent 而从 Cursor MCP 省略；[LLM 子 agent 省略笔记](2026-09-04-mcp-omit-dsh-llm-child-tools.md) 拥有该过滤。

## Decision

[`MCP_SUBAGENT_CONTROL_PLANE`](../../../../packages/cursor/mcp-prompt/src/prompt.ts) 列出这八个名称。[`MCP_OMITTED_TOOL_NAMES`](../../../../packages/cursor/mcp-prompt/README.md) 把它和 Cursor 已拥有的文件/shell/搜索/todo/web/plan/goal 克隆放在同一省略列表。[`listMcpTools`](../../../../packages/cursor/mcp-server/src/catalog.ts) 隐藏它们；[`executeMcpCall`](../../../../packages/cursor/mcp-server/src/execute.ts) 拒绝它们且不进入 `ctx.tools.execute`。目录仍是省略列表，不是允许列表，因此新的额外工具无需改服务器就会出现。

[`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) 描述 `dsh_skill`。被省略的线上名称不得作为子串出现在投影中。Cursor Task 是父侧子 agent。

原生 `packages/subagent/` 和任务工具仍由 `dsh-base` 加载；本过滤只作用于 Cursor MCP。[MCP 服务器笔记](../feature/2026-08-31-cursor-mcp-server.md) 和[投影笔记](../feature/2026-08-31-mcp-system-prompt-projection.md) 记录当前目录事实。

## Alternatives considered

**只省略 `dsh_subagent`。** 否决 — 查询、发消息、中断、fork 和任务板会变成在本目录上没有 spawn 路径的工具。

**为 workflow 和 Ralph 保留任务板。** 否决 — 那些 MCP 工具在前台运行，不返回 job id。任务板是为收集 `dsh_subagent_fork` 而存在的。

**删除 `packages/subagent` 或从 `dsh-base` 卸载这些工具。** 否决 — headless、ACP 和 web 仍会注册它们。Cursor MCP 只隐藏并拒绝，不删除 harness 能力。

**用 `MCP_TOOL_NAMES` 作为允许列表过滤 `tools/list`。** 否决 — [MCP 服务器笔记](../feature/2026-08-31-cursor-mcp-server.md) 已经否决该做法，以便新的额外工具无需改服务器就会出现。本省略列表与文件/shell 克隆是同一机制。

## Consequences

Cursor Task 是 overlay 的父侧子 agent。Workflow 和 Ralph 不进入本目录（[LLM 子 agent 省略](2026-09-04-mcp-omit-dsh-llm-child-tools.md)）；本 MCP 进程不需要 `DEEPSEEK_API_KEY`。以进程为作用域的 `mcp-<uuid>` owner Agent 仍然存在，让其余额外工具共享一个 DSH 会话。在本省略列表之前启动的 live `dsh` MCP 进程必须开关或重启；已有对话会保留旧目录。额外工具冒烟日志里的 spawn/list/job 行是历史记录。

## Testing

包测试要求 `MCP_SUBAGENT_CONTROL_PLANE` 的每个名称都在省略列表上，禁止这些名称作为子串出现在 `renderMcpSystemPrompt()` 中，从 `listMcpTools` 去掉它们，并在不运行已注册 execute 的情况下拒绝 `executeMcpCall`。原生 job 和 subagent 所属源文件仍包含已发布的指引字符串；MCP 投影不引用它们。
