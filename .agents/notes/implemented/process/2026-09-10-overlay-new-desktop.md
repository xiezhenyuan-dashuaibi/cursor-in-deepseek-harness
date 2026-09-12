# Agent Note: Overlay desktop page package is generated, not cloned

Status: implemented

English | [中文](2026-09-10-overlay-new-desktop.zh.md)

## Problem

The reusable overlay desktop is [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md): insert it, do not copy the tree. A desktop product still needs a full client package that occupies `overlay-desktop.body` (`package.json`, `tsconfig`, locales, `Page`, tests, README). The canvas skill carries `apply` snippets and forbids cloning another occupant, so without a writer those files get copied from some other occupant or from the board itself. Occupant `tsconfig.json` must reference the board's composite emit root, or `tsc -p` / `tsc -b` fails and later agents stall on a build maze.

## Decision

`pnpm overlay:new-desktop <name>` (`scripts/overlay-new-desktop.ts`) writes a frontend-only page package under `packages/client/<name>/`. The board stays insert-only. Generated `dsh.client` includes `overlayBody: overlay-desktop.body` so `overlay:live insert` can exclusive-enable that occupant. Generated `tsconfig.json` references `../ui-overlay-desktop/tsconfig.client.json`. Generated `package.json` includes `scripts.build` (`tsc -p tsconfig.json && tsdown`). The generator also inserts the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry when those checkout files exist (`scripts/overlay-page-checkout.ts`). It does not edit `packages/bundle/web-app/cordis.patch.yml`. Keep the generated export name `OverlayPageKey`. Live appearance is `pnpm overlay:live insert` of the host, then the page; that command builds `lib/` when `tsdown.config.ts` is present and waits until the npm name is in `window.__DSH_BOOT__`. Wait classification (fiber vs client-modules) is [boot graph wait](../architecture/2026-09-11-overlay-live-client-boot-graph.md). `pnpm overlay:live remove <id>` without `--keep-files` is the inverse for an omitted occupant: it deletes that directory and those rows. Host RPC stays an optional edit of the empty `src/index.ts` `apply()` using the skill snippet. The package README owns the occupant description; this writer does not add a feature Agent Note ([description registry](2026-09-05-client-plugin-description-registry.md)).

Operational HOW: [dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md). Desktop host: [overlay desktop host](../architecture/2026-09-10-overlay-desktop-host.md). Live vs boot: [live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md). After the stub exists, page layout is [visual independence](2026-09-12-overlay-occupant-visual-independence.md).

## Alternatives considered

**Paste a complete file tree only into the skill.** Rejected — `package.json` exports, `files`, and README gates drift; the skill is guidance, not the writer.

**Ship a live placeholder occupant for agents to copy.** Rejected — `overlay-desktop.body` is `kind: 'single'`, so a kit package fights a product page; stub copy gets cloned as product copy.

**Treat another occupant as the skeleton.** Rejected — an occupant is a product page, not a kit, and naming it in skills keeps deleted plugins alive.

**Reference the board solution `../ui-overlay-desktop` from the occupant `tsconfig.json`.** Rejected — that file is a solution (`files: []`) with host+client refs, not a composite emit root. `tsc -p` needs `../ui-overlay-desktop/tsconfig.client.json`.

**Leave inventory and tsconfig for a later hand edit.** Rejected — agents then open another occupant package to copy those rows, which reintroduces occupant names into the HOW.

## Consequences

A new desktop page is: insert the board, `overlay:new-desktop`, workspace install, replace stub copy in that package only, `overlay:live insert` the page. Replacing the stub does not include searching, grepping, or opening a sibling occupant's page frontend unless the user explicitly asked to make something similar to that product. Unload is `overlay:live remove <id>` and deletes that omitted checkout package. Joining the default web-app roster is a later bundle-patch edit after this overlay session ends. That landing does not edit `packages/bundle/web-app/cordis.patch.yml` while overlay Cursor is running.

## Testing

`scripts/overlay-new-desktop.spec.ts` pins kebab names, `dsh.client.inject` including `ui-overlay-desktop`, `dsh.client.overlayBody` `overlay-desktop.body`, `tsconfig.client.json` as the board reference, `scripts.build`, Next steps that insert the host first and do not ask for a separate `bundle`, a destination that already exists, a missing root version, an unchanged web-app `cordis.patch.yml`, and checkout landing rows when those files are present. `scripts/overlay-page-checkout.spec.ts` pins unland and prefix-safe sibling names. Named gap: generated package tests are not executed from the temp tree (workspace `react` links live under `packages/client/`).
