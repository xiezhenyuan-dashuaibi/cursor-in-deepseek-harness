# Agent Note: Overlay shaped hide is host-owned, like card hide

Status: implemented

English | [中文](2026-09-14-overlay-shaped-hide.zh.md)

## Problem

The Cursor rail treated `overlay-shaped.body` occupants as fibers: 拔出 only. Card windows already have two independent flags — **隐藏 / 显示** keeps the occupant mounted, **插入 / 拔出** writes Loader `disabled`. Operators expect the same two controls on a shaped product. Unmounting on hide would stop an iframe. Putting hide in `Occupant.tsx` would fork every silhouette. Disabling the shaped host would drop every occupant. A standalone `shell.overlay` fiber has no seat, so a hide file there would have nowhere to apply `visibility`.

## Decision

Shaped **occupants** (`dsh.client.overlayBody: overlay-shaped.body`) list as rail kind `shaped` and offer 隐藏 plus 拔出, matching cards. The shaped **host** is unlistable, like the desktop board. Desktop products stay without a hide file ([desktop host](2026-09-10-overlay-desktop-host.md)).

**隐藏 / 显示** writes `hidden.json` next to the live shaped-host plugin copy (`{ "hidden": ["<Loader id>"] }`). The board keeps calling `renderSlot`; the seat uses CSS `visibility: hidden` (not `display: none`, not HTML `hidden`) so an iframe can keep playing. Drag is skipped while hidden. Join from Loader id to seat is npm package name: roster `moduleName` equals `StoredEntry.registrant`. SlotRegistry stamps that field from an explicit register `registrant`, else the Loader entry specifier (`fiber.entry.options.name`), else `fiber.name`. Unnamed client plugins do not export `name`, so the Loader specifier is the join. **插入 / 拔出** still writes that occupant's Loader `disabled`. Unplug does not write hide. Hide survives so 插入后仍隐藏. Never `overlay:live remove` from this UI. Never disable `ui-overlay-shaped`, `ui-float-window`, Cursor, or overlay RPC sidecars.

`plugins.setHidden` lives on `/overlay-plugins` and `/overlay-plugins-rail`. Cached Cursor `apply` does not remount; `overlay:live` rewrites `./overlay-plugin-rail-rpc.mjs` so the sidecar owns the write. The board polls that list every 400ms when Connection exists; without Connection the hide snapshot is `[]`. The board does not join `ctx.overlayStack`. Offset persist stays `localStorage` `dsh.overlay-shaped.offsets` ([shaped drag](2026-09-14-overlay-shaped-drag.md)). Occupant packages do not implement hide.

This note partially supersedes [rail fibers](2026-09-10-overlay-plugin-rail-fibers.md) (shaped occupants are not `fiber`) and the hide-unauthored clauses on [shaped host](2026-09-14-overlay-shaped-host.md), [shaped drag](2026-09-14-overlay-shaped-drag.md), [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md), and [form skills](../process/2026-09-05-overlay-frontend-form-skills.md). Card `instances.json` `hidden` stays on [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md). Standalone fibers such as [television](2026-09-14-overlay-television-standalone-fiber.md) stay 拔出 only.

## Alternatives considered

**Unmount the occupant on hide.** Rejected — hide-while-mounted must keep an iframe playing.

**`display: none` or HTML `hidden`.** Rejected — those stop media that `visibility: hidden` can keep running.

**A hide file on the occupant package.** Rejected — hide is host chrome, like card `instances.json` on the desk.

**Store list ids in `hidden.json`.** Rejected — the rail id is the Loader id; the seat id is the list slug. npm `moduleName` / `StoredEntry.registrant` is the join.

**Hide the shaped host.** Rejected — that would skip every silhouette.

**List the shaped host as a fiber.** Rejected — that row is 拔出 only and is not the product name; operators unplug the board. Unload is `overlay:live remove`.

**Offer hide on standalone fibers.** Rejected — those packages occupy `shell.overlay` with no seat wrap.

**Force `hidden: true` on unplug.** Rejected — hide must survive so 插入后仍隐藏.

**Require Connection on shaped-host `inject`.** Rejected — tests and a connection-less browser half still mount the board; hide poll attaches through nested `ctx.inject(['connection'])`.

## Consequences

A shaped occupant row in 插件 has 隐藏/显示 and 插入/拔出. Hide leaves the silhouette mounted and invisible. Unplug pauses that Loader fiber. The shaped board is not a list row; unload is `overlay:live remove`. Cards keep `instances.json`. Desktop 卸下 / 切换桌面 is unchanged. Live hide on an already-running overlay needs a remount of `/overlay-plugins-rail` (sidecar rewrite) and `ui-overlay-shaped` (seat visibility), plus the Cursor browser half that parses `kind: 'shaped'`.

## Testing

`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` pins `kind: 'shaped'`, an unlistable shaped board, `hidden.json` round-trip, hide surviving unplug, and `plugins.setHidden`. `overlay-card-rpc.spec.ts` pins shaped hide on `/overlay-plugins-rail` and unplug routing. `cursor-panel.client.spec.tsx` pins 隐藏 plus 拔出 on a shaped row. `packages/client/ui-overlay-shaped/tests/` pins visibility-hidden seats, mounted children, skipped drag, `StoredEntry.registrant` join, and the hide poll. `packages/client/runtime/tests/slots-service.client.spec.ts` pins the Loader-entry registrant stamp. `scripts/overlay-live-plugin.spec.ts` pins sidecar `plugins.setHidden`, `return 'shaped'`, and skipping the shaped-host npm name.
