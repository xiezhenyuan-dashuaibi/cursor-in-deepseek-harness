# Agent Note: Overlay card page package is generated, not cloned

Status: implemented

English | [中文](2026-09-05-overlay-new-page.zh.md)

## Problem

The reusable overlay card is [`ui-float-window`](../../../../packages/client/ui-float-window/README.md): insert it, do not copy the tree. A card-window product still needs a full client package that occupies `overlay-card.body` (`package.json`, `tsconfig`, locales, `Page`, tests, README). The card skill carries `apply` / `preferFrame` snippets and forbids cloning another occupant, so without a writer those files get copied from some other occupant or from the card itself.

## Decision

`pnpm overlay:new-page <name>` (`scripts/overlay-new-page.ts`) writes a frontend-only page package under `packages/client/<name>/`. The card stays insert-only. Generated `dsh.client` includes `overlayBody: overlay-card.body` so `overlay:live insert` can record occupancy on that seat. The generator also inserts the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry when those checkout files exist (`scripts/overlay-page-checkout.ts`). It does not edit `packages/bundle/web-app/cordis.patch.yml`. Live appearance is `pnpm overlay:live` after `bundle`. `pnpm overlay:live remove <id>` without `--keep-files` is the inverse for an omitted occupant: it deletes that directory and those rows. Host RPC stays an optional edit of the empty `src/index.ts` `apply()` using the skill snippet. The package README owns the occupant description; this writer does not add a feature Agent Note ([description registry](2026-09-05-client-plugin-description-registry.md)).

Operational HOW: [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md). Card chrome: [overlay-card container](../architecture/2026-09-05-overlay-card-container.md). Live vs boot: [live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md).

## Alternatives considered

**Paste a complete file tree only into the skill.** Rejected — `package.json` exports, `files`, and README gates drift; the skill is guidance, not the writer.

**Ship a live placeholder occupant for agents to copy.** Rejected — `overlay-card.body` is `kind: 'single'`, so a kit package fights a product page; stub copy gets cloned as product copy.

**Treat another occupant as the skeleton.** Rejected — an occupant is a product page, not a kit, and naming it in skills keeps deleted plugins alive.

**Export `occupyCardBody` from `ui-float-window`.** Rejected — client plugins do not value-export helpers for other plugins, and that would not write `package.json` or tests.

**Leave inventory and tsconfig for a later hand edit.** Rejected — agents then open another occupant package to copy those rows, which reintroduces occupant names into the HOW.

## Consequences

A new card-window page is: insert the card, `overlay:new-page`, workspace install, replace stub copy in that package only, bundle, `overlay:live insert` the page. Unload is `overlay:live remove <id>` and deletes that omitted checkout package. Joining the default web-app roster is a later bundle-patch edit after this overlay session ends. That landing does not edit `packages/bundle/web-app/cordis.patch.yml` while overlay Cursor is running.

## Testing

`scripts/overlay-new-page.spec.ts` pins kebab / `packages/client/` names, `dsh.client.inject` including `ui-float-window`, `dsh.client.overlayBody` `overlay-card.body`, `overlay-card.body` registration source, a destination that already exists, a missing root version, an unchanged web-app `cordis.patch.yml`, and checkout landing rows when those files are present. `scripts/overlay-page-checkout.spec.ts` pins unland and prefix-safe sibling names. Named gap: generated package tests are not executed from the temp tree (workspace `react` links live under `packages/client/`).
