# cursor/ — official Cursor CLI

English | [中文](README.zh.md)

Install root for Cursor's official terminal Agent CLI (`agent`). This group is the harness brain peer to [`llm/`](../llm/README.md): DeepSeek HTTP stays on `ctx.llm`; this directory holds the Cursor CLI the DSH dialog talks to.

The Windows installer writes `%LocalAppData%\cursor-agent` and mutates the user `PATH`. This tree uses the same published zip (`2026.08.25-3e8eec8`) and layout, under `cli/` (gitignored), without touching the user `PATH`.

| Package | Role |
|---|---|
| `cli/` | Gitignored official zip layout (`agent.cmd` / versioned `node.exe` + `index.js`) |
| [`agent-gateway/`](agent-gateway/README.md) | Host WebSocket PTY at `/cursor-agent` for the web overlay |
| [`mcp-prompt/`](mcp-prompt/README.md) | MCP system-prompt projection: DSH-unique extra-tool rules, not native `assemble()` |
| [`mcp-server/`](mcp-server/README.md) | stdio MCP server: filtered extra `dsh_*` tools plus `dsh_system_prompt` |

```text
packages/cursor/cli/agent.cmd --version
packages/cursor/cli/agent.cmd login
```

The web overlay is [`@deepseek-ai/dsh-client-ui-cursor-agent`](../client/ui-cursor-agent/README.md). Sign in with `agent login` before the TUI can talk to Cursor. Overlay PTY sessions append operator JSONL at `{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl` (gitignored); see [`agent-gateway/`](agent-gateway/README.md).
