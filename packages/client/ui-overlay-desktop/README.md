# @deepseek-ai/dsh-client-ui-overlay-desktop

English | [中文](README.zh.md)

Reusable overlay **desktop board** (the desktop presentation form): a full-viewport click-through layer on `shell.overlay` under cards and Cursor. The browser half registers `DesktopBoard` with id `overlay-desktop` at order 10 (never `root`, never `cursor-agent`, never `overlay-card.body`). The root carries `data-overlay-board` and `pointer-events: none`, so the shell layer keeps empty space click-through. The board does not join `ctx.overlayStack`. The unique child slot is `overlay-desktop.body` (`kind: 'single'`). A body with no occupant shows the filled `空桌面` label. At most one occupant Loader fiber is enabled at a time. Desktop products have no hide file: 卸下 and 切换桌面 write occupant Loader `disabled`. The node half is an inert Loader seat. The default web-app roster does not mount this package.

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-desktop` locale key union. The board component stays package-internal. Occupant packages type-import `@deepseek-ai/dsh-client-ui-overlay-desktop/client` for `SlotMap` and never value-import `DesktopBoard`.

## Use

Insert this package, then occupy `overlay-desktop.body`. Do not copy this tree into a product package. Write the page package with `pnpm overlay:new-desktop <name>`. Repeat insert of this package is a no-op (the board is already loaded).

```sh
pnpm overlay:live insert packages/client/ui-overlay-desktop
pnpm overlay:live insert packages/client/<desktop-page>
```

A page plugin type-imports `@deepseek-ai/dsh-client-ui-overlay-desktop/client` and registers into `overlay-desktop.body` with no id / order. Page packages declare `dsh.client.overlayBody: overlay-desktop.body` so `overlay:live insert` can exclusive-disable every other desktop occupant. Operational HOW: [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md).

## Model Experience

None, as the reusable overlay desktop is a browser occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Must not occupy `root` or reuse `cursor-agent` or `overlay-card.body`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel; cards are the other authored form.
- **`overlay-desktop.body` is `kind: 'single'`** — one occupant while that fiber is inserted. Switching desktops disables the previous occupant.
- **No hide file** — desktop products have no `instances.json` `hidden`. The rail 桌面 row only 卸下 (Loader `disabled`).
- **Click-through board** — the host root stays `pointer-events: none`. A product page that needs hits sets pointer events on its own root.
- **Protected Loader id** — the Cursor plugin rail must not disable `ui-overlay-desktop`.
