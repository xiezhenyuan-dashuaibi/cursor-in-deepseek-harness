---
name: dsh-overlay-shaped-plugins
description: "Use when writing a non-card floating overlay occupant of arbitrary shape (sprite, 精灵, TV-shaped widget, 电视悬件, freeform floater). HOW is a reserved slot and is not authored. Do not use dsh-overlay-web-plugins or overlay-card.body for this form. Tell the user this skill is reserved. Never restart dsh web."
---

# Overlay shaped floaters

This skill is a reserved slot for **arbitrary-shape floating** overlay occupants: a sprite, a TV-shaped widget with a screen, or any outline that is not the reusable card. It is guidance, not a script. Presentation-form split: [overlay frontend form skills](../../notes/implemented/process/2026-09-05-overlay-frontend-form-skills.md).

The presentation HOW is not authored. Do not invent a procedure. Do not occupy `overlay-card.body` or copy [`ui-float-window`](../../../packages/client/ui-float-window/README.md) chrome for this form. Do not occupy `root` or reuse id `cursor-agent`. Never restart `dsh web`.

Load this skill when the task is this form so you do not follow [dsh-overlay-web-plugins](../dsh-overlay-web-plugins/SKILL.md) or [dsh-overlay-canvas-plugins](../dsh-overlay-canvas-plugins/SKILL.md). Then stop and tell the user the presentation HOW is not authored.

`pnpm overlay:live` is the live insert helper for profile copies. It is not a substitute for this skill’s missing procedure.
