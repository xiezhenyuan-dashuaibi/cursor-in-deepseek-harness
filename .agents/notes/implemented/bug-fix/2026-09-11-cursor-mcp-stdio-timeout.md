# Agent Note: Cursor MCP stdio must finish initialize inside the 30s client timeout

Status: implemented

English | [中文](2026-09-11-cursor-mcp-stdio-timeout.zh.md)

## Problem

Cursor's MCP client gives a stdio server about 30s to complete `initialize`. `dsh --profile cursor-mcp` loads the full `dsh-base` tree through tsx. On Windows that handshake can take ~26s; `cursor-agent mcp list` wrapping the same spawn can take ~31s, so the CLI marks `dsh` failed. A session that starts without `dsh` never picks it up later. Desktop IDE retries once and can show connected; overlay `--print` and terminal CLI do not. Overlay CLI and the desktop IDE are separate MCP clients; enabling `dsh` in desktop Settings does not mount extras on overlay Cursor. `pms_mcp` failing is a separate HTTP/OAuth error.

## Decision

Keep `dsh-base` as the bundle. [`packages/cursor/mcp-server/cordis.patch.yml`](../../../../packages/cursor/mcp-server/cordis.patch.yml) disables unused base rows so Loader never activates them. Windows `shell` (`pwsh-sandbox`) and `permission` / `approval` / `sandbox` / `fs-sandbox` / `skill` / `tool-skill` / `tools` / `agents` / `cursor-mcp-server` stay enabled: `permission-presets` waits on `shell`, and disabling `pwsh-sandbox` fails the tree with `cannot create effect on inactive context`.

`$DSH_HOME/profiles/cursor-mcp/cordis.patch.yml` may repeat the same disables; the shipped bundle patch is the source that a fresh profile copies. After this layer, `cursor-agent --trust --approve-mcps mcp list` reports `dsh: ready` in well under 30s and lists `dsh_skill`, `dsh_str_replace_editor`, `dsh_system_prompt`.

## Alternatives considered

**Wait in an already-open chat until MCP becomes ready, toggle desktop Settings, or open a new overlay chat as a remount step.** Rejected — Cursor freezes the tool catalog at session start; desktop Settings is a different MCP client; overlay chrome does not remount extras onto an in-flight `--print` turn.

**Gateway warmup / first-prompt delay.** Rejected for this cut — catalog filtering and a later first prompt do not shorten Loader boot. Slimming the stdio tree is the initialize-timeout fix.

**Allow-list only `dsh_skill` in `listMcpTools`.** Rejected as the timeout fix — catalog filtering does not shorten Loader boot. Omit-list policy stays on [cursor MCP server](../feature/2026-08-31-cursor-mcp-server.md).

**Launch compiled `apps/cli/lib/bin.js` instead of tsx source.** Rejected for this cut — `stdio.mjs` owns that argv; a missing `apps/cli/lib` emit would still boot through tsx.

**Disable `pwsh-sandbox` / `tool-pwsh` with the other extras.** Rejected — `permission-presets` injects `shell`; the win32 shell row is `pwsh-sandbox`.

## Consequences

A later `dsh-base` row that extras execute actually need fails at Loader time, not silently. Operators who reset the cursor-mcp profile still get the shipped bundle patch. `pms_mcp` remains out of this change. Overlay chrome **dsh_mcp 已连接** can flip after a late `mcp list`; that already-open turn still lacks extras until the next CLI spawn. Overlay Host attach at `/cursor-mcp` skips this Loader boot when the route answers; the slim patch remains for the desktop IDE and for an attach miss ([overlay shared web MCP](../feature/2026-09-12-overlay-shared-web-mcp.md)).

## Testing

The shipped [`cordis.patch.yml`](../../../../packages/cursor/mcp-server/cordis.patch.yml) lists each unused `dsh-base` id with `disabled: true` and does not disable `pwsh-sandbox`. Cold `cursor-agent --trust --approve-mcps mcp list` reporting `dsh: ready` under 30s is the operator check on Windows.
