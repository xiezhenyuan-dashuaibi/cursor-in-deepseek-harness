# Agent Note: Overlay Cursor CLIs share the web Host MCP over Streamable HTTP

Status: implemented

English | [中文](2026-09-12-overlay-shared-web-mcp.zh.md)

## Problem

Each overlay Cursor CLI is a new process. Cursor's MCP client reads `.cursor/mcp.json` and stdio-spawns `packages/cursor/mcp-server/bin/stdio.mjs`, which cold-boots `dsh --profile cursor-mcp` (Cordis Loader plus slimmed `dsh-base` through tsx). Extra tools (`dsh_skill`, `dsh_system_prompt`, the editor) are small; the wait is that per-CLI harness boot, then Cursor's ~30s `initialize` barrier. Overlay `--print` does not retry a failed catalog. The extras themselves are not a large server. Cursor's client also initializes every other configured MCP server on that same CLI process; this repository cannot make those peers start in the background.

## Decision

[`dsh web`](../../../../packages/bundle/web-app/README.md) loads [`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) beside the overlay gateway. When `ctx.get('webServer')` is present, the plugin registers Streamable HTTP at `/cursor-mcp` and one owner Agent for every MCP HTTP session. It does not connect `StdioServerTransport` on that process (stdout stays the web Host). The gateway sets overlay child env `CURSOR_DSH_MCP_URL` to `http://127.0.0.1:{port}/cursor-mcp`. That name must not use a `DSH_` prefix: overlay spawn runs through `scrubbedParentEnv`, which strips `DSH_*`. [`bin/stdio.mjs`](../../../../packages/cursor/mcp-server/bin/stdio.mjs) waits up to 30s for that URL, then proxies stdio JSON-RPC (including empty notification bodies and SSE `data:` lines) to the Host. If the route never answers, it still boots `dsh --profile cursor-mcp` (desktop IDE and attach miss). The route answers only when `Host` is loopback. `.cursor/mcp.json` stays a stdio server so desktop IDE and overlay share one launch entry.

## Alternatives considered

**Put MCP JSON-RPC on the web process stdout.** Rejected — that is the [stdio server note](2026-08-31-cursor-mcp-server.md) rejection; the web Host already uses HTTP.

**Change `.cursor/mcp.json` to a Streamable HTTP URL.** Rejected — the URL includes the live web port; the desktop IDE has no Host; the file is a static project config.

**A long-lived `cursor-mcp` daemon outside `dsh web`.** Rejected — it would pay Loader again; the web process already loaded the tree.

**Teach Cursor to share one MCP client across overlay CLIs, or to initialize `dsh` before other servers.** Rejected — this repository does not own Cursor's MCP client. Sharing is DSH-side: one Host route, many stdio attachers. Other user-global servers stay Cursor's.

**Gateway warmup / delay the first `--print` until `mcp list` is ready.** Rejected as the sharing fix — a delayed prompt does not remove per-CLI Loader boot, and chrome still cannot remount extras onto an in-flight `--print` catalog ([overlay chrome](2026-09-11-overlay-dsh-mcp-status.md)).

## Consequences

Overlay sessions that spawn after the Host route is up skip `cursor-mcp` Loader boot and share one owner Agent. Extra-tool execute still does not appear in the web chat transcript. The desktop IDE without `CURSOR_DSH_MCP_URL` still boots the slim stdio profile ([initialize timeout](../bug-fix/2026-09-11-cursor-mcp-stdio-timeout.md)). A `--print` turn that started without extras keeps an empty catalog until the next CLI spawn. Other MCP servers in the user's Cursor config are unchanged. Loading this Host plugin is a process boot fact; an already-running `dsh web` does not grow the HTTP route through overlay live insert.

## Testing

Package tests cover loopback Host denial, GET without a session, unknown session 404, Streamable HTTP list/call, one owner Agent across two HTTP clients, route-register rollback, handleRequest 500 paths, stdio-to-HTTP proxy (JSON, SSE, empty body, session header), and `stdio.mjs` attaching when `CURSOR_DSH_MCP_URL` answers. Gateway tests assert overlay PTY spawn env carries that URL from `cursorMcpAttachUrl`. Named coverage gap: no keyless snapshot of overlay CLI initialize wall time against a live Cursor client.
