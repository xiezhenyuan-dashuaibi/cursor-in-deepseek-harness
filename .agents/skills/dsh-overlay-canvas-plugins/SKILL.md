---
name: dsh-overlay-canvas-plugins
description: "Use when writing overlay desktop frontend on dsh web (桌面, overlay-desktop, overlay-desktop.body, overlay:new-desktop). Insert ui-overlay-desktop, occupy overlay-desktop.body, exclusive one occupant. Invent look from this product's brief and the generator stub. Do not search, grep, or open another occupant Page as style reference unless the user asked to make something similar. Never occupy root or overlay-card.body. Arbitrary-shape floaters stay on dsh-overlay-shaped-plugins. Never restart dsh web."
---

# Overlay desktop plugins

This skill is the operational HOW for the **desktop** overlay frontend form (product name 桌面; skill id stays `dsh-overlay-canvas-plugins`) on a running `dsh web`. It is guidance, not a script. Package contracts live in READMEs; rationale lives in Agent Notes. Overlay Cursor standing order: `.cursor/rules/dsh-cursor-in-dsh.mdc`. Presentation-form split: [overlay frontend form skills](../../notes/implemented/process/2026-09-05-overlay-frontend-form-skills.md).

If `dsh_skill` is missing, read **this file** from disk and continue. Tell the user the `dsh` server is not connected. Do not invent extra-tool results. Do not hunt MCP catalogs, architecture notes, other occupants, or `packages/bundle/web-app/cordis.patch.yml`.

## Scope: desktop form only

Overlay frontend has three presentation forms. This skill covers only the full-viewport **desktop** under cards and Cursor: host chrome in `shell.overlay` id `overlay-desktop`, product page in `overlay-desktop.body`. It is not a fourth form.

| Form | Skill | HOW |
|---|---|---|
| Card window | [`dsh-overlay-web-plugins`](../dsh-overlay-web-plugins/SKILL.md) | Authored |
| Arbitrary-shape floater (sprite, TV widget, any non-card outline) | [`dsh-overlay-shaped-plugins`](../dsh-overlay-shaped-plugins/SKILL.md) | Authored |
| Desktop (桌面; full-viewport under cards, not a floating card) | `dsh-overlay-canvas-plugins` | This file |

Do not occupy `root` (AppFrame). Do not occupy `overlay-card.body` or copy [`ui-float-window`](../../../packages/client/ui-float-window/README.md). Do not invent shaped HOW from this file. If the task is the shaped form, load `dsh-overlay-shaped-plugins`.

## Never restart `dsh web`

This overlay Cursor session **is** the running `dsh web` process. Killing or restarting it drops this chat. Live insert, update, and unload already work. Do not start a second `dsh web`. Do not edit `packages/bundle/web-app/cordis.patch.yml` to load a plugin onto the open page (`composeLive` snapshots that file at boot). A new `--id` alone does not remount host `apply` for a package name this process already imported. Rename (new npm name **and** new `--id`) only when `overlay:live` stderr reports no Loader fiber or `fiberPhase` `failed`. If stderr reports the fiber is `active`, do not rename — that miss is client-modules composition, not a poisoned specifier.

`pnpm overlay:new-desktop` is a repo-root script (`tsx scripts/overlay-new-desktop.ts`). `pnpm` reads `package.json` on each run; it does not need a process restart. Linking `react` is workspace `pnpm install` (or `--filter ./packages/client/<name>...`), not a restart. Appearance on the open page is `pnpm overlay:live`, not a reboot.

## Checkout workspace install

After adding a checkout package, run repo-root `pnpm install` or `pnpm install --filter ./packages/client/<name>...` so that package's `node_modules` links `react` and workspace peers. Declare `react` in the package `package.json` like other client UI packages. Do not junction another package's `node_modules`. Live `file:` copies still run `pnpm install` inside `$DSH_HOME/profiles/web`.

## Frontend stays independent

Invent this page from the product brief and the generator stub in this new package. Do not follow another overlay occupant's style. Do not search, grep, or open another overlay occupant's `Page.tsx`, `Page.module.css`, locales, or page tests as reference. Do not copy the currently painted desktop or card. Open another occupant's page frontend only when the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)). Host packages `ui-overlay-desktop`, `ui-overlay-shaped`, and `ui-float-window`, `--dsw-alias-*`, and [web styling](../../../docs/web-styling.md) are shared chrome, not a product-page template.

## Canonical desktop board

