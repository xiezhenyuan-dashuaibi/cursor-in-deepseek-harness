# Agent Note: Overlay shaped occupant package is generated, not cloned

Status: implemented

English | [中文](2026-09-14-overlay-new-shaped.zh.md)

## Problem

The reusable overlay shaped board is [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md): insert it, do not copy the tree. An arbitrary-shape product still needs a full client package that occupies `overlay-shaped.body` (`package.json`, `tsconfig`, locales, silhouette component, tests, README). The shaped skill forbids cloning another occupant and forbids occupying `shell.overlay` with product chrome, so without a writer those files get copied from a standalone fiber, from a product occupant, or from the board itself. Occupant `tsconfig.json` must reference the board's composite emit root, or `tsc -p` / `tsc -b` fails and later agents stall on a build maze. Landing rows (inventory, aggregate paths, Model Experience, omit list) otherwise get copied from a sibling package, which reintroduces occupant names into the HOW.

## Decision

`pnpm overlay:new-shaped <name>` (`scripts/overlay-new-shaped.ts`) writes a frontend-only occupant package under `packages/client/<name>/`. The board stays insert-only. Generated `dsh.client` includes `overlayBody: overlay-shaped.body` so `overlay:live insert` can require the host and list the occupant as a rail fiber. Generated `tsconfig.json` references `../ui-overlay-shaped/tsconfig.client.json`. Generated `package.json` includes `scripts.build` (`tsc -p tsconfig.json && tsdown`). The generator also inserts the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry when those checkout files exist (`scripts/overlay-page-checkout.ts` form `shaped`). It does not edit `packages/bundle/web-app/cordis.patch.yml`. Keep the generated export name `OverlayShapedKey`. The browser half registers `Occupant` into `overlay-shaped.body` with list `id` (slug from the directory) and `order: 10`. Live appearance is `pnpm overlay:live insert` of the host, then the occupant; that command builds `lib/` when `tsdown.config.ts` is present and waits until the npm name is in `window.__DSH_BOOT__`. Wait classification (fiber vs client-modules) is [boot graph wait](../architecture/2026-09-11-overlay-live-client-boot-graph.md). `pnpm overlay:live remove <id>` without `--keep-files` is the inverse for an omitted occupant: it deletes that directory and those rows. Host RPC stays an optional edit of the empty `src/index.ts` `apply()` using the skill snippet. The package README owns the occupant description; this writer does not add a feature Agent Note ([description registry](2026-09-05-client-plugin-description-registry.md)).

Host seats own drag, persist, and intra-board raise ([shaped drag](../architecture/2026-09-14-overlay-shaped-drag.md)). The generator emits occupant `onClick` and does not emit occupant drag, hide, or `setPointerCapture`. A dead occupant click recovers with `overlay:live update` of the host, not occupant `onPointerDown`. Hide-while-mounted is host-owned ([shaped hide](../architecture/2026-09-14-overlay-shaped-hide.md)). Operational HOW: [dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md). Shaped host: [overlay shaped host](../architecture/2026-09-14-overlay-shaped-host.md). Live vs boot: [live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md). After the stub exists, silhouette layout is [visual independence](2026-09-12-overlay-occupant-visual-independence.md). A checkout package that occupies `shell.overlay` without `overlayBody` is a standalone fiber ([standalone television](../architecture/2026-09-14-overlay-television-standalone-fiber.md)); new shapes do not copy that occupancy.

## Alternatives considered

**Paste a complete file tree only into the skill.** Rejected — `package.json` exports, `files`, and README gates drift; the skill is guidance, not the writer.

**Occupy `shell.overlay` with product chrome** (a standalone fiber). Rejected for new shapes — that occupancy does not share the list board; a second silhouette would register another chrome id instead of `overlay-shaped.body`.

**Clone a product occupant or the currently painted floater as the skeleton.** Rejected — an occupant is a product silhouette, not a kit, and naming it in skills keeps deleted plugins alive.

**Occupy `overlay-card.body` or `overlay-desktop.body`.** Rejected — cards are rectangular chrome; desktop is `kind: 'single'` and exclusive. Shaped is `kind: 'list'` and concurrent.

**List the shaped host as a rail fiber.** Rejected — that row is not the product; operators unplug the board. The host is unlistable, like the desktop board ([shaped hide](../architecture/2026-09-14-overlay-shaped-hide.md)).

**Reference the board solution `../ui-overlay-shaped` from the occupant `tsconfig.json`.** Rejected — that file is a solution (`files: []`) with host+client refs, not a composite emit root. `tsc -p` needs `../ui-overlay-shaped/tsconfig.client.json`.

**Leave inventory and tsconfig for a later hand edit.** Rejected — agents then open another occupant package to copy those rows, which reintroduces occupant names into the HOW.

**Occupant `onPointerDown` or Occupant `setPointerCapture` when the stub button does not click.** Rejected — delayed host Pointer Capture is the click contract ([shaped drag](../architecture/2026-09-14-overlay-shaped-drag.md)); rewriting the occupant papers over a stale host `lib/`.

**Treat a second host insert as a refresh.** Rejected — repeat insert of the host is a no-op; `overlay:live update` copies `lib/` and rewrites rail sidecars.

## Consequences

A new shaped occupant is: insert the board, `overlay:new-shaped`, workspace install, replace stub copy in that package only, `overlay:live insert` the occupant. Replacing the stub does not include searching, grepping, or opening a sibling occupant's frontend unless the user explicitly asked to make something similar to that product. Unload is `overlay:live remove <id>` and deletes that omitted checkout package. Joining the default web-app roster is a later bundle-patch edit after this overlay session ends. That landing does not edit `packages/bundle/web-app/cordis.patch.yml` while overlay Cursor is running. Many occupants stay enabled at once; inserting another shape does not exclusive-disable the others.

## Testing

`scripts/overlay-new-shaped.spec.ts` pins kebab names, `dsh.client.inject` including `ui-overlay-shaped`, `dsh.client.overlayBody` `overlay-shaped.body`, list `id` from the directory slug, `tsconfig.client.json` as the board reference, `scripts.build`, generated Occupant `onClick` (no occupant `setPointerCapture`), Next steps that insert the host first and name `Occupant.tsx`, a destination that already exists, a missing root version, an unchanged web-app `cordis.patch.yml`, and checkout landing rows when those files are present. `scripts/overlay-page-checkout.spec.ts` pins shaped-form landing after the shaped host markers. Named gap: generated package tests are not executed from the temp tree (workspace `react` links live under `packages/client/`).
