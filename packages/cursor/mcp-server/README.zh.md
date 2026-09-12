# @deepseek-ai/dsh-cursor-mcp-server

[English](README.md) | 中文

把 DeepSeek Harness 额外工具暴露给 Cursor 的 stdio MCP 服务器。文件、shell、搜索、todo、web、plan、goals 和子 agent（智能体）每轮仍走 Cursor 自己的工具。本插件是 [`@deepseek-ai/dsh-mcp-client`](../../mcp/mcp-client/README.md) 的反向：DSH 是 MCP 服务器，Cursor 是客户端。

`pnpm dsh --profile cursor-mcp` 启动 `dsh-base` 加本组合包，不含 Host、HTTP 或浏览器层。stdout 专供 MCP JSON-RPC。overlay 里的 `agent` TUI 仍要 `pnpm dsh --profile web`。在该 web Host 上，本插件还会在 `/cursor-mcp` 注册 Streamable HTTP，并用一个 owner Agent 服务每一个 MCP HTTP 会话。Cursor CLI 与 IDE 都读 [`.cursor/mcp.json`](../../../.cursor/mcp.json)，它通过 [`bin/stdio.mjs`](bin/stdio.mjs) 启动。该入口会用绝对路径的 `tsx/esm` import、并把 `cwd` 设到工作区根再 re-exec Node，这样即使 spawn 时 cwd 不在工作区，也不会因找不到 `node_modules` 而导致 IDE 挂不上 `dsh` 工具目录。当 overlay spawn 设置 `CURSOR_DSH_MCP_URL` 时，`stdio.mjs` 最多等待 30 秒，然后把 stdio JSON-RPC 代理到该 Host 路由，而不再启动 `cursor-mcp`。用 `packages/cursor/cli/agent.cmd mcp enable dsh` 批准一次；`mcp list-tools dsh` 会打印过滤后的目录。web overlay 启动 CLI 时带 `--approve-mcps --trust`，因此该 CLI 进程会加载项目 `dsh`，而不再每次会话都弹批准。overlay CLI 和桌面 IDE 是两套 MCP 客户端：各自仍从 `.cursor/mcp.json` 拉起自己的 stdio 子进程。在桌面 Settings 里启用 `dsh` 不会给 overlay Cursor 挂上额外工具。overlay 拖动条上的 **dsh_mcp 已连接 / 启动中** 报的是该 CLI 的 `mcp list-tools dsh`，不是桌面 IDE。

## 用法

```yaml
- id: cursor-mcp-server
  name: '@deepseek-ai/dsh-cursor-mcp-server'
  config:
    cwd: !!js process.cwd()
```

插件会等 Loader 树其余部分就绪，然后连接 MCP。没有 `ctx.webServer` 时，它创建一个 owner Agent 并连接 stdio。有 Host webServer 时，它注册 `/cursor-mcp`，并在多个 Streamable HTTP 会话之间共用一个 owner Agent。存在 Loader 时，`apply` 在结算前就返回，避免本 fiber 等自己而死锁。`tools/list` 是去掉 [`MCP_OMITTED_TOOL_NAMES`](../mcp-prompt/README.md) 之后的 `ctx.tools.schemas()`，再加上 `dsh_system_prompt`。`tools/call` 在该 owner Agent 上调用 `ctx.tools.execute()`。`tools/change` 发送 MCP `listChanged`。服务器不猜测模型忘了说明；由模型重新获取 `dsh_system_prompt`（或 initialize `instructions`）。

DSH 子 agent 控制面（spawn、查询、发消息、中断、任务板）一并省略；Cursor Task 拥有父侧委派。Workflow 和 Ralph 被省略，因为它们的子 agent 会调用 DSH LLM；本目录不需要 `DEEPSEEK_API_KEY`。

## 配置

| 字段 | 必填 | 说明 |
|---|---|---|
| `cwd` | 否 | owner Agent 的 workspace cwd。空则使用 `process.cwd()`。 |

## MCP 约定

Initialize 的 `serverInfo.name` 是 `dsh`，因此 Cursor 可能显示 `mcp__dsh__dsh_skill`。线上名称仍是 `dsh_*`。参数为 JSON。被省略的名称以 `isError` 失败，且不会进入 `ctx.tools.execute`。

沙箱和审批仍然生效。此 stdio 进程没有审批 UI；需要询问的调用可能被拒绝，或等到策略插件结束。

额外工具在本 MCP 服务器的 owner Agent 上执行（overlay 经 HTTP 挂上时是 web Host 进程，否则是 stdio `cursor-mcp` 进程）。它不会出现在 web GUI 的 transcript（文本记录）里。

`/cursor-mcp` 路由只在 `Host` 为 loopback（`127.0.0.0/8`、`localhost`、`::1`）时应答。overlay spawn 必须设置 `CURSOR_DSH_MCP_URL`，不能用 `DSH_` 前缀：overlay 子进程走 `scrubbedParentEnv`，它会剥掉 `DSH_*`。

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

- **web 上 owner Agent 以 Host 为作用域，stdio 上以进程为作用域** — `dsh web` 注册 Streamable HTTP `/cursor-mcp`，overlay CLI 子进程经 `CURSOR_DSH_MCP_URL` 挂上。额外工具执行仍然不会出现在 web 聊天 transcript 里。桌面 IDE 以及没有该环境变量的 `cursor-mcp` 仍会启动私有 owner Agent（`createOwnerAgent` 在每个 stdio 进程铸造 `mcp-<uuid>`）。同一工作区的并发 stdio 进程不共享一个持久化会话 id。
- **没有审批 UI** — `ask` 策略在 stdio 上没有操作者控件；拒绝会作为工具结果返回。
- **本目录不使用 DSH LLM** — workflow 和 Ralph 被省略（[LLM 子 agent 省略笔记](../../../.agents/notes/implemented/architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md)）。skill 和 editor 不调用 DeepSeek。Cursor 会员身份不是 `DEEPSEEK_API_KEY`。原生 headless、ACP 和 web 仍注册这些工具。
- **不使用 Resources 和 Prompts** — 说明走 `dsh_system_prompt` 和 initialize `instructions`，Cursor 客户端对它们的调用比 MCP Resources 更可靠。
- **没有 MCP instructions-changed 通知** — skill 目录变更会在下一次 `dsh_system_prompt` 或新的 initialize 上可见；不完整 snapshot 会为该 owner Agent 保留上一份完整目录。
- **Cursor MCP initialize 超时** — 缺少挂接时，`cursor-mcp` 组合包禁用用不到的 `dsh-base` 行，让 stdio `initialize` 落在客户端大约 30 秒窗口内。保留平台 `shell` 提供者（Windows 上是 `pwsh-sandbox`）；禁掉它会让整树失败，因为 `permission-presets` 等待 `shell`。overlay 挂接会跳过那次 Loader 启动。
- **Cursor 仍会在 CLI 进程上初始化 `mcp.json` 里的每一台服务器** — 本 Host 只共享 `dsh`。其它用户全局服务器仍属于 Cursor 的客户端。
