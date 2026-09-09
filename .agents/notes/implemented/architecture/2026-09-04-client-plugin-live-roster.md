# Agent Note: Live client-plugin roster without a page refresh

Status: implemented

English | [中文](2026-09-04-client-plugin-live-roster.zh.md)

## Problem

Ordinary client plugins persist as package files plus a Loader row. Process restart reloads that row, so the plugin is not cleared. React state inside the occupant may reset. That durability was already true.

Live insert and remove were not. `watchUserPatches` already recomposes `$DSH_HOME/profiles/<name>/cordis.patch.yml` and `$DSH_HOME/cordis.patch.yml` without restarting the web process. The host client-module table followed those Loader fibers. The open page did not: SSE `graph` frames were sent only on EventSource connect, and the browser half ignored them. A `rebuilt` frame for a name the page had never created was a warning. A package name that failed `require.resolve` on the first scan stayed unresolvable until process restart, so a row written before `pnpm install` finished never joined.

Editing `packages/bundle/web-app/cordis.patch.yml` is still boot-only; `composeLive` snapshots bundle patches at launch. That is not this note's insert path.

## Decision

[`@deepseek-ai/dsh-client-hmr`](../../../../packages/client/hmr/README.md) broadcasts a `graph` frame on connect and on every host roster change, before the new-row re-hash that may emit `rebuilt`. The browser half diffs that roster against the live loader tree: [`adoptRow`](../../../../packages/client/modules/README.md) / `dropRow` on the module table, `loader.create` for new names, `loader.remove` for names the host dropped. It never unloads `@deepseek-ai/dsh-client-modules`, `@deepseek-ai/dsh-client-hmr`, or `@deepseek-ai/dsh-client-app-shell`. Graph applies and rebuilt swaps share one serial queue.

[`ClientModuleRegistry`](../../../../packages/client/modules/src/index.ts) retries an `unresolvable` metadata verdict on the next dirty flush. A successful resolve and a "not a web client" verdict stay cached. Bundle content still reaches the graph only through `rebuilt`.

The insert/remove file the live web process watches remains the profile or home `cordis.patch.yml` ([app-boot](../../../../packages/boot/app-boot/README.md)). Source edits of an already-rostered plugin still need `pnpm run dev:web` rewriting `lib/client.js` for a no-refresh reload, or an overwrite of the profile copy when the page loaded from `$DSH_HOME/profiles/<name>/plugins/` ([dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)). Dynamic Cordis packages stay process memory ([self-referential toolset](../feature/2026-07-08-self-referential-cordis-toolset.md)); this note does not save them. Overlay extras run in the MCP child, not the web process. Live insert of ordinary plugins is the overlay product path ([live path](2026-09-04-overlay-web-plugin-live-path.md)).

## Alternatives considered

**Watch and re-read the web-app bundle `cordis.patch.yml` from `composeLive`.** Rejected — bundle layers are the shipped composition; live user edits belong on the already-watched profile and home files. Re-reading the bundle while the process runs would make checkout composition a hot file.

**Treat an unknown `rebuilt` id as an implicit create.** Rejected — create needs the graph row's url/rev. A `graph` frame is the roster authority; `rebuilt` stays content-only.

**Expire every negative `pkgMeta` cache, including "not a web client".** Rejected — builtins and non-client host plugins would re-read `package.json` on every fiber event. Retrying only `unresolvable` covers a package that appears on disk after the first miss.

**Page refresh as the roster update.** Rejected — it fails the product that a new or deleted plugin takes effect on the open page.

## Consequences

A client plugin whose package is resolvable and whose `lib/client.js` exists appears on the open `dsh web` page when its Loader row lands in a watched user patch, and disappears when that row is removed, without restarting the web process or refreshing the browser. Host node-half HMR code still loads only at process start (web mounts watch-only Cordis HMR with no module roots). Occupant React state still resets when the entry remounts. A package.json that later gains `dsh.client` after a `not-client` verdict still needs a process restart.

## Testing

`packages/client/hmr/tests/node-half.client.spec.ts` opens `/plugins/events` and asserts a later roster change writes a `graph` frame. `packages/client/hmr/tests/browser-half.client.spec.ts` applies graph add/remove, keeps kernel names, warns on unknown rebuilt, and logs a malformed graph. `packages/client/modules/tests/loader.client.spec.ts` pins `adoptRow` / `dropRow`. `packages/client/modules/tests/node-half.client.spec.ts` retries an unresolvable name after the package appears on disk.
