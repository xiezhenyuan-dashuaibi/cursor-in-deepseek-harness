# Agent Note: Overlay card edge tag

Status: implemented

English | [中文](2026-09-07-overlay-card-edge-tag.zh.md)

## Problem

Operators need to clear a card from the playable board without roster `hidden` or occupant Loader `disabled`. Those flags skip or unmount the window; a later show remounts the body. A shared bookmark rail is the wrong model: every minimized card becomes a tab in one row, so dragging one tab (or the row) moves every bookmark to the same `dockEdge`. Cards cannot park independently at arbitrary edges and along-edge positions. 缩小 must collapse **that window** into a tag, not add a second container at the board edge.

## Decision

[`OverlayCard`](../../../../packages/client/ui-float-window/README.md) ships a built-in **缩小** control at the right of the title bar, after `overlay-card.chrome.trailing`. Primary-button pointer down there writes `docks[seat]` from the last parked tag (`parks[seat]`) when one exists, otherwise `dockFromFrame` (nearest board edge to the title bar, along that bar’s projection). The card node **is** the tag: `data-overlay-dock` / `data-overlay-dock-edge`, CSS `.tag`, `z-index` base 200. A docked tag is one ribbon rotated onto the edge: short side `TAG_THICKNESS` 32 along the edge, long side the title into the board (`TAG_ALONG_MAX` 160). Left and right docks are horizontal; top and bottom are vertical. A swallowtail V-cut sits on the free end that sticks into the board (`clip-path`, `TAG_NOTCH` 10); the attached end is flat and tucked. The unique id stays on the expanded title bar; the tag paints the title only at `--dsw-font-xxxs-11`. Idle docks sit `TAG_TUCK` (half of the short side) past the board edge so the playable board clips them to half a ribbon; hover translates `TAG_PEEK` toward the board (`prefers-reduced-motion` skips the transition). Frost stays on `.window:not(.tag)`; a tag uses `backdrop-filter: blur(0)` and `--dsw-alias-bg-overlay`. Dragging uses the full ribbon; dragging away from every edge uses a small rounded rect. Body, resize handles, and trailing chrome use `display: none`. The window stays mounted so the page does not remount. The last expanded frame stays in the desk store. Shrink and expand invert the last box over the new box (`flipInvert` / `flipToward`, `MORPH_MS` 320). Shrink keeps expanded chrome while it flies to the painted ribbon (`tagRibbonAlong`); the tag-face crossfade starts at `DISSOLVE_DELAY_MS` 120, still during that flight (`MORPH_MS` 320), then `SETTLE_MS` 320. The last FLIP transform is frozen (`transition: none`) before `.tag` applies so the leftover scale does not play on the tag box; landing uses the painted ribbon size and drops the tag hover transform transition for two frames. Expand inverts the tag into the frame and crossfades the other way. Magnet `setDock` does not morph.

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) mounts card windows only. There is no `OverlayBookmarkRail` and no shared `dockEdge`. Each docked seat is `{ edge, along }` (`OverlayDock`). Drag that entity: window-level `pointermove` / `pointerup` / `pointercancel` keep the gesture after the node remounts on another edge. Within `DOCK_MAGNET_RANGE` of an edge (a quarter of the short side on a tiny canvas), `magnetDock` projects the tag onto that edge at the pointer’s along position (`clampDockAlong`). Farther than that range the preview floats with the pointer. A click (movement below 6px) restores the last expanded frame and brings the card to the front. A release with no magnet writes that grab origin as the new frame origin, then expands. `setDock` updates an already docked seat and the remembered park.

Minimize is viewing chrome on the [playable board](2026-09-06-overlay-playable-board.md). It does not write `OverlayCardSpec.hidden` or Loader `disabled` ([hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)). Hidden and unplugged specs keep the dock and park the same way they keep frames, until the spec is removed. `placeNewCard` skips docked frames so a tag does not push a new window to the right of an invisible last size. `dsh.overlay-card.frames` stores optional `docks` and `parks` keyed by unique card id. `parks` survives expand so a later 缩小 returns to that edge and along. Older blobs with `dockEdge` and `minimized` migrate each listed id onto that shared edge (invalid `dockEdge` means top; a missing frame uses `along: 0`) and seed `parks` from the migrated dock. Snapshot writes `docks` and `parks` only when non-empty. Empty-body origin `y = 56` sits below a typical tucked top-edge tag (`TAG_TUCK` 16 past the edge; the ribbon hangs by the title length).

The operational HOW is [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md). Related: [overlay-card container](2026-09-05-overlay-card-container.md), [overlay stack](2026-09-07-overlay-stack-and-card-plug.md).

## Alternatives considered

**One shared bookmark rail (`OverlayBookmarkRail`, one `dockEdge` for every tab).** Rejected — dragging one tab moved every bookmark. 缩小 must turn that card into its own tag that parks independently. The earlier rail decision is archived at [bookmark dock](../../archived/architecture/2026-09-07-overlay-card-bookmark-dock.md).

**Ship 缩小 as a trailing-slot occupant.** Rejected — every card would need the same control, and a page occupant could omit it. Docking is default chrome on the reusable card.

**Unmount the body while docked.** Rejected — remounting drops page-local React state. Hide already unmounts; minimize must not.

**Write dock state into `instances.json`.** Rejected — that file is insert-time roster plus `hidden` and `occupants`. Per-card edge and along are viewing geometry, so they share `dsh.overlay-card.frames`.

**Reuse `hidden` for 缩小.** Rejected — hide is the plugin-panel skip; show remounts. Minimize must keep the body mounted and must not change the Cursor rail’s 隐藏 label.

**Keep the last expanded frame on a far drop.** Rejected — a drop away from every edge means expand here. A click (movement below 6px) still restores the last expanded frame.

**Recompute the tag from the expanded frame on every 缩小.** Rejected — `parks` remembers the last magnet or first dock so 缩小 returns to that edge and along.

## Consequences

A card can leave the board as its own tag on any edge at any along position without hide, unplug, or a page-authored control. Other docked cards stay where they are. The body keeps its mount. A page reload restores per-card docks, parks, and frames. Clearing site data restores insert placement with no tags. Product trailing occupants remain extra controls; they do not replace 缩小.

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` pins nearest-edge dock, magnet snap at an along position, a far pointer that does not magnet, a tucked vs full `dockTagBox`, `tagRibbonAlong`, `flipInvert`, `flipToward`, and `tagFlipBox`. `tests/frame-storage.client.spec.ts` round-trips `docks` and `parks` and migrates legacy `dockEdge` / `minimized`. `tests/overlay-card.client.spec.tsx` pins 缩小, a tucked rest origin, swallowtail and hover-peek CSS, click restore of the last frame, far-drop expand at the release origin, park memory across restore, shrink morph flying as a card then dissolving into the tag, magnet-snap of a dragged tag onto another edge (including window-level pointer events), persist, hide keeping the dock, `placeNewCard` skipping a docked neighbor, and ResizeObserver disconnect. Named gap: no automated pointer-drag against the live overlay origin; live check is 缩小 (the window flies as a card, then the tag-face crossfade), hover the half-tucked tag, drag it onto another edge at a chosen along, click to expand at the last frame, then drop away from every edge to expand at the drop.
