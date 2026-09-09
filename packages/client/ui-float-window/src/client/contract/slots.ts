/**
 * SlotMap and inject-face contracts for the reusable overlay card desk.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayStackSnapshot } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { OverlayCardRoster } from '../../instances.ts'

/** Opening frame a page occupant requests. Origin is optional; omitted axes keep the current card origin. */
export type OverlayCardPreferredFrame = {
  /** Requested width in CSS pixels. The card clamps to its minimum. */
  width: number
  /** Requested height in CSS pixels. The card clamps to its minimum. */
  height: number
  /** Optional left origin. Omit to keep the current left. */
  x?: number
  /** Optional top origin. Omit to keep the current top. */
  y?: number
}

/** Owner share rendered into a card body slot. */
export type OverlayCardBodyOwner = {
  /**
   * Ask this card to adopt this opening frame. Call once on mount.
   * Does not move other cards. Ignored after a stored frame, the first adopt,
   * or a user drag/resize so a remount does not reset the window.
   * @param frame - preferred size, and optionally origin.
   */
  preferFrame: (frame: OverlayCardPreferredFrame) => void
}

/** Owner share of a trailing chrome list (the card supplies nothing). */
export type OverlayCardChromeTrailingOwner = {
  /** Marker field: trailing owner props are intentionally empty. */
  children?: never
}

export {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Body of the movable overlay card. Occupied by a page plugin.
     * The page is a designed webpage; call `preferFrame` on mount for opening size.
     * Declared by `overlay-card`; do not occupy `root` or `cursor-agent`.
     */
    'overlay-card.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 2. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-2.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 3. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-3.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 4. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-4.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 5. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-5.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 6. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-6.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 7. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-7.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Body of overlay card seat 8. Same owner share as `overlay-card.body`.
     * Exists while that numbered card is mounted.
     */
    'overlay-card-8.body': { kind: 'single'; scope: 'root'; owner: OverlayCardBodyOwner }
    /**
     * Extra trailing controls on the default compact title bar.
     * Built-in 缩小 is chrome on OverlayCard, not this slot.
     * Pointer events here do not start a card drag; they still raise the window.
     * Absent occupants leave the region blank. A tall branded title bar is an
     * edit of OverlayCard, not this slot. Declared by `overlay-card`.
     */
    'overlay-card.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 2. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-2.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 3. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-3.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 4. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-4.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 5. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-5.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 6. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-6.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 7. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-7.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
    /**
     * Trailing chrome list of overlay card seat 8. Same contract as
     * `overlay-card.chrome.trailing`. Exists while that numbered card is mounted.
     */
    'overlay-card-8.chrome.trailing': { kind: 'list'; scope: 'root'; owner: OverlayCardChromeTrailingOwner }
  }
}

/** Inject face: live roster plus overlay-stack raise for the card desk. */
export interface OverlayCardInjected {
  /** Raise the overlay-card board in `ctx.overlayStack`. */
  raiseDesk: () => void
  hooks: {
    /** Card specs currently listed; RPC poll of `instances.list`. */
    roster: HostObservable<OverlayCardRoster>
    /** Cursor window vs this desk in `shell.overlay`. */
    overlayStack: HostObservable<OverlayStackSnapshot>
  }
}
