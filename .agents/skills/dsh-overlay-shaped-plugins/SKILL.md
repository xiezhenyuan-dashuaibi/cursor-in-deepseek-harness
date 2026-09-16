---
name: dsh-overlay-shaped-plugins
description: "Use when writing a non-card floating overlay occupant of arbitrary shape (sprite, 精灵, TV-shaped widget, 电视悬件, freeform floater, overlay-shaped, overlay-shaped.body, overlay:new-shaped). Insert ui-overlay-shaped, occupy overlay-shaped.body, many occupants coexist. Keep occupant onClick; host delayed Pointer Capture after 6px; line grid and hit targets share one inner size. Invent look from this product's brief and the generator stub. Do not search, grep, or open another occupant Occupant/Page as style reference unless the user asked to make something similar. Never occupy root, overlay-card.body, or overlay-desktop.body. Never restart dsh web."
---

# Overlay shaped floaters

This skill is the operational HOW for the **arbitrary-shape floating** overlay frontend form (sprite, TV-shaped widget, any non-card outline) on a running `dsh web`. It is guidance, not a script. Package contracts live in READMEs; rationale lives in Agent Notes. Overlay Cursor standing order: `.cursor/rules/dsh-cursor-in-dsh.mdc`. Presentation-form split: [overlay frontend form skills](../../notes/implemented/process/2026-09-05-overlay-frontend-form-skills.md). Occupant package kit: [overlay new shaped](../../notes/implemented/process/2026-09-14-overlay-new-shaped.md). Host drag: [overlay shaped drag](../../notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md).

If `dsh_skill` is missing, read **this file** from disk and continue. Tell the user the `dsh` server is not connected. Do not invent extra-tool results. Do not hunt MCP catalogs, architecture notes, other occupants, or `packages/bundle/web-app/cordis.patch.yml`.

## Scope: shaped form only

Overlay frontend has three presentation forms. This skill covers only a floating **non-card outline** on the reusable shaped board: host chrome in `shell.overlay` id `overlay-shaped`, product silhouette in `overlay-shaped.body`. It is not a fourth form.

| Form | Skill | HOW |
|---|---|---|
| Card window | [`dsh-overlay-web-plugins`](../dsh-overlay-web-plugins/SKILL.md) | Authored |
| Arbitrary-shape floater (sprite, TV widget, any non-card outline) | `dsh-overlay-shaped-plugins` | This file |
| Desktop (桌面; full-viewport under cards, not a floating card) | [`dsh-overlay-canvas-plugins`](../dsh-overlay-canvas-plugins/SKILL.md) | Authored |

Do not occupy `root` (AppFrame). Do not occupy `overlay-card.body` or copy [`ui-float-window`](../../../packages/client/ui-float-window/README.md). Do not occupy `overlay-desktop.body` or copy [`ui-overlay-desktop`](../../../packages/client/ui-overlay-desktop/README.md). Do not register a second `shell.overlay` chrome id for a product silhouette. A checkout package that already occupies `shell.overlay` without `overlayBody` is a standalone fiber, not this form; new shapes use this board.

Host seats own drag, persisted offset, and intra-board raise ([shaped drag](../../notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md)). Hide-while-mounted is host-owned ([shaped hide](../../notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md)). Do not implement drag or hide in `Occupant.tsx`. Insert, generate, live-update, and unload the occupant through the path below.

## Never restart `dsh web`

This overlay Cursor session **is** the running `dsh web` process. Killing or restarting it drops this chat. Live insert, update, and unload already work. Do not start a second `dsh web`. Do not edit `packages/bundle/web-app/cordis.patch.yml` to load a plugin onto the open page (`composeLive` snapshots that file at boot). A new `--id` alone does not remount host `apply` for a package name this process already imported. Rename (new npm name **and** new `--id`) only when `overlay:live` stderr reports no Loader fiber or `fiberPhase` `failed`. If stderr reports the fiber is `active`, do not rename — that miss is client-modules composition, not a poisoned specifier.

`pnpm overlay:new-shaped` is a repo-root script (`tsx scripts/overlay-new-shaped.ts`). `pnpm` reads `package.json` on each run; it does not need a process restart. Linking `react` is workspace `pnpm install` (or `--filter ./packages/client/<name>...`), not a restart. Appearance on the open page is `pnpm overlay:live`, not a reboot.

