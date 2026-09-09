/** Persist overlay-card frames so a page reload can restore origin and size. */

import { isOverlayCardId } from '../instances.ts'
import {
  isOverlayDock, isOverlayDockEdge, type OverlayCardFrame, type OverlayDock,
} from './geometry.ts'

/** localStorage key for desk frames keyed by unique card id. */
export const OVERLAY_CARD_FRAMES_STORAGE_KEY = 'dsh.overlay-card.frames'

/** One card's last frame, keyed by insert `--card-id`. */
export type OverlayCardPersistedLayout = {
  readonly frames: Readonly<Record<string, OverlayCardFrame>>
  readonly front: readonly string[]
  /** Per-card edge tags; omitted means every card is expanded. */
  readonly docks?: Readonly<Record<string, OverlayDock>>
  /**
   * Last parked tag per card, kept after expand so 缩小 returns there.
   * Omitted means 缩小 uses the nearest-edge dock from the expanded frame
   * until the user parks once.
   */
  readonly parks?: Readonly<Record<string, OverlayDock>>
  /**
   * Legacy shared rail edge from a previous bookmark-row persist.
   * Store apply migrates it with {@link OverlayCardPersistedLayout.minimized}.
   */
  readonly dockEdge?: OverlayDock['edge']
  /**
   * Legacy unique ids that were docked as a shared rail.
   * Store apply migrates each id into {@link OverlayCardPersistedLayout.docks}.
   */
  readonly minimized?: readonly string[]
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseFrame(value: unknown): OverlayCardFrame | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown }
  const x = finiteNumber(row.x)
  const y = finiteNumber(row.y)
  const width = finiteNumber(row.width)
  const height = finiteNumber(row.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }
  return { x, y, width, height }
}

function parseIdList(value: unknown): string[] {
  const ids: string[] = []
  if (!Array.isArray(value)) return ids
  for (const id of value) {
    if (typeof id !== 'string' || !isOverlayCardId(id) || ids.includes(id)) continue
    ids.push(id)
  }
  return ids
}

function parseDocks(value: unknown): Record<string, OverlayDock> {
  const next: Record<string, OverlayDock> = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return next
  for (const [id, row] of Object.entries(value as Record<string, unknown>)) {
    if (!isOverlayCardId(id) || !isOverlayDock(row)) continue
    next[id] = { edge: row.edge, along: row.along }
  }
  return next
}

/**
 * Snapshot live desk frames keyed by unique card id, dropping seats that have
 * no identity or frame.
 * @param identities - chrome identity per seat.
 * @param frames - pixel frame per seat.
 * @param front - stacking order, back to front.
 * @param docks - seats currently collapsed to an edge tag.
 * @param parks - last parked tag per seat; kept after expand.
 * @returns a value safe to write to localStorage.
 */
export function snapshotCardLayout(
  identities: Partial<Record<number, { id: string }>>,
  frames: Partial<Record<number, OverlayCardFrame>>,
  front: readonly number[],
  docks: Partial<Record<number, OverlayDock>> = {},
  parks: Partial<Record<number, OverlayDock>> = {},
): OverlayCardPersistedLayout {
  const next: Record<string, OverlayCardFrame> = {}
  for (const [key, identity] of Object.entries(identities)) {
    if (identity === undefined || !isOverlayCardId(identity.id)) continue
    const n = Number(key)
    const frame = frames[n]
    if (frame === undefined) continue
    next[identity.id] = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
  }
  const ids: string[] = []
  for (const n of front) {
    const id = identities[n]?.id
    if (id === undefined || !isOverlayCardId(id) || ids.includes(id)) continue
    if (next[id] === undefined) continue
    ids.push(id)
  }
  const docked: Record<string, OverlayDock> = {}
  for (const [key, dock] of Object.entries(docks)) {
    if (dock === undefined || !isOverlayDock(dock)) continue
    const id = identities[Number(key)]?.id
    if (id === undefined || !isOverlayCardId(id) || next[id] === undefined) continue
    docked[id] = { edge: dock.edge, along: dock.along }
  }
  const parked: Record<string, OverlayDock> = {}
  for (const [key, dock] of Object.entries(parks)) {
    if (dock === undefined || !isOverlayDock(dock)) continue
    const id = identities[Number(key)]?.id
    if (id === undefined || !isOverlayCardId(id) || next[id] === undefined) continue
    parked[id] = { edge: dock.edge, along: dock.along }
  }
  return {
    frames: next,
    front: ids,
    ...(Object.keys(docked).length === 0 ? {} : { docks: docked }),
    ...(Object.keys(parked).length === 0 ? {} : { parks: parked }),
  }
}

/**
 * Read a previously written desk layout. Invalid JSON or an empty frame map
 * is ignored.
 * @returns the stored layout, or `undefined` when nothing usable is stored.
 */
export function readPersistedCardFrames(): OverlayCardPersistedLayout | undefined {
  if (typeof localStorage === 'undefined') return undefined
  let raw: string | null
  try {
    raw = localStorage.getItem(OVERLAY_CARD_FRAMES_STORAGE_KEY)
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
  const framesRaw = (parsed as { frames?: unknown }).frames
  if (typeof framesRaw !== 'object' || framesRaw === null || Array.isArray(framesRaw)) {
    return undefined
  }
  const frames: Record<string, OverlayCardFrame> = {}
  for (const [id, value] of Object.entries(framesRaw as Record<string, unknown>)) {
    if (!isOverlayCardId(id)) continue
    const frame = parseFrame(value)
    if (frame === undefined) continue
    frames[id] = frame
  }
  if (Object.keys(frames).length === 0) return undefined
  const row = parsed as {
    front?: unknown
    docks?: unknown
    parks?: unknown
    dockEdge?: unknown
    minimized?: unknown
  }
  const docks = parseDocks(row.docks)
  const parks = parseDocks(row.parks)
  const dockEdge = isOverlayDockEdge(row.dockEdge) ? row.dockEdge : undefined
  const minimized = parseIdList(row.minimized)
  return {
    frames,
    front: parseIdList(row.front),
    ...(Object.keys(docks).length === 0 ? {} : { docks }),
    ...(Object.keys(parks).length === 0 ? {} : { parks }),
    ...(dockEdge === undefined ? {} : { dockEdge }),
    ...(minimized.length === 0 ? {} : { minimized }),
  }
}

/**
 * Write the desk layout. Storage failures are ignored so the overlay still runs.
 * @param layout - frames and stacking keyed by unique card id.
 */
export function writePersistedCardFrames(layout: OverlayCardPersistedLayout): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Quota or private-mode storage must not take down the overlay.
  }
}
