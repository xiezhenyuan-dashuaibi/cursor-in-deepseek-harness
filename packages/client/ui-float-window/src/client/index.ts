/**
 * Overlay card desk: windows on `shell.overlay` that declare
 * `overlay-card.body` (seat 1) and `overlay-card-N.body` for later seats.
 * Id `overlay-card` must not reuse `root` or `cursor-agent`.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { OVERLAY_STACK_DESK_ID } from './overlay-stack-ids.ts'
import {
  OVERLAY_CARD_NUMBERS, overlayCardBodySlot, overlayCardTrailingSlot,
} from '../instances.ts'
import type { OverlayCardInjected } from './contract/slots.ts'
import './contract/slots.ts'
import { OverlayDesk } from './OverlayDesk.tsx'
import { readPersistedCardFrames } from './frame-storage.ts'
import { createOverlayCardRoster } from './roster.ts'
import { createOverlayDeskStore } from './stores.ts'
import { en, NS, zh, type OverlayCardKey } from './locales.ts'

export type { OverlayCardKey } from './locales.ts'
export type {
  OverlayCardBodyOwner, OverlayCardChromeTrailingOwner, OverlayCardInjected,
  OverlayCardPreferredFrame,
} from './contract/slots.ts'
export {
  overlayCardBodySlot, overlayCardTrailingSlot, OVERLAY_CARD_MAX, OVERLAY_CARD_NUMBERS,
  OVERLAY_CARD_PACKAGE_NAME,
} from '../instances.ts'
export type {
  OverlayCardBodySlot, OverlayCardChildSlot, OverlayCardNumber, OverlayCardRoster,
  OverlayCardSpec, OverlayCardTrailingSlot,
} from '../instances.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Compact chrome copy for overlay cards (`{title} {id}`). */
    'overlay-card': OverlayCardKey
  }
}

/** Child-slot table the desk predeclares so adding a card does not remount. */
function overlayCardSlotChildren(): Record<string, { kind: 'single' | 'list'; scope: 'root' }> {
  const children: Record<string, { kind: 'single' | 'list'; scope: 'root' }> = {}
  for (const n of OVERLAY_CARD_NUMBERS) {
    children[overlayCardBodySlot(n)] = { kind: 'single', scope: 'root' }
    children[overlayCardTrailingSlot(n)] = { kind: 'list', scope: 'root' }
  }
  return children
}

/** Required services: the overlay slot, card copy, Connection RPC, overlay stack. */
export const inject = ['slots', 'locale', 'connection', 'overlayStack']

/**
 * Client plugin body: dictionaries, roster poll, and the overlay card desk.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-float-window: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const roster = createOverlayCardRoster(connection.rpc)
  ctx.effect(() => () => roster.dispose(), 'ui-float-window: close roster poll')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'overlay-card',
      order: 220,
      locale: NS,
      store: () => createOverlayDeskStore(readPersistedCardFrames()),
      children: overlayCardSlotChildren(),
      inject: (): OverlayCardInjected => ({
        raiseDesk: () => { ctx.overlayStack.raise(OVERLAY_STACK_DESK_ID) },
        hooks: {
          roster,
          overlayStack: ctx.overlayStack.source,
        },
      }),
    },
    OverlayDesk,
  ))
}
