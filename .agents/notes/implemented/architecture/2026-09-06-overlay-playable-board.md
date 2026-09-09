# Agent Note: Overlay playable board clips cards; title bar stays on the board

Status: implemented

English | [中文](2026-09-06-overlay-playable-board.zh.md)

## Problem

Overlay cards share `shell.overlay` with sibling occupants. Origin clamp used to fence only `x >= 0` and `y >= 0`, so drag and insert could park a title bar past the right or bottom of the painted overlay. The shell frame already clipped overflow, with no scrollbar, so a window that left the box disappeared while its roster spec stayed mounted. `placeNewCard` stacked a later seat below the rightmost frame, which is how a fourth card left the canvas. Pointer math used `window.innerWidth` / `innerHeight`, which is not the overlay box when columns or the Cursor panel share the frame.

## Decision

The playable board is the overlay layer box, not the browser window.

[`ui-layout`](../../../../packages/client/ui-layout/README.md) `AppFrame` `.overlayLayer` (`data-shell-overlay`) clips occupants on all four sides (`overflow: hidden`) and stays click-through. Direct children opt into pointer events except `[data-overlay-board]`, so a full-size clip board does not steal empty-space hits from sibling overlay entries. [`ui-cursor-agent`](../../../../packages/client/ui-cursor-agent/README.md) paints that same node (`background: var(--dsw-alias-bg-base)`) and also clips overflow. This is still `shell.overlay`, not the reserved full-page canvas form.

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) wraps cards in a board (`position: absolute; inset: 0; overflow: hidden; pointer-events: none`) marked `data-overlay-board`. Card `left` / `top` are board-local. A `ResizeObserver` writes the board size into the desk store and reclamps every origin. Drag converts `clientX` / `clientY` through the board's `getBoundingClientRect()`.

Grab-strip clamp: `x` in `[120 - width, canvas.width - 120]`, `y` in `[0, canvas.height - 36]` (`TITLE_BAR_HEIGHT` matches the 36px title bar). The title bar spans the card, so a left hang still leaves the right end of that bar on the board. The body may hang past the left, right, or bottom; CSS clips the hanging pixels. `setFrame` / `setPosition` / `preferFrame` use that clamp. A newly mounted seat still sits to the right of the current rightmost expanded frame; when that opening size would leave the board, it overlaps the default origin (`36, 56`, below a typical top-edge [tag](2026-09-07-overlay-card-edge-tag.md)) instead of stacking below the canvas. Later overlap after insert remains allowed ([isolation](2026-09-06-overlay-card-isolation.md)).

## Alternatives considered

**Keep the whole card inside the viewport.** Rejected — a page `preferFrame` may request a size larger than the overlay box (minimum card is 360×280; product pages are often larger). Locking the entire frame would fight that size.

**Keep `x >= 0` while hanging only off the right.** Rejected — the title bar already spans the card. A 120px overlap on the left is still header chrome (the right end of the bar), so a left hang does not need a second handle.

**`overflow: auto` on the overlay layer.** Rejected — scrolling the board would move every card together and undo per-seat isolation.

**Clamp only in `ui-float-window` against `window.innerWidth`.** Rejected — the overlay box is not the window, and a fragment desk has no containing block of its own. Cards parked past the painted board still disappear.

**Occupy `root` or invent the full-page canvas HOW.** Rejected — the white board here is the existing `shell.overlay` layer. The page-canvas skill is a reserved slot.

## Consequences

A card can hang off the left, right, or bottom and still be retrieved by its title bar. A later insert that does not fit to the right overlaps existing cards at the default origin rather than leaving the board. Shrinking the overlay reclamps origins so a previously off-board window returns. Empty board space stays click-through for sibling overlay occupants; the Cursor panel still paints and receives hits on the overlay layer itself.

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` pins grab-strip clamp (including a left hang) and resize that may hang past the board. `tests/overlay-card.client.spec.tsx` pins far-edge drag on both sides, overlap placement when the right-hand gap would leave the board, reclamp on a shrinking canvas, and the desk `data-overlay-board` node. `packages/client/ui-layout/tests/app-frame.client.spec.tsx` pins `.overlayLayer` overflow clip and the `[data-overlay-board]` exception. Named gap: no automated pointer-drag against the live overlay origin; live check is a title-bar drag that stops with the bar still on the painted board.