The reusable desktop base is [`packages/client/ui-overlay-desktop`](../../../packages/client/ui-overlay-desktop/README.md) (`@deepseek-ai/dsh-client-ui-overlay-desktop`). Insert this package first. Do not copy this tree into a product package. Do not clone another occupant as the page skeleton. Run `pnpm overlay:new-desktop <name>` for the page package. Occupy `overlay-desktop.body` (`kind: 'single'`). Repeat insert of this host is a no-op (the board is already loaded). `--id` is the Loader directory id.

| Fact | Value |
|---|---|
| Occupant | `shell.overlay` id `overlay-desktop` (order 10); never `root`, never `cursor-agent`, never `overlay-card.body` |
| Page slot | `overlay-desktop.body` (`kind: 'single'`, `scope: 'root'`). At most one enabled occupant Loader fiber |
| Empty body | Filled `空桌面` label until a page occupies the body |
| Click-through | Host root `data-overlay-board` + `pointer-events: none`. Cards and Cursor keep hits. A page that needs hits sets `pointer-events` on its own interactive root; a painted scene may stay `none` |
| Stack | The board does not join `ctx.overlayStack` |
| Hide | Desktop products have no hide file. The rail 桌面 row only 卸下 (Loader `disabled`) |
| Exclusive load | Inserting a desktop page exclusive-disables every other `overlay-desktop.body` occupant. Switching desktops is 拔出 current + insert target |
| Page import | Type-import `@deepseek-ai/dsh-client-ui-overlay-desktop/client` for `SlotMap`; never value-import `DesktopBoard` |
| Rail label | Optional `dsh.client.panelTitle` (Chinese product name). The rail 桌面 row uses that string or the Loader id |
| Unload the board | `pnpm overlay:live remove ui-overlay-desktop` (or that Loader id) |

A product must not occupy `shell.overlay` with its own chrome. The Cursor plugin rail protects Loader id `ui-overlay-desktop`.

Rationale: [desktop host](../../notes/implemented/architecture/2026-09-10-overlay-desktop-host.md), [live path](../../notes/implemented/architecture/2026-09-04-overlay-web-plugin-live-path.md), [boot graph wait](../../notes/implemented/architecture/2026-09-11-overlay-live-client-boot-graph.md), [page kit](../../notes/implemented/process/2026-09-10-overlay-new-desktop.md).

## Plugin panel: pinned 桌面

The Cursor rail pins a **桌面** row at the top: the inserted `overlay-desktop.body` occupant (`panelTitle` or Loader id), or 空桌面 when none is inserted. 卸下 writes that occupant's Loader `disabled`. It does not write `hidden`. The inserted occupant is not repeated in the list below. The desktop board is not a list row. The list shows card windows, unloaded desktop products, and other overlay fibers (`dsh.client`, no card `overlayBody`, not a protected id). Desktop list rows only **切换桌面** (exclusive-enable that occupant, which unplugs the current one). Card rows keep 隐藏/显示 (`instances.json`) and 插入/拔出 (occupant `disabled`). Other fibers this skill does not author have 插入/拔出 only; hide is not a second `disabled`.

Follow these so a new desktop page is manageable from that panel:

1. Keep `dsh.client.overlayBody` equal to `overlay-desktop.body`. `overlay:new-desktop` writes it. Without that declaration, live insert cannot exclusive-disable other desktop occupants and the rail cannot classify the row as 桌面.
2. Dual-face (host `provide` / RPC + page) is **one** package and **one** Loader row. Unplug that id stops SQLite/`provide` and the body together.
3. Register host RPC and `provide` in `apply` through `ctx.effect` (or `inject`) so Loader `disabled` tears them down.
4. Do not reuse Loader ids `ui-overlay-desktop`, `ui-overlay-shaped`, `ui-float-window`, `ui-cursor-agent` / `cursor-agent`, `overlay-card-*-rpc`, `overlay-plugin-roster-rpc`, or `overlay-plugin-rail-rpc`. Do not disable those rows. Do not occupy `root` or `overlay-card.body`.
5. Do not invent a product plug flag, call `overlay:live remove` to pause, or edit `packages/bundle/web-app/cordis.patch.yml` while this process is up. Pause is the panel (or patch `disabled`); uninstall is `overlay:live remove`. Switching desktops is exclusive enable, not `overlay:live remove`. Do not `overlay:live remove` an occupant without `--keep-files` unless the checkout package should be deleted.

## Fast path for a new desktop page

