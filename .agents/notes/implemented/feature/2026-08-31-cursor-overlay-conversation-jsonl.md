# Agent Note: Overlay Cursor conversation JSONL export

Status: implemented

English | [中文](2026-08-31-cursor-overlay-conversation-jsonl.zh.md)

## Problem

Operators chatting through the dsh web Cursor overlay need a searchable record of that chat. The overlay drives a long-lived interactive Cursor CLI PTY; a raw byte tee is noisy, so the gateway writes structured rows instead.

## Decision

[`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) appends structured JSONL for each overlay session key (`?session=` on `/cursor-agent`, or a minted UUID):

`{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl`

`cwd` is the CLI spawn cwd (`process.cwd()` unless configured). One overlay CLI runtime is one session id and one file; viewer reconnects append to it. `{op:"shutdown"}` writes `close`. Records stamp UTC `ts` and `session`. Sized rows are:

- `kind:"prompt"` — browser-submitted user text (secret-redacted)
- `kind:"spawn"` — the interactive PTY launch (`file`, `cwd`, scrubbed `args`, `approveMcps`, `resume`)
- `kind:"cursor_event"` — optional parsed model-facing objects when the gateway emits them (secret-redacted JSON)
- `kind:"event"` — `open` / `exit` / `error` / `truncated` / `close` (`exit` may carry a capped message)

`maxLogFileBytes` (default 8 MiB) stops further sized rows and writes `truncated`. The path is gitignored. `logConversations: false` disables the log. This log is not a DSH Session event stream and does not reach a DeepSeek Harness model request.

## Alternatives considered

**Raw PTY `in`/`out` tee.** Rejected for the durable log — TUI redraw noise; option-surface mapping still uses the live PTY, while JSONL stays structured.

**Copy Cursor IDE `agent-transcripts`.** Those files are the IDE chat, not the `dsh web` overlay session.

**Append to the DSH Session log.** The overlay is host-wide Cursor CLI, not a DSH Session.

## Consequences

Operators get a per-session JSONL trail under the workspace `.cursor` tree without coupling the overlay to DSH Sessions. Disable with `logConversations: false` when disk writes are unwanted. Viewer socket drops do not close the file; see [CLI outlives the socket](../architecture/2026-09-03-cursor-overlay-cli-outlives-socket.md).

## Testing

Package tests cover path resolution, redaction, spawn/prompt append, truncation, and disk-error swallowing.
