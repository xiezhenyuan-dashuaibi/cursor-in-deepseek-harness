# Agent Note: 从 Cursor MCP 省略需要 DSH LLM 的子 agent 工具

Status: implemented

[English](2026-09-04-mcp-omit-dsh-llm-child-tools.md) | 中文

## Problem

由 DeepSeek Harness 托管的 Cursor 是 coding agent（编程智能体）。它用的模型是 Cursor 的。`dsh` MCP 服务器上的额外工具不得要求 DeepSeek 提供方密钥。`dsh_workflow` 和 `dsh_ralph` 会 spawn DSH 子 agent，并通过本进程的凭据服务调用 DeepSeek（MCP spawn 环境里的 `DEEPSEEK_API_KEY`）。Cursor 会员身份不是该密钥。广告这些名称会让每次 live 额外工具调用以 `MISSING_CREDENTIAL` 失败，看起来像目录故障。

[省略子 agent 控制面](2026-09-04-mcp-omit-dsh-subagent-control-plane.md) 曾把 workflow 和 Ralph 留在 MCP 上，作为 DSH 子 agent 路径。那条路径是 DeepSeek 模型产品，不是 Cursor 额外能力。

原生 headless、ACP 和 web 仍需要 workflow 和 Ralph。

## Decision

[`MCP_DSH_LLM_CHILD_TOOLS`](../../../../packages/cursor/mcp-prompt/src/prompt.ts) 是 `dsh_workflow` 和 `dsh_ralph`。[`MCP_OMITTED_TOOL_NAMES`](../../../../packages/cursor/mcp-prompt/README.md) 把它和 Cursor 已拥有的克隆以及 [`MCP_SUBAGENT_CONTROL_PLANE`](../../../../packages/cursor/mcp-prompt/src/prompt.ts) 放在同一省略列表。[`listMcpTools`](../../../../packages/cursor/mcp-server/src/catalog.ts) 隐藏它们；[`executeMcpCall`](../../../../packages/cursor/mcp-server/src/execute.ts) 拒绝它们且不进入 `ctx.tools.execute`。目录仍是省略列表，不是允许列表。

[`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) 描述 `dsh_skill`。被省略的线上名称不得作为子串出现在投影中。父侧扇出和迭代留在 Cursor Task 和 Cursor goals。skill（以及 editor 等未被省略的额外工具）不调用 DSH LLM。

原生 `packages/workflow/` 仍由 `dsh-base` 加载；本过滤只作用于 Cursor MCP。[MCP 服务器笔记](../feature/2026-08-31-cursor-mcp-server.md) 和[投影笔记](../feature/2026-08-31-mcp-system-prompt-projection.md) 记录当前目录事实。[控制面省略](2026-09-04-mcp-omit-dsh-subagent-control-plane.md) 仍拥有那八个 spawn/查询/发消息/中断/任务板名称。

## Alternatives considered

**把 workflow 和 Ralph 留在 MCP 上，并要求 stdio 环境提供 `DEEPSEEK_API_KEY`。** 否决 — 由 Cursor 托管的 DSH 不是 DeepSeek 模型产品。该密钥是陷阱，不是安装步骤。

**把这些子 agent 改走 Cursor Agent SDK 或父级 Cursor 模型。** 否决 — MCP 服务器将不得不把 Cursor 当 LLM 来调用。这会反转客户端/服务器方向，为单一宿主给 workflow 开特例，并且仍需要可编程的 Cursor 凭据。

**在 `cursor-mcp` 里塞 stub 或脚本化提供方。** 否决 — 工具会广告一套无法思考的编排。

**名称留在 `tools/list` 上，用凭据句子快速失败。** 否决 — 目录仍会邀请在本宿主上不可能成功的调用。

**从 `cursor-mcp` profile 卸载 workflow 插件。** 否决 — 省略列表已经隐藏并拒绝；`dsh-base` 保持同一套组合，新的额外工具无需改服务器就会出现。

## Consequences

Cursor MCP 不需要 `DEEPSEEK_API_KEY`。在本省略列表之前启动的 live `dsh` 进程必须开关或重启；已有对话会保留旧目录。额外工具冒烟日志里的 workflow/Ralph 行是历史记录。[Workflow/Ralph 子 agent 诊断](../bug-fix/2026-09-04-workflow-child-failure-diagnostic.md) 仍用于原生组合。以进程为作用域的 `mcp-<uuid>` owner Agent 仍然存在，让其余额外工具共享一个 DSH 会话。

## Testing

包测试要求 `MCP_DSH_LLM_CHILD_TOOLS` 的每个名称都在省略列表上，禁止这些名称作为子串出现在 `renderMcpSystemPrompt()` 中，从 `listMcpTools` 去掉它们，并在不运行已注册 execute 的情况下拒绝 `executeMcpCall`。原生 workflow 和 Ralph 所属源文件仍包含已发布的指引字符串；MCP 投影不引用它们。
