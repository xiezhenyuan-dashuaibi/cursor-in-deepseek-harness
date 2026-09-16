---
name: dsh-overlay-web-plugins
description: "Use when writing card-window overlay frontend on dsh web (卡片式, 卡片窗口, overlay-card, ui-float-window, preferFrame). Declare dsh.client.overlayBody; dual-face host+page is one Loader row so the Cursor rail can hide/unplug the whole card. Invent look from this product's brief and the generator stub. Do not search, grep, or open another occupant Page as style reference unless the user asked to make something similar. This skill is only the card form. For arbitrary-shape floaters (精灵, 电视悬件) load dsh-overlay-shaped-plugins; for desktop (桌面) load dsh-overlay-canvas-plugins. Never restart dsh web."
---

# Overlay card-window plugins

This skill is the operational HOW for the **card-window** overlay frontend form (and an optional host backend) on a running `dsh web`. It is guidance, not a script. Package contracts live in READMEs; rationale lives in Agent Notes. Overlay Cursor standing order: `.cursor/rules/dsh-cursor-in-dsh.mdc`. Presentation-form split: [overlay frontend form skills](../../notes/implemented/process/2026-09-05-overlay-frontend-form-skills.md).

## Scope: card form only

Overlay frontend has three presentation forms. This skill covers only a floating rectangular **card** with title-bar chrome and a webpage in `overlay-card.body`.

| Form | Skill | HOW |
|---|---|---|
| Card window | `dsh-overlay-web-plugins` | This file |
| Arbitrary-shape floater (sprite, TV widget, any non-card outline) | [`dsh-overlay-shaped-plugins`](../dsh-overlay-shaped-plugins/SKILL.md) | Authored |
| Desktop (桌面; full-viewport under cards) | [`dsh-overlay-canvas-plugins`](../dsh-overlay-canvas-plugins/SKILL.md) | Authored |

Do not occupy `overlay-card.body` for a sprite, a TV-shaped widget, a desktop, or any other non-card outline. Do not treat this skill as the desktop path. If the task is the desktop form, load `dsh-overlay-canvas-plugins`. If the task is the shaped form, load `dsh-overlay-shaped-plugins`; do not invent its procedure from this file.

## Never restart `dsh web`

This overlay Cursor session **is** the running `dsh web` process. Killing or restarting it drops this chat. Live insert, update, and unload already work. Do not start a second `dsh web`. Do not edit `packages/bundle/web-app/cordis.patch.yml` to load a plugin onto the open page (`composeLive` snapshots that file at boot). If a profile `file:` import failed, use a **new** plugin directory (`--id`), never a restart.

`pnpm overlay:new-page` is a repo-root script (`tsx scripts/overlay-new-page.ts`). `pnpm` reads `package.json` on each run; it does not need a process restart. Linking `react` is workspace `pnpm install` (or `--filter ./packages/client/<name>...`), not a restart. Appearance on the open page is `pnpm overlay:live`, not a reboot.

## Checkout workspace install

After adding a checkout package, run repo-root `pnpm install` or `pnpm install --filter ./packages/client/<name>...` so that package's `node_modules` links `react` and workspace peers. Declare `react` in the package `package.json` like other client UI packages. Do not junction another package's `node_modules`. Live `file:` copies still run `pnpm install` inside `$DSH_HOME/profiles/web`.

## Frontend stays independent

Invent this page from the product brief and the generator stub in this new package. Do not follow another overlay occupant's style. Do not search, grep, or open another overlay occupant's `Page.tsx`, `Page.module.css`, locales, or page tests as reference. Do not copy the currently painted desktop or card. Open another occupant's page frontend only when the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)). Host packages `ui-float-window`, `ui-overlay-desktop`, and `ui-overlay-shaped`, `--dsw-alias-*`, and [web styling](../../../docs/web-styling.md) are shared chrome, not a product-page template.

## Canonical card

The reusable card-window base is [`packages/client/ui-float-window`](../../../packages/client/ui-float-window/README.md) (`@deepseek-ai/dsh-client-ui-float-window`). It is the module you insert when a card-window job needs a card. Do not copy this package into a product tree. Do not clone another occupant or this card as the page skeleton. Run `pnpm overlay:new-page <name>` for the page package. Insert this package first, then occupy `overlay-card.body` (seat 1). Repeat insert of this package adds another card without a second Loader row. `--id` is the Loader directory id; card title, unique id, and opening size are `--title` / `--card-id` / `--width` / `--height`.

