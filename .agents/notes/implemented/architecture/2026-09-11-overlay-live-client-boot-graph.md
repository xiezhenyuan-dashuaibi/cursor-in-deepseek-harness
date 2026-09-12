# Agent Note: Overlay live insert waits on the client boot graph, not the plugin rail

Status: implemented

English | [中文](2026-09-11-overlay-live-client-boot-graph.zh.md)

## Problem

A live overlay page can sit on the plugin rail and still miss `window.__DSH_BOOT__`. The rail reads profile yaml. The boot graph is the Node client-modules table that serves `/plugins/<id>/client.js`. Contributors treat a yaml row plus filled `空桌面` as “Loader did not mount,” then rename a package whose host fiber is already `active`. `parseDshClient` throwing on an unknown `dsh.client.overlayBody` string is that miss: host `apply` ran, flush only `logger.warn`s, the browser row never joins. A long-lived `dsh web` keeps the first-imported scanner for the process lifetime, so a newer slot name (`overlay-desktop.body` on an older scanner, or a future slot) fails the same way. A wait helper that always recommends a new npm name does not fix that compose miss and burns the checkout.

## Decision

Boot-graph admission is `platform: 'web'` plus `exports["./client"]`. [`parseDshClient`](../../../../packages/client/modules/src/index.ts) still records a recognized `overlayBody` (`overlay-card.body`, `overlay-card-N.body` for N ≥ 2, `overlay-desktop.body`). An unknown string is omitted from the parsed declaration so it cannot fail composition. A non-string `overlayBody` still throws. Occupant packages keep declaring the real slot: the rail and `overlay:live` exclusive-desktop insert read checkout `package.json`, not this scanner field.

[`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) of a `dsh.client` package waits on `GET /` until that npm name is in `window.__DSH_BOOT__` (default 15s, `--no-wait` skips). A miss probes `pluginInventory/list` and prints one of:

- no Loader fiber, or `fiberPhase` `failed` — first ESM import poison or yaml did not mount; new npm name and new `--id`; never restart `dsh web`;
- fiber `active` — host mounted, client-modules omitted the browser row; do not rename; omit live `overlayBody`, remount that Loader row, wait again, restore the original live `package.json` without a second remount;
- inventory RPC unreachable, or fiber `pending` / `loading` / disabled — do not rename.

This note partially supersedes the wait-diagnosis sentence on [live path](2026-09-04-overlay-web-plugin-live-path.md). Live-versus-boot, first-import cache, and never-restart stay there. Desktop occupancy stays on [desktop host](2026-09-10-overlay-desktop-host.md). Operational HOW stays the form skills.

## Alternatives considered

**Restart `dsh web` so the running process reloads `parseDshClient`.** Rejected — overlay Cursor is that process; a restart drops the session doing the work.

**Keep throwing on an unknown `overlayBody` string.** Rejected — that field is rail and exclusive-insert metadata. Using it as a boot-graph gate hides the page while the host fiber stays up.

**Treat the plugin rail as proof the client half mounted.** Rejected — the rail lists yaml; `__DSH_BOOT__` is the live client table.

**Always rename on a wait miss.** Rejected — rename helps a poisoned first ESM import. An `active` fiber is already imported; a new npm name is a detour.

**Expire Node’s ESM cache or the client-modules `pkgMeta` cache from `overlay:live`.** Rejected — both are process-lifetime. Recovery remounts after a disk edit the current scanner accepts.

**Import Cursor-panel RPC helpers into `overlay:live`.** Rejected — overlay Cursor denies edits under `packages/client/ui-cursor-agent/`. The helper duplicates the inventory URL and envelope.

**Skip `overlayBody` remount recovery.** Rejected — a long-lived process still runs the scanner it imported at boot. Omitting the field on the live copy, remounting, then restoring the field without a second remount admits the browser row without dropping the rail’s slot declaration.

## Consequences

A new desktop (or card) page can `pnpm overlay:live insert` the host kit, generate the occupant, and wait on the boot graph without renaming when the fiber is already `active`. Cards whose `overlayBody` already matches the scanner regex take the happy path unchanged. Exclusive desktop insert, card hide/unplug, and the default web-app roster are untouched. A process that imported an older scanner still needs the remount recovery until that process ends.

## Testing

`packages/client/modules/tests/node-half.client.spec.ts` pins unknown string `overlayBody` (`root`, `overlay-card-1.body`) joining the graph, `overlay-desktop.body` joining, and a non-string throwing. `scripts/overlay-live-plugin.spec.ts` pins `LiveClientBootWaitError`, `pluginInventory/list` match vs absent, `failed` fiber that must not remount, and an `active` fiber that omits `overlayBody`, remounts once, then restores the field. Named gap: no automated test against a long-lived `dsh web` whose in-memory scanner predates this `parseDshClient` change; remount recovery is the pin for that process.
