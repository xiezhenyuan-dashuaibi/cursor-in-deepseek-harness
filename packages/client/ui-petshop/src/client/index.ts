/**
 * Pet-grooming booking homepage: occupies overlay-card-2.body. No id / order.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-float-window/client'
import { Page } from './Page.tsx'
import type { PetshopHomeInjected } from './face.ts'
import { postPetshopBooking } from './booking.ts'
import { en, NS, zh, type OverlayPetshopKey } from './locales.ts'

export type { OverlayPetshopKey } from './locales.ts'
export type { PetshopHomeInjected } from './face.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the pet-grooming overlay homepage. */
    'overlay-petshop': OverlayPetshopKey
  }
}

/** Required services: the card body slot, copy, and Connection RPC. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Client plugin body: dictionaries and the overlay-card-2.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-petshop: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.slots.inject('overlay-card-2.body', () => ctx.slots.register(
    {
      name: 'overlay-card-2.body',
      locale: NS,
      inject: (): PetshopHomeInjected => ({
        book: draft => postPetshopBooking(connection.rpc, draft),
      }),
    },
    Page,
  ))
}
