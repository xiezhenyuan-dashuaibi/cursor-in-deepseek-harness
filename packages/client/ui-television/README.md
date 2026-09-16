# @deepseek-ai/dsh-client-ui-television

English | [中文](README.zh.md)

CRT television floater on `shell.overlay`. The browser half registers `Television` with id `television` at order 180 (never `root`, never `cursor-agent`, never `overlay-card.body`, never `overlay-desktop.body`). The package declares `dsh.client.panelTitle` and omits `overlayBody`, so the Cursor rail lists it as a standalone fiber (拔出 writes Loader `disabled`; hide is not offered). The cabinet is the hit target; the CRT iframe opens `https://example.com/` and retunes from the channel plate to another `http` or `https` URL. Sites that send `X-Frame-Options` or `frame-ancestors` stay blank. Drag, click-through holes, and a reusable shaped host are out of this package. The node half is an inert Loader seat. The default web-app roster does not mount this package. Live insert is `pnpm overlay:live insert packages/client/ui-television`.

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-television` locale key union. The set component stays package-internal.

## Model Experience

None, as this overlay television is a browser-only shell.overlay fiber and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Must not occupy `root` or reuse `cursor-agent`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel.
- **Not a card or desktop occupant** — this fiber does not declare `overlayBody` and does not insert `ui-float-window` or `ui-overlay-desktop`.
- **Framed pages may refuse to load** — the CRT is an iframe; many sites block embedding.
- **No drag and no reusable shaped host** — geometry is CSS placement; shaped HOW stays unauthored.
