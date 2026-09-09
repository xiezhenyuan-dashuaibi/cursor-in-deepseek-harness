# Agent Note: Overlay Cursor CLI 的寿命长于查看套接字

Status: implemented

[English](2026-09-03-cursor-overlay-cli-outlives-socket.md) | 中文

## Problem

操作者把 `dsh web` 标签页放到后台，或在 Cursor 回合仍在跑时关掉页面。原先 overlay 把 CLI 寿命绑在 `/cursor-agent` WebSocket 上，升级一断就会杀掉交互 PTY 和 headless 子进程。再回到页面只剩断开状态；输入条 Enter 发进已关闭的套接字，没有任何效果。目标规则是：只要 `dsh web` 本身还在，宿主 Cursor CLI 就继续跑，只有明确的 overlay 关闭才停它。

## Decision

[`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) 按 overlay 会话键持有一份 CLI runtime。升级路径仍是 `/cursor-agent`；`?session=` 携带轨上的 id（`cursor-cli-N`）。缺少或非法的查询会另铸 UUID，匿名套接字仍然隔离。该键第一次被接受时生成交互 PTY（以及之后的 headless 回合）。之后的接受只绑定唯一查看者：关掉上一套接字，新套接字先收到 `{op:"ready"}` 再收到 `{op:"snapshot"}`（`status`、`events`、`followUps`、`cursorSessionId`、`mirror`），然后才是实时帧。套接字 `close` / `error` 只卸下该查看者。`{op:"shutdown"}` 或插件销毁才会杀掉 PTY、headless 子进程和 JSONL 槽。宿主对打开的查看者每 25 秒 ping 一次，降低空闲标签页代理掐断升级的概率。

[`@deepseek-ai/dsh-client-ui-cursor-agent`](../../../../packages/client/ui-cursor-agent/README.md) 打开 `cursorAgentChatUrl(sessionId)`。意外关闭时只改断开态 chrome、保留上次 fold，并在 400ms 后重开（`visibilitychange` 变为可见或 `online` 时立即重开）。`{op:"snapshot"}` 用宿主事件列表替换 fold。轨上的关闭控件是 overlay 里唯一会在卸载该 ChatSession 之前发送 `{op:"shutdown"}` 的手势。页面隐藏、标签页休眠、overlay 卸载只关套接字，不 shutdown。轨上的 id 与名称存在 `dsh.cursor-overlay.rail`，之后再次打开页面会绑回同一批键。

这是 [floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md) 映射决策旁边的寿命约定。JSONL 身份跟随会话键而不是套接字；见 [overlay 会话 JSONL](../feature/2026-08-31-cursor-overlay-conversation-jsonl.md)。

## Alternatives considered

**套接字一关就杀掉 CLI。** 否决 — 后台标签页和刷新页面是正常操作，不是结束会话。

**只在客户端重连并另起一份 CLI。** 否决 — 新的 PTY 会丢掉正在跑的 headless 回合，以及操作者刚离开时的 transcript。

**用应用层 `{op:"ping"}` 代替 WebSocket ping 帧。** 对空闲标签页没有必要；宿主已经能 ping，断线重连也能补上死掉的升级。

**一份 runtime 扇出给多个并发查看者。** 否决 — 产品是一个 overlay 标签页；最后一次 bind 获胜。

## Consequences

离开页面不再停下 Cursor。想关掉 CLI 的操作者必须结束那条轨上的会话（或停下 `dsh web`）。宿主重启仍会丢掉所有 runtime；下一次打开页面会新起 CLI，snapshot 为空。两个标签页抢同一个会话时会互相抢走查看者。内存里的 snapshot 事件只活到该 runtime 为止。

## Testing

网关测试覆盖查看者关闭后 PTY 仍在、重新 bind 时回放 running snapshot、只在 `{op:"shutdown"}` 时停下 PTY，以及 `?session=` 复用而不二次 spawn。客户端测试覆盖 `close` 后重连、应用 snapshot fold、轨上关闭发送 `{op:"shutdown"}`、从 localStorage 恢复命名会话，以及忽略畸形 snapshot 帧。
