# Agent Note: Overlay frontend has three presentation forms and three skills

Status: implemented

English | [中文](2026-09-05-overlay-frontend-form-skills.zh.md)

## Problem

Overlay frontend work is treated as one procedure. Contributors then force a sprite, a TV-shaped floater, or a full-page white canvas through the reusable card (`overlay-card.body`), or they occupy `root` to look like a document. The card HOW does not describe those forms, and inventing them from the card skill produces the wrong chrome.

## Decision

Overlay frontend has three presentation forms, each with its own DSH skill:

| Form | Skill | HOW |
|---|---|---|
| Floating rectangular **card** with title-bar chrome and a webpage in the body | [`dsh-overlay-web-plugins`](../../../skills/dsh-overlay-web-plugins/SKILL.md) | Authored. Canonical package [`ui-float-window`](../../../../packages/client/ui-float-window/README.md) (`overlay-card` / `overlay-card.body`) |
| Floating **arbitrary-shape** occupant (sprite, TV-shaped widget, any non-card outline) | [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) | Authored. Canonical host [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md) (`overlay-shaped` / `overlay-shaped.body`); occupant kit [`overlay:new-shaped`](2026-09-14-overlay-new-shaped.md); host drag [shaped drag](../architecture/2026-09-14-overlay-shaped-drag.md); host hide [shaped hide](../architecture/2026-09-14-overlay-shaped-hide.md). Occupant `onClick` versus delayed host Pointer Capture, and one inner size for line grids and hit targets, live in that skill |
| **Desktop** (product name 桌面; full-viewport under cards, not a floating card) | [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) | Authored. Canonical package [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md) (`overlay-desktop` / `overlay-desktop.body`) |

Overlay Cursor loads the matching skill with `dsh_skill` before writing or live-inserting that form. If `dsh_skill` is missing, it reads the matching `.agents/skills/<form>/SKILL.md` from disk and continues overlay work. It does not invent extra-tool results. Do not occupy `overlay-card.body` for a non-card outline. Do not occupy `root`. Never restart `dsh web`. Shaped hide-while-mounted is [shaped hide](../architecture/2026-09-14-overlay-shaped-hide.md).

Live insert of a profile copy still uses `pnpm overlay:live` ([live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)). That helper is not a substitute for the form skill. Card chrome remains [overlay-card container](../architecture/2026-09-05-overlay-card-container.md). Desktop host and exclusive occupancy remain [desktop host](../architecture/2026-09-10-overlay-desktop-host.md). Shaped host occupancy remains [shaped host](../architecture/2026-09-14-overlay-shaped-host.md). Shaped occupant kit remains [overlay new shaped](2026-09-14-overlay-new-shaped.md). Shaped drag remains [shaped drag](../architecture/2026-09-14-overlay-shaped-drag.md).

Standing orders: `.cursor/rules/dsh-cursor-in-dsh.mdc`, root `AGENTS.md`.

## Alternatives considered

**One skill for every overlay frontend form.** Rejected — the card procedure would be applied to sprites and to the desktop.

**Teach shaped floaters and the desktop as exceptions inside the card skill** (`inset: 0`, skip chrome). Rejected — those are other forms; shaped HOW is the shaped skill; desktop HOW is the canvas skill, not a card footnote.

**Omit the shaped skill from the catalog until occupant HOW is written.** Rejected — the catalog must route sprite tasks away from the card skill even before the occupant kit exists.

**Occupy `root` for the desktop form.** Rejected — `root` is AppFrame. Desktop HOW occupies `shell.overlay` via [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md); occupying `root` stays forbidden.

## Consequences

Card-window work follows `dsh-overlay-web-plugins`. Desktop work follows `dsh-overlay-canvas-plugins`. Shaped-floater work follows `dsh-overlay-shaped-plugins`: insert [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md), run `pnpm overlay:new-shaped`, occupy `overlay-shaped.body` ([shaped host](../architecture/2026-09-14-overlay-shaped-host.md), [overlay new shaped](2026-09-14-overlay-new-shaped.md)). Calling `dsh_skill` for that name loads the rapid-dev HOW (occupant `onClick`, delayed host Pointer Capture, painted inner size). A checkout package may occupy `shell.overlay` as a standalone fiber without `overlayBody` ([standalone fiber](../architecture/2026-09-14-overlay-television-standalone-fiber.md)). That occupancy is not the reusable host and is not the generator stub. New shapes do not copy that occupancy. Live-versus-boot, first-import cache, and never-restart stay on the [live-path](../architecture/2026-09-04-overlay-web-plugin-live-path.md) note.

## Testing

The three `SKILL.md` files exist under `.agents/skills/` with catalog `name` and `description`. Named gap: no automated test that a model loads the shaped skill instead of the card or desktop skill for a sprite task.
