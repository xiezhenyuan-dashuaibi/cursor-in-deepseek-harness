# Agent Note: Overlay web plugins load live and render as ordinary web pages

Status: implemented

English | [中文](2026-09-04-overlay-web-plugin-live-path.zh.md)

## Problem

A frontend-plus-backend overlay plugin is an ordinary React page talking to an ordinary Node program. Contributors instead treat overlay UI as sparse chrome, occupy `root` to look like a “full page”, edit `packages/bundle/web-app/cordis.patch.yml` while `dsh web` is running, or restart that process. Those paths hide AppFrame, stay boot-only (`composeLive` snapshots bundle patches at launch), or kill the overlay Cursor session that is doing the work. The checkout landing checklist (aggregates, bilingual READMEs, catalogs, 100% coverage) is also mistaken for the path that makes 3080 show the page.

## Decision

Overlay plugins are ordinary web pages and ordinary Node services composed by Cordis. Write a complete product: designed frontend, host backend, and a database when data must persist. The overlay document is the product’s browser. HTML, CSS, and JS (React + CSS Modules; shared chrome uses `--dsw-alias-*`; a product page may own local color custom properties when those colors are the page's presentation) are in scope. Vue, Angular, Next, Nuxt, Remix, Express-as-the-app, Tailwind, and component libraries are not the overlay composition path — they want to own the document or the server, and [web styling](../../../../docs/web-styling.md) forbids those kits in feature packages.

Default presentation of the **card-window** form is the reusable **card** on `shell.overlay`: title-bar drag and eight-edge resize in [`ui-float-window`](../../../../packages/client/ui-float-window/README.md) (`overlay-card` / `overlay-card.body`). Write only the page. Call `preferFrame` on mount for opening size. Sparse plugin chrome is not an acceptable default for that form. `root` remains AppFrame. See [overlay-card container](2026-09-05-overlay-card-container.md). Arbitrary-shape floaters and a full-page white canvas are other forms; their HOW is reserved in [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) and [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) ([form skills](../process/2026-09-05-overlay-frontend-form-skills.md)). Do not occupy `root` for the canvas form.

Live effect on an already-running `dsh web` uses a stripped copy under `$DSH_HOME/profiles/<name>/plugins/` (built `lib/index.js` / `lib/client.js`, manifest with no `workspace:` specifiers), `file:./plugins/…` in that profile’s `package.json`, `pnpm install` in the profile directory, then a Loader row in the watched profile `cordis.patch.yml`. `pnpm overlay:live insert|update|remove` (`scripts/overlay-live-plugin.ts`) is that sequence: copy and profile install finish before the yaml row, so Node cannot cache a failed first ESM import of that `file:` URL. Default `remove <id>` also deletes an omitted lab occupant from checkout (`packages/client/<id>` plus inventory, aggregate tsconfig, Model Experience, omit-list rows) and regenerates derived catalogs, so an unload cannot leave a searchable empty record. `--keep-files` keeps the live copy and the checkout. Removing the card Loader unloads the desk only; `ui-float-window` stays in checkout. A web-app roster package stays in checkout. The web-app bundle patch is the next-boot product composition, not the live insert file ([live roster](2026-09-04-client-plugin-live-roster.md)). Overlay Cursor never restarts `dsh web`; that rule is in `.cursor/rules/dsh-cursor-in-dsh.mdc`.

Node caches the first ESM import of a given profile `file:` URL for the process lifetime. Copy complete artifacts and finish profile install before writing the yaml row. A failed first import stays failed until the row uses a new URL (new directory) or the web process restarts. Overlay Cursor must not restart `dsh web` to recover. Repo-root `pnpm install` (or `pnpm install --filter ./packages/client/<name>...`) is allowed: the overlay fence denies spine source, not `node_modules` install artifacts. Profile `pnpm install` under `$DSH_HOME` remains the live `file:` copy path.

Host `lib/index.js` does not hot-swap. Loader imports the plugin **package name**; Node caches that specifier for the process lifetime. A new `--id` (new `file:` directory) does not re-run host `apply` for a name this process has already imported. Live host-logic recovery is a never-imported specifier (a profile-relative `./….mjs`, or a new npm name) or a later process start. Overlay Cursor must not restart `dsh web`. Browser `lib/client.js` content swaps through HMR `rebuilt` when the profile copy is overwritten.

Overlay `dsh_*` extras execute in `--profile cursor-mcp` (stdio, no Host or browser). The page is `--profile web`. Do not spawn a second `dsh web` or bind another HTTP port to plant UI. Do not use dynamic Cordis on the MCP child to mount a page occupant. Live insert of ordinary client plugins is the overlay product path.

The card-window procedure is skill [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md): plugin roots, slot/RPC interface, `pnpm overlay:new-page` for the checkout page package ([page kit](../process/2026-09-05-overlay-new-page.md)), `pnpm overlay:live` register/start/unload. Overlay Cursor loads the skill that matches the presentation form before frontend plugin work. Reserved forms load [dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) or [dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) and stop. Do not hunt architecture notes or the bundle patch to put a page on the open overlay. Dual-face RPC is ordinary host `apply` plus page `apply` in one package; that package README owns the description. Occupancy for the Cursor rail is [hide vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md). Plugin inventory is [`packages/client/README.md`](../../../../packages/client/README.md). The [overlay web plugins](../../../../docs/cookbook/overlay-web-plugins.md) page is the card-form documentation-site pointer.

## Alternatives considered

**Restart `dsh web` after every plugin edit.** Rejected — the overlay Cursor CLI is that process; a restart drops the session doing the work.

**Edit the web-app bundle `cordis.patch.yml` while the process runs.** Rejected — bundle layers are the shipped composition; `composeLive` does not re-read them. Live user edits belong on the already-watched profile and home patches.

**Occupy `root` so the plugin looks like a standalone site.** Rejected — `root` shadows AppFrame. The page-canvas form is a reserved skill, not a second `root`. Default presentation of the card form is the reusable draggable, resizable card; additional windows are numbered instances of that card, not a second chrome on `shell.overlay`.

**Mount Vue, Next, or an Express+Tailwind app as the overlay.** Rejected — the overlay is already a React document with a Node host. Those stacks own `index.html` or the HTTP server; slot occupants are React components and Cordis `apply()` functions. CSS Modules plus tokens replace a component kit.

**Point the profile `file:` URL at checkout `packages/client/…`.** Rejected — that manifest uses `workspace:^`, which profile `pnpm` cannot resolve. The live artifact is a stripped copy under the profile `plugins/` directory.

**Treat overlay UI as token-less chrome with no CSS.** Rejected — the overlay is a real document; [web styling](../../../../docs/web-styling.md) applies, and product overlay pages must look designed.

**Make every overlay occupant full-viewport by default.** Rejected — a card leaves the product shell visible and lets the user place and size the page. Covering the document as a non-floating canvas is a reserved form, not the card default.

**Leave checkout source after live `remove`.** Rejected — an unloaded occupant that remains in inventory, tsconfig, omit lists, or generated catalogs is a searchable empty record and misleads later agents. Complete uninstall is the default; `--keep-files` is the escape hatch.

**Hunt architecture notes, bundle patches, and checkout checklists to put one page on the open overlay.** Rejected — load the skill that matches the presentation form; `pnpm overlay:live` encodes insert, update, and remove. Card HOW is `dsh-overlay-web-plugins`.

**Spawn a second `dsh web` or bind another HTTP port to plant overlay UI.** Rejected — extras run in `cursor-mcp`; the page is the already-running web profile. Live insert is the product path.

**Use dynamic Cordis on the MCP child to mount a page occupant.** Rejected — that mutates the stdio process; the open page does not change.

**Expire Node’s ESM `file:` import cache on Loader unload.** Rejected — that cache is process-wide Node behavior, not a Cordis table. Recovery is a never-imported specifier or a later process start.

## Consequences

Overlay plugin work writes frontend and backend like a normal app, then follows the profile live path to appear on the open page. Checkout landing remains a separate job from appearing on 3080; live `remove` of an omitted occupant is the inverse of that landing. This note stays active: it owns the live-versus-boot split, the first-import cache, the MCP-versus-web process split, the framework/shell split, the `root` negative guarantee, the overlay-session never-restart rule, and complete uninstall of omitted checkout occupants. It does not replace the live-roster HMR internals, the [overlay-card container](2026-09-05-overlay-card-container.md), or the [form skills](../process/2026-09-05-overlay-frontend-form-skills.md). Card-window HOW is skill `dsh-overlay-web-plugins` plus `overlay:live`. Plugin descriptions live in package READMEs ([description registry](../process/2026-09-05-client-plugin-description-registry.md)).

## Testing

Package tests for the card cover drag, edge resize, minimum frame, and `preferFrame`. `scripts/overlay-live-plugin.spec.ts` pins insert-before-yaml, a missing `lib/index.js` that must not write a Loader row, update that does not rewrite yaml, remove that drops the row without deleting `$HOME/.dsh` SQLite, remove that deletes an omitted checkout occupant, `--keep-files` that keeps checkout, and card insert that writes `./overlay-card-roster-rpc.mjs` when the roster channel is missing. `scripts/overlay-page-checkout.spec.ts` pins land/unland and prefix-safe sibling names. Live verification against `http://127.0.0.1:3080` uses Playwright `waitUntil: 'domcontentloaded'`. Named gap: no automated test that Node retains a failed `file:` import for the process lifetime; that pin is this note.
