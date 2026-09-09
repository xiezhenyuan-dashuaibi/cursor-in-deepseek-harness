/**
 * Booking-ledger host: SQLite under the Harness home, Cordis `petshopStore`,
 * and `/petshop-store` `list` for the overlay panel.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { openPetshopLedger, resolvePetshopStorePath } from './ledger.ts'
import {
  PETSHOP_STORE_LIST_ENDPOINT, PETSHOP_STORE_RPC_CHANNEL,
} from './wire.ts'

export {
  asPetshopBookingRow, asPetshopPackageId, asPetshopSlotId, asPetshopStoreList,
  PETSHOP_PACKAGE_IDS, PETSHOP_SLOT_IDS, PETSHOP_STORE_LIST_ENDPOINT,
  PETSHOP_STORE_RPC_CHANNEL,
} from './wire.ts'
export type {
  PetshopBookingDraft, PetshopBookingRow, PetshopPackageId, PetshopSlotId,
  PetshopStoreList,
} from './wire.ts'
export {
  openPetshopLedger, PETSHOP_STORE_FILE, resolvePetshopStorePath,
} from './ledger.ts'
export type { PetshopStoreApi } from './ledger.ts'

/** Optional sqlite path for tests. */
export interface PetshopStoreHostOptions {
  /** Absolute database path. Omitted uses `$DSH_HOME/petshop-store.sqlite`. */
  databasePath?: string
}

/** Required service: Connection RPC registry. */
export const inject = ['connection']

/**
 * Provide `petshopStore` and register `/petshop-store`.
 * @param ctx - host plugin context.
 * @param options - optional database path override.
 */
export function apply(ctx: Context, options?: PetshopStoreHostOptions): void {
  const ledger = openPetshopLedger(resolvePetshopStorePath(options?.databasePath))
  ctx.provide('petshopStore', ledger)
  ctx.effect(() => () => { ledger.close() }, 'ui-petshop-store: close sqlite')
  ctx.effect(
    () => ctx.connection.rpc.handle(
      PETSHOP_STORE_RPC_CHANNEL,
      async (endpoint) => {
        if (endpoint !== PETSHOP_STORE_LIST_ENDPOINT) {
          return {
            ok: false,
            error: {
              code: 'bad-request',
              message: `unknown petshop-store endpoint ${endpoint}`,
              details: { issues: [] },
            },
          }
        }
        return { ok: true, value: { rows: ledger.list() } }
      },
      { authority: 'trusted-host' },
    ),
    'petshop-store RPC',
  )
}