| Fact | Value |
|---|---|
| Occupant | `shell.overlay` id `overlay-card` (order 220); never `root`, never `cursor-agent` |
| Page slot | Seat 1: `overlay-card.body`; seat N: `overlay-card-N.body` (`kind: 'single'`, `scope: 'root'`) |
| Trailing controls | Seat 1: `overlay-card.chrome.trailing`; seat N: `overlay-card-N.chrome.trailing` (`kind: 'list'`) — extra controls beside built-in 缩小; pointer events there must not start a drag; primary-button pointer down anywhere in the window still raises that card |
| Insert flags | `--title` (default `卡片`), `--card-id` (default next seat as a decimal string), `--width` (default 360), `--height` (default 280). Later rewrite of `instances.json` updates title/id on poll; an already-mounted frame keeps user drag/resize |
| Default chrome | Top-left 名称 then 编号: `--title` and `--card-id` (defaults still read `卡片 1`); the slot seat is not the 编号. Title bar is 36px, overlays the body, and fades to transparent at its lower edge. Identity font stays the 13px chrome size. Top-right built-in **缩小** collapses that window into an edge tag at the last parked edge (nearest board edge on first 缩小). |
| Edge tag | The card itself is the tag (`data-overlay-dock` on the card), one ribbon rotated onto the edge: title only at `--dsw-font-xxxs-11`, unique id stays on the expanded title bar, swallowtail V-cut on the free end that sticks into the board (left/right horizontal, top/bottom vertical). At rest the attached half sits past the board edge (only half shows); hover peeks toward the board. Drag it: near an edge it magnet-snaps onto that edge at that along position. A click restores the last expanded frame; a drop farther than the magnet range from every edge expands at the release origin. Shrink flies as the expanded card to the painted ribbon, then the tag-face crossfade; expand crossfades back from the tag into the frame. The body stays mounted (`display: none` on body/handles/trailing). Last parks persist in `dsh.overlay-card.frames` with `docks`. Not roster `hidden` or Loader `disabled`. |
| Title-bar cursor | Default arrow on the expanded title bar; not grab/hand. A docked tag uses grab. Resize handles keep `ns-resize` / `ew-resize` / corner cursors. n/s/e/w hit is the outer 4px strip so the body scrollbar stays clickable; corners stay 12px |
| Empty body | Origin 36×56 (below a typical top-edge tag); size from insert `--width` / `--height` (minimum 360×280). A new card sits to the right of the current rightmost **expanded** frame; when that opening size would leave the playable board, it overlaps the default origin. After that, `preferFrame`, drag, and resize change only that card's frame. Same-document `#id` links resolve inside that body (walk descendants by the `id` property; not CSS `#id`; only an in-body scrollport). A body with no page occupant shows the filled `空卡片` label. |
| Page preferFrame | Page `preferFrame({ width, height })` on first mount may still change size; a stored frame (page reload) or a later user drag/resize ignores a later call. Optional `x` / `y`; omit origin to keep the current origin. Not Loader `config` |
| Page import | Type-import `@deepseek-ai/dsh-client-ui-float-window/client` for `SlotMap`; never value-import `OverlayCard` |
| Tall branded bar | Edit `OverlayCard` in this package; do not replace the whole title bar with a single slot (that drops drag) |
| Unload one card | `pnpm overlay:live remove overlay-card-<id>` (edits `instances.json`; the plugin stays) |
| Unload the desk | `pnpm overlay:live remove ui-float-window` (or that Loader id) |

A product must not occupy `shell.overlay` with its own chrome. Additional windows are instances of this card, each with an insert-time unique id. Arbitrary-shape floaters and the desktop are the other two forms.

Rationale: [overlay-card container](../../notes/implemented/architecture/2026-09-05-overlay-card-container.md), [isolation](../../notes/implemented/architecture/2026-09-06-overlay-card-isolation.md), [playable board](../../notes/implemented/architecture/2026-09-06-overlay-playable-board.md), [edge tag](../../notes/implemented/architecture/2026-09-07-overlay-card-edge-tag.md), [live path](../../notes/implemented/architecture/2026-09-04-overlay-web-plugin-live-path.md).

