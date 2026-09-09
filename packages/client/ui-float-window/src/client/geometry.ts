/**
 * Overlay card geometry: grab-strip clamps and edge resize. Pure functions so
 * pointer handlers, the desk store, and tests share one rule.
 */

/** Which edge or corner the pointer captured. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Pixel frame of the overlay card. */
export type OverlayCardFrame = {
  x: number
  y: number
  width: number
  height: number
}

/** Pixel size of the overlay playable board (not `window.innerWidth`). */
export type OverlayCanvasSize = {
  width: number
  height: number
}

/** Smallest card that still hosts a landing page. */
export const MIN_WIDTH = 360
/** Smallest card height that still hosts a landing page. */
export const MIN_HEIGHT = 280
/**
 * Title-bar height in CSS pixels. Keep `OverlayCard.module.css` `.header`
 * `height` in sync.
 */
export const TITLE_BAR_HEIGHT = 36
/** Minimum title-bar strip that must stay on the playable board. */
export const MIN_GRAB_WIDTH = 120
/** Desk canvas until `OverlayDesk` measures the board. */
export const DEFAULT_CANVAS: OverlayCanvasSize = { width: 1280, height: 800 }

/** Board edge a minimized card tag can hang from. */
export type OverlayDockEdge = 'top' | 'right' | 'bottom' | 'left'

/** One card's dock: which edge, and pixels along that edge from its start. */
export type OverlayDock = {
  edge: OverlayDockEdge
  along: number
}

/**
 * Ribbon short side (CSS pixels): paper width, along the docked edge.
 * Docking rotates this same ribbon; left/right stay horizontal, top/bottom vertical.
 * Keep `OverlayCard.module.css` `.tag` height / top-bottom width and
 * `--overlay-tag-notch` / `--overlay-tag-tuck` / `--overlay-tag-peek` in sync.
 */
export const TAG_THICKNESS = 32
/** Swallowtail V-cut on the free end that sticks into the board (CSS pixels). */
export const TAG_NOTCH = 10
/** How much of {@link TAG_THICKNESS} sits past the board edge at rest. */
export const TAG_TUCK = TAG_THICKNESS / 2
/** Extra reveal toward the board on hover (CSS pixels). */
export const TAG_PEEK = 12
/** Longest ribbon extent into the board (title; CSS pixels). */
export const TAG_ALONG_MAX = 160
/**
 * Distance from an edge at which a dragged tag magnet-snaps onto it.
 * Farther than this, a release expands the card. Tiny canvases use a quarter
 * of the short side so an inner drop still exists.
 */
export const DOCK_MAGNET_RANGE = 72

const DOCK_EDGES: readonly OverlayDockEdge[] = ['top', 'right', 'bottom', 'left']

/**
 * True when `value` is a board edge a tag can hang from.
 * @param value - unknown persist or pointer payload.
 * @returns whether it is one of the four board edges.
 */
export function isOverlayDockEdge(value: unknown): value is OverlayDockEdge {
  return typeof value === 'string' && (DOCK_EDGES as readonly string[]).includes(value)
}

/**
 * True when `value` is a persistable per-card dock.
 * @param value - unknown persist payload.
 * @returns whether it names an edge and a finite along offset.
 */
export function isOverlayDock(value: unknown): value is OverlayDock {
  if (typeof value !== 'object' || value === null) return false
  const row = value as { edge?: unknown; along?: unknown }
  return isOverlayDockEdge(row.edge) && typeof row.along === 'number' && Number.isFinite(row.along)
}

function edgeDistance(
  edge: OverlayDockEdge,
  x: number,
  y: number,
  canvas: OverlayCanvasSize,
): number {
  if (edge === 'top') return y
  if (edge === 'bottom') return canvas.height - y
  if (edge === 'left') return x
  return canvas.width - x
}

function alongOnEdge(edge: OverlayDockEdge, x: number, y: number): number {
  return edge === 'top' || edge === 'bottom' ? x : y
}

function magnetRange(edge: OverlayDockEdge, canvas: OverlayCanvasSize): number {
  const span = edge === 'top' || edge === 'bottom' ? canvas.height : canvas.width
  return Math.min(DOCK_MAGNET_RANGE, span / 4)
}

