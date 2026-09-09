/**
 * Neighborhood barbershop landing page: occupies `overlay-card.body`. No `id` / `order`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-float-window/client'
import { Page } from './Page.tsx'
import { en, NS, zh, type OverlayBarberKey } from './locales.ts'

export type { OverlayBarberKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the neighborhood barbershop landing page. */
    'overlay-barber': OverlayBarberKey
  }
}

/** Required services: the card body slot and this page's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay-card.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-barber: dictionaries')
  ctx.slots.inject('overlay-card.body', () => ctx.slots.register(
    { name: 'overlay-card.body', locale: NS },
    Page,
  ))
}
