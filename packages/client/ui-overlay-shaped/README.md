# @deepseek-ai/dsh-client-ui-overlay-shaped

English | [中文](README.zh.md)

Reusable overlay **shaped board** (the arbitrary-shape presentation form): a full-viewport transparent click-through layer on `shell.overlay` above the desktop and Cursor, under cards. The browser half registers `ShapedBoard` with id `overlay-shaped` at order 180 (never `root`, never `cursor-agent`, never `overlay-card.body`, never `overlay-desktop.body`). The root carries `data-overlay-board` and `pointer-events: none`, so the shell layer keeps empty space click-through. Inserting only this package paints nothing: no chrome, no empty label. The board does not join `ctx.overlayStack`. Host seats wrap each `overlay-shaped.body` list id: drag, persisted offset (`localStorage` `dsh.overlay-shaped.offsets`), intra-board raise, hide-while-mounted (`hidden.json`, CSS `visibility: hidden`), and keeping the occupant axis-aligned box on the playable board. The unique child slot is `overlay-shaped.body` (`kind: 'list'`). Many occupant Loader fibers may stay enabled at once. The node half is an inert Loader seat. The default web-app roster does not mount this package.

The `/client` exports are the plugin body (`apply` / `inject`). The board component stays package-internal. Occupant packages type-import `@deepseek-ai/dsh-client-ui-overlay-shaped/client` for `SlotMap` and never value-import `ShapedBoard`.

## Use

Insert this package, then occupy `overlay-shaped.body`. Do not copy this tree into a product package. Occupant insert is `pnpm overlay:new-shaped <name>` ([dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md)). Repeat insert of this package is a no-op (the board is already loaded). Refresh `lib/` with `pnpm overlay:live update packages/client/ui-overlay-shaped`.

```sh
pnpm overlay:live insert packages/client/ui-overlay-shaped
```

A page plugin type-imports `@deepseek-ai/dsh-client-ui-overlay-shaped/client` and registers into `overlay-shaped.body` with its own id. Page packages declare `dsh.client.overlayBody: overlay-shaped.body` so `overlay:live insert` can require this host and list the occupant as a Cursor-rail `shaped` row. Inserting another shaped occupant adds; it does not exclusive-disable the others. Operational HOW for occupants is [dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md).

## Model Experience

None, as the reusable overlay shaped board is a browser occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Must not occupy `root` or reuse `cursor-agent`, `overlay-card.body`, or `overlay-desktop.body`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel; cards and desktop are the other authored forms.
- **`overlay-shaped.body` is `kind: 'list'`** — many occupants while that fiber is inserted. A later insert does not disable the previous occupant.
- **No empty copy** — a host-only insert must look like nothing was inserted. Clicks in empty space pass through.
- **Click-through board** — the host root stays `pointer-events: none`. Host seats stay `none`. A product that needs hits sets pointer events on its own silhouette. Host Pointer Capture starts after `SHAPED_CLICK_SLOP` (6px) so occupant `onClick` still fires ([shaped drag](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md)). If occupant buttons do not click, `overlay:live update` this package; do not add Occupant drag or Occupant `onPointerDown`.
- **Unlistable board** — the Cursor plugin rail does not list `ui-overlay-shaped`. Occupant rows (`overlay-shaped.body`) offer 隐藏/显示 plus 插入/拔出 ([shaped hide](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md)). Card hide/unplug still must not disable this Loader id. Unload the board with `overlay:live remove`.
- **Occupant HOW** — insert/generator is `pnpm overlay:new-shaped`. Keep generated `onClick`. Host seats own drag, persist, intra-board raise, hide-while-mounted, and keeping the occupant box on the playable board ([shaped drag](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md), [shaped hide](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md)). Line grids and hit targets share one inner size (theme `border-box` shrinks content under a `border`).
