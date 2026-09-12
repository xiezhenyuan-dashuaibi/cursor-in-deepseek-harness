# Agent Note: Overlay stack and card plug/unplug

Status: implemented

English | [中文](2026-09-07-overlay-stack-and-card-plug.zh.md)

## Problem

Overlay cards paint over the Cursor conversation window. Card `z-index` starts at 40 inside `shell.overlay`, while the Cursor window uses CSS `z-index: 1`. Card-local `bringToFront` only orders seats inside the desk, so a card click cannot send Cursor behind the desk and a Cursor click cannot climb above 40. Client plugins must not value-import each other, so there is no shared z-list in either package. Operators also need to hide a card without deleting its checkout package or running `overlay:live remove`.

## Decision

[`ui-layout`](../../../../packages/client/ui-layout/README.md) provides `ctx.overlayStack`. The face orders two occupants: id `cursor-agent` (the Cursor window) and id `overlay-card` (the card desk as a unit). `raise(id)` appends that id to `front`; inline `z-index` is `40 + index`. Boot `front` is `[overlay-card, cursor-agent]`, so the first paint puts Cursor on top. The snapshot object stays the same until `raise` actually moves the order; inject `hooks` bind `HostObservable` as `useOverlayStack`.

The Cursor window listens on primary-button `pointerdown` capture and calls `raise('cursor-agent')`. The overlay-card board sets `isolation: isolate` and the desk `z-index` from the stack, so per-card `z-index` no longer competes with Cursor. Board capture raises `'overlay-card'` before the card's own `bringToFront`. Empty board space stays `pointer-events: none`, so clicks through gaps still reach Cursor. The minimized Cursor sprite does not use overlayStack math: its inline `z-index` is a fixed 80, above `40 + index`, so raising the desk cannot cover the bubble. Expanding restores overlayStack order.

[`OverlayCardSpec.hidden`](../../../../packages/client/ui-float-window/README.md) skips desk mount; occupant Loader `disabled` is real unplug ([hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)). The durable file is `$DSH_HOME/profiles/<name>/plugins/<id>/instances.json`. Host `/overlay-card` resolves that directory on every `instances.list` and `instances.setHidden`; `occupants.setInserted` edits the live profile patch. Checkout `instances.json` is only the one-card template. The first `/overlay-card` `apply` does not hot-swap, so a list-only handler rejects those writes. `overlay:live` insert or update of the card package writes `./overlay-card-plug-rpc.mjs` on `/overlay-card-plug`; the Cursor panel calls `/overlay-card` then that channel. Desk poll still uses `/overlay-card` `instances.list`, which sets wire-only `inserted` from the patch. The Cursor rail keeps `+` immediately after the session list and places a plugin control at the bottom of the slab. Clicking it opens a floating panel in the expanded rail, directly above the control. Leaving that panel closes it. The list viewport is 3.5 rows; further rows scroll. The panel lists card `--title` / `--card-id` plus standalone overlay fibers and offers 隐藏/显示 and 插入/拔出 ([rail fibers](2026-09-10-overlay-plugin-rail-fibers.md)). Desk poll stays on the card roster; the panel merges `/overlay-plugins`. Overlay insert, remove, hide, unplug, and a later `dsh web` start show the same card seats. It does not call `overlay:live remove` and does not delete `packages/client/<name>`. Cursor and the card desk duplicate occupant ids and the z-index helper; Cursor also duplicates the `/overlay-card`, `/overlay-card-plug`, and `/overlay-plugins` channel strings and list types. Neither package value-imports the other or `ui-layout`.

Related: [overlay-card container](2026-09-05-overlay-card-container.md), [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md), [rail fibers](2026-09-10-overlay-plugin-rail-fibers.md), [floating Cursor overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md).

## Alternatives considered

**One z-list of every card plus Cursor.** Rejected — cards remain one desk; per-seat order stays in the desk store. A shared stack of two occupants is the cross-plugin contract.

**A new `overlay:new-page` card for the plugin manager.** Rejected — the entry is the Cursor rail, not another `overlay-card.body` page.

**`overlay:live remove` or checkout delete from the UI.** Rejected — hide is `hidden`; unplug is Loader `disabled`; destructive cleanup is easy to get wrong and is out of this cut.

**Value-import `ui-float-window` or occupant ids from `ui-layout`.** Rejected — client plugins share JSON and callbacks through slots and ctx services only; occupant ids and the z-index helper are duplicated.

**Hand-rolled `useSyncExternalStore` in the window components.** Rejected — inject `hooks` already bind `HostObservable`.

**Put the minimized sprite on overlayStack as a third occupant.** Rejected — the bubble is not a competing window; it stays above the two-occupant stack regardless of `raise`.

## Consequences

Clicking the Cursor window uncovers it when cards overlap it. Clicking a card raises the whole desk, then that card inside the desk. The minimized sprite stays above that order until the panel expands. Hide skips a window and keeps its spec (and a stored frame) so show can remount it. Unplug pauses occupant fibers; the window stays down while `inserted` is false ([hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)). After a `dsh web` start, the host reads the live roster file, so visible inserted seats remount and the Cursor panel lists the same rows.

## Testing

Layout tests cover boot order, skip-notify when already front, and provide/dispose of `overlayStack`. Float-window tests cover duplicate `/overlay-card` ignored, board isolation CSS, `raiseDesk` on primary-button capture, and that source launch prefers the live profile `instances.json`. Hide, occupancy, and Loader `disabled` coverage lives on [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md). Cursor tests cover window `z-index` and `raiseWindow` on primary-button capture, the minimized sprite staying above a front desk, rail `+` still the session-list sibling, the plugin panel above the rail control with hide and insert controls, `/overlay-card-plug` fallback, empty and failure copy, duplicated `/overlay-card` channel strings, and a standalone fiber row on the merged list.
