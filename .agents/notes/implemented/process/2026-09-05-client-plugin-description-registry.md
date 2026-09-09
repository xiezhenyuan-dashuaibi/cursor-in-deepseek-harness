# Agent Note: Client plugin descriptions live in the package path

Status: implemented

English | [中文](2026-09-05-client-plugin-description-registry.zh.md)

## Problem

Product plugins change often. Agent Notes, skills, cookbooks, and unpaired campaign files that name which overlay plugins exist and what they look like rot, keep deleted package names alive, and duplicate the package README.

## Decision

The client plugin inventory is the table in [`packages/client/README.md`](../../../../packages/client/README.md): directory, short role, link to that package README. Generated catalogs (`module-graph`, `config-catalog`, slot catalog) list packages mechanically from source. A plugin's description lives in that package's `README.md` / `README.zh.md`, written when the plugin is authored.

Agent Notes, skills, and cookbooks name mechanisms — `overlay-card.body`, `pnpm overlay:live`, the card module [`ui-float-window`](../../../../packages/client/ui-float-window/README.md) — not product occupants. Do not write that a campaign developed plugin X. Do not name an occupant even as a clone-from example. Do not keep unpaired handoff, smoke-log, or campaign notebooks that enumerate plugins. Default web-app composition stays on the bundle patch ([omitted inventory packages](../simplification/2026-09-05-web-app-omits-overlay-lab-occupants.md)).

New `packages/client/<name>` work adds a short inventory row and the package README; it does not add a feature Agent Note whose body is that README. `overlay:live remove <id>` of an omitted occupant deletes that inventory row with the package.

## Alternatives considered

**Keep a feature Agent Note per overlay occupant.** Rejected — the occupant changes more often than the card and live-insert mechanisms; those notes become campaign eulogies.

**Put product plugin lists in architecture.md or the overlay skill.** Rejected — architecture maps composition; the skill is HOW for a presentation form. Both rot when the inventory moves.

**Archive campaign notes instead of deleting them.** Rejected for unpaired handoff and smoke-log files, and for implemented notes whose only remaining content is a deleted package name or a package README restatement. Unique mechanisms stay on [live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md), [overlay-card container](../architecture/2026-09-05-overlay-card-container.md), and this note.

## Consequences

Overlay product copy has one home. Contributors look up a plugin in the inventory, then read that README. Mechanism notes stay stable when occupants change.

## Testing

`packages/client/README.md` lists every `packages/client/*` product directory. `packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` pins bundle omission without living in Agent Note prose. Named gap: no gate that Agent Notes must not name inventory packages; this note is the pin.
