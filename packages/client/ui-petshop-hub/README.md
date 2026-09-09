# @deepseek-ai/dsh-client-ui-petshop-hub

English | [中文](README.zh.md)

Booking hub: host RPC on `/petshop-hub` (`book`, `signals`) plus the `overlay-card-3.body` signal panel. `book` validates the homepage payload, records detection hops, inserts through Cordis `petshopStore` (provided by the store plugin; this package does not import that package), and returns the row id so the homepage can show success. The browser half polls `signals` and lights the homepage → hub → store → ack pipeline. The page calls `preferFrame({ width: 600, height: 620 })` on mount. The default web-app bundle does not mount this package. Live insert uses `pnpm overlay:live` after the store plugin and the card for this seat. Presentation HOW is [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md).

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-petshop-hub` locale key union. The page component stays package-internal.

## Model Experience

None, as the hub panel is a browser overlay-card occupant and the host RPC is not model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Signal log is in-memory** — at most 40 newest hops; restarting the Loader fiber clears it. Bookings still persist in the store plugin.
- **Must not occupy `root` or reuse `cursor-agent`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel.
- **`overlay-card-3.body` is `kind: 'single'`** — this page is the sole occupant of that seat while loaded.
- **Host `lib/index.js` does not hot-swap** — change hub dispatch with a new live `--id`, not `overlay:live update` of the same directory.
