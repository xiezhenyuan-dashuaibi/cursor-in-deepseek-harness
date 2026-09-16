# Agent Note: Overlay shaped host is a transparent list board

Status: implemented

English | [中文](2026-09-14-overlay-shaped-host.zh.md)

## Problem

The arbitrary-shape overlay form (skill id `dsh-overlay-shaped-plugins`) had no insertable host. Contributors either occupied `shell.overlay` with a product-owned chrome id, stuffed a non-card outline into `overlay-card.body`, or waited behind a reserved skill that said stop. The first product, [`ui-television`](../../../../packages/client/ui-television/README.md), is a standalone fiber ([standalone fiber](2026-09-14-overlay-television-standalone-fiber.md)). A second shape would have copied that occupancy instead of sharing a board. Occupying `root` would shadow AppFrame. Occupying `overlay-desktop.body` would exclusive-disable other desktops and paint a full-viewport page, not concurrent silhouettes.

## Decision

The reusable host is [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md). It registers `shell.overlay` id `overlay-shaped` at order 180, declares the unique child `overlay-shaped.body` (`kind: 'list'`), stays click-through (`data-overlay-board`, `pointer-events: none`), paints no chrome and no empty copy, and does not join `ctx.overlayStack`. Occupant packages type-import `/client` for `SlotMap` and never value-import the board. Many occupant Loader fibers may stay enabled at once. Repeat insert of the host is a no-op. Missing host fails loud. Inserting another shaped occupant adds; it does not exclusive-disable the others.

[`parseDshClient`](../../../../packages/client/modules/src/index.ts) records `overlay-shaped.body` beside card and desktop body slots. An unknown string `overlayBody` still joins the boot graph; a non-string throws. Occupant packages declare `overlay-shaped.body` so the rail lists the row as `shaped` (hide plus unplug). The host itself is unlistable, like the desktop board. Card hide/unplug still must not disable `ui-overlay-shaped`. Unload the board with `overlay:live remove`.

A shaped page occupies `overlay-shaped.body`. It does not register a second `shell.overlay` chrome id. Occupant insert and generator HOW is [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md). Host seats own drag, persist, intra-board raise, and hide-while-mounted ([shaped drag](2026-09-14-overlay-shaped-drag.md), [shaped hide](2026-09-14-overlay-shaped-hide.md)). This note partially supersedes [standalone television](2026-09-14-overlay-television-standalone-fiber.md): the host now exists; that CRT stays a standalone fiber until a later change retargets it onto `overlay-shaped.body`.

## Alternatives considered

**Reuse `overlay-desktop.body` for shapes.** Rejected — desktop is `kind: 'single'` and exclusive-disables other desktops. Shapes must coexist.

**Paint host chrome or an empty label.** Rejected — inserting only the host must look like nothing was inserted; empty space clicks through.

**Author occupant HOW in the same change.** Rejected for the host change — the host is the reusable board. Occupant insert/generator HOW lives in [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md); hide-while-mounted lives in [shaped hide](2026-09-14-overlay-shaped-hide.md). Drag lives in [shaped drag](2026-09-14-overlay-shaped-drag.md).

**Treat [`ui-television`](../../../../packages/client/ui-television/README.md) as the host.** Rejected — that package is a product fiber, not a list board.

**Occupy `root` or `overlay-card.body`.** Rejected — `root` is AppFrame; cards are the other authored form.

**A hide file that unmounts the occupant.** Rejected — hide-while-mounted keeps the iframe playing ([shaped hide](2026-09-14-overlay-shaped-hide.md)).

## Consequences

Inserting only the host leaves the overlay visually unchanged. The Cursor rail does not list that host. Occupants that declare `overlay-shaped.body` can coexist on one board. New occupants follow [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md). Television remains a standalone `shell.overlay` fiber until migrated.

## Testing

`packages/client/ui-overlay-shaped/tests/` pins `shell.overlay` id `overlay-shaped`, order 180, click-through attributes, no empty copy, two list ids on `overlay-shaped.body`, per-id seats, and inject `bodyIds`. `packages/client/modules/tests/node-half.client.spec.ts` accepts `overlay-shaped.body`. `scripts/overlay-live-plugin.spec.ts` pins missing host, repeat host insert, and two shaped occupants both enabled. `packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` pins the host unlistable and shaped `overlayBody` as `shaped`. `packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` omits the package from the default roster. Drag coverage lives in [shaped drag](2026-09-14-overlay-shaped-drag.md). Hide coverage lives in [shaped hide](2026-09-14-overlay-shaped-hide.md).
