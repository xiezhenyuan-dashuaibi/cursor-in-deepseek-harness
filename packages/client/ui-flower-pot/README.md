# @deepseek-ai/dsh-client-ui-flower-pot

English | [中文](README.zh.md)

Celadon morning-glory pot on `overlay-shaped.body`. The browser half registers `FlowerPot` with id `flower-pot` at order 10. The package declares `dsh.client.overlayBody: overlay-shaped.body` and `panelTitle` 花盆, so live insert requires the shaped host and the Cursor rail lists this row as a fiber (拔出 writes Loader `disabled`; hide is not offered). 浇水 and 施肥 write moisture and nutrients; the vine grows while the soil stays wet (full bloom in a few minutes when cared for). Progress persists in `localStorage` (`dsh.overlay-flower-pot.state`) for this origin. Geometry is CSS placement on the lower-left of the board. Drag, raise, and hide-while-mounted stay unauthored. The node half is an inert Loader seat. The default web-app roster does not mount this package. Live insert is `pnpm overlay:live insert packages/client/ui-flower-pot` after the shaped host is loaded.

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-flower-pot` locale key union. The pot component stays package-internal.

## Model Experience

None, as this overlay flower pot is a browser-only overlay-shaped.body occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Must occupy `overlay-shaped.body`** — never `root`, `cursor-agent`, `overlay-card.body`, or `overlay-desktop.body`.
- **Host must already be inserted** — `overlay:live insert` of this package fails loud when `ui-overlay-shaped` is missing.
- **No drag** — the pot stays at its CSS origin. Shaped occupant drag/persist/raise stay unauthored.
- **Growth is local to this origin** — clearing site data replants a seed. There is no hide-while-mounted roster.