/**
 * Clamp a tag's along offset so {@link TAG_THICKNESS} stays on the board.
 * @param edge - docked edge.
 * @param along - proposed start along that edge.
 * @param canvas - board size in CSS pixels.
 * @returns along in `[0, max(0, span - TAG_THICKNESS)]`.
 */
export function clampDockAlong(
  edge: OverlayDockEdge,
  along: number,
  canvas: OverlayCanvasSize,
): number {
  const span = edge === 'top' || edge === 'bottom' ? canvas.width : canvas.height
  const max = Math.max(0, span - TAG_THICKNESS)
  if (!Number.isFinite(along)) return 0
  return Math.min(Math.max(0, along), max)
}

/**
 * Nearest board edge to a pointer in board pixels. Ties prefer top, then
 * bottom, then left, then right.
 * @param x - board-local pointer x.
 * @param y - board-local pointer y.
 * @param canvas - board size in CSS pixels.
 * @returns the nearest edge.
 */
export function nearestDockEdge(
  x: number,
  y: number,
  canvas: OverlayCanvasSize,
): OverlayDockEdge {
  const distTop = y
  const distBottom = canvas.height - y
  const distLeft = x
  const distRight = canvas.width - x
  const min = Math.min(distTop, distBottom, distLeft, distRight)
  if (min === distTop) return 'top'
  if (min === distBottom) return 'bottom'
  if (min === distLeft) return 'left'
  return 'right'
}

/**
 * Magnet projection of a pointer onto the nearest edge, or `undefined` when
 * the pointer is farther than {@link DOCK_MAGNET_RANGE} from every edge.
 * `grabX` / `grabY` keep the point that was under the cursor on the tag.
 * @param x - board-local pointer x.
 * @param y - board-local pointer y.
 * @param canvas - board size in CSS pixels.
 * @param grabX - pointer offset from the tag's left at pointer-down.
 * @param grabY - pointer offset from the tag's top at pointer-down.
 * @returns a dock on the nearest edge, or `undefined` to expand on release.
 */
export function magnetDock(
  x: number,
  y: number,
  canvas: OverlayCanvasSize,
  grabX: number,
  grabY: number,
): OverlayDock | undefined {
  const edge = nearestDockEdge(x, y, canvas)
  if (edgeDistance(edge, x, y, canvas) > magnetRange(edge, canvas)) return undefined
  const grabAlong = edge === 'top' || edge === 'bottom' ? grabX : grabY
  return {
    edge,
    along: clampDockAlong(edge, alongOnEdge(edge, x, y) - grabAlong, canvas),
  }
}

/**
 * Opening dock when 缩小 collapses a card: nearest edge to the title bar,
 * along the projection of that bar onto the edge.
 * @param frame - last expanded frame.
 * @param canvas - board size in CSS pixels.
 * @returns a clamped dock on the nearest edge.
 */
export function dockFromFrame(
  frame: OverlayCardFrame,
  canvas: OverlayCanvasSize,
): OverlayDock {
  const x = frame.x + Math.min(frame.width, TAG_ALONG_MAX) / 2
  const y = frame.y + TITLE_BAR_HEIGHT / 2
  const edge = nearestDockEdge(x, y, canvas)
  const grabAlong = TAG_THICKNESS / 2
  return {
    edge,
    along: clampDockAlong(edge, alongOnEdge(edge, x, y) - grabAlong, canvas),
  }
}

/**
 * Long side of a painted tag: title length plus tuck and notch, capped at
 * {@link TAG_ALONG_MAX}. A missing or empty measurement uses the cap so a
 * FLIP destination still exists.
 * @param textPx - measured title along the ribbon in CSS pixels.
 * @returns the ribbon long side in CSS pixels.
 */
export function tagRibbonAlong(textPx: number): number {
  if (!Number.isFinite(textPx) || textPx < 1) return TAG_ALONG_MAX
  return Math.min(TAG_ALONG_MAX, Math.max(TAG_THICKNESS, textPx + TAG_TUCK + TAG_NOTCH))
}

