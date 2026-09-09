# Agent Note: Overlay abort chrome does not own the composer

Status: implemented

English | [中文](2026-09-04-cursor-overlay-error-locks-composer.zh.md)

## Problem

A failed Cursor turn paints `Error: [aborted] read ECONNRESET` on the CLI gray bar. The overlay treated that row as `{op:"mirror"}` draft and below-prompt chrome, latched PTY ownership, and `{op:"status",status:"error"}` left the host in error. The pill showed the banner; every keystroke went to the PTY; Enter never sent `{op:"prompt"}`.

## Decision

Abort banners are CLI status chrome, not a draft or a picker. `isCliStatusChrome` matches `Error: [` and `ECONNRESET`; `extractPromptMirror` emits empty `input`, and `keepOptionSurface` drops those rows.

The client filters the same text with `isAbortChromeDraft`. `{op:"error"}`, `{op:"status",status:"error"}`, and snapshot `status:"error"` call `applyFailedTurn`: the message is a transcript alert, host status returns to `idle` with the composer ready, below-prompt rows and the mirror latch clear, and the draft empties only when it is abort chrome or equals the host message. Overlay mapping remains [Floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md).

## Alternatives considered

**Disable the textarea while host status is error.** Rejected — the operator cannot send another `{op:"prompt"}` in the same session.

**Treat the abort banner as a picker until the next idle status.** Rejected — Ink offers no selection on that banner; latching PTY ownership is the lock.

**Strip abort text only in the browser.** Rejected as the sole fix — a reconnect `{op:"snapshot"}` would re-inject a host mirror that still carried the banner.

## Consequences

Failed-turn text stays in the alert. The pill is empty and local. A real slash or option row that survives the filter still owns the bar.

## Testing

`packages/cursor/agent-gateway/tests/prompt-mirror.spec.ts` pins abort banners to empty `input` / `below`. `packages/client/ui-cursor-agent/tests/composer-clipboard.spec.ts` pins `isAbortChromeDraft`. `packages/client/ui-cursor-agent/tests/chat-session.client.spec.tsx` types and sends `{op:"prompt"}` after an abort mirror and a host error, keeps a differing local draft, and still forwards keys when option rows remain under abort `input`.
