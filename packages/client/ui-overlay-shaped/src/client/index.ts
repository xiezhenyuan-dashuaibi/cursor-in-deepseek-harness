/**
 * Overlay shaped board: concurrent `overlay-shaped.body` occupants on
 * `shell.overlay` id `overlay-shaped` at order 180 — above the desktop (10)
 * and Cursor (50), below the card desk (220). Never `root`, never
 * `cursor-agent`, never `overlay-card.body`, never `overlay-desktop.body`.
 * Does not join `overlayStack`. Paints no product chrome. Host seats own
 * drag, persisted offset, intra-board raise, hide-while-mounted, and keeping
 * the occupant box on the playable board.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import './contract/slots.ts'
import { createBodyIdsSource } from './body-ids.ts'
import {
  createHiddenRegistrantsSource, type HiddenRegistrantsRpc,
} from './hidden-registrants.ts'
import { ShapedBoard } from './ShapedBoard.tsx'
import type { OverlayShapedInjected } from './contract/slots.ts'

export type { OverlayShapedBodyOwner, OverlayShapedInjected } from './contract/slots.ts'
export type { ShapedBodyOccupant } from './body-ids.ts'
export {
  OVERLAY_SHAPED_BODY_SLOT, OVERLAY_SHAPED_PACKAGE_NAME,
} from '../shaped.ts'

/** Required service: the overlay slot this board occupies. */
export const inject = ['slots']

type ConnectionHolder = ClientContext & {
  connection: { rpc: HiddenRegistrantsRpc }
}

/**
 * Client plugin body: the transparent shaped board.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const bodyIds = createBodyIdsSource(ctx.slots)
  const hiddenRegistrants = createHiddenRegistrantsSource()
  ctx.inject(['connection'], (wired) => {
    const holder = wired as ConnectionHolder
    holder.effect(
      () => hiddenRegistrants.attach(holder.connection.rpc),
      'overlay-shaped: hidden poll',
    )
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'overlay-shaped',
      order: 180,
      children: { 'overlay-shaped.body': { kind: 'list', scope: 'root' } },
      inject: (): OverlayShapedInjected => ({
        hooks: { bodyIds, hiddenRegistrants },
      }),
    },
    ShapedBoard,
  ))
}
