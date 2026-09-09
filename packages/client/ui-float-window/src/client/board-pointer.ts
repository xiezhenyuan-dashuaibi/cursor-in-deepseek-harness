/** Pointer coordinates in overlay-board pixels. */

/**
 * Convert viewport client coordinates to board-local pixels using an element
 * on or under `[data-overlay-board]`. Window-level gesture listeners pass the
 * card node here because `currentTarget` is the window, not the board.
 * With no board ancestor, client coordinates pass through (fragment tests).
 * @param clientX - viewport X.
 * @param clientY - viewport Y.
 * @param from - an element under the board, or null.
 * @returns board-local x/y.
 */
export function clientOnBoard(
  clientX: number,
  clientY: number,
  from: EventTarget | null | undefined,
): { x: number; y: number } {
  if (from instanceof Element) {
    const board = from.closest('[data-overlay-board]')
    if (board instanceof HTMLElement) {
      const rect = board.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }
  }
  return { x: clientX, y: clientY }
}

/**
 * Convert a pointer event to board-local pixels. `left`/`top` on cards and
 * docked tags are board-local; `clientX`/`clientY` are viewport-local when
 * the board is not at (0, 0).
 * @param event - pointer whose `currentTarget` is on or under the board.
 * @returns board-local x/y.
 */
export function pointerOnBoard(event: {
  readonly currentTarget: EventTarget
  readonly clientX: number
  readonly clientY: number
}): { x: number; y: number } {
  return clientOnBoard(event.clientX, event.clientY, event.currentTarget)
}
