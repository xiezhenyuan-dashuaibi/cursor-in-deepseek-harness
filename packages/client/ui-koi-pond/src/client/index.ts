/**
 * Desktop page: occupies overlay-desktop.body. No id / order.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-overlay-desktop/client'
import { Page } from './Page.tsx'
import { en, NS, zh, type OverlayPageKey } from './locales.ts'

export type { OverlayPageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for this overlay-desktop.body page. */
    'overlay-koi-pond': OverlayPageKey
  }
}

/** Required services: the desktop body slot and this page's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay-desktop.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-koi-pond: dictionaries')
  ctx.slots.inject('overlay-desktop.body', () => ctx.slots.register(
    { name: 'overlay-desktop.body', locale: NS },
    Page,
  ))
}
