/**
 * Overlay-card RPC constants and list parsing for the Cursor rail manager.
 * Duplicated from `@deepseek-ai/dsh-client-ui-float-window` — client plugins
 * must not value-import another plugin's symbols.
 */

/** Connection RPC channel the overlay-card host half registers. */
export const OVERLAY_CARD_RPC_CHANNEL = '/overlay-card'

/**
 * Live hide/insert channel when {@link OVERLAY_CARD_RPC_CHANNEL} still runs a
 * list-only `apply`.
 */
export const OVERLAY_CARD_PLUG_RPC_CHANNEL = '/overlay-card-plug'

/** Endpoint that returns `{ cards: OverlayCardManagerItem[] }`. */
export const OVERLAY_CARD_LIST_ENDPOINT = 'instances.list'

/** Endpoint that writes `hidden` on one roster spec. */
export const OVERLAY_CARD_SET_HIDDEN_ENDPOINT = 'instances.setHidden'

/** Endpoint that sets Loader `disabled` on that card's occupants. */
export const OVERLAY_CARD_SET_INSERTED_ENDPOINT = 'occupants.setInserted'

/** How the rail hides or unplugs this row. */
export type OverlayPluginKind = 'card' | 'fiber' | 'desktop' | 'shaped'

/** One overlay card as the plugin manager lists it. */
export type OverlayCardManagerItem = {
  /** Unique `--card-id` or standalone Loader id. */
  readonly id: string
  /** Title-bar left name or `dsh.client.panelTitle`. */
  readonly title: string
  /** `true` when the desk skipped this window, or a shaped occupant is in host `hidden.json`. */
  readonly hidden: boolean
  /** `false` when an occupant fiber is disabled or missing. */
  readonly inserted: boolean
  /** Loader ids on this seat; empty dims 插入/拔出. */
  readonly occupants: readonly string[]
  /**
   * `fiber` is a standalone overlay Loader row; `shaped` occupies overlay-shaped.body;
   * `desktop` occupies overlay-desktop.body; omitted means `card`.
   */
  readonly kind?: OverlayPluginKind
}

/** Unary RPC result the plug helper reads. */
type OverlayCardRpcResult =
  | { readonly ok: true; readonly value?: unknown }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** Minimal RPC caller the plugin manager needs. */
export interface OverlayCardRpc {
  /**
   * Call one endpoint on a dedicated channel.
   * @param channel - absolute channel such as `/overlay-card`.
   * @param endpoint - channel-relative method.
   * @param payload - JSON payload.
   */
  call(channel: string, endpoint: string, payload: unknown): Promise<OverlayCardRpcResult>
}

/**
 * Narrow `instances.list` JSON to manager rows.
 * @param value - RPC success value.
 * @returns rows, or `undefined` when the payload is not a card roster.
 */
export function overlayCardsFromListValue(value: unknown): OverlayCardManagerItem[] | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (!('cards' in value) || !Array.isArray(value.cards)) return undefined
  const items: OverlayCardManagerItem[] = []
  const ids = new Set<string>()
  for (const item of value.cards) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) return undefined
    if (typeof record.title !== 'string' || record.title.trim().length === 0) return undefined
    if (record.hidden !== undefined && typeof record.hidden !== 'boolean') return undefined
    if (record.inserted !== undefined && typeof record.inserted !== 'boolean') return undefined
    if (record.occupants !== undefined) {
      if (!Array.isArray(record.occupants) || record.occupants.some(id => typeof id !== 'string')) {
        return undefined
      }
    }
    if (ids.has(record.id)) return undefined
    ids.add(record.id)
    items.push({
      id: record.id,
      title: record.title,
      hidden: record.hidden === true,
      inserted: record.inserted !== false,
      occupants: Array.isArray(record.occupants) ? record.occupants as string[] : [],
      kind: 'card',
    })
  }
  return items
}

/**
 * Whether every card in a raw `instances.list` value set wire `inserted`.
 * @param value - RPC success value.
 * @returns true when every card includes a boolean `inserted`.
 */
export function overlayCardListSetsInserted(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (!('cards' in value) || !Array.isArray(value.cards)) return false
  return value.cards.every(item => (
    item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && typeof (item as { inserted?: unknown }).inserted === 'boolean'
  ))
}

/**
 * List overlay cards, preferring a payload that sets wire `inserted`.
 * A persist-only `/overlay-card` handler omits that field; `/overlay-card-plug` sets it.
 * @param rpc - Connection generic RPC caller.
 * @returns manager rows, or `[]` when neither channel returns a roster.
 */
export async function callOverlayCardList(rpc: OverlayCardRpc): Promise<OverlayCardManagerItem[]> {
  const primary = await listOverlayCardChannel(rpc, OVERLAY_CARD_RPC_CHANNEL)
  if (primary !== undefined && overlayCardListSetsInserted(primary.raw)) return primary.items
  const fallback = await listOverlayCardChannel(rpc, OVERLAY_CARD_PLUG_RPC_CHANNEL)
  if (fallback !== undefined && overlayCardListSetsInserted(fallback.raw)) return fallback.items
  return fallback?.items ?? primary?.items ?? []
}

