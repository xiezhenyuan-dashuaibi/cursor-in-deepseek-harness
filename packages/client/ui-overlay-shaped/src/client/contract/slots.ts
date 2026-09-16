/**
 * SlotMap contract for the reusable overlay shaped board.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShapedBodyOccupant } from '../body-ids.ts'

export {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Concurrent arbitrary-shape overlay occupants. Occupied by many page
     * plugins at once. Declared by `overlay-shaped`; do not occupy `root`,
     * `overlay-card.body`, or `overlay-desktop.body`.
     */
    'overlay-shaped.body': { kind: 'list'; scope: 'root'; owner: OverlayShapedBodyOwner }
  }
}

/** Owner share rendered into the shaped body slot (the board supplies nothing). */
export type OverlayShapedBodyOwner = {
  /** Marker field: shaped body owner props are intentionally empty. */
  children?: never
}

/** Inject face the board registers: occupant list ids and hidden npm names. */
export type OverlayShapedInjected = {
  /** Selector-hook sources. */
  hooks: {
    /** `overlay-shaped.body` occupants, registration order. */
    bodyIds: HostObservable<readonly ShapedBodyOccupant[]>
    /** npm names whose silhouettes stay mounted but invisible. */
    hiddenRegistrants: HostObservable<readonly string[]>
  }
}