/**
 * Board-local box for a docked tag. CSS may shrink the long side to the label.
 * Idle docks sit {@link TAG_TUCK} past the board edge so the playable board
 * clips them to half a ribbon. Drag previews pass `tucked: false`.
 * @param dock - edge and along offset.
 * @param canvas - board size in CSS pixels.
 * @param tucked - whether the attached half sits past the edge.
 * @param ribbonAlong - long side into the board; default {@link TAG_ALONG_MAX}.
 * @returns top-left and the tag box for that long side.
 */
export function dockTagBox(
  dock: OverlayDock,
  canvas: OverlayCanvasSize,
  tucked: boolean = true,
  ribbonAlong: number = TAG_ALONG_MAX,
): OverlayCardFrame {
  const along = clampDockAlong(dock.edge, dock.along, canvas)
  const inset = tucked ? TAG_TUCK : 0
  const span = Math.min(TAG_ALONG_MAX, Math.max(TAG_THICKNESS, ribbonAlong))
  if (dock.edge === 'top') {
    return { x: along, y: tucked ? -TAG_TUCK : 0, width: TAG_THICKNESS, height: span }
  }
  if (dock.edge === 'bottom') {
    return {
      x: along, y: canvas.height - span + inset,
      width: TAG_THICKNESS, height: span,
    }
  }
  if (dock.edge === 'left') {
    return { x: tucked ? -TAG_TUCK : 0, y: along, width: span, height: TAG_THICKNESS }
  }
  return {
    x: canvas.width - span + inset, y: along,
    width: span, height: TAG_THICKNESS,
  }
}

/**
 * True when two docks name the same edge and along offset.
 * @param left - first dock.
 * @param right - second dock.
 * @returns whether they match.
 */
export function sameDock(left: OverlayDock, right: OverlayDock): boolean {
  return left.edge === right.edge && left.along === right.along
}

/** Board-local or viewport box used to invert a shrink/expand morph. */
export type OverlayFlipBox = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Duration of the shrink/expand FLIP flight (milliseconds). Keep
 * `OverlayCard.module.css` `.morphing` `transition` in sync.
 */
export const MORPH_MS = 320
/**
 * Delay after the shrink FLIP starts before the tag-face crossfade begins
 * (milliseconds). Later than takeoff so the window flies as a card; earlier
 * than {@link MORPH_MS} so chrome still changes before the flight fully
 * parks.
 */
export const DISSOLVE_DELAY_MS = 120
/**
 * Duration of the tag-face crossfade (milliseconds). Keep
 * `OverlayCard.module.css` `.dissolve` `transition` in sync.
 */
export const SETTLE_MS = 320

/**
 * Invert a last box over a first box so a transform can play from `from` to `to`.
 * @param from - box before the layout change.
 * @param to - box after the layout change.
 * @returns translate then scale with origin at the top-left of `to`.
 */
export function flipInvert(from: OverlayFlipBox, to: OverlayFlipBox): {
  dx: number
  dy: number
  sx: number
  sy: number
} {
  return {
    dx: from.left - to.left,
    dy: from.top - to.top,
    sx: from.width / Math.max(to.width, 1),
    sy: from.height / Math.max(to.height, 1),
  }
}

/**
 * Translate then scale a node that stays laid out at `from` so it lands on `to`.
 * Shrink uses this so expanded chrome can fly to the tag box before `.tag` applies.
 * @param from - current layout box.
 * @param to - destination box.
 * @returns translate then scale with origin at the top-left of `from`.
 */
export function flipToward(from: OverlayFlipBox, to: OverlayFlipBox): {
  dx: number
  dy: number
  sx: number
  sy: number
} {
  return flipInvert(to, from)
}

/**
 * Viewport box of an idle tucked tag, given the playable board's viewport origin.
 * @param dock - edge and along offset.
 * @param canvas - board size in CSS pixels.
 * @param boardLeft - board `getBoundingClientRect().left`.
 * @param boardTop - board `getBoundingClientRect().top`.
 * @param ribbonAlong - long side matching the painted title ribbon.
 * @returns the tag box in viewport pixels.
 */
