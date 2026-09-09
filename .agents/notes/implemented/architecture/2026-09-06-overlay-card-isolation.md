# Agent Note: Overlay cards isolate frames and in-card hash navigation

Status: implemented

English | [中文](2026-09-06-overlay-card-isolation.zh.md)

## Problem

Several overlay cards share one document and one desk store. A page `preferFrame` or resize that overlapped another window used to rewrite that sibling's `x` / `y`. Same-document `a[href="#id"]` used document-global hash navigation, so a click in one body could scroll the first matching id in another window. Product pages talk across plugins through Connection RPC and Cordis services; the desk must not treat geometry or DOM ids as a second channel.

## Decision

Each seat's frame is private after insert. `setFrame` (page `preferFrame` and edge resize) and `setPosition` (title-bar drag) mutate only the addressed seat. A newly mounted seat still uses free space to the right of the current rightmost frame; when that opening size would leave the playable board, it overlaps the default origin ([playable board](2026-09-06-overlay-playable-board.md)). Later overlap is allowed; the user moves a window by dragging that window.

The card body intercepts same-document hash clicks (`href` starting with `#`). Resolution walks that body's descendants by the `id` property; it does not use `document.getElementById` or a CSS `#id` selector (both are document-global when two windows reuse an id). A matching element is brought into view by adjusting the nearest overflow ancestor still inside that body (`scrollTop` / `scrollLeft` only). `Element.scrollIntoView` is not used, because it would scroll overlay ancestors and move other windows on screen. A missing id still `preventDefault`s so the document cannot jump to another window.

Cross-card data stays on Connection RPC and Cordis services. The desk store is window-manager state only. Card chrome, insert flags, and roster format stay on [overlay-card container](2026-09-05-overlay-card-container.md).

## Alternatives considered

**Keep pushing overlapping siblings on `preferFrame` and resize.** Rejected — a click or mount effect in one page moved another product's window. That is not an RPC or Cordis call.

**Call `Element.scrollIntoView` on the in-card target.** Rejected — that API scrolls every scrollable ancestor, including the overlay canvas, so other windows move on screen even when their store frames are unchanged.

**iframe or shadow root per body.** Rejected for this path — page plugins are same-document React occupants of `overlay-card-N.body`; an iframe would drop slots, locale, and Connection. Hash capture plus per-seat frames are the isolation that path can keep.

**Require unique ids in every page package.** Rejected as the only pin — occupants will reuse `book` / `packages`. The card window is the isolation boundary.

## Consequences

Windows may overlap. Insert still places a new empty card beside existing ones, or overlaps the default origin when that gap would leave the playable board. A page that omits `x` / `y` on `preferFrame` keeps the origin the user dragged. Hash in-page nav stays inside that card. Product plugins do not import each other for UI.

## Testing

`packages/client/ui-float-window/tests/overlay-card.client.spec.tsx` pins that resizing seat 1 leaves seat 2's frame unchanged, and that a body `#id` click does not call `scrollIntoView` on another root. `tests/hash.client.spec.ts` pins in-body resolution when `document.getElementById` already points at another root, body-only scroll offsets including a nested page overflow root, and that a missing local hash still cancels default navigation. Named gap: no live two-plugin click test against a running overlay; the unit pins are the contract.
