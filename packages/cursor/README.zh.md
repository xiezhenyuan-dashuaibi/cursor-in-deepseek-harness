# cursor/ — 官方 Cursor CLI

[English](README.md) | 中文

Cursor 官方终端 Agent CLI（`agent`）的安装根目录。本组与 [`llm/`](../llm/README.md) 同级：DeepSeek HTTP 仍走 `ctx.llm`；DSH 对话框对接的 Cursor CLI 放在这里。

Windows 官方安装器会写入 `%LocalAppData%\cursor-agent` 并改用户 `PATH`。本树使用同一份已发布 zip（`2026.08.25-3e8eec8`）和目录布局，放在 `cli/`（不入库），不改用户 `PATH`。

| 包 | 角色 |
|---|---|
| `cli/` | 不入库的官方 zip 布局（`agent.cmd` / 带版本的 `node.exe` + `index.js`） |
| [`agent-gateway/`](agent-gateway/README.md) | 给 Web overlay 用的宿主 WebSocket PTY，路径为 `/cursor-agent` |
| [`mcp-prompt/`](mcp-prompt/README.md) | MCP 系统提示词投影：只保留 DSH 独特的额外工具规则，不是原生 `assemble()` |
| [`mcp-server/`](mcp-server/README.md) | stdio MCP 服务器：过滤后的额外 `dsh_*` 工具，加上 `dsh_system_prompt` |

```text
packages/cursor/cli/agent.cmd --version
packages/cursor/cli/agent.cmd login
```

Web overlay 是 [`@deepseek-ai/dsh-client-ui-cursor-agent`](../client/ui-cursor-agent/README.md)。TUI 要连上 Cursor 之前，先用 `agent login` 登录。overlay PTY 会话会把操作者 JSONL 追加到 `{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl`（不入库）；见 [`agent-gateway/`](agent-gateway/README.md)。