export function tagFlipBox(
  dock: OverlayDock,
  canvas: OverlayCanvasSize,
  boardLeft: number,
  boardTop: number,
  ribbonAlong: number = TAG_ALONG_MAX,
): OverlayFlipBox {
  const box = dockTagBox(dock, canvas, true, ribbonAlong)
  return {
    left: boardLeft + box.x,
    top: boardTop + box.y,
    width: box.width,
    height: box.height,
  }
}

/**
 * Leftmost origin that still keeps {@link MIN_GRAB_WIDTH} of the card on the
 * board. Negative when the card is wider than the strip, so the body may hang
 * past the left edge the same way it hangs past the right.
 * @param width - card width in CSS pixels.
 * @returns the minimum `x`.
 */
export function grabMinX(width: number): number {
  return MIN_GRAB_WIDTH - Math.max(width, MIN_GRAB_WIDTH)
}

/**
 * Keep a title-bar grab strip on the playable board. The body may hang past
 * the left, right, or bottom; the top of the title bar stays on the board.
 * The title bar spans the card, so a left hang still leaves header chrome
 * (the right end of the bar) on the board — no extra handle.
 * @param x - proposed left.
 * @param y - proposed top.
 * @param canvas - board size in CSS pixels.
 * @param width - card width; left hang uses this to keep a 120px overlap.
 * @returns origin with a visible grab strip.
 */
export function clampGrabOrigin(
  x: number,
  y: number,
  canvas: OverlayCanvasSize,
  width: number,
): { x: number; y: number } {
  const minX = grabMinX(width)
  const maxX = Math.max(minX, canvas.width - MIN_GRAB_WIDTH)
  const maxY = Math.max(0, canvas.height - TITLE_BAR_HEIGHT)
  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  }
}

/**
 * Apply grab-strip origin and minimum size. Width and height may exceed the
 * board so a large page can hang off the left, right, or bottom.
 * @param frame - proposed frame.
 * @param canvas - board size in CSS pixels.
 * @returns the clamped frame.
 */
export function clampFrame(
  frame: OverlayCardFrame,
  canvas: OverlayCanvasSize,
): OverlayCardFrame {
  const width = Math.max(MIN_WIDTH, frame.width)
  const height = Math.max(MIN_HEIGHT, frame.height)
  const origin = clampGrabOrigin(frame.x, frame.y, canvas, width)
  return {
    x: origin.x,
    y: origin.y,
    width,
    height,
  }
}

/**
 * Resize the card from a pointer delta against the gesture origin.
 * West/north moves keep the opposite edge until min size, then pin.
 * Top origin stays non-negative; size is not forced inside the board.
 * @param start - frame at pointer-down.
 * @param edge - captured handle.
 * @param pointerX - current clientX.
 * @param pointerY - current clientY.
 * @param originX - clientX at pointer-down.
 * @param originY - clientY at pointer-down.
 * @returns the next frame.
 */
export function applyResize(
  start: OverlayCardFrame,
  edge: ResizeEdge,
  pointerX: number,
  pointerY: number,
  originX: number,
  originY: number,
): OverlayCardFrame {
  const dx = pointerX - originX
  const dy = pointerY - originY
  const right = start.x + start.width
  const bottom = start.y + start.height
  let x = start.x
  let y = start.y
  let width = start.width
  let height = start.height

  if (edge === 'e' || edge === 'ne' || edge === 'se') {
    width = start.width + dx
  }
  if (edge === 's' || edge === 'se' || edge === 'sw') {
    height = start.height + dy
  }
  if (edge === 'w' || edge === 'nw' || edge === 'sw') {
    x = start.x + dx
    width = right - x
  }
  if (edge === 'n' || edge === 'ne' || edge === 'nw') {
    y = start.y + dy
    height = bottom - y
  }

  if (width < MIN_WIDTH) {
    if (edge === 'w' || edge === 'nw' || edge === 'sw') {
      x = right - MIN_WIDTH
    }
    width = MIN_WIDTH
  }
  if (height < MIN_HEIGHT) {
    if (edge === 'n' || edge === 'ne' || edge === 'nw') {
      y = bottom - MIN_HEIGHT
    }
    height = MIN_HEIGHT
  }

  if (y < 0) {
    height += y
    y = 0
  }

  width = Math.max(width, MIN_WIDTH)
  height = Math.max(height, MIN_HEIGHT)
  return { x, y, width, height }
}