async function listOverlayCardChannel(
  rpc: OverlayCardRpc,
  channel: string,
): Promise<{ raw: unknown; items: OverlayCardManagerItem[] } | undefined> {
  let result: OverlayCardRpcResult
  try {
    result = await rpc.call(channel, OVERLAY_CARD_LIST_ENDPOINT, {})
  } catch {
    return undefined
  }
  if (!result.ok) return undefined
  const items = overlayCardsFromListValue(result.value)
  if (items === undefined) return undefined
  return { raw: result.value, items }
}

/**
 * Whether a `/overlay-card` failure is a list-only handler rejecting a write.
 * @param message - RPC error message.
 */
export function isOverlayCardUnknownEndpoint(message: string): boolean {
  return message.includes('unknown overlay-card endpoint')
}

/**
 * Write on `/overlay-card`, then `/overlay-card-plug` when that first handler
 * is still list-only.
 * @param rpc - Connection generic RPC caller.
 * @param endpoint - `instances.setHidden` or `occupants.setInserted`.
 * @param payload - JSON payload.
 */
export async function callOverlayCardWrite(
  rpc: OverlayCardRpc,
  endpoint: string,
  payload: unknown,
): Promise<void> {
  let primary: OverlayCardRpcResult | undefined
  try {
    primary = await rpc.call(OVERLAY_CARD_RPC_CHANNEL, endpoint, payload)
  } catch {
    primary = undefined
  }
  if (primary?.ok === true) return
  if (primary !== undefined && !isOverlayCardUnknownEndpoint(primary.error.message)) {
    throw new Error(primary.error.message)
  }
  const fallback = await rpc.call(OVERLAY_CARD_PLUG_RPC_CHANNEL, endpoint, payload)
  if (!fallback.ok) throw new Error(fallback.error.message)
}

/**
 * Hide or show one overlay card window.
 * @param rpc - Connection generic RPC caller.
 * @param id - unique card id.
 * @param hidden - `true` skips the window.
 */
export async function callOverlayCardSetHidden(
  rpc: OverlayCardRpc,
  id: string,
  hidden: boolean,
): Promise<void> {
  await callOverlayCardWrite(rpc, OVERLAY_CARD_SET_HIDDEN_ENDPOINT, { id, hidden })
}

/**
 * Insert or unplug occupant Loader fibers for one overlay card.
 * @param rpc - Connection generic RPC caller.
 * @param id - unique card id.
 * @param inserted - `false` sets `disabled: true` on occupant rows.
 */
export async function callOverlayCardSetInserted(
  rpc: OverlayCardRpc,
  id: string,
  inserted: boolean,
): Promise<void> {
  await callOverlayCardWrite(rpc, OVERLAY_CARD_SET_INSERTED_ENDPOINT, { id, inserted })
}

/** Connection RPC channel for standalone overlay fibers. Duplicated from the host half. */
export const OVERLAY_PLUGIN_RPC_CHANNEL = '/overlay-plugins'

/**
 * Live recovery channel when {@link OVERLAY_PLUGIN_RPC_CHANNEL} still runs a
 * cached Cursor `apply`. Duplicated from the host half.
 */
export const OVERLAY_PLUGIN_RAIL_RPC_CHANNEL = '/overlay-plugins-rail'

/** Endpoint that returns `{ desktop?, plugins: OverlayCardManagerItem[] }`. */
export const OVERLAY_PLUGIN_LIST_ENDPOINT = 'plugins.list'

/** Endpoint that sets Loader `disabled` on one standalone plugin id. */
export const OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT = 'plugins.setInserted'

/** Endpoint that writes shaped-host `hidden.json` for one occupant Loader id. */
export const OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT = 'plugins.setHidden'

/** Endpoint that exclusive-enables one overlay-desktop.body occupant. */
export const OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT = 'plugins.switchDesktop'

/**
 * List card windows plus standalone overlay fibers.
 * A missing `/overlay-plugins` handler leaves the card rows in place.
 * @param rpc - Connection generic RPC caller.
 */
export async function callOverlayPluginList(rpc: OverlayCardRpc): Promise<OverlayCardManagerItem[]> {
  const cards = await callOverlayCardList(rpc)
  const fibers = await callStandalonePluginList(rpc)
  return [...cards, ...fibers]
}

/**
 * Hide or show one rail row. Fiber and desktop rows have no hide file.
 * Shaped occupants write the host `hidden.json` and stay mounted.
 * @param rpc - Connection generic RPC caller.
 * @param id - card id or standalone Loader id.
 * @param hidden - `true` skips the window or hides the silhouette.
 * @param kind - `fiber` / `desktop` reject hide; `shaped` writes `plugins.setHidden`.
 */
export async function callOverlayPluginSetHidden(
  rpc: OverlayCardRpc,
  id: string,
  hidden: boolean,
  kind: OverlayPluginKind = 'card',
): Promise<void> {
  if (kind === 'fiber' || kind === 'desktop') {
    throw new Error('overlay-plugins: hide is not supported for this plugin')
  }
  if (kind === 'shaped') {
    await callOverlayPluginWrite(rpc, OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT, { id, hidden })
    return
  }
  await callOverlayCardSetHidden(rpc, id, hidden)
}