## Plugin panel: hide and unplug

The Cursor rail lists **cards** plus **desktop occupants** and **standalone overlay fibers**: live profile Loader rows whose `package.json` has `dsh.client`, is not a protected id (desk, desktop board, Cursor, overlay RPC sidecars), and is either a card `overlayBody`, `overlay-desktop.body`, or has no `overlayBody`. It does not list bundle DSH chrome, the desktop board, or arbitrary Loader rows. The top row is always **桌面**: the inserted occupant, or 空桌面. 卸下 writes that occupant's Loader `disabled`. The inserted occupant is not repeated below. Desktop list rows only 切换桌面. Card 隐藏 skips the window (`hidden`). Card 拔出 sets occupant `disabled` on the live profile patch and unmounts the **whole card** while `inserted` is false. A standalone fiber's 拔出 writes that row's `disabled`; hide is not a second `disabled`. Title-bar 缩小 is viewing chrome that collapses the card into an edge tag, not these flags ([edge tag](../../notes/implemented/architecture/2026-09-07-overlay-card-edge-tag.md)). Rationale: [hide vs Loader disabled](../../notes/implemented/architecture/2026-09-07-overlay-card-hide-and-loader-disabled.md), [rail fibers](../../notes/implemented/architecture/2026-09-10-overlay-plugin-rail-fibers.md), [desktop host](../../notes/implemented/architecture/2026-09-10-overlay-desktop-host.md).

Follow these so a new page is manageable from that panel without changing product behavior:

1. Keep `dsh.client.overlayBody` equal to the body slot you `slots.inject` (`overlay-card.body` or `overlay-card-N.body`). `overlay:new-page` writes seat 1. Occupying a later seat means changing that field to match, then `overlay:live insert` or `update` so `occupants` records this Loader id. Without that declaration, 拔出 is dimmed and the fiber stays up.
2. Dual-face (host `provide` / RPC + page) is **one** package and **one** Loader row. Unplug that id stops SQLite/`provide` and the body together. Do not insert a host-only extra package for the same window — the rail cannot attach it to that card. A different window is another card insert plus another page package with its own `overlayBody`.
3. Register host RPC and `provide` in `apply` through `ctx.effect` (or `inject`) so Loader `disabled` tears them down. Dependents `inject` those services; do not keep a provider alive with a loose `ctx.get` after it unplugs.
4. Do not reuse Loader ids `ui-float-window`, `ui-overlay-desktop`, `ui-overlay-shaped`, `ui-cursor-agent` / `cursor-agent`, `overlay-card-*-rpc`, `overlay-plugin-roster-rpc`, or `overlay-plugin-rail-rpc`. Do not disable those rows. Do not occupy `root` or `shell.overlay` with product chrome.
5. Do not invent a product plug flag, call `overlay:live remove` to pause, or edit `packages/bundle/web-app/cordis.patch.yml` while this process is up. Pause is the panel (or patch `disabled`); uninstall is `overlay:live remove`.

## Insert-time settings

Creating a card is **one** `pnpm overlay:live insert packages/client/ui-float-window` command with title, unique id, and opening size on that line. That command writes `instances.json` and, when the profile has no overlay-card RPC row, writes `./overlay-card-roster-rpc.mjs` so `/overlay-card` mounts even if this process already cached the npm package `apply`. Later drag/resize and a rewrite of `instances.json` can still change the window. `--id` is the Loader directory id, not the card unique id.

Pass the flags on every card insert, including the first desk and every later window. Omitting a flag still applies its default; the practice is to pass them so the new window is explicit.

```sh
pnpm overlay:live insert packages/client/ui-float-window --title 草稿 --card-id draft --width 520 --height 400
```

| Flag | Default when omitted | Meaning |
|---|---|---|
| `--title` | `卡片` | Title-bar left text |
| `--card-id` | next seat as a decimal string (`1`, `2`, …) | Unique id; unload with `overlay-card-<id>` |
| `--width` | `360` (minimum) | Opening width in CSS pixels |
| `--height` | `280` (minimum) | Opening height in CSS pixels |
| `--id` | checkout directory name | Loader directory; do not reuse this for the card unique id |

