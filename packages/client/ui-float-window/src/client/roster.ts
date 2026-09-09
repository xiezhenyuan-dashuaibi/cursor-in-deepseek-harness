/**
 * Browser-side overlay-card roster: unary RPC poll of `instances.list`.
 */

import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  defaultOverlayCardSpec, isOverlayCardRoster, overlayCardRosterListsInserted,
  OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_RPC_CHANNEL,
  type OverlayCardRoster,
} from '../instances.ts'

/** Default roster before the first successful RPC. */
export const DEFAULT_OVERLAY_CARD_ROSTER: OverlayCardRoster = { cards: [defaultOverlayCardSpec()] }

/** Milliseconds between `instances.list` polls. */
export const OVERLAY_CARD_ROSTER_POLL_MS = 400

/** Minimal RPC caller the roster needs (Connection's generic channel API). */
export interface OverlayCardRpc {
  /**
   * Call one endpoint on a dedicated channel.
   * @param channel - absolute channel such as `/overlay-card`.
   * @param endpoint - channel-relative method.
   * @param payload - JSON payload.
   * @param signal - optional cancellation.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>>
}

/** Snapshot source the desk injects as `hooks.roster`. */
export interface OverlayCardRosterSource extends HostObservable<OverlayCardRoster> {
  /** Stop the poll timer. */
  dispose: () => void
}

/**
 * Create a roster source that hydrates over RPC and polls for later inserts.
 * @param rpc - Connection generic RPC caller.
 * @param intervalMs - poll period; tests pass a large value to skip ticks.
 * @returns source the plugin dispose must close.
 */
export function createOverlayCardRoster(
  rpc: OverlayCardRpc,
  intervalMs: number = OVERLAY_CARD_ROSTER_POLL_MS,
): OverlayCardRosterSource {
  let snapshot: OverlayCardRoster = DEFAULT_OVERLAY_CARD_ROSTER
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const publish = (next: OverlayCardRoster): void => {
    if (sameCards(snapshot.cards, next.cards)) return
    snapshot = next
    notify()
  }
  const pull = async (): Promise<void> => {
    const primary = await listRoster(rpc, OVERLAY_CARD_RPC_CHANNEL)
    if (primary !== undefined && overlayCardRosterListsInserted(primary)) {
      publish(primary)
      return
    }
    const fallback = await listRoster(rpc, OVERLAY_CARD_PLUG_RPC_CHANNEL)
    if (fallback !== undefined && overlayCardRosterListsInserted(fallback)) {
      publish(fallback)
      return
    }
    if (fallback !== undefined) publish(fallback)
    else if (primary !== undefined) publish(primary)
  }
  void pull()
  const timer = setInterval(() => { void pull() }, intervalMs)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => { clearInterval(timer) },
  }
}

async function listRoster(rpc: OverlayCardRpc, channel: string): Promise<OverlayCardRoster | undefined> {
  let result: RpcResult<unknown>
  try {
    result = await rpc.call(channel, OVERLAY_CARD_LIST_ENDPOINT, {})
  } catch {
    // HTTP 405/network: that channel is not mounted (SPA fallback).
    return undefined
  }
  if (!result.ok) return undefined
  if (!isOverlayCardRoster(result.value)) return undefined
  return result.value
}

function sameOccupants(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const a = left ?? []
  const b = right ?? []
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function sameCards(left: readonly OverlayCardSpec[], right: readonly OverlayCardSpec[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return false
    if (
      a.seat !== b.seat
      || a.id !== b.id
      || a.title !== b.title
      || a.width !== b.width
      || a.height !== b.height
      || a.hidden !== b.hidden
      || a.inserted !== b.inserted
      || sameOccupants(a.occupants, b.occupants) === false
    ) return false
  }
  return true
}
