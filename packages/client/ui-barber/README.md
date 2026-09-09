# @deepseek-ai/dsh-client-ui-barber

English | [中文](README.zh.md)

Neighborhood barbershop landing page occupying `overlay-card.body` on the reusable overlay card. The browser half registers `Page` with no `id` / `order` (`kind: 'single'`). The page calls `preferFrame({ width: 1080, height: 820 })` on mount, keeps product title and primary actions in the body, and treats menu, barber, seating, booking form, FAQ, and shop lights as component-local React state. The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert uses `pnpm overlay:live` after the card is loaded. Presentation HOW is [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md).

The `/client` exports are the plugin body (`apply` / `inject`) and the `overlay-barber` locale key union. The page component stays package-internal.

## Model Experience

None, as the barbershop landing page is a browser-only overlay-card.body occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Booking and lights do not survive reload** — only the plugin mount is durable across `dsh web` restart; menu, barber, seating, form fields, FAQ, confirmation, and shop lights reset when the occupant remounts.
- **Must not occupy `root` or reuse `cursor-agent`** — `root` shadows AppFrame; `cursor-agent` is the Cursor overlay panel.
- **`overlay-card.body` is `kind: 'single'`** — this page is the sole occupant while loaded. Unload it to show a different product.
