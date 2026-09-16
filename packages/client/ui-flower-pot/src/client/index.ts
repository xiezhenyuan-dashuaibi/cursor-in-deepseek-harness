/**
 * Flower pot: occupies overlay-shaped.body. List id `flower-pot`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-overlay-shaped/client'
import { FlowerPot } from './FlowerPot.tsx'
import { en, NS, zh, type FlowerPotKey } from './locales.ts'

export type { FlowerPotKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for this overlay-shaped.body pot. */
    'overlay-flower-pot': FlowerPotKey
  }
}

/** Required services: the shaped body slot and this pot's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay-shaped.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-flower-pot: dictionaries')
  ctx.slots.inject('overlay-shaped.body', () => ctx.slots.register(
    { name: 'overlay-shaped.body', id: 'flower-pot', order: 10, locale: NS },
    FlowerPot,
  ))
}
