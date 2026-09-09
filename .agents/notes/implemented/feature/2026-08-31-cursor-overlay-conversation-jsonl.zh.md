# Agent Note: Overlay Cursor conversation JSONL export

Status: implemented

[English](2026-08-31-cursor-overlay-conversation-jsonl.md) | 中文

## Problem

通过 dsh web Cursor overlay 聊天的操作者需要可检索的聊天记录。该 overlay 驱动长驻交互式 Cursor CLI PTY；原始字节 tee 噪声过大，因此网关改为写入结构化行。

## Decision

[`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) 为每个 overlay 会话键（`/cursor-agent` 上的 `?session=`，或新铸的 UUID）追加结构化 JSONL：

`{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl`

`cwd` 是 CLI spawn cwd（未配置时为 `process.cwd()`）。一份 overlay CLI runtime 对应一个 session id 与一个文件；查看者重连会继续追加。`{op:"shutdown"}` 写入 `close`。记录打上 UTC `ts` 与 `session`。计尺寸的行包括：

- `kind:"prompt"` — 浏览器提交的用户文本（已脱敏）
- `kind:"spawn"` — 交互 PTY 启动（`file`、`cwd`、清洗后的 `args`、`approveMcps`、`resume`）
- `kind:"cursor_event"` — 网关发出时可选的面向模型对象（已脱敏 JSON）
- `kind:"event"` — `open` / `exit` / `error` / `truncated` / `close`（`exit` 可带截断 `message`）

`maxLogFileBytes`（默认 8 MiB）停止继续写入计尺寸行并写入 `truncated`。该路径已 gitignore。`logConversations: false` 关闭日志。本日志不是 DSH Session 事件流，也不会进入 DeepSeek Harness 模型请求。

## Alternatives considered

**原始 PTY `in`/`out` tee。** 否决作为持久日志 — TUI 重绘噪声过大；选项面映射仍使用实时 PTY，而 JSONL 保持结构化。

**复制 Cursor IDE `agent-transcripts`。** 那些文件是 IDE 聊天，不是 `dsh web` overlay 会话。

**追加到 DSH Session 日志。** overlay 是宿主级 Cursor CLI，不是 DSH Session。

## Consequences

操作者可在工作区 `.cursor` 树下获得按会话划分的 JSONL 轨迹，且不把 overlay 绑到 DSH Session。不需要落盘时用 `logConversations: false` 关闭。查看者套接字掉线不会关闭该文件；见 [CLI 寿命长于套接字](../architecture/2026-09-03-cursor-overlay-cli-outlives-socket.md)。

## Testing

包测试覆盖路径解析、脱敏、spawn/prompt 追加、截断，以及吞掉磁盘错误。
