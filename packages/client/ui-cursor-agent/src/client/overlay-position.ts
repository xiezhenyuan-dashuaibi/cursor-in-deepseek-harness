/** Viewport-clamped overlay geometry. Default size is 920×720; operators may resize. */

/** Default overlay width in CSS pixels on a large viewport. */
export const OVERLAY_PANEL_MAX_WIDTH = 560
/** Default overlay height in CSS pixels on a large viewport. */
export const OVERLAY_PANEL_MAX_HEIGHT = 400
/** Smallest overlay width in CSS pixels, unless the viewport is narrower. */
export const OVERLAY_PANEL_MIN_WIDTH = 480
/** Smallest overlay height in CSS pixels, unless the viewport is shorter. */
export const OVERLAY_PANEL_MIN_HEIGHT = 320
/** Inset kept between the default overlay and each viewport edge. */
export const OVERLAY_PANEL_MARGIN = 24
/** Edge length of the minimized overlay sprite in CSS pixels. */
export const OVERLAY_SPRITE_SIZE = 52
/** Inset kept between the minimized sprite and each viewport edge. */
export const OVERLAY_SPRITE_MARGIN = 24

/** Left/top of the overlay panel in CSS pixels. */
export interface OverlayPosition {
  left: number
  top: number
}

/** Position and size of the overlay panel in CSS pixels. */
export interface OverlayBox extends OverlayPosition {
  width: number
  height: number
}

/** Window-edge handle that starts a resize. */
export type OverlayResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Every resize handle the overlay paints. */
export const OVERLAY_RESIZE_EDGES: readonly OverlayResizeEdge[] = [
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
]

/**
 * Width and height after applying the min size and the viewport as the max.
 * When the viewport is smaller than a min, that axis uses the viewport.
 * @param width - proposed width.
 * @param height - proposed height.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped width and height.
 */
export function clampOverlaySize(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const minWidth = Math.min(OVERLAY_PANEL_MIN_WIDTH, viewportWidth)
  const minHeight = Math.min(OVERLAY_PANEL_MIN_HEIGHT, viewportHeight)
  return {
    width: Math.min(viewportWidth, Math.max(minWidth, width)),
    height: Math.min(viewportHeight, Math.max(minHeight, height)),
  }
}

/**
 * Size the overlay uses on first paint, matching the previous stylesheet default.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns width and height used to center the first box.
 */
export function overlayPanelSize(
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const inset = OVERLAY_PANEL_MARGIN * 2
  return clampOverlaySize(
    Math.min(OVERLAY_PANEL_MAX_WIDTH, viewportWidth - inset),
    Math.min(OVERLAY_PANEL_MAX_HEIGHT, viewportHeight - inset),
    viewportWidth,
    viewportHeight,
  )
}

/**
 * Keep the overlay fully inside the viewport. A panel larger than the viewport
 * pins to the origin rather than hanging off-screen.
 * @param left - proposed left.
 * @param top - proposed top.
 * @param width - measured panel width.
 * @param height - measured panel height.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped left/top.
 */
export function clampOverlayPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): OverlayPosition {
  const maxLeft = Math.max(0, viewportWidth - width)
  const maxTop = Math.max(0, viewportHeight - height)
  return {
    left: Math.min(maxLeft, Math.max(0, left)),
    top: Math.min(maxTop, Math.max(0, top)),
  }
}

/**
 * Clamp both size and position so the box stays on-screen and at least min-sized.
 * @param box - proposed box.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped box.
 */
export function clampOverlayBox(
  box: OverlayBox,
  viewportWidth: number,
  viewportHeight: number,
): OverlayBox {
  const size = clampOverlaySize(box.width, box.height, viewportWidth, viewportHeight)
  const position = clampOverlayPosition(
    box.left,
    box.top,
    size.width,
    size.height,
    viewportWidth,
    viewportHeight,
  )
  return { ...position, ...size }
}

/**
 * Centered default box for the overlay at a viewport.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped centered box.
 */
