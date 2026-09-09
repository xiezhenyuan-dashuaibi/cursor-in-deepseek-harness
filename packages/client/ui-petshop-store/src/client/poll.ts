/**
 * Browser poll of `/petshop-store` `list`.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  asPetshopStoreList, PETSHOP_STORE_LIST_ENDPOINT, PETSHOP_STORE_RPC_CHANNEL,
  type PetshopStoreList,
} from '../wire.ts'

/** Empty ledger before the first successful RPC. */
export const EMPTY_PETSHOP_STORE_LIST: PetshopStoreList = { rows: [] }

/** Milliseconds between `list` polls. */
const PETSHOP_STORE_POLL_MS = 400

/** Minimal RPC caller the ledger poll needs. */
export interface PetshopStoreRpc {
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

/** Snapshot source the panel injects as `hooks.ledger`. */
export interface PetshopStoreLedgerSource extends HostObservable<PetshopStoreList> {
  /** Stop the poll timer. */
  dispose: () => void
}

/**
 * Hydrate the ledger over RPC and poll for later inserts.
 * @param rpc - Connection generic RPC caller.
 * @param intervalMs - poll period; tests pass a large value to skip ticks.
 * @returns source the plugin dispose must close.
 */
export function createPetshopStoreLedger(
  rpc: PetshopStoreRpc,
  intervalMs: number = PETSHOP_STORE_POLL_MS,
): PetshopStoreLedgerSource {
  let snapshot: PetshopStoreList = EMPTY_PETSHOP_STORE_LIST
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const publish = (next: PetshopStoreList): void => {
    if (sameRows(snapshot.rows, next.rows)) return
    snapshot = next
    notify()
  }
  const pull = async (): Promise<void> => {
    let result
    try {
      result = await rpc.call(PETSHOP_STORE_RPC_CHANNEL, PETSHOP_STORE_LIST_ENDPOINT, {})
    } catch {
      return
    }
    if (!result.ok) return
    const list = asPetshopStoreList(result.value)
    if (list !== undefined) publish(list)
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

function sameRows(
  left: PetshopStoreList['rows'],
  right: PetshopStoreList['rows'],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
