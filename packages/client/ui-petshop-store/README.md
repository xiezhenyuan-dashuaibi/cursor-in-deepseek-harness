# @deepseek-ai/dsh-client-ui-petshop-store

English | [中文](README.zh.md)

Booking ledger: host SQLite at `$DSH_HOME/petshop-store.sqlite`, Cordis `petshopStore` (`insert` / `list`), `/petshop-store` `list` RPC, and the `overlay-card-4.body` live table. The hub plugin is the writer; this panel only lists. The page calls `preferFrame({ width: 900, height: 620 })` on mount and polls `list`. The default web-app bundle does not mount this package. Live insert uses `pnpm overlay:live` before the hub. Presentation HOW is [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md).

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-petshop-store` locale key union. The page component stays package-internal.

## Model Experience

None, as the ledger panel is a browser overlay-card occupant and the sqlite file is not model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Unload does not delete the sqlite file** — `overlay:live remove` leaves `$DSH_HOME/petshop-store.sqlite` in place.
- **Must not occupy `root` or reuse `cursor-agent`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel.
- **`overlay-card-4.body` is `kind: 'single'`** — this page is the sole occupant of that seat while loaded.
- **Host `lib/index.js` does not hot-swap** — change ledger logic with a new live `--id`, not `overlay:live update` of the same directory.