/**
 * Insert or unplug one rail row. Desktop insert exclusive-enables that occupant.
 * @param rpc - Connection generic RPC caller.
 * @param id - card id or standalone Loader id.
 * @param inserted - `false` sets Loader `disabled: true`.
 * @param kind - `fiber` / `desktop` / `shaped` route to `/overlay-plugins-rail`.
 */
export async function callOverlayPluginSetInserted(
  rpc: OverlayCardRpc,
  id: string,
  inserted: boolean,
  kind: OverlayPluginKind = 'card',
): Promise<void> {
  if (kind === 'fiber' || kind === 'desktop' || kind === 'shaped') {
    await callStandaloneSetInserted(rpc, id, inserted)
    return
  }
  await callOverlayCardSetInserted(rpc, id, inserted)
}

/**
 * Exclusive-enable one overlay-desktop.body occupant.
 * @param rpc - Connection generic RPC caller.
 * @param id - Loader id of the desktop occupant.
 */
export async function callOverlayPluginSwitchDesktop(
  rpc: OverlayCardRpc,
  id: string,
): Promise<void> {
  await callOverlayPluginWrite(rpc, OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT, { id })
}

async function callStandalonePluginList(rpc: OverlayCardRpc): Promise<OverlayCardManagerItem[]> {
  const rail = await listPluginChannel(rpc, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL)
  if (rail !== undefined) return rail
  return (await listPluginChannel(rpc, OVERLAY_PLUGIN_RPC_CHANNEL)) ?? []
}

async function listPluginChannel(
  rpc: OverlayCardRpc,
  channel: string,
): Promise<OverlayCardManagerItem[] | undefined> {
  let result: OverlayCardRpcResult
  try {
    result = await rpc.call(channel, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
  } catch {
    return undefined
  }
  if (!result.ok) return undefined
  return overlayPluginsFromListValue(result.value)
}

async function callStandaloneSetInserted(
  rpc: OverlayCardRpc,
  id: string,
  inserted: boolean,
): Promise<void> {
  await callOverlayPluginWrite(rpc, OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT, { id, inserted })
}

async function callOverlayPluginWrite(
  rpc: OverlayCardRpc,
  endpoint: string,
  payload: unknown,
): Promise<void> {
  let rail: OverlayCardRpcResult | undefined
  try {
    rail = await rpc.call(OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, endpoint, payload)
  } catch {
    rail = undefined
  }
  if (rail?.ok === true) return
  if (rail !== undefined && !isUnknownOverlayPluginEndpoint(rail.error.message)) {
    throw new Error(rail.error.message)
  }
  const fallback = await rpc.call(OVERLAY_PLUGIN_RPC_CHANNEL, endpoint, payload)
  if (!fallback.ok) throw new Error(fallback.error.message)
}

function isUnknownOverlayPluginEndpoint(message: string): boolean {
  return message.includes('unknown overlay-plugins endpoint')
}

/**
 * Narrow `plugins.list` JSON to rail rows. Accepts `{ desktop, plugins }` or
 * a plugins-only payload from an older sidecar.
 * @param value - RPC success value.
 */
export function overlayPluginsFromListValue(value: unknown): OverlayCardManagerItem[] | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const items: OverlayCardManagerItem[] = []
  const ids = new Set<string>()
  if (record.desktop !== undefined && record.desktop !== null) {
    const desktop = pluginItemFromUnknown(record.desktop, 'desktop')
    if (desktop === undefined) return undefined
    ids.add(desktop.id)
    items.push(desktop)
  }
  if (!('plugins' in record) || !Array.isArray(record.plugins)) return undefined
  for (const item of record.plugins) {
    const parsed = pluginItemFromUnknown(item, 'fiber')
    if (parsed === undefined) return undefined
    if (ids.has(parsed.id)) return undefined
    ids.add(parsed.id)
    items.push(parsed)
  }
  return items
}

function pluginItemFromUnknown(
  item: unknown,
  fallbackKind: 'fiber' | 'desktop',
): OverlayCardManagerItem | undefined {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined
  const record = item as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.title !== 'string' || record.title.trim().length === 0) return undefined
  if (record.hidden !== undefined && typeof record.hidden !== 'boolean') return undefined
  if (record.inserted !== undefined && typeof record.inserted !== 'boolean') return undefined
  if (record.occupants !== undefined) {
    if (!Array.isArray(record.occupants) || record.occupants.some(id => typeof id !== 'string')) {
      return undefined
    }
  }
  const kind = record.kind === 'desktop' || record.kind === 'fiber' || record.kind === 'shaped'
    ? record.kind
    : fallbackKind
  return {
    id: record.id,
    title: record.title,
    hidden: record.hidden === true,
    inserted: record.inserted !== false,
    occupants: Array.isArray(record.occupants) ? record.occupants as string[] : [],
    kind,
  }
}
