# Agent Note: Overlay card roster needs a live `/overlay-card` channel

Status: implemented

English | [中文](2026-09-06-overlay-card-roster-channel.zh.md)

## Problem

A second overlay card written into `instances.json` never appeared. The desk store mounts only the RPC roster. POST `/overlay-card/instances.list` on the live `dsh web` returned HTTP 405 and the SPA `index.html` fallback, so the channel was not registered. The browser poll had no `try/catch`; a throw left the default one-card roster. An empty seat also painted only glass chrome, which is easy to miss next to a large page. A page `preferFrame` that grew past a later card pushed that card further right, often past the overlay canvas (`overflow: hidden` on the shell frame).

The host fiber for `@deepseek-ai/dsh-client-ui-float-window` can be `active` while still running the first ESM `apply` of that **package name**. Loader does not re-import a new `file:` directory under the same name. Host `lib/index.js` does not hot-swap ([live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)).

## Decision

The node half calls `ctx.connection.rpc.handle('/overlay-card', …)` from `apply`; `rpc.handle` already owns the route effect, so a second `ctx.effect` is not required. Duplicate `rpc.handle` is ignored so a sidecar that already owns the channel does not fail the package fiber. `pnpm overlay:live insert` or `update` of the card package writes `$DSH_HOME/profiles/web/overlay-card-roster-rpc.mjs` and a Loader row (`id: overlay-card-roster-rpc`, `name: ./overlay-card-roster-rpc.mjs`) when the profile has no overlay-card RPC row. That specifier is independent of the npm package-name ESM cache, so one insert command mounts `/overlay-card` on a process that already imported `@deepseek-ai/dsh-client-ui-float-window`. The first `/overlay-card` handler still wins and does not hot-swap: a list-only `apply` rejects `instances.setHidden` and `occupants.setInserted`. The same insert or update writes `./overlay-card-plug-rpc.mjs` (`id: overlay-card-plug-rpc`) on `/overlay-card-plug` so hide and insert writes can reach the live `instances.json` and profile patch without replacing that first handler. Card `update` also writes `./overlay-card-hide-rpc.mjs` and retargets that Loader name when the first plug-rpc URL is already in the patch, so Node remounts hide/insert `apply` on the same `/overlay-card-plug` channel. The Cursor panel calls `/overlay-card` then `/overlay-card-plug`. The modules read `plugins/*/instances.json` for that package name. Package `apply` resolves the roster directory on every RPC: `$DSH_HOME/profiles/<name>/plugins/<id>/instances.json` when that live copy exists, otherwise the checkout one-card template. Overlay insert, hide, unplug, the desk poll, and the Cursor plugin panel share that roster. A live `./overlay-card-rpc.mjs` row counts as already mounted; insert does not add a second roster row. Repeat insert of the same package still only appends `instances.json` once the channel rows exist. The roster poll swallows transport failures and keeps the last snapshot. A body slot with no occupant renders the filled `chrome.empty` label (`空卡片`). After insert, `preferFrame` and resize do not move other seats ([isolation](../architecture/2026-09-06-overlay-card-isolation.md)). Card roster format and insert flags stay on [overlay-card container](../architecture/2026-09-05-overlay-card-container.md). Hide vs Loader `disabled` stays on [hide vs Loader disabled](../architecture/2026-09-07-overlay-card-hide-and-loader-disabled.md). Other live host-logic changes still need a never-imported specifier, not `overlay:live update` of the same package name.

## Alternatives considered

**Drive the desk from `instances.json` in the client bundle.** Rejected — insert must add a card without rebuilding `lib/client.js`.

**Serve `instances.json` from `client-modules` `/plugins`.** Rejected on a running process — that host half is also first-import cached. The dedicated `/overlay-card` channel is the product path.

**Keep pushing covered siblings only to the right.** Rejected — a 960px page `preferFrame` parks a later 520px card past a typical overlay canvas.

## Consequences

A missing channel no longer looks like “insert did nothing”: the first card stays until `/overlay-card` is actually mounted, then the roster can grow. One `overlay:live insert` of the card package is enough to mount that channel and append a spec. An empty extra card is a labeled window. Other live host RPC still requires a never-imported specifier, not `overlay:live update` of the same package name.

## Testing

`packages/client/ui-float-window/tests/apply.host.spec.ts` pins `instances.list`, that `/overlay-card` is a `webServer` prefix for the plugin fiber lifetime, that a duplicate `/overlay-card` registration is ignored, and that source-launch checkout `src/` prefers the live profile `instances.json`. `roster.client.spec.ts` keeps the default roster when RPC throws. `overlay-card.client.spec.tsx` pins the empty-body label and that resizing one seat leaves a sibling frame unchanged. `scripts/overlay-live-plugin.spec.ts` pins that card insert writes `./overlay-card-roster-rpc.mjs` when missing (including `instances.setHidden` and `occupants.setInserted`), writes `./overlay-card-plug-rpc.mjs` for `/overlay-card-plug`, skips a second roster row when `overlay-card-rpc` already exists, adds the plug row on card `update` when it is missing, retargets plug-rpc to `./overlay-card-hide-rpc.mjs` on card `update` when that row already exists, and still appends `instances.json` on repeat insert. Named gap: no automated test that Node retains the first `apply` of a profile `file:` URL; that pin remains the live-path note.
