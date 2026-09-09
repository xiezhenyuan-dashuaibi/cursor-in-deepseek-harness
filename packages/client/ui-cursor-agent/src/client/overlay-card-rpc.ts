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

/** One overlay card as the plugin manager lists it. */
export type OverlayCardManagerItem = {
  /** Unique `--card-id`. */
  readonly id: string
  /** Title-bar left name. */
  readonly title: string
  /** `true` when the desk skipped this window. */
  readonly hidden: boolean
  /** `false` when an occupant fiber is disabled or missing. */
  readonly inserted: boolean
  /** Loader ids on this seat; empty dims 插入/拔出. */
  readonly occupants: readonly string[]
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
