# Agent Note: Overlay shaped seats own drag, offset persist, and intra-board raise

Status: implemented

English | [中文](2026-09-14-overlay-shaped-drag.zh.md)

## Problem

The reusable shaped board ([shaped host](2026-09-14-overlay-shaped-host.md)) painted concurrent `overlay-shaped.body` occupants at their CSS rest pose. Occupants that needed to move either implemented pointer math in product code or waited behind an unauthored HOW. Product-owned drag would duplicate across silhouettes, fight occupant `pointer-events`, and miss a shared persist key. Joining `ctx.overlayStack` would raise the whole board over cards. Node `instances.json` persist would miss browser-half HMR because host `apply` is cached for the process lifetime.

## Decision

[`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md) wraps each `overlay-shaped.body` list id in a host `ShapedSeat`. The seat is `position: absolute; inset: 0; pointer-events: none` with `transform: translate(x, y)`. Occupant CSS keeps the rest pose. Hits land on occupant `pointer-events: auto` targets and bubble through the seat. Primary-button travel past `SHAPED_CLICK_SLOP` (6px) is a drag; smaller travel stays a click. Pointer capture starts after travel leaves the slop so occupant `click` handlers still fire; a trailing click after a drag is swallowed. Offsets persist in browser `localStorage` key `dsh.overlay-shaped.offsets` (`{ [listId]: { x, y } }`). The occupant painted box stays on the playable board (`ResizeObserver` on `[data-overlay-board]`; a silhouette larger than the board pins to the canvas origin). Seat measurement walks past `display: contents` slot anchors — those nodes have a 0×0 border box at the viewport origin, which is not the silhouette. Raise is intra-board `z-index` among seats. The board still does not join `ctx.overlayStack`. Occupant packages do not implement drag. Hide-while-mounted is host-owned ([shaped hide](2026-09-14-overlay-shaped-hide.md)): occupant rail rows offer 隐藏 plus 拔出; the host row stays 拔出 only.

Operational HOW: [dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md). Occupant kit: [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md). Form split: [form skills](../process/2026-09-05-overlay-frontend-form-skills.md).

## Alternatives considered

**Occupant-owned drag in `Occupant.tsx`.** Rejected — every silhouette would reimplement slop, persist, and stacking; visual independence forbids copying a sibling occupant as the pattern.

**Occupant `onPointerDown` or Occupant `setPointerCapture` when buttons do not click.** Rejected — delayed host Pointer Capture is the click contract; occupant pointerdown papers over a seat that captured on pointer-down. Recovery is `overlay:live update` of `ui-overlay-shaped`.

**Join `ctx.overlayStack` so a shaped hit raises over cards.** Rejected — the board stays under the card desk (order 180 vs 220). Raise is among shaped seats only.

**Persist in node `instances.json` / overlay-card RPC.** Rejected — host `apply` is cached for the process lifetime; browser-half HMR can pick up `client.js`, and `localStorage` survives that remount without a Node round-trip.

**Keep a grab remnant on the board, like card `clampGrabOrigin`.** Rejected — shaped seats have no title bar. The occupant box stays fully on the playable board. A silhouette larger than the board pins to the canvas origin.

**Reset the occupant CSS rest pose from the host.** Rejected — the product owns outline placement; the host only adds a pixel offset.

## Consequences

A live `overlay:live update` of the host makes every `overlay-shaped.body` occupant draggable without editing that occupant's `Occupant.tsx`. Occupant `onClick` is the interaction contract: travel inside the slop must still fire the occupant click. Empty space, cards, desktop, and Cursor stay click-through. Hide-while-mounted is [shaped hide](2026-09-14-overlay-shaped-hide.md). A standalone `shell.overlay` fiber such as [television](2026-09-14-overlay-television-standalone-fiber.md) does not sit in a seat and does not receive this wrap.

## Testing

`packages/client/ui-overlay-shaped/tests/` pins click slop, delayed pointer capture so a child button `click` still fires, swallowing a trailing click after a drag, offset parse, `localStorage` round-trip, body-id snapshot reuse, per-id `renderSlot` `only`, intra-board raise, persist after pointer travel past the slop, and keeping the occupant box on the playable board (including a shrink reclamp and a `display: contents` slot-anchor measure). Hide coverage lives in [shaped hide](2026-09-14-overlay-shaped-hide.md).
