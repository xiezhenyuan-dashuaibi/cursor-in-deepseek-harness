/**
 * Booking-hub host: receives homepage `book`, writes through Cordis
 * `petshopStore`, and serves the signal log on `/petshop-hub`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { createPetshopHub, type PetshopHubStore } from './hub.ts'
import { PETSHOP_HUB_RPC_CHANNEL } from './wire.ts'

export {
  asPetshopHubAck, asPetshopHubSignals, parsePetshopHubDraft, PETSHOP_HUB_BOOK_ENDPOINT,
  PETSHOP_HUB_PACKAGE_IDS, PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT,
  PETSHOP_HUB_SIGNALS_MAX, PETSHOP_HUB_SLOT_IDS,
} from './wire.ts'
export type {
  PetshopHubAck, PetshopHubDraft, PetshopHubPackageId, PetshopHubSignal, PetshopHubSignals,
  PetshopHubSlotId, PetshopHubStage,
} from './wire.ts'
export { createPetshopHub } from './hub.ts'
export type { PetshopHubRpcResult, PetshopHubStore } from './hub.ts'

/** Required services: Connection RPC and the booking ledger. */
export const inject = ['connection', 'petshopStore']

/**
 * Register `/petshop-hub` `book` and `signals`.
 * @param ctx - host plugin context carrying `petshopStore`.
 */
export function apply(ctx: Context): void {
  const store = (ctx as Context & { petshopStore: PetshopHubStore }).petshopStore
  const hub = createPetshopHub(store)
  ctx.effect(
    () => ctx.connection.rpc.handle(
      PETSHOP_HUB_RPC_CHANNEL,
      async (endpoint, payload) => hub.dispatch(endpoint, payload),
      { authority: 'trusted-host' },
    ),
    'petshop-hub RPC',
  )
}