Do not skip the flags because a desk already exists. A later insert of this same package is how another card is created; pass `--title` / `--card-id` / `--width` / `--height` on that insert too. These flags on a non-card package fail loud.

## Fast path for a new card-window page

1. Insert the card module, passing title, unique id, and opening size: `pnpm overlay:live insert packages/client/ui-float-window --title <name> --card-id <id> --width <px> --height <px>`. Always run this step. Do not skip it because a profile already shows a card.
2. Write the page package: `pnpm overlay:new-page <name>` (directory under `packages/client/`, e.g. `ui-notes` or `packages/client/ui-notes`). That command writes `package.json` (including `dsh.client.overlayBody: overlay-card.body`), `tsconfig.json`, `locales.ts`, `Page`, tests, READMEs, the client inventory row, aggregate tsconfig paths, the Model Experience row, and the web-app omit-list entry. It does not edit `packages/bundle/web-app/cordis.patch.yml`. Occupying seat N: set `overlayBody` to `overlay-card-N.body` to match `slots.inject`. Put host RPC/`provide` in this same package. Do not copy `ui-float-window` or another occupant. Do not search, grep, or open another occupant package as frontend reference unless the user explicitly asked to make something similar to that product ([visual independence](../../notes/implemented/process/2026-09-12-overlay-occupant-visual-independence.md)).
3. Run `pnpm install --filter ./packages/client/<name>...`. Replace stub copy in `Page.tsx`, `locales.ts`, and `Page.module.css` only. Invent this product's composition from the brief and that stub. Do not copy layout or chrome from a sibling occupant page. Call `preferFrame` is already on mount. Style stays CSS Modules. Theme chrome uses `--dsw-alias-*`; a product page whose identity is a specific palette may set local color custom properties to those colors ([web styling](../../../docs/web-styling.md)). Product title and actions live in the page, not in card chrome. Leave ~36px at the top of the page so copy sits below `{title} {id}`. Do not add a feature Agent Note whose body is the package README ([description registry](../../notes/implemented/process/2026-09-05-client-plugin-description-registry.md)).
4. Build `lib/`, then `pnpm overlay:live insert packages/client/<name>` (or `update` when already loaded).

These four steps run on the already-open overlay. Do not restart `dsh web` to pick up the generator, `react`, or the page. Never occupy `root`.

- Write a designed webpage (type hierarchy, spacing, filled primary actions, `prefers-reduced-motion`). Sparse plugin chrome is not acceptable. Do not search, grep, or open a sibling occupant's `Page.tsx` / `Page.module.css` as a design system. Shared look is `--dsw-alias-*` and the card host.
- Frontend is React + CSS Modules. Shared chrome uses `--dsw-alias-*`. A product page may own local color custom properties when those colors are the page's presentation; do not map them through unrelated semantic aliases (success, error, warn). Product copy is Chinese. Vue, Angular, Next, Nuxt, Remix, Express-as-the-app, Tailwind, and component libraries are not this path: they want to own `index.html` or the HTTP server, and [web styling](../../../docs/web-styling.md) forbids those kits in feature packages.
- Backend is an ordinary Node plugin: SQLite, filesystem, timers, Connection RPC. Register RPC with `ctx.effect(() => ctx.connection.rpc.handle(...), '…')` so unload unregisters the channel.
- The browser bundle must not value-import a host package. Duplicate the channel string and wire types on the client.
- A `kind: 'single'` occupant has no `id` / `order`. `renderSlot(name, { preferFrame })` always takes the owner-props argument.
- `overlay:live` writes Loader `{ id, name }` only; card `--title` / `--card-id` / `--width` / `--height` go into `instances.json`. The browser half does not receive Loader config. After mount, user drag/resize persists in `localStorage` (`dsh.overlay-card.frames`) across a page reload.

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

Host (`src/index.ts`) — Node only, no `dsh.client`:

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

Page (`src/client/index.ts`) — occupies the card body; no `id` / `order`. `dsh.client.overlayBody` must equal this inject slot:

