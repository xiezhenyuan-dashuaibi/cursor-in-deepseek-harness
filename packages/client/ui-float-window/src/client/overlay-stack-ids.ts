/**
 * Overlay-stack occupant id and z-index math for the card desk.
 * Duplicated from `@deepseek-ai/dsh-client-ui-layout` — client plugins must
 * not value-import another plugin's symbols.
 */

/** Occupant id this desk raises on `ctx.overlayStack`. */
export const OVERLAY_STACK_DESK_ID = 'overlay-card'

/** Inline `z-index` base shared by overlay occupants in the shell layer. */
export const OVERLAY_STACK_BASE_Z = 40

/**
 * Inline z-index for one overlay occupant.
 * @param front - `ctx.overlayStack` snapshot `front`, back to front.
 * @param id - occupant id.
 * @returns `BASE + index`, or `BASE` when the id has not been raised yet.
 */
export function overlayStackZIndex(front: readonly string[], id: string): number {
  const index = front.indexOf(id)
  if (index === -1) return OVERLAY_STACK_BASE_Z
  return OVERLAY_STACK_BASE_Z + index
}
