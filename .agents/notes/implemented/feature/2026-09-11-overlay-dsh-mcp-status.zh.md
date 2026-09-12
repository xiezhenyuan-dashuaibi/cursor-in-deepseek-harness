# Agent Note: Overlay chrome 显示 dsh MCP list 状态

Status: implemented

[English](2026-09-11-overlay-dsh-mcp-status.md) | 中文

## Problem

overlay 里的 Cursor 对话经常开局就没有 `dsh_*` 工具。操作者接着问模型 DSH MCP 连上没有。工具表一旦冻结，模型答不了；面板上的 C 标记也没有独立状态。

## Decision

overlay Cursor 面板在约 1cm 的拖动带上、轨上 C 标记右侧，用小字画 **dsh_mcp 启动中** 或 **dsh_mcp 已连接**。`checking` 与 `disconnected` 共用启动中；只有 `connected` 是已连接。[`createAgentChatRuntime`](../../../../packages/cursor/agent-gateway/src/chat-session.ts) 用同一套 CLI argv 再加 `mcp list-tools dsh` 探测，经 [`classifyDshMcpListOutput`](../../../../packages/cursor/agent-gateway/src/dsh-mcp-status.ts) 与 [`settleDshMcpProbe`](../../../../packages/cursor/agent-gateway/src/dsh-mcp-status.ts) 判定项目 `dsh`（不是 `pms_mcp`），并发布 `{op:"dsh_mcp",status}` 以及 `snapshot.dshMcp`。一旦 `dsh` 可判定，drain 立即结算并杀掉子进程。超时仍未判定 `dsh` 时保持 `checking`，1 秒后再探。干净列出且没有 `dsh` 行则为 `disconnected`，15 秒后再探；已连接则 60 秒后再探。从 `disconnected` 开始的探测先发布 `checking`，拖动带保持启动中。测试若注入 `spawnHeadless` 则跳过探测，除非同时传入 `spawnMcpList`。

## Alternatives considered

**在 overlay 对话里问模型。** 否决——开局没有 `dsh` 的会话永远列不出那些工具，答案同义反复，还打断干活。

**在交互 PTY 上敲 `/mcp list`。** 否决——会劫持输入框和 slash 镜像。

**读 headless `--print` 的工具目录。** 否决——stream-json 在回合开始前不公布 MCP 目录，而且每次 print spawn 都是新进程。

**等第一次额外工具调用再显示。** 否决——操作者在空闲时就要这个事实。

## Consequences

标签跟踪的是旁边一次 `mcp list-tools dsh` spawn，不是已经在跑的 `--print` 回合里冻住的目录。chrome 可以显示已连接，而当前 overlay 回合仍然没有额外工具。chrome 保持启动中，直到 `dsh` 判定为已连接。卡住的其它 MCP 保持 `checking`（1 秒再探），而不是 `disconnected`（15 秒再探）；两者都画启动中。overlay 子进程继承 `CURSOR_DSH_MCP_URL`，因此那次列出可以挂到 Host `/cursor-mcp`（[overlay 共享 web MCP](2026-09-12-overlay-shared-web-mcp.md)）。这个标签不是操作步骤：不要据此让人空等、去桌面 Settings 开关，或新开 overlay 对话来重挂额外工具。桌面 Settings 的 MCP 和这条 overlay CLI 不是同一个客户端。

## Testing

解析器单测钉住 `dsh: ready`、dsh 错误行、`dsh_skill` / `mcp__dsh__` 名称，忽略 `pms_mcp`，把挂起结算为 `checking`，并在提前判定时杀掉子进程。网关测试注入 `spawnMcpList`，并期望 `mcp list-tools dsh` 得到 `{op:"dsh_mcp",status:"connected"}`。面板测试先渲染启动中，再翻到已连接，再在 `disconnected` 上回到启动中。
