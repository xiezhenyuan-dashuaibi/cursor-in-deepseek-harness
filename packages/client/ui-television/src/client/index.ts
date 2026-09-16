/**
 * Overlay television: occupies `shell.overlay` id `television` at order 180.
 * Never `root`, never `cursor-agent`, never `overlay-card.body`, never
 * `overlay-desktop.body`. No `dsh.client.overlayBody`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { Television } from './Television.tsx'
import { en, NS, zh, type TelevisionKey } from './locales.ts'

export type { TelevisionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the CRT television floater. */
    'overlay-television': TelevisionKey
  }
}

/** Required services: the overlay list slot and this set's copy. */
export const inject = ['slots', 'locale']

/** Slot id on `shell.overlay`; not the Loader id. */
const OVERLAY_TELEVISION_ID = 'television'

/**
 * Client plugin body: dictionaries and the television fiber.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-television: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: OVERLAY_TELEVISION_ID,
      order: 180,
      locale: NS,
    },
    Television,
  ))
}