## Checkout workspace install

After adding a checkout package, run repo-root `pnpm install` or `pnpm install --filter ./packages/client/<name>...` so that package's `node_modules` links `react` and workspace peers. Declare `react` in the package `package.json` like other client UI packages. Do not junction another package's `node_modules`. Live `file:` copies still run `pnpm install` inside `$DSH_HOME/profiles/web`. Filter install rewrites the lockfile and talks to the registry; that can take one to two minutes. Wait for it. Do not treat a quiet terminal as a hang and do not restart `dsh web`.

## Frontend stays independent

Invent this silhouette from the product brief and the generator stub in this new package. Do not follow another overlay occupant's style. Do not search, grep, or open another overlay occupant's `Occupant.tsx`, `Page.tsx`, `*.module.css`, locales, or page tests as reference. Do not copy the currently painted desktop, card, or floater. Open another occupant's page frontend only when the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)). Host packages `ui-overlay-shaped`, `ui-overlay-desktop`, and `ui-float-window`, `--dsw-alias-*`, and [web styling](../../../docs/web-styling.md) are shared chrome, not a product-page template.

## Canonical shaped board

The reusable shaped base is [`packages/client/ui-overlay-shaped`](../../../packages/client/ui-overlay-shaped/README.md) (`@deepseek-ai/dsh-client-ui-overlay-shaped`). Insert this package first. Do not copy this tree into a product package. Do not clone another occupant as the silhouette skeleton. Run `pnpm overlay:new-shaped <name>` for the occupant package. Occupy `overlay-shaped.body` (`kind: 'list'`). Repeat insert of this host is a no-op (the board is already loaded). Refresh host `lib/` with `pnpm overlay:live update packages/client/ui-overlay-shaped`. `--id` is the Loader directory id.

| Fact | Value |
|---|---|
| Occupant | `shell.overlay` id `overlay-shaped` (order 180); never `root`, never `cursor-agent`, never `overlay-card.body`, never `overlay-desktop.body` |
| Page slot | `overlay-shaped.body` (`kind: 'list'`, `scope: 'root'`). Many enabled occupant Loader fibers |
| Empty body | Nothing painted. Clicks in empty space pass through |
| Click-through | Host root `data-overlay-board` + `pointer-events: none`. Cards, desktop, and Cursor keep hits. A silhouette that needs hits sets `pointer-events: auto` on its own hit target. Host seats stay `none`; hits land on the occupant and bubble through the seat |
| Drag | Host `ShapedSeat` wrap. Primary-button travel past 6px translates that seat. Pointer Capture starts only after that slop so occupant `onClick` still fires. Occupant CSS rest pose stays. The occupant axis-aligned box stays on the playable board |
| Persist | Browser `localStorage` key `dsh.overlay-shaped.offsets` (`{ [listId]: { x, y } }`). Survives browser-half remount |
| Stack | The board does not join `ctx.overlayStack`. Pointer-down among shaped seats raises that seat's z-index on the board |
| Hide | Host `hidden.json` (Loader ids) next to the live shaped-host copy. Occupant rail rows (`kind: 'shaped'`) offer 隐藏/显示. The seat uses `visibility: hidden`; the occupant stays mounted. Join is npm package name. The host is unlistable, like the desktop board |
| Concurrent load | Inserting a shaped occupant **adds**. It does not exclusive-disable other `overlay-shaped.body` occupants |
| Page import | Type-import `@deepseek-ai/dsh-client-ui-overlay-shaped/client` for `SlotMap`; never value-import `ShapedBoard` |
| Rail label | Optional `dsh.client.panelTitle` (Chinese product name). The occupant row uses that string or the Loader id |
| Host rail | Unlistable, like the desktop board. Occupant rows carry hide plus unplug |
| Unload the board | `pnpm overlay:live remove ui-overlay-shaped` (or that Loader id) |

A product must not occupy `shell.overlay` with its own chrome. The Cursor plugin rail protects Loader id `ui-overlay-shaped`. Missing host on occupant insert fails loud.

