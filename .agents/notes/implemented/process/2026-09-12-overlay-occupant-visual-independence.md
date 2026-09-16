# Agent Note: Overlay occupant frontend does not copy sibling product layout

Status: implemented

English | [中文](2026-09-12-overlay-occupant-visual-independence.zh.md)

## Problem

`overlay:new-page`, `overlay:new-desktop`, and `overlay:new-shaped` already forbid cloning another occupant as the package skeleton. Overlay agents still search, grep, or open a sibling occupant's `Page.tsx` / `Occupant.tsx` / `*.module.css` / locales, or treat the currently painted desktop or floater as a template, and reproduce a corner glass HUD (clock, kicker, stats, primary button in a floating pad) or another product's silhouette. Operators then see the same bottom-left panel on every new desktop, and similar cloned layout on new cards and floaters, even when the brief did not ask to match an existing product.

## Decision

A new overlay occupant page invents its composition from the user's product brief and the generator stub in that new package. Frontend for that page stays independent: it does not follow another overlay occupant's style. Do not search, grep, or open another overlay occupant's `Page.tsx`, `Occupant.tsx`, `*.module.css`, locales, or page tests as reference. Do not copy the currently painted desktop, card, or floater as a layout template. Open another occupant's page frontend only when the user explicitly asked to make something similar to that product. Host chrome stays [`ui-float-window`](../../../../packages/client/ui-float-window/README.md), [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md), or [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md); those packages are insert-only, not page templates. Shared look is `--dsw-alias-*` and [web styling](../../../../docs/web-styling.md), not a sibling product's CSS. Desktop and shaped click-through (`pointer-events: none` on the board, `auto` on this occupant's own hit targets) is which nodes receive hits; it does not require clustering controls into one corner pad.

Operational HOW: [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md), [dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md), [dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md). Package writers: [overlay new page](2026-09-05-overlay-new-page.md), [overlay new desktop](2026-09-10-overlay-new-desktop.md), [overlay new shaped](2026-09-14-overlay-new-shaped.md). Occupant names stay out of skills ([description registry](2026-09-05-client-plugin-description-registry.md)).

## Alternatives considered

**Put a corner HUD in the generator stub.** Rejected — that would make the floating pad the official desktop page.

**Allow searching, grepping, or opening sibling pages for visual quality.** Rejected — sibling occupants are products, not a design system. Shared chrome is tokens and the host packages.

**Search, grep, or open every overlay occupant `Page.tsx` / `Page.module.css` as house style.** Rejected — that is the same clone with extra steps.

## Consequences

Overlay Cursor standing order, skill YAML descriptions, the three form skills, `packages/client/AGENTS.md`, and the overlay cookbooks state that a new page invents look from its brief and the generator stub; that the agent does not search, grep, or open another occupant's page frontend as reference; and that another occupant's frontend is a layout template only when the user explicitly asked to make something similar to that product. The writers still own the package skeleton; this note owns layout independence after the stub exists.

## Testing

Named gap: no automated test that a model does not search, grep, or open sibling occupant page frontend when the user did not ask to make something similar to that product.
