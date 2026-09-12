# Agent Note: Overlay Cursor CLI outlives the viewer socket

Status: implemented

English | [中文](2026-09-03-cursor-overlay-cli-outlives-socket.zh.md)

## Problem

Operators leave the `dsh web` tab in the background or close the page while a Cursor turn is running. The overlay bound CLI lifetime to the `/cursor-agent` WebSocket, so a dropped upgrade killed the interactive PTY and the headless child. Returning to the page showed disconnected chrome; composer Enter sent into a closed socket and did nothing. The wanted rule is: the host Cursor CLI stays up for as long as `dsh web` itself is up, and only an explicit overlay close stops it.

## Decision

[`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) owns one CLI runtime per overlay session key. The upgrade path stays `/cursor-agent`; `?session=` carries the rail id (`cursor-cli-N`). A missing or invalid query mints a UUID so anonymous sockets still isolate. The first accept for a key spawns the interactive PTY (and later headless turns). Later accepts bind as the sole viewer: the previous socket is closed, and the new one receives `{op:"ready"}` then `{op:"snapshot"}` (`status`, `events`, `followUps`, `cursorSessionId`, `mirror`) before live frames. Socket `close` / `error` detaches that viewer only. `{op:"shutdown"}` or plugin dispose kills the PTY, the headless child, and the JSONL sink. The host pings the open viewer every 25s so idle-tab proxies are less likely to drop the upgrade.

[`@deepseek-ai/dsh-client-ui-cursor-agent`](../../../../packages/client/ui-cursor-agent/README.md) opens `cursorAgentChatUrl(sessionId)`. On unexpected close it marks disconnected chrome, keeps the last fold, and reopens after 400ms (immediately on `visibilitychange` to visible or `online`). `{op:"snapshot"}` replaces the fold from the host event list. The rail close control is the only overlay gesture that sends `{op:"shutdown"}` before unmounting that ChatSession. Page hide, tab sleep, and overlay unmount close the socket without shutdown. The rail list (ids and labels) is stored under `dsh.cursor-overlay.rail` together with this `dsh web` process's index meta boot id so a later page load in the same process rebinds the same keys. A new process ignores that record and starts at Chat 1.

This is the lifetime contract beside the overlay mapping in [floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md). JSONL identity follows the session key, not the socket; see [overlay conversation JSONL](../feature/2026-08-31-cursor-overlay-conversation-jsonl.md).

## Alternatives considered

**Keep killing the CLI on socket close.** Rejected — background tabs and page reloads are normal operator behavior, not an end-session gesture.

**Client-only reconnect that spawns a new CLI.** Rejected — a new PTY drops the in-flight headless turn and the transcript the operator just left.

**App-level `{op:"ping"}` instead of WebSocket ping frames.** Unnecessary for the idle-tab case; the host already can ping, and reconnect covers a dead upgrade.

**Fan-out one runtime to many concurrent viewers.** Rejected — one overlay tab is the product; the latest bind wins.

## Consequences

Leaving the page no longer stops Cursor. Operators who want the CLI gone must end that rail session (or stop `dsh web`). A host restart still drops every runtime; the next page load starts at Chat 1 with fresh CLIs and an empty snapshot. Two tabs on the same session steal the viewer from each other. In-memory snapshot events last only as long as the runtime.

## Testing

Gateway tests keep the PTY across viewer close, replay a running snapshot on rebind, stop the PTY only on `{op:"shutdown"}`, and reuse `?session=` without a second spawn. Client tests reconnect after `close`, apply a snapshot fold, send `{op:"shutdown"}` from rail close, restore named sessions from localStorage when the host boot meta matches, start at Chat 1 when it does not, and ignore malformed snapshot frames.
