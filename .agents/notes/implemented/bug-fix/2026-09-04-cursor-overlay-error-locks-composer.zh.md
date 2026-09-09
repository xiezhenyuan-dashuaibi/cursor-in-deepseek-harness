# Agent Note: Overlay 失败回合横幅不得占用输入框

Status: implemented

[English](2026-09-04-cursor-overlay-error-locks-composer.md) | 中文

## Problem

失败的 Cursor 回合会把 `Error: [aborted] read ECONNRESET` 画在 CLI 灰色输入条上。overlay 把该行当成 `{op:"mirror"}` 草稿和输入行下方 chrome，闩上 PTY 占用，且 `{op:"status",status:"error"}` 把宿主留在 error。pill 里显示横幅；每个按键都进 PTY；Enter 不再发送 `{op:"prompt"}`。

## Decision

失败横幅是 CLI 状态 chrome，不是草稿或选项面。`isCliStatusChrome` 匹配 `Error: [` 与 `ECONNRESET`；`extractPromptMirror` 发出空 `input`，`keepOptionSurface` 丢掉这些行。

客户端用 `isAbortChromeDraft` 过滤同一段文本。`{op:"error"}`、`{op:"status",status:"error"}` 以及 snapshot 的 `status:"error"` 都走 `applyFailedTurn`：消息是 transcript 警告，宿主状态回到 `idle` 且输入框就绪，输入行下方行与 mirror 闩锁清空，仅当草稿本身是失败横幅或等于宿主消息时才清空草稿。overlay 映射仍见 [浮动 Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md)。

## Alternatives considered

**在宿主状态为 error 时禁用 textarea。** 否决 — 操作者无法在同一会话里再发 `{op:"prompt"}`。

**把失败横幅当选项面，直到下一次 idle。** 否决 — Ink 在该横幅上不提供选择；闩上 PTY 占用就是锁死。

**只在浏览器里剥掉失败文本。** 作为唯一修复否决 — 重连 `{op:"snapshot"}` 会再次注入仍带横幅的宿主 mirror。

## Consequences

失败回合文本留在警告里。pill 为空且走本地草稿。过滤后仍剩下的真实 slash 或选项行仍然占用输入条。

## Testing

`packages/cursor/agent-gateway/tests/prompt-mirror.spec.ts` 固定失败横幅对应空 `input` / `below`。`packages/client/ui-cursor-agent/tests/composer-clipboard.spec.ts` 固定 `isAbortChromeDraft`。`packages/client/ui-cursor-agent/tests/chat-session.client.spec.tsx` 在 abort mirror 与宿主 error 之后仍可键入并发送 `{op:"prompt"}`，保留与消息不同的本地草稿，并在 abort `input` 下方仍有选项行时转发按键。
