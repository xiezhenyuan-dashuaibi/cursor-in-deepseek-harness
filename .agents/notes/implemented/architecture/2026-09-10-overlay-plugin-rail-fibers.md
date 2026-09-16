# Agent Note: Overlay plugin rail lists cards and standalone fibers

Status: implemented

English | [中文](2026-09-10-overlay-plugin-rail-fibers.zh.md)

## Problem

The Cursor rail 插件 list read only `/overlay-card` `instances.list`. A live profile fiber that occupies `shell.overlay` without `dsh.client.overlayBody` stayed mounted and invisible to that panel. Operators expect 插件 to name every overlay plugin they inserted, not only card windows. Stuffing those fibers into `instances.list` would make the card desk poll a fake window.

## Decision

The rail merges two rosters. Cards stay on `/overlay-card` (`instances.list` / `instances.setHidden` / `occupants.setInserted`) and never enter this new channel. Overlay fibers and desktop occupants use `/overlay-plugins` (`plugins.list` returns `{ desktop, plugins }`; `plugins.setInserted`; `plugins.switchDesktop`). Live recovery when that handler still lists the desktop board as a fiber uses `/overlay-plugins-rail`.

A standalone fiber is a live **profile** Loader row whose `plugins/<id>/package.json` has `dsh.client`, has no `overlayBody`, and is not a protected id (`ui-float-window`, `ui-overlay-desktop`, `ui-overlay-shaped`, `ui-cursor-agent` / `cursor-agent`, overlay-card RPC ids, `overlay-plugin-roster-rpc`, `overlay-plugin-rail-rpc`). The desktop board is also skipped by npm name `@deepseek-ai/dsh-client-ui-overlay-desktop`. The shaped board is skipped by npm name `@deepseek-ai/dsh-client-ui-overlay-shaped`. A desktop occupant is the same scan with `overlayBody: overlay-desktop.body`. A shaped occupant is the same scan with `overlayBody: overlay-shaped.body` and lists as `shaped` (hide plus unplug; [shaped hide](2026-09-14-overlay-shaped-hide.md)). Title is `dsh.client.panelTitle` when that string is non-empty, otherwise the Loader id. Bundle DSH chrome is not listed. The inserted occupant is not repeated in the lower list.

For a fiber, 拔出 writes that row's Loader `disabled`. The rail does not offer hide on fiber or desktop rows. Desktop occupancy, exclusive enable, and the pinned 桌面 row stay on [desktop host](2026-09-10-overlay-desktop-host.md). The desk poll stays on `instances.list` so a backdrop cannot become a card.

Host `apply` of `@deepseek-ai/dsh-client-ui-cursor-agent` is cached for the process lifetime. Overlay fibers and desktop occupants use `/overlay-plugins` when that handler is current, and `/overlay-plugins-rail` from `./overlay-plugin-rail-rpc.mjs` when the cached handler still lists the desktop board as a fiber. `overlay:live` insert or update writes both sidecars and a rail Loader row so the panel can pin the occupant without restarting `dsh web`. Duplicate `rpc.handle` on `/overlay-plugins` is ignored. Card hide vs occupant `disabled` stays on [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md). Panel chrome stays on [overlay stack](2026-09-07-overlay-stack-and-card-plug.md).

## Alternatives considered

**Append standalone fibers to `instances.list` `cards`.** Rejected — the desk polls that same RPC and would mount a fake window.

**Occupy `overlay-card.body` so a backdrop becomes a card.** Rejected — a click-through desktop page occupies `overlay-desktop.body`; a non-card outline occupies `overlay-shaped.body`.

**A hide file for fibers, distinct from Loader `disabled`.** Rejected for generic fibers — those rows have no hide flag; the rail offers 插入/拔出 only. Desktop products also have no hide file ([desktop host](2026-09-10-overlay-desktop-host.md)). Shaped occupants use host `hidden.json` ([shaped hide](2026-09-14-overlay-shaped-hide.md)).

**List every Loader row, including bundle chrome.** Rejected — the panel is the live overlay roster, not `ui-conversation` and other shipped DSH seats.

**Register `/overlay-plugins` only from cached `ui-cursor-agent` `apply`.** Rejected — that first `apply` does not remount; live recovery is a never-imported profile specifier.

**Own the roster in a product package.** Rejected — the rail is Cursor chrome; a desktop page is one occupant.

## Consequences

A live standalone overlay fiber appears in 插件 next to card windows and unloaded desktop products. Unplugging it pauses that fiber. Hide is not offered on that row. The card desk does not gain a window. A process that already cached Cursor host `apply` still serves desktop occupancy through `/overlay-plugins-rail` after `overlay:live` writes the rail sidecar. Pinned 桌面 chrome stays on [desktop host](2026-09-10-overlay-desktop-host.md).

## Testing

`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` pins list filter, yaml `disabled`, exclusive desktop enable, host npm-name exclusion, and `/overlay-plugins` list/unplug/switchDesktop. `overlay-card-rpc.spec.ts` pins `kind: 'card'` on mapped cards, desktop flattening, hide rejected on fiber/desktop, merge/unplug routing, and `/overlay-plugins-rail` first. `cursor-panel.client.spec.tsx` pins the pinned 桌面 row, 卸下, 切换桌面, a fiber row without hide, and a shaped row with hide. `browser-plugin.client.spec.ts` pins the merged list call and `switchOverlayDesktop`. `scripts/overlay-live-plugin.spec.ts` pins insert and update writing `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs`. Shaped hide coverage lives in [shaped hide](2026-09-14-overlay-shaped-hide.md).
