# @deepseek-ai/dsh-cursor-agent-gateway

English | [中文](README.zh.md)

Host WebSocket gateway for the web chat overlay. The plugin registers the exact upgrade path `/cursor-agent` on `ctx.webServer`. One overlay session key (`?session=` on that path, or a minted UUID) owns a long-lived interactive Cursor CLI PTY (print/force flags stripped) for slash menus and other below-prompt option surfaces, and spawns a separate headless `--print --output-format stream-json` child for each `{op:"prompt"}` chat turn (with `--resume` after the first `session_id`). The WebSocket is a replaceable viewer: close detaches it; `{op:"shutdown"}` or plugin dispose stops the CLI.

`{op:"keys",data}` writes into the interactive PTY. On every screen update the gateway publishes `{op:"mirror",input,below}` for the gray input bar and rows strictly under it. Failed-turn abort banners (`Error: [aborted] …`, `ECONNRESET`) are status chrome: they are not `input` and not option rows. Chat transcript events come only from headless NDJSON as `{op:"event"}` — the PTY screen is never harvested into assistant text. Busy follow-ups use `{op:"prompt",mode:"queue"}` (FIFO drain on exit) and `{op:"followup_cancel"}` (LIFO pop); `mode:"steer"` kills the active child and starts a resume turn. `{op:"interrupt"}` kills the headless child and sends Ctrl+C to the PTY; `{op:"reset"}` clears the resume id and queue. A new viewer receives `{op:"snapshot"}` (`status`, `events`, `followUps`, `cursorSessionId`, `mirror`) before live frames. When the spawn cwd is this DeepSeek Harness checkout, headless turns inject `fence/preload.mjs` via Node `--import` and `NODE_OPTIONS`.

When `logConversations` is enabled (default), each overlay session key appends structured JSONL under `{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl`. The Host/Origin fence is `isTrustedApiRequest` from the connection plugin.

## Model Experience

None; the Cursor CLI owns the model conversation this gateway relays.

#### KV Cache effect

None; this package neither assembles nor sends a DeepSeek Harness provider request.

## Known Limitations and Deferred Work

- **JSONL is operator-facing, not a DSH Session log** — chat turns are headless stream-json; the interactive PTY is only for option surfaces.
- **Busy follow-up `steer` is kill + resume** — headless turns have no stdin steer channel.
- **The spine preload patches Node `fs` / `child_process`** — a native binary the CLI execs without going through those APIs can still mutate a spine path. Project hooks remain a second line for the desktop IDE. Spawns of `worker-server` and `packages/cursor/mcp-server/bin/stdio.mjs` strip this preload so project `dsh` MCP can still mount. A resolved `node_modules` path under a spine prefix is an install artifact, so overlay `pnpm install` can link workspace members. Replacing a workspace symlink under `node_modules` is allowed; a write through a directory link into spine source stays denied.
- **Prompt-row detection uses the gray input-bar paint** — chromatic selection washes are not the bar. When that paint is missing and a below-prompt picker is open (filter footer, keyed `[y]` rows, slash option columns), the extractor locates the bar as slash, empty draft, or home tip; option labels never become the bar. A full-screen Ink pager with no bar still mirrors its body after skipping the CLI header. A live AskQuestion Ink box (`AskQuestion` plus progress, `[ ]` rows, or `Space select` footer) is extracted first onto the same `{op:"mirror"}.below` list and wins over a concurrent slash menu.
- **Headless `--print` fabricates AskQuestion skip** — stream-json turns have no IDE form, so the CLI returns `Questions skipped by the user` immediately. The gateway intercepts that `tool_call`, projects the question onto the glass card (always appending Cursor's freeform Other after stripping a trailing catch-all), stops the skipped child, and treats overlay keys as the real answer `{op:"prompt"}` (arrows move; Space toggles a listed option or types a space on Other; printable keys and IME commits edit Other when it is highlighted; Enter confirms the highlighted option, using the typed Other text or the label `Other` when empty). Slash `{op:"keys"}` still go to the interactive PTY when no AskQuestion form is pending.
- **The screen buffer uses xterm deferred wrap** — a full-width Ink row plus CRLF must not skip a line; otherwise scrolled slash menus leave duplicate entries.
- **Cursor IDE `agent-transcripts` are a different product** — this log is only the `dsh web` overlay session.
- **The Cursor CLI outlives the viewer socket** — a dropped tab reconnects; `{op:"shutdown"}` or plugin dispose stops the CLI. A host restart drops every runtime.
