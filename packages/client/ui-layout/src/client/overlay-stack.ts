/**
 * Cross-occupant overlay stacking for `shell.overlay` windows.
 * Card-local `bringToFront` only orders seats inside the desk; this face
 * orders the Cursor window against the whole overlay-card board.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Stacking id of the Cursor conversation window. */
export const OVERLAY_STACK_CURSOR_ID = 'cursor-agent'

/** Stacking id of the overlay-card playable board (every card window). */
export const OVERLAY_STACK_DESK_ID = 'overlay-card'

/** Inline `z-index` base shared by overlay occupants in the shell layer. */
export const OVERLAY_STACK_BASE_Z = 40

/** Snapshot the overlay stack publishes to inject `hooks`. */
export type OverlayStackSnapshot = {
  /** Occupant ids, back to front. */
  readonly front: readonly string[]
}

/**
 * Inline z-index for one overlay occupant.
 * @param front - {@link OverlayStackSnapshot.front}.
 * @param id - occupant id ({@link OVERLAY_STACK_CURSOR_ID} or {@link OVERLAY_STACK_DESK_ID}).
 * @returns `BASE + index`, or `BASE` when the id has not been raised yet.
 */
export function overlayStackZIndex(front: readonly string[], id: string): number {
  const index = front.indexOf(id)
  if (index === -1) return OVERLAY_STACK_BASE_Z
  return OVERLAY_STACK_BASE_Z + index
}

/**
 * The outward overlay-stack face (`ctx.overlayStack`). Test fakes supply
 * {@link raise} and {@link source}.
 */
export interface IOverlayStack {
  /**
   * Move `id` to the front of the overlay layer.
   * @param id - occupant id.
   */
  raise(id: string): void
  /** Observable front list for inject `hooks`. */
  readonly source: HostObservable<OverlayStackSnapshot>
}

/**
 * Overlay stacking controller. Boot order puts the Cursor window in front of
 * the card desk so a first paint is not covered by `z-index: 40` cards.
 */
export class OverlayStackController implements IOverlayStack {
  #snapshot: OverlayStackSnapshot = {
    front: [OVERLAY_STACK_DESK_ID, OVERLAY_STACK_CURSOR_ID],
  }

  readonly #listeners = new Set<() => void>()

  /** Observable front list for inject `hooks`. */
  readonly source: HostObservable<OverlayStackSnapshot> = {
    getSnapshot: () => this.#snapshot,
    subscribe: (listener) => {
      this.#listeners.add(listener)
      return () => { this.#listeners.delete(listener) }
    },
  }

  /**
   * Move `id` to the front of the overlay layer.
   * @param id - occupant id. Empty strings are ignored.
   */
  raise(id: string): void {
    if (id.length === 0) return
    const front = this.#snapshot.front
    if (front[front.length - 1] === id) return
    const next = front.filter(item => item !== id)
    next.push(id)
    this.#snapshot = { front: next }
    for (const listener of [...this.#listeners]) listener()
  }
}
