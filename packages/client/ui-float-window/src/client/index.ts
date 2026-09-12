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
  overlayCardBodySlot, overlayCardDeclaredSeatCount, overlayCardRosterMaxSeat,
  overlayCardTrailingSlot,
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
  overlayCardBodySlot, overlayCardTrailingSlot, OVERLAY_CARD_PACKAGE_NAME,
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

/** Child-slot table OverlayDesk predeclares through seat `maxSeat`. */
function overlayCardSlotChildren(maxSeat: number): Record<string, { kind: 'single' | 'list'; scope: 'root' }> {
  const children: Record<string, { kind: 'single' | 'list'; scope: 'root' }> = {}
  for (let n = 1; n <= maxSeat; n += 1) {
    children[overlayCardBodySlot(n)] = { kind: 'single', scope: 'root' }
    children[overlayCardTrailingSlot(n)] = { kind: 'list', scope: 'root' }
  }
  return children
}

/** Required services: the overlay slot, card copy, Connection RPC, overlay stack. */
export const inject = ['slots', 'locale', 'connection', 'overlayStack']

/**
 * Client plugin body: dictionaries, roster poll, and the overlay card desk.
 * OverlayDesk children grow with the roster high-water mark so a later insert
 * does not remount existing windows until the predeclared block is crossed.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-float-window: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const roster = createOverlayCardRoster(connection.rpc)
  ctx.effect(() => () => roster.dispose(), 'ui-float-window: close roster poll')
  ctx.slots.inject('shell.overlay', () => {
    const store = createOverlayDeskStore(readPersistedCardFrames())
    let declaredSeats = 0
    let disposeDesk: (() => void) | undefined
    const mount = (seats: number): void => {
      if (seats === declaredSeats && disposeDesk !== undefined) return
      disposeDesk?.()
      declaredSeats = seats
      disposeDesk = ctx.slots.register(
        {
          name: 'shell.overlay',
          id: 'overlay-card',
          order: 220,
          locale: NS,
          store,
          children: overlayCardSlotChildren(seats),
          inject: (): OverlayCardInjected => ({
            raiseDesk: () => { ctx.overlayStack.raise(OVERLAY_STACK_DESK_ID) },
            hooks: {
              roster,
              overlayStack: ctx.overlayStack.source,
            },
          }),
        },
        OverlayDesk,
      )
    }
    const sync = (): void => {
      mount(overlayCardDeclaredSeatCount(overlayCardRosterMaxSeat(roster.getSnapshot().cards)))
    }
    sync()
    const unsub = roster.subscribe(sync)
    return () => {
      unsub()
      disposeDesk?.()
    }
  })
}
