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
| Floating **arbitrary-shape** occupant (sprite, TV-shaped widget, any non-card outline) | [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) | Reserved slot; body is not authored |
| **Desktop** (product name 桌面; full-viewport under cards, not a floating card) | [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) | Authored. Canonical package [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md) (`overlay-desktop` / `overlay-desktop.body`) |

Overlay Cursor loads the matching skill with `dsh_skill` before writing or live-inserting that form. If `dsh_skill` is missing, it reads the matching `.agents/skills/<form>/SKILL.md` from disk and continues overlay work. It does not invent extra-tool results. For a reserved skill, stop and tell the user the presentation HOW is not authored. Do not invent a procedure. Do not occupy `overlay-card.body` for a non-card outline. Do not occupy `root`. Never restart `dsh web`.

Live insert of a profile copy still uses `pnpm overlay:live` ([live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)). That helper is not a substitute for a missing presentation HOW. Card chrome remains [overlay-card container](../architecture/2026-09-05-overlay-card-container.md). Desktop host and exclusive occupancy remain [desktop host](../architecture/2026-09-10-overlay-desktop-host.md).

Standing orders: `.cursor/rules/dsh-cursor-in-dsh.mdc`, root `AGENTS.md`.

## Alternatives considered

**One skill for every overlay frontend form.** Rejected — the card procedure would be applied to sprites and to the desktop.

**Teach shaped floaters and the desktop as exceptions inside the card skill** (`inset: 0`, skip chrome). Rejected — those are other forms; shaped HOW stays reserved; desktop HOW is the canvas skill, not a card footnote.

**Omit the reserved skills from the catalog until their HOW is written.** Rejected — the catalog must route those tasks away from the card skill. An empty authored slot that says “stop” is the routing for shaped floaters.

**Occupy `root` for the desktop form.** Rejected — `root` is AppFrame. Desktop HOW occupies `shell.overlay` via [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md); occupying `root` stays forbidden.

## Consequences

Card-window work follows `dsh-overlay-web-plugins`. Desktop work follows `dsh-overlay-canvas-plugins`. Shaped-floater work loads its reserved skill and halts until that body is authored. Live-versus-boot, first-import cache, and never-restart stay on the [live-path](../architecture/2026-09-04-overlay-web-plugin-live-path.md) note.

## Testing

The three `SKILL.md` files exist under `.agents/skills/` with catalog `name` and `description`. Named gap: no automated test that the live MCP catalog lists the reserved shaped-floater name or that a model loads that skill instead of the card or desktop skill for a sprite task.
