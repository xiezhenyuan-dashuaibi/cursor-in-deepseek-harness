/**
 * Drag offset math for overlay-shaped.body seats. Occupant CSS keeps the
 * rest pose; the host translates by this pixel offset and keeps the
 * occupant axis-aligned box on the playable board.
 */

/** Pixel translation from an occupant's authored rest pose. */
export type ShapedOffset = {
  /** Horizontal translation in CSS pixels. */
  readonly x: number
  /** Vertical translation in CSS pixels. */
  readonly y: number
}

/** Occupant painted box in board-local pixels at offset `{ x: 0, y: 0 }`. */
export type ShapedBox = {
  /** Left edge in board-local CSS pixels. */
  readonly x: number
  /** Top edge in board-local CSS pixels. */
  readonly y: number
  /** Width in CSS pixels. */
  readonly width: number
  /** Height in CSS pixels. */
  readonly height: number
}

/** Pixel size of the overlay playable board (not `window.innerWidth`). */
export type ShapedCanvasSize = {
  /** Board width in CSS pixels. */
  readonly width: number
  /** Board height in CSS pixels. */
  readonly height: number
}

/** Viewport or element box used to recover a rest pose from a live rect. */
export type ShapedViewportBox = {
  /** Left edge in CSS pixels. */
  readonly left: number
  /** Top edge in CSS pixels. */
  readonly top: number
  /** Width in CSS pixels. */
  readonly width: number
  /** Height in CSS pixels. */
  readonly height: number
}

/** Movement below this on a seat is a click, not a drag. */
export const SHAPED_CLICK_SLOP = 6

/**
 * True when pointer travel stays inside the click slop.
 * @param dx - pointer delta X.
 * @param dy - pointer delta Y.
 */
export function isShapedClick(dx: number, dy: number): boolean {
  return (dx * dx) + (dy * dy) <= SHAPED_CLICK_SLOP * SHAPED_CLICK_SLOP
}

/**
 * Offset after a pointer move from the drag origin. The seat then clamps
 * through {@link clampShapedOffset}.
 * @param origin - offset at pointer down.
 * @param dx - pointer delta X.
 * @param dy - pointer delta Y.
 */
export function offsetAfterMove(origin: ShapedOffset, dx: number, dy: number): ShapedOffset {
  return { x: origin.x + dx, y: origin.y + dy }
}

/**
 * Smallest viewport box covering every input. Empty input is `undefined`.
 * @param boxes - occupant painted boxes (post-translate).
 * @returns the union, or `undefined` when `boxes` is empty.
 */
export function unionViewportBoxes(
  boxes: readonly ShapedViewportBox[],
): ShapedViewportBox | undefined {
  if (boxes.length === 0) return undefined
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const box of boxes) {
    left = Math.min(left, box.left)
    top = Math.min(top, box.top)
    right = Math.max(right, box.left + box.width)
    bottom = Math.max(bottom, box.top + box.height)
  }
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Rest-pose box from a live content rect, a board rect, and the current
 * translation. The seat is full-board; the painted silhouette is the occupant
 * box, not a `display: contents` slot anchor.
 * @param board - playable board viewport box.
 * @param content - occupant painted viewport box (post-translate).
 * @param offset - translation currently applied to the seat.
 */
export function restBoxFromRects(
  board: ShapedViewportBox,
  content: ShapedViewportBox,
  offset: ShapedOffset,
): ShapedBox {
  return {
    x: content.left - board.left - offset.x,
    y: content.top - board.top - offset.y,
    width: content.width,
    height: content.height,
  }
}

/**
 * Keep the occupant box inside the playable board. A silhouette larger than
 * the board pins to the top-left of the canvas (the overflowing edges stay
 * clipped). A non-positive canvas leaves `offset` unchanged.
 * @param offset - proposed translation.
 * @param rest - occupant box at offset zero, board-local.
 * @param canvas - playable board size.
 */
export function clampShapedOffset(
  offset: ShapedOffset,
  rest: ShapedBox,
  canvas: ShapedCanvasSize,
): ShapedOffset {
  if (!(canvas.width > 0) || !(canvas.height > 0)) return offset
  return {
    x: clampAxis(offset.x, -rest.x, canvas.width - rest.x - rest.width),
    y: clampAxis(offset.y, -rest.y, canvas.height - rest.y - rest.height),
  }
}

/**
 * True when two offsets are identical.
 * @param left - first offset.
 * @param right - second offset.
 */
export function sameShapedOffset(left: ShapedOffset, right: ShapedOffset): boolean {
  return left.x === right.x && left.y === right.y
}

/**
 * True when two canvas sizes are identical.
 * @param left - first size.
 * @param right - second size.
 */
export function sameShapedCanvas(left: ShapedCanvasSize, right: ShapedCanvasSize): boolean {
  return left.width === right.width && left.height === right.height
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(min, value), max)
}
