# Agent Note: Overlay card hide vs Loader disabled

Status: implemented

English | [中文](2026-09-07-overlay-card-hide-and-loader-disabled.zh.md)

## Problem

The Cursor rail 插入/拔出 control only wrote a roster flag and skipped desk mount. Occupant `apply()` stayed on the Loader fiber: host RPC, `provide`, and the browser page kept running. Operators still needed a window hide that does not delete checkout, and a real pause that Cordis already owns as profile `cordis.patch.yml` entry `disabled: true`. Cards and Loader ids are different namespaces, so the rail cannot guess which fiber belongs to which seat. `overlay:live` never wrote `disabled`.

## Decision

Two independent flags. **隐藏 / 显示** is `OverlayCardSpec.hidden` (`true` skips the window). **插入 / 拔出** is `disabled: true` / omit on the **occupant** Loader rows in `$DSH_HOME/profiles/web/cordis.patch.yml` only (watched live). Keep `plugins/<id>/`. Never `overlay:live remove` from this UI. Never edit [`packages/bundle/web-app/cordis.patch.yml`](../../../../packages/bundle/web-app/cordis.patch.yml) on a running overlay process. Title-bar 缩小 is viewing chrome that collapses the card into an edge tag, not these flags ([edge tag](2026-09-07-overlay-card-edge-tag.md)).

The desk mounts a window only when the spec is **not hidden** and occupant fibers are **inserted**. `inserted` is wire-only: `instances.list` always sets it; `instances.json` never stores it. It is `false` when any recorded occupant row is `disabled: true` or missing from the live patch. An empty `occupants` list is inserted (拔出 is a no-op / dimmed); hide still works. Unplug does not force `hidden: true`. Hide state survives so a later insert does not show a still-hidden card. 拔出后窗口一并收起 because `inserted` is false, not because hide was written. The desk poll and Cursor list use `/overlay-card-plug` when the first `/overlay-card` list omits wire `inserted`, so a persist-only first handler cannot leave an empty shell or keep the 拔出 label after occupant `disabled`.

Occupancy is a declaration, not a product special case. Optional `dsh.client.overlayBody` is the body slot string (`overlay-card.body` or `overlay-card-N.body`). [`overlay:new-page`](../../../../scripts/overlay-new-page.ts) writes it. [`parseDshClient`](../../../../packages/client/modules/src/index.ts) validates it and still ignores it on the boot graph. [`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) maps that slot to a seat and writes `occupants: [loaderId]` on the matching spec. Dual-face packages are **one** Loader row: disabling that id stops host `provide` and the body page together. A different card is a different row. Unplugging a provider fiber tears down consumers that `inject` that service until the fiber returns ([service unload](../../../../docs/user/develop/framework/service.md)).

Host `/overlay-card` (and live `./overlay-card-plug-rpc.mjs` on `/overlay-card-plug`) serves `instances.setHidden` and `occupants.setInserted`. `overlay:live update` of the card package writes `./overlay-card-hide-rpc.mjs` and retargets an existing plug-rpc Loader name to that specifier so a process that already imported the first plug-rpc URL remounts those handlers on `/overlay-card-plug`. `setInserted` refuses ids not on that card's `occupants`, refuses desk/desktop-host/Cursor/RPC helper ids (`ui-float-window`, `ui-overlay-desktop`, `ui-cursor-agent` / `cursor-agent`, `overlay-card-roster-rpc`, `overlay-card-plug-rpc`, `overlay-card-hide-rpc`, `overlay-card-rpc`, `overlay-plugin-roster-rpc`, `overlay-plugin-rail-rpc`), and uses trusted-host authority. `overlay:live` parse/dump keeps `disabled: true` on insert rows so a later insert of another package does not re-enable an unplugged occupant.

The Cursor plugin panel lists card rows `{ id, title, hidden, inserted, occupants }` plus desktop occupants and standalone overlay fibers on `/overlay-plugins-rail` then `/overlay-plugins`, and offers 隐藏/显示 on cards and on shaped occupants ([shaped hide](2026-09-14-overlay-shaped-hide.md)). Fiber and desktop rows unplug with Loader `disabled`; desktop products have no hide file ([desktop host](2026-09-10-overlay-desktop-host.md)). Fiber hide is not a second `disabled` ([rail fibers](2026-09-10-overlay-plugin-rail-fibers.md)). Overlay stack z-order and the rail chrome stay on [overlay stack](2026-09-07-overlay-stack-and-card-plug.md).

## Alternatives considered

**Call `overlay:live remove` from the plugin panel.** Rejected — that can delete checkout. Unplug is Loader `disabled`; hide is `hidden`.

**Disable `ui-float-window`, Cursor, or overlay-card RPC rows.** Rejected — the desk, panel, and write channels must stay mounted so hide/insert RPC still works.

**Persist `inserted` in `instances.json`.** Rejected — Loader `disabled` is the source of truth; list derives the wire field.

**Force `hidden: true` on unplug.** Rejected — hide must survive so 插入后仍隐藏的卡不会突然出现. The window is already unmounted while `inserted` is false.

**Keep `instances.setPlugged` as an alias.** Rejected — pre-release one-cut rename.

**Special-case one product package for occupancy.** Rejected — `dsh.client.overlayBody` is the join.

## Consequences

Hide skips the window and keeps the spec and a stored frame. Unplug pauses occupant fibers; Cordis unloads dependents that inject those services; the window stays down until insert, then follows the surviving hide flag. Empty cards can hide; 拔出 is dimmed. Live insert of a page with `overlayBody` binds occupancy without rewriting page business logic. Card authors follow the occupancy protocol in [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md) so the rail can hide and unplug without product-specific wiring.

## Testing

Float-window tests cover `hidden` / `occupants` parse and persist, on-disk `plugged: false` migrating to `hidden: true`, desk mount iff `!hidden && inserted`, hide surviving re-insert, `instances.setHidden`, `occupants.setInserted` yaml `disabled`, protected and missing occupant ids, empty-occupant no-op, and desk poll of `/overlay-card-plug` when the first list omits `inserted`. `scripts/overlay-live-plugin.spec.ts` pins occupancy writes on insert/update, sidecar `instances.setHidden` / `occupants.setInserted`, `disabled: true` parse/dump, and card `update` retargeting plug-rpc to `./overlay-card-hide-rpc.mjs`. Cursor tests cover two panel buttons, hide not calling setInserted, unplug dimmed when `occupants` is empty, `/overlay-card-plug` fallback for list and writes, 拔出 switching to 插入, and a standalone fiber row routed with `kind: 'fiber'`. `packages/client/modules/tests/node-half.client.spec.ts` rejects an invalid `overlayBody`.
