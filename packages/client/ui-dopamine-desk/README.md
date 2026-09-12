# @deepseek-ai/dsh-client-ui-dopamine-desk

English | [中文](README.zh.md)

Full-viewport pulse floor occupying overlay-desktop.body: scattered pads add a local dopamine score. The painted floor stays click-through; only the pads take pointer events. The browser half registers Page with no id / order (kind: 'single'). The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert is pnpm overlay:live insert of this package after the desktop board is loaded; that command builds lib/ when tsdown.config.ts is present. Inserting this page exclusive-disables every other overlay-desktop.body occupant. Presentation HOW is [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md).

The /client exports are the plugin body (apply / inject) and the overlay-dopamine-desk locale key union. The page component stays package-internal.

## Model Experience

None, as this overlay-desktop.body page is a browser-only occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Must not occupy root, overlay-card.body, or reuse cursor-agent: root shadows AppFrame; cards are the other authored form; cursor-agent is the Cursor overlay panel.
- overlay-desktop.body is kind single: this page is the sole occupant while inserted. Switching desktops disables this fiber.
- No hide file: the rail 桌面 row only 卸下 (Loader disabled).
- The painted scene stays click-through; only the floor pads take pointer events so conversation, cards, and Cursor remain reachable through empty board space.
