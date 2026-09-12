# Agent Note: Overlay chrome shows dsh MCP list status

Status: implemented

English | [中文](2026-09-11-overlay-dsh-mcp-status.zh.md)

## Problem

Overlay Cursor chats often start without `dsh_*` tools. Operators then ask the model whether DSH MCP is connected. That question cannot be answered from inside a frozen catalog, and the C mark in the panel had no independent status.

## Decision

The overlay Cursor panel paints **dsh_mcp 启动中** or **dsh_mcp 已连接** as small type on the 1cm drag strip, immediately to the right of the rail C mark. `checking` and `disconnected` share 启动中; only `connected` is 已连接. [`createAgentChatRuntime`](../../../../packages/cursor/agent-gateway/src/chat-session.ts) probes with the same CLI argv plus `mcp list-tools dsh`, classifies project `dsh` (not `pms_mcp`) through [`classifyDshMcpListOutput`](../../../../packages/cursor/agent-gateway/src/dsh-mcp-status.ts) and [`settleDshMcpProbe`](../../../../packages/cursor/agent-gateway/src/dsh-mcp-status.ts), and publishes `{op:"dsh_mcp",status}` plus `snapshot.dshMcp`. The drain settles and kills the child as soon as `dsh` classifies. A timeout that never classifies `dsh` stays `checking` and retries after 1s. A clean listing with no `dsh` row is `disconnected` and retries after 15s; connected retries after 60s. A probe that starts from `disconnected` publishes `checking` first so the strip stays on 启动中. Tests that inject `spawnHeadless` skip the probe unless they also pass `spawnMcpList`.

## Alternatives considered

**Ask the model in the overlay chat.** Rejected — a session that started without `dsh` never lists those tools, so the answer is tautological and keeps interrupting work.

**Drive `/mcp list` on the interactive PTY.** Rejected — that hijacks the composer and slash mirror.

**Read the headless `--print` tool catalog.** Rejected — stream-json does not advertise the MCP catalog before a turn, and each print spawn is a new process.

**Show only after the first extra-tool call.** Rejected — operators need the fact at idle.

## Consequences

The label tracks a sibling `mcp list-tools dsh` spawn, not the frozen catalog of an already-running `--print` turn. Chrome can show 已连接 while the current overlay turn still lacks extras. Chrome stays 启动中 until `dsh` classifies as connected. A hung peer server stays `checking` (1s retry) instead of `disconnected` (15s retry); both paint 启动中. Overlay children inherit `CURSOR_DSH_MCP_URL` so that listing can attach to Host `/cursor-mcp` ([overlay shared web MCP](2026-09-12-overlay-shared-web-mcp.md)). The label is not an operator procedure: it does not tell anyone to wait, toggle desktop Settings, or open a new overlay chat to remount extras. Desktop Settings MCP is a different client than this overlay CLI.

## Testing

Parser unit tests pin `dsh: ready`, dsh error rows, `dsh_skill` / `mcp__dsh__` names, ignore `pms_mcp`, settle a hang as `checking`, and kill the child on early classify. Gateway tests inject `spawnMcpList` and expect `{op:"dsh_mcp",status:"connected"}` from `mcp list-tools dsh`. Panel tests render 启动中, flip to 已连接, then 启动中 again on `disconnected`.
