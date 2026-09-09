/**
 * Booking-hub signal panel: occupies overlay-card-3.body. No id / order.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-float-window/client'
import { Page } from './Page.tsx'
import type { PetshopHubInjected } from './face.ts'
import { createPetshopHubSignals } from './poll.ts'
import { en, NS, zh, type OverlayPetshopHubKey } from './locales.ts'

export type { OverlayPetshopHubKey } from './locales.ts'
export type { PetshopHubInjected } from './face.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the booking-hub overlay panel. */
    'overlay-petshop-hub': OverlayPetshopHubKey
  }
}

/** Required services: the card body slot, copy, and Connection RPC. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Client plugin body: dictionaries, signal poll, and overlay-card-3.body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-petshop-hub: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const signals = createPetshopHubSignals(connection.rpc)
  ctx.effect(() => () => signals.dispose(), 'ui-petshop-hub: close signal poll')
  ctx.slots.inject('overlay-card-3.body', () => ctx.slots.register(
    {
      name: 'overlay-card-3.body',
      locale: NS,
      inject: (): PetshopHubInjected => ({ hooks: { signals } }),
    },
    Page,
  ))
}
