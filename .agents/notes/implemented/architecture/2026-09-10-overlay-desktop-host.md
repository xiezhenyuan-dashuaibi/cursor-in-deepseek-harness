# Agent Note: Overlay desktop host and exclusive occupancy

Status: implemented

English | [中文](2026-09-10-overlay-desktop-host.zh.md)

## Problem

The third overlay presentation form (skill id `dsh-overlay-canvas-plugins`) had no insertable host and no empty-page generator. Contributors either occupied `root`, stuffed a full-viewport painting into `overlay-card.body`, or registered a second `shell.overlay` chrome id. The slacker backdrop did the last of those. The Cursor 插件 list then treated that fiber like a card-adjacent row whose 隐藏 also wrote Loader `disabled`, so hide and unplug were the same bit. Two such fibers could stay enabled at once and paint on top of each other.

## Decision

Desktop is that third form’s product name (桌面), not a fourth form. The reusable host is [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md). It registers `shell.overlay` id `overlay-desktop` at order 10, declares the unique child `overlay-desktop.body` (`kind: 'single'`), stays click-through (`data-overlay-board`, `pointer-events: none`), does not join `ctx.overlayStack`, and shows filled `空桌面` when the body has no occupant. Occupant packages type-import `/client` for `SlotMap` and never value-import the board. `pnpm overlay:new-desktop <name>` writes a frontend-only page package plus inventory, aggregate tsconfig, Model Experience, and omit-list rows. Generated occupant `tsconfig.json` references `../ui-overlay-desktop/tsconfig.client.json` (the composite emit root), not the solution `../ui-overlay-desktop`. It does not write `packages/bundle/web-app/cordis.patch.yml`.

[`parseDshClient`](../../../../packages/client/modules/src/index.ts) records `overlay-desktop.body` beside card body slots. An unknown string `overlayBody` still joins the boot graph; a non-string throws. Occupant packages still declare `overlay-desktop.body` so the rail and exclusive insert can classify the row. [`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) of a page with that `overlayBody` exclusive-enables that Loader row and writes `disabled: true` on every other `overlay-desktop.body` occupant. Repeat insert of the host is a no-op. Missing host fails loud. Switching desktops is exclusive enable, not `overlay:live remove` and not a checkout delete.

A desktop page occupies `overlay-desktop.body`. It does not register a second `shell.overlay` chrome id.

The Cursor rail pins a **桌面** row at the top: the inserted occupant (`panelTitle` or Loader id) or 空桌面. 卸下 is `plugins.setInserted(id, false)`. The list below shows cards, unloaded desktop products, and other overlay fibers. Desktop list rows only 切换桌面 (`plugins.switchDesktop`). The inserted occupant is not repeated in that list. The desktop board is not a product row. Desktop products have no hide file. Protected Loader ids include `ui-overlay-desktop` beside the card desk, Cursor, and overlay RPC sidecars. The live panel prefers `/overlay-plugins-rail` when cached `/overlay-plugins` still lists the board as a fiber. Operational HOW: [dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md). This note partially supersedes the fiber-hide clause on [rail fibers](2026-09-10-overlay-plugin-rail-fibers.md): fiber 隐藏 is not a second `disabled`. Card `hidden` stays on [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md).

## Alternatives considered

**A fourth overlay form.** Rejected — three forms stay three; desktop is the canvas skill’s product name.

**Keep a product-owned `shell.overlay` chrome id.** Rejected — that is a second board. The host owns click-through and empty fallback; the page occupies `overlay-desktop.body`.

**Occupy `overlay-card.body` for a full-viewport painting.** Rejected — cards are the other authored form; a desktop is not a card page.

**Occupy `root`.** Rejected — `root` is AppFrame.

**A hide file for desktop products.** Rejected — there is no window to skip. 卸下 and 切换桌面 write occupant Loader `disabled`.

**Fiber 隐藏 also writes `disabled`.** Rejected — hide is not unplug. Fibers without a hide file get 插入/拔出 only.

**Several enabled desktop occupants at once.** Rejected — `kind: 'single'` plus exclusive `disabled` keeps one live page.

## Consequences

Inserting the host then a desktop page paints under cards and Cursor without stealing hits. Inserting another desktop page pauses the previous occupant fiber. The rail 桌面 row unloads that fiber; switching desktops exclusive-enables the chosen occupant. Checkout stays. Arbitrary-shape HOW stays reserved.

## Testing

`packages/client/ui-overlay-desktop/tests/` pins `shell.overlay` id `overlay-desktop`, empty `空桌面`, and click-through attributes. `scripts/overlay-new-desktop.spec.ts` pins generator landing, `overlayBody`, and `tsconfig.client.json`. `packages/client/modules/tests/node-half.client.spec.ts` accepts `overlay-desktop.body` and unknown strings such as `root`; it rejects a non-string `overlayBody`. `scripts/overlay-live-plugin.spec.ts` pins missing host, repeat host insert, exclusive `disabled`, and boot-graph wait classification. `packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts`, `overlay-card-rpc.spec.ts`, and `cursor-panel.client.spec.tsx` pin the pinned 桌面 row, 卸下, 切换桌面, fiber without hide, and card hide leaving desktop alone. Boot-graph admission vs `overlayBody` is [boot graph wait](2026-09-11-overlay-live-client-boot-graph.md).
