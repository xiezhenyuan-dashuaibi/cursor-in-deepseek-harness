/**
 * Overlay desktop board: one `overlay-desktop.body` occupant on
 * `shell.overlay` id `overlay-desktop` at order 10 — below the Cursor window
 * (50) and the card desk (220). Never `root`, never `cursor-agent`, never
 * `overlay-card.body`. Does not join `overlayStack`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import './contract/slots.ts'
import { DesktopBoard } from './DesktopBoard.tsx'
import { en, NS, zh, type OverlayDesktopKey } from './locales.ts'

export type { OverlayDesktopKey } from './locales.ts'
export type { OverlayDesktopBodyOwner } from './contract/slots.ts'
export {
  OVERLAY_DESKTOP_BODY_SLOT, OVERLAY_DESKTOP_PACKAGE_NAME,
} from '../desktop.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the overlay desktop empty fallback. */
    'overlay-desktop': OverlayDesktopKey
  }
}

/** Required services: the overlay slot and this board's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay desktop board.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-overlay-desktop: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'overlay-desktop',
      order: 10,
      locale: NS,
      children: { 'overlay-desktop.body': { kind: 'single', scope: 'root' } },
    },
    DesktopBoard,
  ))
}