export function defaultOverlayBox(
  viewportWidth: number,
  viewportHeight: number,
): OverlayBox {
  const { width, height } = overlayPanelSize(viewportWidth, viewportHeight)
  return clampOverlayBox(
    {
      left: (viewportWidth - width) / 2,
      top: (viewportHeight - height) / 2,
      width,
      height,
    },
    viewportWidth,
    viewportHeight,
  )
}

/**
 * Bottom-right default box for the minimized overlay sprite.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped sprite box.
 */
export function defaultSpriteBox(
  viewportWidth: number,
  viewportHeight: number,
): OverlayBox {
  const size = Math.min(OVERLAY_SPRITE_SIZE, viewportWidth, viewportHeight)
  return clampSpriteBox(
    {
      left: viewportWidth - size - OVERLAY_SPRITE_MARGIN,
      top: viewportHeight - size - OVERLAY_SPRITE_MARGIN,
      width: size,
      height: size,
    },
    viewportWidth,
    viewportHeight,
  )
}

/**
 * Keep a minimized sprite on-screen at a fixed edge length.
 * Does not apply the expanded panel min size.
 * @param box - proposed sprite box (size is forced to the sprite edge).
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped sprite box.
 */
export function clampSpriteBox(
  box: OverlayBox,
  viewportWidth: number,
  viewportHeight: number,
): OverlayBox {
  const size = Math.min(OVERLAY_SPRITE_SIZE, viewportWidth, viewportHeight)
  const position = clampOverlayPosition(
    box.left,
    box.top,
    size,
    size,
    viewportWidth,
    viewportHeight,
  )
  return { ...position, width: size, height: size }
}

/**
 * Centered default placement for the overlay at a viewport.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped centered left/top.
 */
export function defaultOverlayPosition(
  viewportWidth: number,
  viewportHeight: number,
): OverlayPosition {
  const { left, top } = defaultOverlayBox(viewportWidth, viewportHeight)
  return { left, top }
}

function edgeAxis(edge: OverlayResizeEdge): {
  west: boolean
  east: boolean
  north: boolean
  south: boolean
} {
  return {
    west: edge === 'w' || edge === 'nw' || edge === 'sw',
    east: edge === 'e' || edge === 'ne' || edge === 'se',
    north: edge === 'n' || edge === 'ne' || edge === 'nw',
    south: edge === 's' || edge === 'se' || edge === 'sw',
  }
}

/**
 * Apply one pointer delta to a resize that started at `start`. The opposite
 * edge stays put unless a min-size or viewport clamp has to move it.
 * @param edge - handle that captured the pointer.
 * @param start - box at pointer-down.
 * @param dx - `clientX` minus the pointer-down origin.
 * @param dy - `clientY` minus the pointer-down origin.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns clamped box after the delta.
 */
export function resizeOverlayBox(
  edge: OverlayResizeEdge,
  start: OverlayBox,
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number,
): OverlayBox {
  const axis = edgeAxis(edge)
  const minWidth = Math.min(OVERLAY_PANEL_MIN_WIDTH, viewportWidth)
  const minHeight = Math.min(OVERLAY_PANEL_MIN_HEIGHT, viewportHeight)
  const startRight = start.left + start.width
  const startBottom = start.top + start.height
  let left = start.left
  let top = start.top
  let right = startRight
  let bottom = startBottom
  if (axis.west) left = start.left + dx
  if (axis.east) right = startRight + dx
  if (axis.north) top = start.top + dy
  if (axis.south) bottom = startBottom + dy
  left = Math.max(0, left)
  top = Math.max(0, top)
  right = Math.min(viewportWidth, right)
  bottom = Math.min(viewportHeight, bottom)
  if (axis.west) left = Math.min(left, right - minWidth)
  if (axis.east) right = Math.max(right, left + minWidth)
  if (axis.north) top = Math.min(top, bottom - minHeight)
  if (axis.south) bottom = Math.max(bottom, top + minHeight)
  left = Math.max(0, left)
  top = Math.max(0, top)
  right = Math.min(viewportWidth, right)
  bottom = Math.min(viewportHeight, bottom)
  return {
    left,
    top,
    width: Math.max(minWidth, right - left),
    height: Math.max(minHeight, bottom - top),
  }
}
