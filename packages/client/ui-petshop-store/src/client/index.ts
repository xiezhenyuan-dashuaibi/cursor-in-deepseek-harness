/**
 * Booking-ledger panel: occupies overlay-card-4.body. No id / order.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-float-window/client'
import { Page } from './Page.tsx'
import { createPetshopStoreLedger } from './poll.ts'
import type { PetshopStoreInjected } from './face.ts'
import { en, NS, zh, type OverlayPetshopStoreKey } from './locales.ts'

export type { OverlayPetshopStoreKey } from './locales.ts'
export type { PetshopStoreInjected } from './face.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the booking-ledger overlay panel. */
    'overlay-petshop-store': OverlayPetshopStoreKey
  }
}

/** Required services: the card body slot, copy, and Connection RPC. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Client plugin body: dictionaries, ledger poll, and overlay-card-4.body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-petshop-store: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const ledger = createPetshopStoreLedger(connection.rpc)
  ctx.effect(() => () => ledger.dispose(), 'ui-petshop-store: close ledger poll')
  ctx.slots.inject('overlay-card-4.body', () => ctx.slots.register(
    {
      name: 'overlay-card-4.body',
      locale: NS,
      inject: (): PetshopStoreInjected => ({ hooks: { ledger } }),
    },
    Page,
  ))
}