```ts
import type {} from '@deepseek-ai/dsh-client-ui-float-window/client'

ctx.slots.inject('overlay-card.body', () => ctx.slots.register(
  { name: 'overlay-card.body', locale: NS },
  MyPage,
))
```

Page component — call `preferFrame` on mount:

```ts
const PREFERRED = { width: 720, height: 520 }

export function MyPage({ t, preferFrame }: MyPageProps) {
  useEffect(() => {
    preferFrame(PREFERRED)
  }, [preferFrame])
  return <div className={css.page}>{t('title')}</div>
}
```

Client RPC uses the same channel string copied into the page package (not imported from the host). CSS is `*.module.css`. Shared chrome uses `--dsw-alias-*`; a product palette is local custom properties. The page root fills the card body (`flex: 1` or `height: 100%`).

Author tree that `overlay:new-page` writes (frontend-only; add host RPC with the snippet above when needed):

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

A host-only package omits `dsh.client`, `./client`, and `src/client/`. Dual-face RPC is ordinary host `apply` plus page `apply` in one package; that package README owns the description. Do not add a host-only extra package for the same window if the rail should unplug that backend with the card. Plugin inventory is [packages/client/README.md](../../../packages/client/README.md). Joining the **default** web-app roster on a later boot is a bundle-patch edit after this overlay session ends ([client plugin checklist](../../../packages/client/AGENTS.md#new-plugin-package-checklist) item 3). Live appearance does not wait on it and must not write that patch while this process is up.

## Register, update, unload

`overlay:live insert` and `update` run `tsc -p tsconfig.json` then `pnpm run bundle` in the checkout package when `tsdown.config.ts` is present (`--no-build` skips). Do not run `tsc -b` from the occupant: that walks unrelated project references. Occupant `tsconfig.json` references `../ui-float-window/tsconfig.client.json` (the emit root), not the solution `../ui-float-window`.

Then one command, which copies the stripped tree, adds the `file:` dependency, runs `pnpm install` **in the profile directory**, and only then appends the Loader row (that order avoids Node caching a failed first ESM import of that `file:` URL):

```sh
pnpm overlay:live insert packages/client/<name>
# optional: --id my-id --profile web
```

Frontend-only is two inserts: the card module, then the page. Always insert the card first. Frontend-plus-backend is still the card, then **one** dual-face page package (host `apply` in that same tree). A second backend window is another card plus another page package. Keep existing overlay rows (Cursor panel and the reusable card) in place.

```sh
pnpm overlay:live insert packages/client/ui-float-window
pnpm overlay:live insert packages/client/ui-float-window --title 草稿 --card-id draft --width 520 --height 400
pnpm overlay:live insert packages/client/<page>
```

Repeat `insert packages/client/ui-float-window` appends another card without copying `lib/` again (that would remount existing cards). The same command writes `$DSH_HOME/profiles/web/overlay-card-roster-rpc.mjs` and a Loader row when that roster channel is not already present, and `./overlay-card-plug-rpc.mjs` so `instances.setHidden` and `occupants.setInserted` can mount on `/overlay-card-plug`. Card `update` retargets that Loader row to `./overlay-card-hide-rpc.mjs` when the first plug-rpc specifier is already cached. Any insert or update also writes `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs` so `/overlay-plugins-rail` can pin the desktop occupant when the cached `ui-cursor-agent` `apply` still owns `/overlay-plugins`. Omitted flags take `卡片`, the next seat as `--card-id`, and 360×280. Unload one window with `pnpm overlay:live remove overlay-card-<id>`. Unload the whole desk with `pnpm overlay:live remove ui-float-window` (or that Loader id). The Cursor plugin panel hide/show writes `hidden` on a card; insert/unplug writes Loader `disabled` on card occupants, desktop occupants, and standalone fibers. Desktop 卸下 / 切换桌面 also write occupant `disabled`. Fiber rows have no hide control. That UI does not call `overlay:live remove`.

The helper is [`scripts/overlay-live-plugin.ts`](../../../scripts/overlay-live-plugin.ts). Do not hand-edit the profile yaml until the copy and profile install have succeeded. Checkout workspace install is above; live `file:` copies still install in the profile directory.

```sh
pnpm overlay:live update packages/client/<name>
```

That overwrites profile `lib/client.js` (and `lib/index.js`). The live roster treats a client content change as `rebuilt` and swaps the browser module without a yaml edit. Host `lib/index.js` does not hot-swap: change host logic with a new `--id` (new directory URL), not a restart.

```sh
pnpm overlay:live remove overlay-card-draft       # drop unique id `draft`; desk stays
pnpm overlay:live remove <id>                     # drop Loader row, file: dep, plugins/<id>/, and the omitted checkout occupant
pnpm overlay:live remove <id> --keep-files        # drop Loader row only; live copy and checkout stay
```

The occupant and RPC channel disappear from the open page. Default `remove <id>` also deletes `packages/client/<id>` and the landing rows `overlay:new-page` wrote (inventory, aggregate tsconfig, Model Experience, omit list), then relinks the workspace and regenerates derived catalogs. That is a complete uninstall: an unloaded occupant must not remain as a searchable empty record. `--keep-files` skips both the live copy delete and the checkout delete. The card module stays in checkout when you `remove ui-float-window` (desk unload only). A web-app roster package stays in checkout. Unload one window with `overlay-card-<id>` does not delete a page package. Host SQLite under `$HOME/.dsh` **stays** until you delete that file on purpose. The helper never removes it. Do not keep occupant names in skills, cookbooks, or Agent Notes after an unload ([description registry](../../notes/implemented/process/2026-09-05-client-plugin-description-registry.md)).

Checkout landing — inventory row, aggregate tsconfig, Model Experience, and the web-app omit list — is written by `overlay:new-page` so a later typecheck and README gate see the package. `overlay:live remove <id>` without `--keep-files` is the inverse for an omitted lab occupant: it deletes that checkout directory and those rows. A row in `packages/bundle/web-app/cordis.patch.yml` is how the package joins the **default** web-app roster on a later boot. It is not how `overlay:new-page` or `overlay:live` take effect; those already work on this process. Do not add a live overlay plugin to the bundle patch while this process is up: a later boot would load both the profile copy and the bundle copy.

## Verify

The occupant appears on the open page without a refresh. For the card: empty body at the insert size (default 360×280) with the filled `空卡片` label until a page occupies that body, identity `{title} {id}` (default `卡片 1`) at the top left of a title bar that fades into the page, title-bar drag with the default cursor, edge resize, primary-button pointer down in the window raising that card, and top-right 缩小 collapsing that window into an edge tag (half tucked at rest, hover peeks; drag the tag near an edge to magnet-snap it there at that along position; click restores the last frame; drop away from every edge expands at the release; shrink flies as the expanded card, then the tag-face crossfade; expand crossfades back from the tag into the frame). A later insert with flags adds a **separate** window to the right of existing cards; when that opening size would leave the playable board, it overlaps the default origin. Later `preferFrame`, drag, and resize change only that card. Same-document `#id` links stay in that body. A later page may still call `preferFrame` and fill the body. Playwright against this origin must use `waitUntil: 'domcontentloaded'` (the page does not reach `networkidle`). If the browser still shows an old chrome style, refresh the tab only — do not restart `dsh web`. Direct CLI `overlay:live insert` of a `dsh.client` package waits until that npm name is in `window.__DSH_BOOT__`; when that wait fails, stderr says whether the Loader fiber is missing (`failed` / absent → new npm name and new `--id`) or `active` (client-modules compose miss; do not rename). The plugin rail lists profile yaml; it is not the boot graph. `overlay:live insert` or `update` of this card package is the never-imported specifier for `/overlay-card` (`./overlay-card-roster-rpc.mjs`) and for hide/insert writes (`./overlay-card-plug-rpc.mjs` on `/overlay-card-plug` when the first `/overlay-card` handler is list-only; card `update` retargets to `./overlay-card-hide-rpc.mjs` when that first plug specifier is already cached). Any insert or update also writes `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs` so `/overlay-plugins-rail` can pin the desktop occupant. Do not hand-write those modules. Other host RPC still needs a never-imported specifier, not `overlay:live update` of the same package name.

The documentation-site pointer for this **card** form (not a second procedure) is [overlay web plugins](../../../docs/cookbook/overlay-web-plugins.md).