## Occupant clicks vs host drag

Keep generated `onClick` on occupant controls. Host `ShapedSeat` records pointer-down, starts Pointer Capture only after travel leaves `SHAPED_CLICK_SLOP` (6px), and swallows the trailing click after a drag so the occupant does not fire that click. Occupant packages do not call `setPointerCapture`, do not implement drag or hide, and do not rewrite a dead `onClick` to `onPointerDown` as the first recovery — that papers over a host that captured on pointer-down. If buttons on a live silhouette do not click, `pnpm overlay:live update packages/client/ui-overlay-shaped` (refresh the overlay tab only if the browser still shows the old seat). Do not restart `dsh web`. Contract: [shaped drag](../../notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md).

## Painted inner size

The web theme sets `box-sizing: border-box`. A `border` on the painted box shrinks the content box, so an SVG or background line grid sized from `100%` or `inset: 0` will not match a hit grid sized in `px`. Give the line layer and the hit layer **one inner size**: `box-sizing: content-box` (rim outside that size) or a rim that is not `border` (for example `box-shadow`). Do not set `inset` together with `width`/`height` on the same absolutely positioned layer. Set `flex-shrink: 0` on the painted box. SVG `viewBox` units must match the pixel stride of the hit targets (`preserveAspectRatio="none"` when the viewBox is a unit grid). Invent the look from this product's brief; do not open another occupant's CSS for this rule.

Rationale: [shaped host](../../notes/implemented/architecture/2026-09-14-overlay-shaped-host.md), [shaped drag](../../notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md), [shaped hide](../../notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md), [live path](../../notes/implemented/architecture/2026-09-04-overlay-web-plugin-live-path.md), [boot graph wait](../../notes/implemented/architecture/2026-09-11-overlay-live-client-boot-graph.md), [occupant kit](../../notes/implemented/process/2026-09-14-overlay-new-shaped.md).

## Plugin panel: shaped occupants

The Cursor rail lists each inserted `overlay-shaped.body` occupant as `shaped` (隐藏 plus 拔出), matching card hide vs unplug. The shaped board is unlistable, like the desktop board. 隐藏 writes host `hidden.json` and keeps the silhouette mounted (`visibility: hidden`). 拔出 writes that row's Loader `disabled`. Unplug does not write hide; hide survives so 插入后仍隐藏. Unload the board with `overlay:live remove`.

Follow these so a new shaped occupant is manageable from that panel:

1. Keep `dsh.client.overlayBody` equal to `overlay-shaped.body`. `overlay:new-shaped` writes it. Without that declaration, live insert cannot require the host and the rail cannot classify the row as a shaped occupant.
2. Dual-face (host `provide` / RPC + silhouette) is **one** package and **one** Loader row. Unplug that id stops SQLite/`provide` and the silhouette together.
3. Register host RPC and `provide` in `apply` through `ctx.effect` (or `inject`) so Loader `disabled` tears them down.
4. Do not reuse Loader ids `ui-overlay-shaped`, `ui-overlay-desktop`, `ui-float-window`, `ui-cursor-agent` / `cursor-agent`, `overlay-card-*-rpc`, `overlay-plugin-roster-rpc`, or `overlay-plugin-rail-rpc`. Do not disable those rows. Do not occupy `root`, `overlay-card.body`, or `overlay-desktop.body`.
5. Do not invent a product plug flag, call `overlay:live remove` to pause, or edit `packages/bundle/web-app/cordis.patch.yml` while this process is up. Pause is the panel (or patch `disabled`); uninstall is `overlay:live remove`. Adding another shape is another insert, not exclusive enable. Do not `overlay:live remove` an occupant without `--keep-files` unless the checkout package should be deleted.

## Fast path for a new shaped occupant

