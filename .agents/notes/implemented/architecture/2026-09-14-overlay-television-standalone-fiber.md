# Agent Note: Overlay television is a standalone shell.overlay fiber

Status: implemented

English | [中文](2026-09-14-overlay-television-standalone-fiber.zh.md)

## Problem

The arbitrary-shape overlay form ([shaped skill](../../../skills/dsh-overlay-shaped-plugins/SKILL.md)) has no authored HOW. A product that occupies `shell.overlay` itself is that form's first occupancy. Forcing it through `overlay-card.body` or `overlay-desktop.body` would teach the card or desktop occupancy, not a non-card outline. Occupying `root` would shadow AppFrame. Waiting for a reusable shaped host would block the first run-through.

## Decision

A checkout package may register into `shell.overlay` and omit `overlayBody`, so the Cursor rail treats it as a standalone fiber ([rail fibers](2026-09-10-overlay-plugin-rail-fibers.md)): 拔出 writes Loader `disabled`; hide is not offered. That occupancy is not a reusable host, not a generator, and not occupancy of `overlay-card.body`, `overlay-desktop.body`, `root`, or `cursor-agent`. Shaped occupant insert/generator HOW is [overlay new shaped](../process/2026-09-14-overlay-new-shaped.md). The reusable board is [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md) ([shaped host](2026-09-14-overlay-shaped-host.md)). This checkout has no sample CRT occupant; new shapes occupy `overlay-shaped.body` and do not copy standalone occupancy.

## Alternatives considered

**Occupy `overlay-card.body` and clip the card into a television.** Rejected — that is the card form; the skill forbids using card chrome for a non-card outline.

**Occupy `overlay-desktop.body`.** Rejected — desktop is a full-viewport board under cards, not a floating CRT.

**Occupy `root`.** Rejected — `root` is AppFrame.

**Author the shaped HOW and a reusable host before any product.** Rejected for this change — the first run-through is this fiber. The host is now [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md) ([shaped host](2026-09-14-overlay-shaped-host.md)).

**Reuse `cursor-agent`.** Rejected — that id is the Cursor overlay panel.

## Consequences

A standalone fiber does not sit in a shaped seat, so it does not receive host drag ([shaped drag](2026-09-14-overlay-shaped-drag.md)). Occupant insert for this form is `pnpm overlay:new-shaped`. The reusable host is [shaped host](2026-09-14-overlay-shaped-host.md). Copying another occupant's frontend as the next shaped product is still forbidden by [visual independence](../process/2026-09-12-overlay-occupant-visual-independence.md) unless the user asked for something similar.

## Testing

This checkout has no television occupant package. `packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` omits demo occupants from the default roster. Runtime registrant tests use `seat-a` / `seat-b` ids, not a product package.
