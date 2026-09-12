# @deepseek-ai/dsh-client-ui-dew-journal

English | [中文](README.zh.md)

Dew journal occupying overlay-card.body on the reusable overlay card: sky chips, one quiet line, and a local stamp. The browser half registers Page with no id / order (kind: 'single'). The page calls preferFrame({ width: 420, height: 560 }) on mount. The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert uses pnpm overlay:live after the card is loaded. Presentation HOW is [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md).

The /client exports are the plugin body (apply / inject) and the overlay-dew-journal locale key union. The page component stays package-internal.

## Model Experience

None, as this overlay-card.body page is a browser-only occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Must not occupy root or reuse cursor-agent: root shadows AppFrame; cursor-agent is the Cursor overlay panel.
- overlay-card.body is kind single: this page is the sole occupant while loaded.
- Leave ~36px at the top of the page so copy sits below the card title bar.
