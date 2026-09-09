/**
 * Browser poll of `/petshop-hub` `signals`.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  asPetshopHubSignals, PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT,
  type PetshopHubSignals,
} from '../wire.ts'

/** Empty console before the first successful RPC. */
export const EMPTY_PETSHOP_HUB_SIGNALS: PetshopHubSignals = {
  signals: [],
  lastStage: null,
  lastError: null,
}

/** Milliseconds between `signals` polls. */
const PETSHOP_HUB_POLL_MS = 400

/** Minimal RPC caller the signal poll needs. */
export interface PetshopHubRpc {
  /**
   * Call one endpoint on a dedicated channel.
   * @param channel - absolute channel.
   * @param endpoint - channel-relative method.
   * @param payload - JSON payload.
   * @param signal - optional cancellation.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string } }>
}

/** Snapshot source the panel injects as `hooks.signals`. */
export interface PetshopHubSignalsSource extends HostObservable<PetshopHubSignals> {
  /** Stop the poll timer. */
  dispose: () => void
}

/**
 * Hydrate the signal console over RPC and poll for later hops.
 * @param rpc - Connection generic RPC caller.
 * @param intervalMs - poll period; tests pass a large value to skip ticks.
 * @returns source the plugin dispose must close.
 */
export function createPetshopHubSignals(
  rpc: PetshopHubRpc,
  intervalMs: number = PETSHOP_HUB_POLL_MS,
): PetshopHubSignalsSource {
  let snapshot: PetshopHubSignals = EMPTY_PETSHOP_HUB_SIGNALS
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const publish = (next: PetshopHubSignals): void => {
    if (sameSnapshot(snapshot, next)) return
    snapshot = next
    notify()
  }
  const pull = async (): Promise<void> => {
    let result
    try {
      result = await rpc.call(PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT, {})
    } catch {
      return
    }
    if (!result.ok) return
    const parsed = asPetshopHubSignals(result.value)
    if (parsed !== undefined) publish(parsed)
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

function sameSnapshot(left: PetshopHubSignals, right: PetshopHubSignals): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
