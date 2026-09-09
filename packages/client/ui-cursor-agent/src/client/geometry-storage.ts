/** Persist Cursor overlay geometry so a page reload can restore the box. */

import {
  clampOverlayBox,
  clampSpriteBox,
  defaultOverlayBox,
  defaultSpriteBox,
  type OverlayBox,
} from './overlay-position.ts'

/** localStorage key for the Cursor overlay box and minimized sprite. */
export const OVERLAY_GEOMETRY_STORAGE_KEY = 'dsh.cursor-overlay.geometry'

/** Expanded box, optional last sprite origin, and whether the sprite is showing. */
export type PersistedOverlayGeometry = {
  readonly box: OverlayBox
  readonly sprite?: OverlayBox
  readonly minimized: boolean
}

/** Clamped geometry applied on first paint. */
export type HydratedOverlayGeometry = {
  readonly box: OverlayBox
  readonly minimized: boolean
  readonly expanded: OverlayBox
  readonly sprite: OverlayBox | null
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseBox(value: unknown): OverlayBox | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as {
    left?: unknown
    top?: unknown
    width?: unknown
    height?: unknown
  }
  const left = finiteNumber(row.left)
  const top = finiteNumber(row.top)
  const width = finiteNumber(row.width)
  const height = finiteNumber(row.height)
  if (left === undefined || top === undefined || width === undefined || height === undefined) {
    return undefined
  }
  return { left, top, width, height }
}

/**
 * Read a previously written overlay box. Invalid JSON or a missing box is ignored.
 * @returns the stored geometry, or `undefined` when nothing usable is stored.
 */
export function readPersistedGeometry(): PersistedOverlayGeometry | undefined {
  if (typeof localStorage === 'undefined') return undefined
  let raw: string | null
  try {
    raw = localStorage.getItem(OVERLAY_GEOMETRY_STORAGE_KEY)
  } catch {
    return undefined
  }
  if (raw === null || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const box = parseBox((parsed as { box?: unknown }).box)
  if (box === undefined) return undefined
  const sprite = parseBox((parsed as { sprite?: unknown }).sprite)
  const minimizedRaw = (parsed as { minimized?: unknown }).minimized
  return {
    box,
    ...(sprite === undefined ? {} : { sprite }),
    minimized: minimizedRaw === true,
  }
}

/**
 * Write the overlay box. Storage failures are ignored so the overlay still runs.
 * @param geometry - expanded box, optional sprite origin, and minimized flag.
 */
export function writePersistedGeometry(geometry: PersistedOverlayGeometry): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, JSON.stringify(geometry))
  } catch {
    // Quota or private-mode storage must not take down the overlay.
  }
}

/**
 * Clamp stored geometry to this viewport, or use the centered default.
 * @param viewportWidth - `window.innerWidth`.
 * @param viewportHeight - `window.innerHeight`.
 * @returns the box to paint and the refs to keep across minimize/expand.
 */
export function hydrateOverlayGeometry(
  viewportWidth: number,
  viewportHeight: number,
): HydratedOverlayGeometry {
  const stored = readPersistedGeometry()
  if (stored === undefined) {
    const box = defaultOverlayBox(viewportWidth, viewportHeight)
    return { box, minimized: false, expanded: box, sprite: null }
  }
  const expanded = clampOverlayBox(stored.box, viewportWidth, viewportHeight)
  const sprite = stored.sprite === undefined
    ? null
    : clampSpriteBox(stored.sprite, viewportWidth, viewportHeight)
  if (stored.minimized) {
    const current = sprite ?? defaultSpriteBox(viewportWidth, viewportHeight)
    return { box: current, minimized: true, expanded, sprite: current }
  }
  return { box: expanded, minimized: false, expanded, sprite }
}
