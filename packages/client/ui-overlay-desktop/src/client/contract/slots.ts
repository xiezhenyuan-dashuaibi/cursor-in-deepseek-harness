/**
 * SlotMap contract for the reusable overlay desktop board.
 */

export {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Full-viewport desktop product under cards and Cursor. Occupied by one
     * page plugin. Declared by `overlay-desktop`; do not occupy `root` or
     * `overlay-card.body`.
     */
    'overlay-desktop.body': { kind: 'single'; scope: 'root'; owner: OverlayDesktopBodyOwner }
  }
}

/** Owner share rendered into the desktop body slot (the board supplies nothing). */
export type OverlayDesktopBodyOwner = {
  /** Marker field: desktop body owner props are intentionally empty. */
  children?: never
}
