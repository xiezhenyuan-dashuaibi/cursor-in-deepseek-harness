# @deepseek-ai/dsh-cursor-mcp-server

[English](README.md) | 中文

把 DeepSeek Harness 额外工具暴露给 Cursor 的 stdio MCP 服务器。文件、shell、搜索、todo、web、plan、goals 和子 agent（智能体）每轮仍走 Cursor 自己的工具。本插件是 [`@deepseek-ai/dsh-mcp-client`](../../mcp/mcp-client/README.md) 的反向：DSH 是 MCP 服务器，Cursor 是客户端。

`pnpm dsh --profile cursor-mcp` 启动 `dsh-base` 加本组合包，不含 Host、HTTP 或浏览器层。stdout 专供 MCP JSON-RPC。overlay 里的 `agent` TUI 仍要 `pnpm dsh --profile web`；Cursor CLI 与 IDE 都读 [`.cursor/mcp.json`](../../../.cursor/mcp.json)，它通过 [`bin/stdio.mjs`](bin/stdio.mjs) 启动。该入口会用绝对路径的 `tsx/esm` import、并把 `cwd` 设到工作区根再 re-exec Node，这样即使 spawn 时 cwd 不在工作区，也不会因找不到 `node_modules` 而导致 IDE 挂不上 `dsh` 工具目录。用 `packages/cursor/cli/agent.cmd mcp enable dsh` 批准一次；`mcp list-tools dsh` 会打印过滤后的目录。web overlay 启动 CLI 时带 `--approve-mcps --trust`，因此 TUI 会话会加载项目 `dsh`，而不再每次会话都弹批准。若某个 IDE Agent 对话里没有 `dsh` 工具，打开 Cursor Settings → Tools & MCP，把 `dsh` 关再开（或彻底重启 Cursor），然后开一个**新**对话——已有会话不会补挂晚到的 MCP。

## 用法

```yaml
- id: cursor-mcp-server
  name: '@deepseek-ai/dsh-cursor-mcp-server'
  config:
    cwd: !!js process.cwd()
```

插件会等 Loader 树其余部分就绪，创建一个 owner Agent，然后连接 MCP。存在 Loader 时，`apply` 在结算前就返回，避免本 fiber 等自己而死锁。`tools/list` 是去掉 [`MCP_OMITTED_TOOL_NAMES`](../mcp-prompt/README.md) 之后的 `ctx.tools.schemas()`，再加上 `dsh_system_prompt`。`tools/call` 在该 owner Agent 上调用 `ctx.tools.execute()`。`tools/change` 发送 MCP `listChanged`。服务器不猜测模型忘了说明；由模型重新获取 `dsh_system_prompt`（或 initialize `instructions`）。

DSH 子 agent 控制面（spawn、查询、发消息、中断、任务板）一并省略；Cursor Task 拥有父侧委派。Workflow 和 Ralph 被省略，因为它们的子 agent 会调用 DSH LLM；本目录不需要 `DEEPSEEK_API_KEY`。

## 配置

| 字段 | 必填 | 说明 |
|---|---|---|
| `cwd` | 否 | owner Agent 的 workspace cwd。空则使用 `process.cwd()`。 |

## MCP 约定

Initialize 的 `serverInfo.name` 是 `dsh`，因此 Cursor 可能显示 `mcp__dsh__dsh_skill`。线上名称仍是 `dsh_*`。参数为 JSON。被省略的名称以 `isError` 失败，且不会进入 `ctx.tools.execute`。

沙箱和审批仍然生效。此 stdio 进程没有审批 UI；需要询问的调用可能被拒绝，或等到策略插件结束。

额外工具在本进程的 owner Agent 上执行，不会出现在 web GUI 里。

## 模型体验

### Initialize instructions

#### 模型看到的内容

MCP `initialize` 的 `instructions` 是 [`renderMcpSystemPrompt()`](../mcp-prompt/README.md) 按 owner Agent 当前模型可调用 skill（技能）目录返回的 markdown。本包对 `ctx.skills` 做 snapshot，不重复那份投影。

#### Token 影响

数据相关：静态额外工具包装加上当前 skill 目录，在客户端注入 initialize instructions 时支付。

#### KV Cache 影响

与原生 DSH `assemble()` 相互独立。Cursor 自己的系统提示词仍是客户端前缀。

### `dsh_system_prompt`

#### 模型看到的内容

无参数工具。描述为：

##### `dsh_system_prompt` 描述

```markdown
Return DeepSeek Harness extra-capability instructions for this MCP server. Call this when you have never read those instructions, or after compaction dropped them. Do not wait for the server to guess you forgot.
```

结果文本与 initialize instructions 相同。

#### Token 影响

每个包含此工具的请求都为 schema 支付固定 token；模型调用它时再加上当前投影（含 live skill 目录）。

#### KV Cache 影响

压缩之后重新获取，会替换或再次追加客户端注入的 MCP 说明。本包不为投影本身发送 DeepSeek Harness 提供方请求。

### 额外工具目录

#### 模型看到的内容

每个不在省略列表上的现役 `ctx.tools` schema，以其名称、描述和 JSON Schema 作为 MCP `inputSchema`。这些字符串由所属插件记录；本包只过滤并转发。

#### Token 影响

每个列出的额外工具都有数据相关的 schema 成本，在 Cursor 请求仍广告这些工具时支付。

#### KV Cache 影响

广告列表和 schema 不变时，Cursor 侧前缀稳定。`tools/change` 增删或修改 schema 时，可能从第一个变化的工具 token 起使复用失效。

## 已知限制与暂缓事项

- **与 web GUI 不是同一进程** — overlay 里的 Cursor CLI 拉起本 profile；额外工具执行不会出现在 web 会话中。
- **没有审批 UI** — `ask` 策略在 stdio 上没有操作者控件；拒绝会作为工具结果返回。
- **本目录不使用 DSH LLM** — workflow 和 Ralph 被省略（[LLM 子 agent 省略笔记](../../../.agents/notes/implemented/architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md)）。skill 和 editor 不调用 DeepSeek。Cursor 会员身份不是 `DEEPSEEK_API_KEY`。原生 headless、ACP 和 web 仍注册这些工具。
- **owner Agent 以进程为作用域** — `createOwnerAgent` 在每次 stdio 启动时铸造 `mcp-<uuid>`。额外工具的会话状态随该进程消失。同一工作区的并发 MCP 进程各自拥有独立 owner，不共享一个持久化会话 id。
- **不使用 Resources 和 Prompts** — 说明走 `dsh_system_prompt` 和 initialize `instructions`，Cursor 客户端对它们的调用比 MCP Resources 更可靠。
- **没有 MCP instructions-changed 通知** — skill 目录变更会在下一次 `dsh_system_prompt` 或新的 initialize 上可见；不完整 snapshot 会为该 owner Agent 保留上一份完整目录。