1. Insert the shaped host: `pnpm overlay:live insert packages/client/ui-overlay-shaped`. Always run this step. Repeat insert is a no-op when the host row already exists. Host `tsconfig.json` must emit (`include: ["src"]`, `outDir: lib/types`); a solution `files: []` makes live `tsc -p` a no-op.
2. Write the occupant package: `pnpm overlay:new-shaped <name>` (directory under `packages/client/`, e.g. `ui-notes` or `packages/client/ui-notes`). That command writes `package.json` (including `dsh.client.overlayBody: overlay-shaped.body`), `tsconfig.json` (references `../ui-overlay-shaped/tsconfig.client.json`), `locales.ts`, `Occupant`, tests, READMEs, the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry. It does not edit `packages/bundle/web-app/cordis.patch.yml`. Put host RPC/`provide` in this same package. Do not copy `ui-overlay-shaped` or another occupant. Do not search, grep, or open another occupant package as frontend reference unless the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)).
3. Run `pnpm install --filter ./packages/client/<name>...`. Replace stub copy in `Occupant.tsx`, `locales.ts`, and `Occupant.module.css` only. Invent this product's outline from the brief and that stub. Keep generated `onClick` on controls; the host starts Pointer Capture only after 6px. Line grids and hit targets share one inner size (theme `border-box` shrinks content under a `border`). Keep the export name `OverlayShapedKey` (`src/client/index.ts` imports it). Keep the list register `{ name: 'overlay-shaped.body', id, order: 10, locale: NS }` — `id` is the slug from the directory (`ui-notes` → `notes`). Optional `dsh.client.panelTitle` is the rail fiber label (Chinese product name). Style stays CSS Modules. Shared chrome uses `--dsw-alias-*`; a product whose identity is a specific palette may set local color custom properties to those colors ([web styling](../../../docs/web-styling.md)). Product copy is Chinese. Domain logic that is not React lives in a pure module beside `Occupant.tsx`; component tests assert visible copy. Occupant tests use `getAttribute` unless that spec already imports jest-dom. Do not add a feature Agent Note whose body is the package README ([description registry](../../notes/implemented/process/2026-09-05-client-plugin-description-registry.md)).
4. `pnpm overlay:live insert packages/client/<name>` (or `update` when already loaded). That command builds `lib/` when `tsdown.config.ts` is present (`--no-build` skips), copies the stripped tree, then waits until this npm name is in `window.__DSH_BOOT__` (`--no-wait` skips). Success is that boot graph plus `GET /plugins/@deepseek-ai/dsh-client-<name>/client.js` 200, not the plugin rail. Insert adds this occupant beside any others on `overlay-shaped.body`. If the wait fails, read stderr: missing or `failed` fiber → new npm name and new `--id`; `active` fiber → do not rename.

These four steps run on the already-open overlay. Do not restart `dsh web` to pick up the generator, `react`, or the occupant. Never occupy `root`.

## Guidance for the next shaped occupant

Say and do these; they are the same four steps above, not a second procedure.

| Use | Avoid |
|---|---|
| Occupy `overlay-shaped.body` with a list id | Occupying `shell.overlay` with product chrome, occupying `root`, stuffing the outline into `overlay-card.body` or `overlay-desktop.body` |
| `pnpm overlay:live insert packages/client/ui-overlay-shaped` then `pnpm overlay:new-shaped <name>` then filter install then `overlay:live insert` the occupant | Cloning `ui-overlay-shaped` or another occupant; editing `packages/bundle/web-app/cordis.patch.yml` while this process is up; hand-writing inventory / tsconfig / omit-list rows |
| Outline from this product's brief and the generator stub | Searching, grepping, or opening a sibling occupant's `Occupant.tsx` / `Page.tsx` / `*.module.css`; copying the currently painted floater |
| Mount proof: `window.__DSH_BOOT__` contains this npm name and `/plugins/<pkg>/client.js` returns 200 | Treating the plugin rail or a yaml row as proof the client half mounted |
| Wait stderr that the Loader fiber is `active` | Renaming the package, restarting `dsh web`, or refreshing as the first recovery |
| Wait stderr that there is no fiber or `fiberPhase` is `failed` | Reusing the same npm name after a poisoned first ESM import |
| Repeat host insert is a no-op; `overlay:live update` copies host `lib/` | Expecting a second `insert` of the host to refresh built files |
| Optional `dsh.client.panelTitle` (Chinese) and keep export name `OverlayShapedKey` | A feature Agent Note whose body is the package README |
| Occupant `pointer-events: auto` on the hit target; host board stays `none` | Stealing hits from cards, desktop, and Cursor, or leaving a painted silhouette that must receive clicks with `none` |
| Keep generated `onClick`; host delayed Pointer Capture | Occupant `onPointerDown` / Occupant `setPointerCapture` / Occupant drag because clicks vanished |
| One inner size for line grid and hit targets (`content-box` or rim outside) | `border-box` + `border` plus `inset`/`100%` lines against a `px` hit grid |
| `getAttribute` in generated occupant tests | jest-dom `toHaveAttribute` unless that spec already imports it |
| Leave occupant CSS rest pose; host seats drag, persist, raise, hide, and keep the occupant box on the playable board | Implementing drag, hide, or `overlayStack` raise in `Occupant.tsx` |
| TSX SVG closes the real tag (`</g>`, `</path>`, `</svg>`); className parts may be undefined under `noUncheckedIndexedAccess` | Fragment close `</>` on an SVG element, or indexing CSS module keys without a definite string |
| Catalog gens write English | Leaving the zh counterpart and pairing sidecar stale in the same change |

