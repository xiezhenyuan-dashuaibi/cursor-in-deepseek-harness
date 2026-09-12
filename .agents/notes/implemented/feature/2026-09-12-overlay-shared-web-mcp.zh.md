# Agent Note: Overlay Cursor CLI 经 Streamable HTTP 共享 web Host MCP

Status: implemented

[English](2026-09-12-overlay-shared-web-mcp.md) | 中文

## Problem

每个 overlay Cursor CLI 都是新进程。Cursor 的 MCP 客户端读 `.cursor/mcp.json`，用 stdio spawn `packages/cursor/mcp-server/bin/stdio.mjs`，再冷启动 `dsh --profile cursor-mcp`（Cordis Loader 加上经 tsx 精简的 `dsh-base`）。额外工具（`dsh_skill`、`dsh_system_prompt`、编辑器）很小；等待的是这次按 CLI 计的 harness 启动，再加上 Cursor 大约 30 秒的 `initialize` 屏障。overlay `--print` 不会重试失败的目录。额外工具本身不是一台很大的服务器。Cursor 的客户端还会在同一个 CLI 进程上初始化其它已配置的 MCP 服务器；本仓库不能让那些对等服务器在后台启动。

## Decision

[`dsh web`](../../../../packages/bundle/web-app/README.md) 在 overlay 网关旁边加载 [`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md)。存在 `ctx.get('webServer')` 时，插件在 `/cursor-mcp` 注册 Streamable HTTP，并用一个 owner Agent 服务每一个 MCP HTTP 会话。它不在该进程上连接 `StdioServerTransport`（stdout 仍归 web Host）。网关把 overlay 子进程环境变量 `CURSOR_DSH_MCP_URL` 设为 `http://127.0.0.1:{port}/cursor-mcp`。该名称不得使用 `DSH_` 前缀：overlay spawn 走 `scrubbedParentEnv`，它会剥掉 `DSH_*`。[`bin/stdio.mjs`](../../../../packages/cursor/mcp-server/bin/stdio.mjs) 最多等待该 URL 30 秒，然后把 stdio JSON-RPC（含空通知体和 SSE（Server-Sent Events） `data:` 行）代理到 Host。若路由始终无应答，它仍启动 `dsh --profile cursor-mcp`（桌面 IDE 和挂接失败）。该路由只在 `Host` 为 loopback 时应答。`.cursor/mcp.json` 保持 stdio 服务器，让桌面 IDE 和 overlay 共用一个启动入口。

## Alternatives considered

**把 MCP JSON-RPC 放到 web 进程的 stdout 上。** 否决 — 这是 [stdio 服务器笔记](2026-08-31-cursor-mcp-server.md) 的否决；web Host 已经占用 HTTP。

**把 `.cursor/mcp.json` 改成 Streamable HTTP URL。** 否决 — URL 含有活的 web 端口；桌面 IDE 没有 Host；该文件是静态项目配置。

**在 `dsh web` 之外再跑一台长驻 `cursor-mcp` 守护进程。** 否决 — 会再付一次 Loader；web 进程已经加载了那棵树。

**让 Cursor 在 overlay CLI 之间共用一个 MCP 客户端，或让 `dsh` 先于其它服务器 initialize。** 否决 — 本仓库不拥有 Cursor 的 MCP 客户端。共享在 DSH 侧：一条 Host 路由，多个 stdio 挂接者。其它用户全局服务器仍属于 Cursor。

**网关预热 / 把第一次 `--print` 拖到 `mcp list` 就绪。** 否决作为共享修复 — 推迟 prompt 不会去掉按 CLI 计的 Loader 启动，而且 chrome 仍然不能把额外工具挂进正在进行的 `--print` 目录（[overlay chrome](2026-09-11-overlay-dsh-mcp-status.md)）。

## Consequences

Host 路由起来之后 spawn 的 overlay 会话会跳过 `cursor-mcp` 的 Loader 启动，并共用一个 owner Agent。额外工具执行仍然不会出现在 web 聊天 transcript（文本记录）里。没有 `CURSOR_DSH_MCP_URL` 的桌面 IDE 仍启动精简 stdio profile（[initialize 超时](../bug-fix/2026-09-11-cursor-mcp-stdio-timeout.md)）。在没有额外工具的情况下开始的 `--print` 回合会保持空目录，直到下一次 CLI spawn。用户 Cursor 配置里的其它 MCP 服务器不变。加载这个 Host 插件是进程启动事实；已经在跑的 `dsh web` 不会通过 overlay live insert 长出这条 HTTP 路由。

## Testing

包测试覆盖 loopback Host 拒绝、无会话的 GET、未知会话 404、Streamable HTTP 的 list/call、两个 HTTP 客户端共用一个 owner Agent、路由注册回滚、handleRequest 的 500 路径、stdio 到 HTTP 的代理（JSON、SSE、空 body、会话头），以及 `CURSOR_DSH_MCP_URL` 可应答时 `stdio.mjs` 挂接。网关测试断言 overlay PTY spawn 环境带有来自 `cursorMcpAttachUrl` 的该 URL。具名覆盖缺口：没有对着活 Cursor 客户端测量 overlay CLI initialize 墙钟时间的 keyless 快照。
