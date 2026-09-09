---
name: dsh-overlay-canvas-plugins
description: "Use when writing a full-page overlay frontend on the webpage white canvas, not floating (整页画板, 背部纯白画板). HOW is a reserved slot and is not authored. Do not occupy root. Do not reuse dsh-overlay-web-plugins or the card. Tell the user this skill is reserved. Never restart dsh web."
---

# Overlay page canvas

This skill is a reserved slot for a **full-page** overlay frontend that is not floating: the product is written on the webpage’s white backboard. It is guidance, not a script. Presentation-form split: [overlay frontend form skills](../../notes/implemented/process/2026-09-05-overlay-frontend-form-skills.md).

The presentation HOW is not authored. Do not invent a procedure. Do not occupy `root` (AppFrame) or reuse id `cursor-agent`. Do not occupy `overlay-card.body` or copy [`ui-float-window`](../../../packages/client/ui-float-window/README.md) to fake a full page. Never restart `dsh web`.

Load this skill when the task is this form so you do not follow [dsh-overlay-web-plugins](../dsh-overlay-web-plugins/SKILL.md). Then stop and tell the user the presentation HOW is not authored.

`pnpm overlay:live` is the live insert helper for profile copies. It is not a substitute for this skill’s missing procedure.