- Write a designed silhouette (readable type, spacing, a filled primary action, `prefers-reduced-motion`). Sparse plugin chrome is not acceptable unless the product is deliberately click-through (the host board stays `pointer-events: none`; the occupant chooses its own hit targets). Keep generated `onClick`. Line grids and hit targets share one inner size.
- Frontend is React + CSS Modules. Shared chrome uses `--dsw-alias-*`. Product copy is Chinese. Vue, Angular, Next, Nuxt, Remix, Express-as-the-app, Tailwind, and component libraries are not this path.
- Backend is an ordinary Node plugin: SQLite, filesystem, timers, Connection RPC. Register RPC with `ctx.effect(() => ctx.connection.rpc.handle(...), '…')` so unload unregisters the channel.
- The browser bundle must not value-import a host package. Duplicate the channel string and wire types on the client.
- A `kind: 'list'` occupant has `id` / `order`.
- `overlay:live` writes Loader `{ id, name }` only. The browser half does not receive Loader config.

## Roots

| Role | Path | What belongs there |
|---|---|---|
| Author source | `packages/client/<name>/` npm name `@deepseek-ai/dsh-client-<name>` | TypeScript you edit |
| Live plugin root | `$DSH_HOME/profiles/web/plugins/<id>/` | Stripped copy the running process imports (`lib/index.js`, optional `lib/client.js`, `package.json` with **no** `workspace:^`) |
| Live Loader file | `$DSH_HOME/profiles/web/cordis.patch.yml` | Insert or delete a row to start or stop the plugin. The process already watches this file. |
| Live `file:` manifest | `$DSH_HOME/profiles/web/package.json` | `"@deepseek-ai/dsh-client-<name>": "file:./plugins/<id>"` |

Do not point `file:` at checkout `packages/client/<name>`: that manifest still has `workspace:^`, and profile `pnpm` cannot resolve it.

On this machine `$DSH_HOME` defaults to `%USERPROFILE%\.dsh` (Unix: `~/.dsh`).

## Interface

Host (`src/index.ts`) — Node only; a dual-face **occupant** may register RPC here:

```ts
export const inject = ['connection']

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.connection.rpc.handle('/my-api', (endpoint, payload) => dispatch(endpoint, payload), {
      authority: 'trusted-host',
    }),
    'my-api RPC',
  )
}
```

Occupant (`src/client/index.ts`) — occupies the shaped body with a list id. `dsh.client.overlayBody` must equal this inject slot:

```ts
import type {} from '@deepseek-ai/dsh-client-ui-overlay-shaped/client'

ctx.slots.inject('overlay-shaped.body', () => ctx.slots.register(
  { name: 'overlay-shaped.body', id: 'notes', order: 10, locale: NS },
  Occupant,
))
```

Author tree that `overlay:new-shaped` writes (frontend-only; add host RPC with the snippet above when needed):

```
packages/client/<name>/
  package.json          # name, exports . / ./invariant / ./client, dsh.client
  tsconfig.json
  tsdown.config.ts
  src/index.ts          # host apply(); empty function if the occupant is browser-only
  src/invariant.ts
  src/client/index.ts   # browser apply()
  src/client/Occupant.tsx
  src/client/Occupant.module.css
  src/client/locales.ts
  tests/
```

