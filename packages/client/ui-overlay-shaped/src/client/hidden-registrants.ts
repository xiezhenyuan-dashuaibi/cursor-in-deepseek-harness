/**
 * Poll `/overlay-plugins-rail` for shaped occupants in the host hide file.
 * Join is npm package name (slot registrant), not list id.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Duplicated from Cursor host — this package must not value-import that plugin. */
const OVERLAY_PLUGIN_RPC_CHANNEL = '/overlay-plugins'

/** Live recovery channel when `/overlay-plugins` still runs a cached apply. */
const OVERLAY_PLUGIN_RAIL_RPC_CHANNEL = '/overlay-plugins-rail'

/** Endpoint that returns `{ desktop, plugins }`. */
const OVERLAY_PLUGIN_LIST_ENDPOINT = 'plugins.list'

/** Poll period matching the Cursor plugin panel. */
const HIDDEN_REGISTRANTS_POLL_MS = 400

/** Minimal RPC caller the hide poll needs. */
export type HiddenRegistrantsRpc = {
  /**
   * Call one endpoint on a dedicated channel.
   * @param channel - absolute channel such as `/overlay-plugins-rail`.
   * @param endpoint - channel-relative method.
   * @param payload - JSON payload.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
  ): Promise<{ readonly ok: boolean; readonly value?: unknown }>
}

/** Hide poll plus the attach hook used when Connection is present. */
export type HiddenRegistrantsSource = HostObservable<readonly string[]> & {
  /**
   * Start polling. Returns a disposer that stops the timer.
   * @param rpc - Connection generic RPC caller.
   */
  attach(rpc: HiddenRegistrantsRpc): () => void
}

/**
 * Snapshot of npm names whose silhouettes stay mounted but invisible.
 * Without {@link HiddenRegistrantsSource.attach}, the snapshot stays `[]`.
 */
export function createHiddenRegistrantsSource(): HiddenRegistrantsSource {
  let snapshot: readonly string[] = []
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | undefined
  let generation = 0

  const notify = (): void => {
    for (const fn of [...listeners]) fn()
  }

  const pull = async (gen: number, current: HiddenRegistrantsRpc): Promise<void> => {
    const value = await listPlugins(current)
    if (gen !== generation) return
    const next = hiddenModuleNames(value)
    if (sameNames(snapshot, next)) return
    snapshot = next
    notify()
  }

  const stop = (): void => {
    generation += 1
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    attach(nextRpc) {
      stop()
      const gen = generation
      void pull(gen, nextRpc)
      timer = setInterval(() => { void pull(gen, nextRpc) }, HIDDEN_REGISTRANTS_POLL_MS)
      return () => { stop() }
    },
  }
}

async function listPlugins(rpc: HiddenRegistrantsRpc): Promise<unknown> {
  const rail = await tryList(rpc, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL)
  if (rail !== undefined) return rail
  return await tryList(rpc, OVERLAY_PLUGIN_RPC_CHANNEL)
}

async function tryList(rpc: HiddenRegistrantsRpc, channel: string): Promise<unknown> {
  try {
    const result = await rpc.call(channel, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
    if (result.ok) return result.value
  } catch {
    return undefined
  }
  return undefined
}

function hiddenModuleNames(value: unknown): readonly string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const plugins = (value as { plugins?: unknown }).plugins
  if (!Array.isArray(plugins)) return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of plugins) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    if (row.kind !== 'shaped' || row.hidden !== true) continue
    if (typeof row.moduleName !== 'string' || row.moduleName.length === 0) continue
    if (seen.has(row.moduleName)) continue
    seen.add(row.moduleName)
    names.push(row.moduleName)
  }
  return names
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((name, index) => name === right[index])
}
