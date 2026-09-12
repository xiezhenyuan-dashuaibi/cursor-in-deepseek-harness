# Agent Note: 面向 Cursor 的 DSH 额外工具 MCP 服务器

Status: implemented

[English](2026-08-31-cursor-mcp-server.md) | 中文

## Problem

Cursor 是 coding agent（编程智能体）。DeepSeek Harness 的额外工具（skill、workflow、Ralph）必须以 JSON MCP 工具调用，而不是进入/退出技能。[`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) 已经渲染说明投影，但还没有服务器返回它或执行 `ctx.tools`。

## Decision

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) 是 Cordis 命名空间插件，也是叠在 `dsh-base` 上的 `dsh --profile cursor-mcp` 组合包。它在 stdio 上讲 MCP：initialize `instructions` 和无参数的 `dsh_system_prompt` 都在对 owner Agent 的模型可调用 skill 做 snapshot 之后返回 `renderMcpSystemPrompt({ skillCatalog })`。`tools/list` 用 `MCP_OMITTED_TOOL_NAMES` 过滤 `ctx.tools.schemas()`，并始终包含 `dsh_system_prompt`。`tools/call` 把 JSON 参数映射到该 owner Agent 上的 `ctx.tools.execute()`。`tools/change` 发出 MCP `listChanged`。服务器从不推断模型忘了提示词。

MCP `serverInfo.name` 是 `dsh`。线上名称仍是 `dsh_*`；Cursor 可能加前缀（`mcp__dsh__dsh_skill`）。DSH 子 agent 控制面不进入本目录；[控制面省略笔记](../architecture/2026-09-04-mcp-omit-dsh-subagent-control-plane.md) 拥有该过滤。Workflow 和 Ralph 因子 agent 会调用 DSH LLM 而被省略；[LLM 子 agent 省略笔记](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md) 拥有该过滤。文件/shell/搜索/todo/ask-user/web/plan/goal 克隆被省略，即使仍注册也拒绝执行。

web overlay 仍启动 `--profile web`。Cursor CLI 与 IDE 都读 [`.cursor/mcp.json`](../../../../.cursor/mcp.json)，它通过 [`bin/stdio.mjs`](../../../../packages/cursor/mcp-server/bin/stdio.mjs) 启动，确保子进程先 chdir 到工作区根再执行 `dsh --profile cursor-mcp`。该子进程不是 web GUI 的 stdout。当 overlay 网关设置 `CURSOR_DSH_MCP_URL` 时，该 stdio 进程挂到 web Host 的 `/cursor-mcp`，而不是再启动 `cursor-mcp`（[overlay 共享 web MCP](2026-09-12-overlay-shared-web-mcp.md)）。

## Alternatives considered

**用 MCP Resources 代替 `dsh_system_prompt`。** 否决 — Cursor 客户端调用工具比 Resources 更可靠；无参数工具才是压缩之后模型可以重复获取的入口。

**只允许 `MCP_TOOL_NAMES`。** 否决 — 锁定的约定是按省略列表过滤，这样新的额外工具无需改服务器就会出现。

**在 web 进程的 stdout 上提供 MCP JSON-RPC。** 否决 — MCP 占用 stdout；web GUI 已经占用 HTTP。第二套组合让 overlay TUI 和 stdio 服务器不共享同一条流。overlay CLI 改为经 Host `/cursor-mcp` 上的 Streamable HTTP 共享额外工具（[overlay 共享 web MCP](2026-09-12-overlay-shared-web-mcp.md)）。

**把包放进 `packages/mcp/`。** 否决 — 这台服务器面向 Cursor（名称前缀、overlay `mcp.json`、相对 Cursor 工具的省略列表）。`mcp-client` 仍是另一方向的通用桥。

**把进入/退出 DSH 模式技能当作产品路径复活。** 否决 — MCP 在场就是在用 DSH 工具。那些技能和 `dsh-cursor-dsh-mode` 包已删除；它们不执行 `ctx.tools`；不要复活它们。被否决的实验见归档 [`cursor-cli-dsh-mode-skills`](../../archived/feature/2026-08-31-cursor-cli-dsh-mode-skills.md)。

**猜测「忘了」并主动推送提示词。** 否决 — 由模型重新获取。与[投影笔记](2026-08-31-mcp-system-prompt-projection.md)同一决定。

## Consequences

存在 Loader 时，插件 `apply` 在 `loader.await()` 之前返回，避免本 fiber 等自己的结算而死锁；MCP 在 `dsh-base` 其余部分起来之后再连接。overlay CLI 和桌面 IDE 各自从 `.cursor/mcp.json` 拉起自己的 stdio 子进程。overlay 使用 `--approve-mcps --trust`；桌面 Settings → Tools & MCP 只开关桌面 IDE 的客户端，不会给 overlay Cursor 挂上额外工具。`agent mcp enable dsh` 仍会把服务器写入本地批准列表。overlay 里的 Cursor CLI 仍需 `agent login`。额外工具执行不会出现在 web 会话 transcript 里。审批 `ask` 在 stdio 上没有控件。原生 `assemble()` 不变。投影 markdown 仍由提示词包拥有。

## Testing

包测试覆盖 Loader `unwrapExports`（无 default 导出）、invariant 伴生插件、带 `dsh_system_prompt` 的省略列表目录、InMemory MCP 的 initialize/list/call/`listChanged`、省略 `dsh_read` 且不执行、JSON 参数归一、content-block 映射、owner Agent 的创建/释放、`apply` 在连接失败时回滚，以及 live skill 目录披露（含不完整 snapshot 上的上一份完整目录）。Host Streamable HTTP 挂接覆盖见 [overlay 共享 web MCP](2026-09-12-overlay-shared-web-mcp.md)。
