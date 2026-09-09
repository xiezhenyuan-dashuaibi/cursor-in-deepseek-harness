/**
 * In-memory signal log and `book` dispatch. Host-only.
 */

import { randomUUID } from 'node:crypto'
import {
  parsePetshopHubDraft, PETSHOP_HUB_BOOK_ENDPOINT, PETSHOP_HUB_SIGNALS_ENDPOINT,
  PETSHOP_HUB_SIGNALS_MAX, type PetshopHubAck, type PetshopHubDraft, type PetshopHubSignal,
  type PetshopHubSignals, type PetshopHubStage,
} from './wire.ts'

/** Cordis `petshopStore` insert the hub calls. Duplicated; do not import the store package. */
export interface PetshopHubStore {
  /**
   * Persist one booking.
   * @param draft - validated homepage fields.
   * @returns the stored row id and createdAt plus the draft fields.
   */
  insert: (draft: PetshopHubDraft) => { id: string; createdAt: string }
}

/** Result of one hub RPC dispatch. Discriminated to match Connection `RpcResult`. */
export type PetshopHubRpcResult =
  | { ok: true; value: PetshopHubAck | PetshopHubSignals }
  | { ok: false; error: { code: 'bad-request'; message: string; details: { issues: never[] } } }
  | { ok: false; error: { code: 'internal'; message: string; details: {} } }

/**
 * Create the hub runtime: signal log plus book/signals dispatch.
 * @param store - Cordis ledger insert.
 * @returns dispatch and a snapshot reader.
 */
export function createPetshopHub(store: PetshopHubStore): {
  /** Handle one `/petshop-hub` endpoint. */
  dispatch: (endpoint: string, payload: unknown) => PetshopHubRpcResult
  /** Copy of the current signal snapshot. */
  snapshot: () => PetshopHubSignals
} {
  const signals: PetshopHubSignal[] = []
  let lastStage: PetshopHubStage | null = null
  let lastError: string | null = null

  const push = (stage: PetshopHubStage, detail: string): void => {
    lastStage = stage
    lastError = stage === 'failed' ? detail : null
    signals.unshift({
      id: randomUUID(),
      at: new Date().toISOString(),
      stage,
      detail,
    })
    if (signals.length > PETSHOP_HUB_SIGNALS_MAX) signals.length = PETSHOP_HUB_SIGNALS_MAX
  }

  const snapshot = (): PetshopHubSignals => ({
    signals: [...signals],
    lastStage,
    lastError,
  })

  const book = (payload: unknown): PetshopHubRpcResult => {
    const draft = parsePetshopHubDraft(payload)
    if (draft === undefined) {
      push('failed', 'booking payload rejected')
      return {
        ok: false,
        error: {
          code: 'bad-request',
          message: 'petshop-hub: booking payload rejected',
          details: { issues: [] },
        },
      }
    }
    push('home-in', `${draft.owner} · ${draft.dogName}`)
    push('store-out', draft.packageId)
    try {
      const row = store.insert(draft)
      push('store-ok', row.id)
      push('home-ack', row.id)
      return { ok: true, value: { id: row.id, createdAt: row.createdAt } }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      push('failed', message)
      return { ok: false, error: { code: 'internal', message, details: {} } }
    }
  }

  const dispatch = (endpoint: string, payload: unknown): PetshopHubRpcResult => {
    if (endpoint === PETSHOP_HUB_BOOK_ENDPOINT) return book(payload)
    if (endpoint === PETSHOP_HUB_SIGNALS_ENDPOINT) return { ok: true, value: snapshot() }
    return {
      ok: false,
      error: {
        code: 'bad-request',
        message: `unknown petshop-hub endpoint ${endpoint}`,
        details: { issues: [] },
      },
    }
  }

  return { dispatch, snapshot }
}
