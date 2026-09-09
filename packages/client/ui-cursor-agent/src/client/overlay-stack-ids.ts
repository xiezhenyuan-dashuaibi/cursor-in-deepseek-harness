/**
 * Overlay-stack occupant id and z-index math for the Cursor window.
 * Duplicated from `@deepseek-ai/dsh-client-ui-layout` — client plugins must
 * not value-import another plugin's symbols.
 */

/** Occupant id this window raises on `ctx.overlayStack`. */
export const OVERLAY_STACK_CURSOR_ID = 'cursor-agent'

/** Inline `z-index` base shared by overlay occupants in the shell layer. */
export const OVERLAY_STACK_BASE_Z = 40

/**
 * Inline `z-index` for the minimized Cursor sprite. Always above
 * {@link overlayStackZIndex} (`40 + index` for the two overlay occupants).
 */
export const OVERLAY_STACK_SPRITE_Z = 80

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
