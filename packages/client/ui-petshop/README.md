# @deepseek-ai/dsh-client-ui-petshop

English | [中文](README.zh.md)

Pet-grooming booking page occupying `overlay-card-2.body` on the reusable overlay card. The browser half registers `Page` with no `id` / `order` (`kind: 'single'`). The page calls `preferFrame({ width: 900, height: 560 })` on mount, keeps product title and the confirm action in the body, and posts a booking to `/petshop-hub` `book` through an injected callback (the hub plugin must be loaded). Success copy `预约成功` appears only after that RPC returns a row id. The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert uses `pnpm overlay:live` after the card for this seat is loaded. Presentation HOW is [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md).

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-petshop` locale key union. The page component stays package-internal.

## Model Experience

None, as the grooming homepage is a browser overlay-card occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Form fields do not survive remount** — only the plugin mount is durable; package, slot, and form fields reset when the occupant remounts. Accepted bookings remain in the store plugin's sqlite file.
- **Must not occupy `root` or reuse `cursor-agent`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel.
- **`overlay-card-2.body` is `kind: 'single'`** — this page is the sole occupant of that seat while loaded. Seat 1 may still hold another product.
