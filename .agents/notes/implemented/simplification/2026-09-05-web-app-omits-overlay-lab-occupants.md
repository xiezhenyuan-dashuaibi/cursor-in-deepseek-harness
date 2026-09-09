# Agent Note: Default web-app roster is the bundle patch

Status: implemented

English | [中文](2026-09-05-web-app-omits-overlay-lab-occupants.zh.md)

## Problem

The default `dsh web` page mounts every `shell.overlay` occupant in the web-app bundle. Checkout inventory can include packages for live insert and package tests. Shipping those rows in the bundle puts non-product chrome on every session beside the Cursor panel and any live-inserted cards.

## Decision

[`@deepseek-ai/dsh-web-app`](../../../../packages/bundle/web-app/README.md) inserts only the Loader rows in its `cordis.patch.yml` and depends only on packages that patch names. Client packages that exist in the checkout but are absent from that patch do not mount on the next `dsh web` boot. Live-inserted profile rows stay on the profile patch. Card-window work inserts [`ui-float-window`](../../../../packages/client/ui-float-window/README.md) then a page ([dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)). Cursor overlay, conversation, settings, and other web-app roster rows stay.

Which packages exist is the [client plugin inventory](../../../../packages/client/README.md). Which of those the bundle omits is pinned by `packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts`, not by restating that omit list here.

Editing the bundle patch does not change an already-running process (`composeLive` snapshots bundle layers at launch). Unload of a bundle occupant on an open page is a restart, or a live profile `disabled: true` / row delete for ids the process already loaded.

## Alternatives considered

**Delete workspace packages that the bundle omits as a standing inventory.** Rejected as the composition rule — checkout may hold a live-inserted occupant while it is being authored. **Leave those packages after live `remove`.** Rejected — `overlay:live remove <id>` without `--keep-files` deletes that omitted occupant from checkout and strips its landing rows so an unload cannot remain as a searchable empty record ([live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)).

**Leave omitted rows in the bundle with `disabled: true`.** Rejected — a disabled bundle row is still shipped composition and still requires the package.json dependencies; absence is the contract.

**Unload only through this machine's profile patch.** Rejected — a profile `disabled: true` can drop occupants on the open page, but the next boot remounts them from the bundle.

## Consequences

A default `dsh web` overlay shows product chrome plus whatever the profile live-inserts. Installing the web-app bundle does not pull omitted inventory packages through that bundle's dependency list. An omitted occupant that is live-removed is gone from checkout, not left as an empty inventory row.

## Testing

`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` rejects Loader ids and package.json dependencies that exist in the client inventory but are absent from this bundle, and still requires `ui-cursor-agent` and `cursor-agent-gateway`.
