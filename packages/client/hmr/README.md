# @deepseek-ai/dsh-client-hmr

English | [中文](README.zh.md)

Hot reload for script-loaded client plugins. The web bundle mounts the row unconditionally. Roster add/remove (host Loader entries appearing or disappearing) pushes a `graph` frame so the open page mounts or unmounts the matching client entry without a refresh. Without a rebuild watcher (`pnpm run dev:web`) rewriting client bundles, content polls stay idle; source edits of an already-rostered plugin then need a refresh or that watcher.

The browser half subscribes to the system SSE channel (`GET /plugins/events`). A `graph` frame diffs the host roster against the live loader tree: `adoptRow`/`dropRow` on the module table, `loader.create` for new names, `loader.remove` for names the host dropped (never the modules kernel, this driver, or app-shell). A `rebuilt` frame reloads one plugin through a serialized queue shared with graph applies. The rebuilt sequence — `invalidate`, `prefetch` (load and register the new bundle while the old fiber still serves), `registry.delete` (before the fiber: a bare fiber dispose trips the vendored Loader's self-dispose branch, which would mark the entry disabled), drain the old fiber, delete `entry.fiber`, remove owned `<style data-plugin>` tags, `entry.refresh()` re-imports and remounts, `fiber.await()` rethrows startup failures loud. Dependents reload through cordis itself: a fiber's activation epoch strings its service providers' uids, so replacing a provider's fiber cascades every dependent with zero client-side graph analysis. The node half detects rebuilds with one interval that stat-polls each graph bundle from a synchronous baseline, immediately re-hashes after adding a row, retains missing rows as dirty, and broadcasts only real rev changes; it broadcasts a `graph` frame on connect and on every roster change, before that re-hash, so a new row is created on the page before a content `rebuilt` can name it. Any tsdown watch process producing the bundle therefore triggers content HMR with no builder→host channel.

## Model Experience

None, as the reload driver is browser-side machinery; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Reload is coarse by design** — a fresh fiber and fresh components; React state inside the reloaded plugin is lost while the data layer (connection/runtime fibers, Session objects) is untouched. react-refresh-grade state preservation conflicts with "re-executing the bundle re-runs the factory" and is deliberately out.
- **No failure rollback** — a reload or roster add that fails leaves the entry FAILED (or fiberless) and visible in the loader status projection; the previous bundle is not restored automatically.
- **Rebuilt frames do not rewrite the in-memory boot rev** — the stale rev is harmless because the bundle endpoint serves no-cache; roster identity follows `graph` frames, including reconnect.