1. Insert the desktop host: `pnpm overlay:live insert packages/client/ui-overlay-desktop`. Always run this step. Repeat insert is a no-op when the host row already exists.
2. Write the page package: `pnpm overlay:new-desktop <name>` (directory under `packages/client/`, e.g. `ui-slacker` or `packages/client/ui-slacker`). That command writes `package.json` (including `dsh.client.overlayBody: overlay-desktop.body`), `tsconfig.json` (references `../ui-overlay-desktop/tsconfig.client.json`), `locales.ts`, `Page`, tests, READMEs, the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry. It does not edit `packages/bundle/web-app/cordis.patch.yml`. Put host RPC/`provide` in this same package. Do not copy `ui-overlay-desktop` or another occupant. Do not search, grep, or open another occupant package as frontend reference unless the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)).
3. Run `pnpm install --filter ./packages/client/<name>...`. Replace stub copy in `Page.tsx`, `locales.ts`, and `Page.module.css` only. Invent this product's composition from the brief and that stub. Do not copy a corner glass HUD, clock pad, or kicker/title/stats stack from a sibling occupant or from the currently painted desktop. Keep the export name `OverlayPageKey` (`src/client/index.ts` imports it). Optional `dsh.client.panelTitle` is the rail 桌面 label. Style stays CSS Modules. Shared chrome uses `--dsw-alias-*`; a product page whose identity is a specific palette may set local color custom properties to those colors ([web styling](../../../docs/web-styling.md)). Product copy is Chinese. Do not add a feature Agent Note whose body is the package README ([description registry](../../notes/implemented/process/2026-09-05-client-plugin-description-registry.md)).
4. `pnpm overlay:live insert packages/client/<name>` (or `update` when already loaded). That command builds `lib/` when `tsdown.config.ts` is present (`--no-build` skips), copies the stripped tree, then waits until this npm name is in `window.__DSH_BOOT__` (`--no-wait` skips). Success is that boot graph plus `GET /plugins/@deepseek-ai/dsh-client-<name>/client.js` 200, not the plugin rail. Insert exclusive-disables every other `overlay-desktop.body` occupant. If the wait fails, read stderr: missing or `failed` fiber → new npm name and new `--id`; `active` fiber → do not rename. `overlay:live` remounts an active-fiber compose miss once after omitting live `overlayBody`, then restores that field without a second remount.

These four steps run on the already-open overlay. Do not restart `dsh web` to pick up the generator, `react`, or the page. Never occupy `root`.

## Guidance for the next desktop page

Say and do these; they are the same four steps above, not a second procedure.

| Use | Avoid |
|---|---|
| Product name **桌面**; occupy `overlay-desktop.body` | Calling it a card, occupying `root`, or stuffing the page into `overlay-card.body` |
| `pnpm overlay:live insert packages/client/ui-overlay-desktop` then `pnpm overlay:new-desktop <name>` then filter install then `overlay:live insert` the page | Cloning `ui-overlay-desktop` or another occupant; editing `packages/bundle/web-app/cordis.patch.yml` while this process is up |
| Layout from this product's brief and the generator stub | Searching, grepping, or opening a sibling occupant's `Page.tsx` / `Page.module.css`; copying a corner glass HUD or the currently painted desktop |
| Mount proof: `window.__DSH_BOOT__` contains this npm name and `/plugins/<pkg>/client.js` returns 200 | Treating the plugin rail or a yaml row as proof the client half mounted |
| Wait stderr that the Loader fiber is `active` | Renaming the package, restarting `dsh web`, or refreshing as the first recovery |
| Wait stderr that there is no fiber or `fiberPhase` is `failed` | Reusing the same npm name after a poisoned first ESM import |
| Optional `dsh.client.panelTitle` (Chinese) and keep export name `OverlayPageKey` | A feature Agent Note whose body is the package README |
| Page `pointer-events` on hit targets; host board stays `none` | Stealing hits from cards and Cursor, or leaving a painted scene that must receive clicks with `none` |

- Write a designed webpage (type hierarchy, spacing, filled primary actions, `prefers-reduced-motion`). Sparse plugin chrome is not acceptable unless the product is deliberately click-through (the host board stays `pointer-events: none`; the page chooses its own hit targets). Click-through is which nodes receive hits; it does not require clustering controls into one bottom-left floating pad.
- Frontend is React + CSS Modules. Shared chrome uses `--dsw-alias-*`. Product copy is Chinese. Vue, Angular, Next, Nuxt, Remix, Express-as-the-app, Tailwind, and component libraries are not this path.
- Backend is an ordinary Node plugin: SQLite, filesystem, timers, Connection RPC. Register RPC with `ctx.effect(() => ctx.connection.rpc.handle(...), '…')` so unload unregisters the channel.
- The browser bundle must not value-import a host package. Duplicate the channel string and wire types on the client.
- A `kind: 'single'` occupant has no `id` / `order`.
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

Host (`src/index.ts`) — Node only, no `dsh.client` on the board package; a dual-face **page** may register RPC here:

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

Page (`src/client/index.ts`) — occupies the desktop body; no `id` / `order`. `dsh.client.overlayBody` must equal this inject slot:

```ts
import type {} from '@deepseek-ai/dsh-client-ui-overlay-desktop/client'

ctx.slots.inject('overlay-desktop.body', () => ctx.slots.register(
  { name: 'overlay-desktop.body', locale: NS },
  MyPage,
))
```

Author tree that `overlay:new-desktop` writes (frontend-only; add host RPC with the snippet above when needed):

```
packages/client/<name>/
  package.json          # name, exports . / ./invariant / ./client, dsh.client
  tsconfig.json
  tsdown.config.ts
  src/index.ts          # host apply(); empty function if the occupant is browser-only
  src/invariant.ts
  src/client/index.ts   # browser apply()
  src/client/Page.tsx
  src/client/Page.module.css
  src/client/locales.ts
  tests/
```

Plugin inventory is [packages/client/README.md](../../../packages/client/README.md). Joining the **default** web-app roster on a later boot is a bundle-patch edit after this overlay session ends ([client plugin checklist](../../../packages/client/AGENTS.md#new-plugin-package-checklist) item 3). Live appearance does not wait on it and must not write that patch while this process is up.

## Register, update, unload

`overlay:live insert` and `update` run `tsc -p tsconfig.json` then `pnpm run bundle` in the checkout package when `tsdown.config.ts` is present (`--no-build` skips). Do not run `tsc -b` from the occupant: that walks unrelated project references. Occupant `tsconfig.json` references `../ui-overlay-desktop/tsconfig.client.json` (the emit root), not the solution `../ui-overlay-desktop`.

Then one command, which copies the stripped tree, adds the `file:` dependency, runs `pnpm install` **in the profile directory**, and only then appends the Loader row:

```sh
pnpm overlay:live insert packages/client/ui-overlay-desktop
pnpm overlay:live insert packages/client/<page>
```

Frontend-only is two inserts: the desktop host, then the page. Always insert the host first. Frontend-plus-backend is still the host, then **one** dual-face page package. Keep existing overlay rows (Cursor panel and the reusable card) in place.

```sh
pnpm overlay:live update packages/client/<name>
pnpm overlay:live remove <id>                 # drop Loader row, file: dep, plugins/<id>/, and the omitted checkout occupant
pnpm overlay:live remove <id> --keep-files    # drop Loader row only; live copy and checkout stay
```

Default `remove <id>` also deletes `packages/client/<id>` and the landing rows `overlay:new-desktop` wrote, then relinks the workspace. `--keep-files` skips both deletes. The desktop host stays in checkout when you `remove ui-overlay-desktop` (board unload only). A web-app roster package stays in checkout. Host SQLite under `$HOME/.dsh` **stays** until you delete that file on purpose. Switching desktops does not call `overlay:live remove`.

## Verify

The plugin rail lists profile yaml. That list is not proof the client half mounted.

Direct CLI `overlay:live insert` of a `dsh.client` package waits until that npm name is in `window.__DSH_BOOT__` (origin `$DSH_OVERLAY_ORIGIN` or `http://127.0.0.1:3080`; `--no-wait` skips). When that wait fails, stderr classifies `pluginInventory/list` against the boot graph:

- **No Loader fiber**, or **`fiberPhase` `failed`**: first ESM import of this package name is poisoned, or yaml did not mount. Insert under a **new npm name** and a new `--id`. Do not restart `dsh web`.
- **Fiber `active`**, name missing from `__DSH_BOOT__`: host `apply` ran; client-modules did not add the browser row. Do **not** rename. `overlay:live` already tried omitting live `overlayBody` and remounting that fiber.
- **Inventory RPC unreachable**: do not rename. Retry the wait; do not restart `dsh web`.

Yaml (and the rail) may already list the package in every case above.

After a successful insert:

1. `GET /plugins/@deepseek-ai/dsh-client-<name>/client.js` returns 200.
2. The board no longer shows filled `空桌面`. Cards and Cursor remain clickable.
3. Playwright against this origin must use `waitUntil: 'domcontentloaded'`. If the browser still shows an old board, refresh the tab only — do not restart `dsh web`.

Inserting a second desktop page unmounts the first occupant's fiber (its Loader row is `disabled: true`). The rail 桌面 row shows that occupant's title and 卸下; the list shows other desktop products as 切换桌面 and does not list the board or the inserted occupant. Any insert or update also writes `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs` so `/overlay-plugins-rail` can pin the occupant when cached `/overlay-plugins` still lists the board as a fiber. Do not hand-write those modules.

The documentation-site pointer for this **desktop** form (not a second procedure) is [overlay desktop plugins](../../../docs/cookbook/overlay-desktop-plugins.md).
