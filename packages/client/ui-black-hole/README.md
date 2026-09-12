# @deepseek-ai/dsh-client-ui-black-hole

English | [中文](README.zh.md)

Black-hole scene occupying overlay-desktop.body on the reusable overlay desktop: a star field, an accretion disk, an event horizon, a coordinate clock, and a control that drops a photon. The browser half registers Page with no id / order (kind: 'single'). The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert uses pnpm overlay:live after the desktop board is loaded; inserting this page exclusive-disables every other overlay-desktop.body occupant. Presentation HOW is [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md).

The /client exports are the plugin body (apply / inject) and the overlay-black-hole locale key union. The page component stays package-internal.

## Model Experience

None, as this overlay-desktop.body page is a browser-only occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Must not occupy root, overlay-card.body, or reuse cursor-agent: root shadows AppFrame; cards are the other authored form; cursor-agent is the Cursor overlay panel.
- overlay-desktop.body is kind single: this page is the sole occupant while inserted. Switching desktops disables this fiber.
- No hide file: the rail 桌面 row only 卸下 (Loader disabled).
- The painted scene stays click-through; only the plaque takes pointer events so conversation, cards, and Cursor remain reachable through empty board space.