Plugin inventory is [packages/client/README.md](../../../packages/client/README.md). Joining the **default** web-app roster on a later boot is a bundle-patch edit after this overlay session ends ([client plugin checklist](../../../packages/client/AGENTS.md#new-plugin-package-checklist) item 3). Live appearance does not wait on it and must not write that patch while this process is up.

## Register, update, unload

`overlay:live insert` and `update` run `tsc -p tsconfig.json` then `pnpm run bundle` in the checkout package when `tsdown.config.ts` is present (`--no-build` skips). Do not run `tsc -b` from the occupant: that walks unrelated project references. Occupant `tsconfig.json` references `../ui-overlay-shaped/tsconfig.client.json` (the emit root), not the solution `../ui-overlay-shaped`.

Then one command, which copies the stripped tree, adds the `file:` dependency, runs `pnpm install` **in the profile directory**, and only then appends the Loader row:

```sh
pnpm overlay:live insert packages/client/ui-overlay-shaped
pnpm overlay:live insert packages/client/<occupant>
```

Frontend-only is two inserts: the shaped host, then the occupant. Always insert the host first. Frontend-plus-backend is still the host, then **one** dual-face occupant package. Keep existing overlay rows (Cursor panel, the reusable card, the desktop board) in place.

```sh
pnpm overlay:live update packages/client/<name>
pnpm overlay:live remove <id>                 # drop Loader row, file: dep, plugins/<id>/, and the omitted checkout occupant
pnpm overlay:live remove <id> --keep-files    # drop Loader row only; live copy and checkout stay
```

Default `remove <id>` also deletes `packages/client/<id>` and the landing rows `overlay:new-shaped` wrote, then relinks the workspace. `--keep-files` skips both deletes. The shaped host stays in checkout when you `remove ui-overlay-shaped` (board unload only). A web-app roster package stays in checkout. Host SQLite under `$HOME/.dsh` **stays** until you delete that file on purpose. Adding another shape does not call `overlay:live remove`.

## Verify

The plugin rail lists profile yaml. That list is not proof the client half mounted.

Direct CLI `overlay:live insert` of a `dsh.client` package waits until that npm name is in `window.__DSH_BOOT__` (origin `$DSH_OVERLAY_ORIGIN` or `http://127.0.0.1:3080`; `--no-wait` skips). When that wait fails, stderr classifies `pluginInventory/list` against the boot graph:

- **No Loader fiber**, or **`fiberPhase` `failed`**: first ESM import of this package name is poisoned, or yaml did not mount. Insert under a **new npm name** and a new `--id`. Do not restart `dsh web`.
- **Fiber `active`**, name missing from `__DSH_BOOT__`: host `apply` ran; client-modules did not add the browser row. Do **not** rename. `overlay:live` already tried omitting live `overlayBody` and remounting that fiber.
- **Inventory RPC unreachable**: do not rename. Retry the wait; do not restart `dsh web`.

Yaml (and the rail) may already list the package in every case above.

After a successful insert:

1. `GET /plugins/@deepseek-ai/dsh-client-<name>/client.js` returns 200.
2. The silhouette is on the overlay layer. Click the generated Continue control (or the product control that replaced it): copy or `aria-pressed` changes, and the seat does not translate. If that click is dead, `overlay:live update` the host, not Occupant `onPointerDown`. Empty space, cards, desktop, and Cursor remain clickable. Drag the hit target past 6px; the seat translates. Drag offset survives a browser-half remount (`localStorage` `dsh.overlay-shaped.offsets`).
3. Playwright against this origin must use `waitUntil: 'domcontentloaded'`. If the browser still shows an old silhouette, refresh the tab only — do not restart `dsh web`.

Inserting a second shaped occupant leaves the first occupant's fiber enabled. The rail lists both as shaped occupants. The board is not a list row. Any insert or update also writes `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs`. Do not hand-write those modules.

The documentation-site pointer for this **shaped** form (not a second procedure) is [overlay shaped plugins](../../../docs/cookbook/overlay-shaped-plugins.md).
