# Agent Note: Overlay card bookmark dock

Status: implemented
Archived: 2026-09-07

English | [中文](2026-09-07-overlay-card-bookmark-dock.zh.md)

## Problem

Operators need to clear a card from the playable board without roster `hidden` or occupant Loader `disabled`. Those flags skip or unmount the window; a later show remounts the body. The board’s top already reserved space for a row of labels (empty-card origin `y = 56`), but the card chrome had no control that parked a window there. The trailing list was documented as a hole for a minimize occupant; nothing shipped, so each page would reimplement docking.

## Decision

[`OverlayCard`](../../../../packages/client/ui-float-window/README.md) ships a built-in **缩小** control at the right of the title bar, after `overlay-card.chrome.trailing`. Primary-button pointer down there docks that seat. The window stays mounted: `hidden` plus `.docked { display: none }` hide the frame so the body does not remount. The last expanded frame stays in the desk store.

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) paints one bookmark rail (`OverlayBookmarkRail`, `data-overlay-dock`, `z-index: 200`) while any mounted seat is minimized and has chrome identity. Tabs are `{title} {id}` labels. The rail defaults to the **top** edge. Dragging a tab or the row magnet-snaps the whole row to the nearest board edge (`top` / `right` / `bottom` / `left`; ties prefer top, then bottom, then left, then right) while the pointer is near that edge. A click, or a drop in the inner board (`DOCK_RESTORE_INSET`, a quarter of a tiny canvas), restores that card at its last frame and brings it to the front. Window-level pointer listeners keep the gesture after the rail jumps. Restore does not write the drop coordinates as a new origin.

Minimize is viewing chrome on the [playable board](2026-09-06-overlay-playable-board.md). It does not write `OverlayCardSpec.hidden` or Loader `disabled` ([hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)). Hidden and unplugged specs keep the minimized flag the same way they keep frames, until the spec is removed. `placeNewCard` skips docked frames so a bookmark does not push a new window to the right of an invisible last size. `dsh.overlay-card.frames` stores optional `dockEdge` and `minimized` (unique card ids that still have a stored frame). Older blobs omit those fields and mean top rail, no bookmarks.

The operational HOW is [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md). Related: [overlay-card container](2026-09-05-overlay-card-container.md), [overlay stack](2026-09-07-overlay-stack-and-card-plug.md).

## Alternatives considered

**Ship 缩小 as a trailing-slot occupant.** Rejected — every card would need the same control, and a page occupant could omit it. Docking is default chrome on the reusable card.

**Unmount the body while docked.** Rejected — remounting drops page-local React state. Hide already unmounts; minimize must not.

**Write dock state into `instances.json`.** Rejected — that file is insert-time roster plus `hidden` and `occupants`. Bookmark edge and minimized ids are viewing geometry, so they share `dsh.overlay-card.frames`.

**One dock per card instead of one rail.** Rejected — the board top is one bookmark row that the user parks on an edge. Per-card docks would stack conflicting edges.

**Reuse `hidden` for 缩小.** Rejected — hide is the plugin-panel skip; show remounts. Minimize must keep the body mounted and must not change the Cursor rail’s 隐藏 label.

**Restore at the drop origin.** Rejected — the inner drop means “expand,” not “place here.” The last expanded frame is the window the user already positioned.

## Consequences

A card can leave the board as a bookmark without hide, unplug, or a page-authored control. The body keeps its mount. A page reload restores dock edge and which unique ids were bookmarks. Clearing site data restores insert placement with no bookmarks. Product trailing occupants remain extra controls; they do not replace 缩小.

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` pins edge snap and inner-drop restore. `tests/frame-storage.client.spec.ts` round-trips `dockEdge` / `minimized` and skips a docked id that has no frame. `tests/overlay-card.client.spec.tsx` pins 缩小, click and inner-drop restore, magnet-snap of a dragged tab onto another edge (including window-level pointer events), rail snap including a pointer-up without capture, persist, hide keeping minimized, `placeNewCard` skipping a docked neighbor, and ResizeObserver disconnect. Named gap: no automated pointer-drag against the live overlay origin; live check is 缩小, drag a tab onto another edge, then click or inner-drop a tab.
