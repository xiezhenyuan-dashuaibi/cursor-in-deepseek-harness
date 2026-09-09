/**
 * Overlay card desk viewing state: which seats are mounted, chrome identity,
 * each frame, per-card edge tags, and the measured playable board. Factory
 * only — no module handle.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { isOverlayCardMounted, isOverlayCardNumber, type OverlayCardNumber, type OverlayCardSpec } from '../instances.ts'
import type { OverlayCardPersistedLayout } from './frame-storage.ts'
import {
  clampDockAlong,
  clampFrame,
  clampGrabOrigin,
  DEFAULT_CANVAS,
  dockFromFrame,
  isOverlayDock,
  isOverlayDockEdge,
  MIN_HEIGHT,
  MIN_WIDTH,
  sameDock,
  type OverlayCanvasSize,
  type OverlayCardFrame,
  type OverlayDock,
} from './geometry.ts'

/** Empty-body left origin on the overlay canvas. */
export const DEFAULT_X = 36
/** Empty-body top offset below a typical top-edge tag. */
export const DEFAULT_Y = 56
/** Empty-body width until insert spec or a page `preferFrame`. */
export const DEFAULT_WIDTH = MIN_WIDTH
/** Empty-body height until insert spec or a page `preferFrame`. */
export const DEFAULT_HEIGHT = MIN_HEIGHT
/** Gap between adjacent cards when placing a newly mounted window. */
export const NEW_CARD_GAP = 24

/** Title-bar identity for one seat (unique id and left-side name). */
export type OverlayCardIdentity = {
  /** Unique card id from insert `--card-id`. */
  id: string
  /** Title-bar left name from insert `--title`. */
  title: string
}

/** Store state is the numbered desk. */
export type OverlayDeskState = {
  /** Mounted seats in insert order. */
  numbers: OverlayCardNumber[]
  /** Chrome identity per mounted seat. */
  identities: Partial<Record<OverlayCardNumber, OverlayCardIdentity>>
  /** Frame per known seat (kept for hidden or unplugged specs so a later show restores it). */
  frames: Partial<Record<OverlayCardNumber, OverlayCardFrame>>
  /** Stacking order, back to front. */
  front: OverlayCardNumber[]
  /**
   * Seats whose frame is user- or reload-owned. A later page `preferFrame`
   * must not override these.
   */
  preferLocked: Partial<Record<OverlayCardNumber, true>>
  /**
   * Seats collapsed to an edge tag. The window stays mounted (`display: none`
   * on the body) so the page does not remount. Hidden/unplugged specs keep
   * this dock like frames until the spec is removed.
   */
  docks: Partial<Record<OverlayCardNumber, OverlayDock>>
  /**
   * Last parked tag per seat. Survives restore so 缩小 returns to that
   * edge and along instead of docking from the expanded frame.
   */
  parks: Partial<Record<OverlayCardNumber, OverlayDock>>
  /** Playable board size; `OverlayDesk` writes this from the board box. */
  canvas: OverlayCanvasSize
}

/** Actions annotation twin. */
type OverlayDeskActions = {
  syncCards: (draft: OverlayDeskState, cards: readonly OverlayCardSpec[]) => void
  setCanvas: (draft: OverlayDeskState, width: number, height: number) => void
  setPosition: (draft: OverlayDeskState, n: number, x: number, y: number) => void
  setFrame: (draft: OverlayDeskState, n: number, frame: OverlayCardFrame) => void
  bringToFront: (draft: OverlayDeskState, n: number) => void
  minimize: (draft: OverlayDeskState, n: number) => void
  restore: (draft: OverlayDeskState, n: number, origin?: { x: number; y: number }) => void
  setDock: (draft: OverlayDeskState, n: number, dock: OverlayDock) => void
}

function asCardNumber(n: number): OverlayCardNumber | undefined {
  return isOverlayCardNumber(n) ? n : undefined
}

/**
 * Drop keys that are not a current roster seat, including non-numeric leftovers.
 * Returns a new map so an invalid token cannot linger as `"undefined"`.
 * @param record - seat-keyed map on the immer draft.
 * @param known - seats still present on the roster (hidden specs included).
 * @returns only the known seats from `record`.
 */
export function dropUnknownSeatKeys<T>(
  record: Partial<Record<OverlayCardNumber, T>>,
  known: ReadonlySet<OverlayCardNumber>,
): Partial<Record<OverlayCardNumber, T>> {
  const next: Partial<Record<OverlayCardNumber, T>> = {}
  for (const key of Object.keys(record)) {
    const n = asCardNumber(Number(key))
    if (n === undefined || !known.has(n)) continue
    const value = record[n]
    if (value !== undefined) next[n] = value
  }
  return next
}

function clipsCanvas(x: number, width: number, canvasWidth: number): boolean {
  return x >= canvasWidth || x + width > canvasWidth
}

function sameFrame(left: OverlayCardFrame, right: OverlayCardFrame): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
}

function sameCanvas(left: OverlayCanvasSize, right: OverlayCanvasSize): boolean {
  return left.width === right.width && left.height === right.height
}

function reclampFrames(draft: OverlayDeskState): void {
  for (const n of draft.numbers) {
    const frame = draft.frames[n]
    /* v8 ignore next -- syncCards writes a frame before a seat enters numbers */
    if (frame === undefined) continue
    const next = clampFrame(frame, draft.canvas)
    if (!sameFrame(frame, next)) draft.frames[n] = next
  }
}

function reclampDockMap(
  record: Partial<Record<OverlayCardNumber, OverlayDock>>,
  canvas: OverlayCanvasSize,
): void {
  for (const key of Object.keys(record)) {
    const n = asCardNumber(Number(key))
    /* v8 ignore next -- Object.keys on this map only yields roster seats after dropUnknownSeatKeys */
    if (n === undefined) continue
    const dock = record[n]
    /* v8 ignore next -- dropUnknownSeatKeys deletes empty entries */
    if (dock === undefined) continue
    const next: OverlayDock = {
      edge: dock.edge,
      along: clampDockAlong(dock.edge, dock.along, canvas),
    }
    if (!sameDock(dock, next)) record[n] = next
  }
}

function migrateLegacyDock(
  specId: string,
  saved: OverlayCardPersistedLayout,
  canvas: OverlayCanvasSize,
): OverlayDock | undefined {
  if (saved.minimized?.includes(specId) !== true) return undefined
  const edge = isOverlayDockEdge(saved.dockEdge) ? saved.dockEdge : 'top'
  const remembered = saved.frames[specId]
  const along = remembered === undefined
    ? 0
    : (edge === 'top' || edge === 'bottom' ? remembered.x : remembered.y)
  return { edge, along: clampDockAlong(edge, along, canvas) }
}

/**
 * Opening frame for a newly mounted seat. Skips docked neighbors so a tag
 * does not push the next window to the right of a hidden last-expanded frame.
 * @param frames - known seats, including holes from a Partial Record.
 * @param width - insert `--width`.
 * @param height - insert `--height`.
 * @param canvas - playable board size.
 * @param docks - seats currently collapsed to an edge tag.
 * @returns a clamped frame at the default origin or to the right of expanded cards.
 */
export function placeNewCard(
  frames: Partial<Record<OverlayCardNumber, OverlayCardFrame>>,
  width: number,
  height: number,
  canvas: OverlayCanvasSize,
  docks: Partial<Record<OverlayCardNumber, OverlayDock>>,
): OverlayCardFrame {
  let x = DEFAULT_X
  for (const [key, frame] of Object.entries(frames)) {
    if (frame === undefined) continue
    const n = asCardNumber(Number(key))
    if (n !== undefined && docks[n] !== undefined) continue
    x = Math.max(x, frame.x + frame.width + NEW_CARD_GAP)
  }
  if (!clipsCanvas(x, width, canvas.width)) {
    return clampFrame({ x, y: DEFAULT_Y, width, height }, canvas)
  }
  return clampFrame({ x: DEFAULT_X, y: DEFAULT_Y, width, height }, canvas)
}

/**
 * Create the overlay-card desk store handle.
 * `setFrame` / `setPosition` mutate only the addressed seat. Initial placement
 * of a newly mounted seat uses a stored frame when `persist` has that card id,
 * otherwise {@link placeNewCard}; later overlap is allowed.
 * Origins keep a title-bar grab strip on the playable board.
 * Docked seats keep their last expanded frame; 缩小 does not write
 * `hidden` on the roster. Last parked tags live in `parks` and survive
 * restore so a later 缩小 returns there. A far drop may pass `origin`
 * to `restore` so the expanded frame opens at the release point.
 * @param persist - last frames keyed by unique card id; omit in tests.
 * @returns the store handle for register().
 */
export function createOverlayDeskStore(
  persist?: OverlayCardPersistedLayout | null,
): EngineStoreHandle<OverlayDeskState, OverlayDeskActions> {
  const saved = persist ?? undefined
  let appliedPersistFront = saved === undefined || saved.front.length === 0
  let appliedPersistDock = saved === undefined
  return defineStore({
    init: (): OverlayDeskState => ({
      numbers: [],
      identities: {},
      frames: {},
      front: [],
      preferLocked: {},
      docks: {},
      parks: {},
      canvas: { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height },
    }),
    actions: {
      syncCards: (draft, cards: readonly OverlayCardSpec[]) => {
        const mounted: OverlayCardNumber[] = []
        const known = new Set<OverlayCardNumber>()
        const bySeat = new Map<OverlayCardNumber, OverlayCardSpec>()
        for (const spec of cards) {
          if (bySeat.has(spec.seat)) continue
          bySeat.set(spec.seat, spec)
          known.add(spec.seat)
          if (isOverlayCardMounted(spec)) mounted.push(spec.seat)
        }
        draft.numbers = mounted
        draft.frames = dropUnknownSeatKeys(draft.frames, known)
        draft.identities = dropUnknownSeatKeys(draft.identities, known)
        draft.preferLocked = dropUnknownSeatKeys(draft.preferLocked, known)
        draft.docks = dropUnknownSeatKeys(draft.docks, known)
        draft.parks = dropUnknownSeatKeys(draft.parks, known)
        for (const spec of bySeat.values()) {
          draft.identities[spec.seat] = { id: spec.id, title: spec.title }
        }
        if (!appliedPersistDock && saved !== undefined && known.size > 0) {
          appliedPersistDock = true
          for (const spec of bySeat.values()) {
            const savedDock = saved.docks?.[spec.id]
            if (isOverlayDock(savedDock)) {
              draft.docks[spec.seat] = {
                edge: savedDock.edge,
                along: clampDockAlong(savedDock.edge, savedDock.along, draft.canvas),
              }
            } else {
              const migrated = migrateLegacyDock(spec.id, saved, draft.canvas)
              if (migrated !== undefined) draft.docks[spec.seat] = migrated
            }
            const savedPark = saved.parks?.[spec.id] ?? draft.docks[spec.seat] ?? saved.docks?.[spec.id]
            if (isOverlayDock(savedPark)) {
              draft.parks[spec.seat] = {
                edge: savedPark.edge,
                along: clampDockAlong(savedPark.edge, savedPark.along, draft.canvas),
              }
            }
          }
        }
        for (const spec of bySeat.values()) {
          if (draft.frames[spec.seat] !== undefined) continue
          const remembered = saved?.frames[spec.id]
          if (remembered !== undefined) {
            draft.frames[spec.seat] = clampFrame(remembered, draft.canvas)
            draft.preferLocked[spec.seat] = true
            continue
          }
          if (!isOverlayCardMounted(spec)) continue
          draft.frames[spec.seat] = placeNewCard(
            draft.frames, spec.width, spec.height, draft.canvas, draft.docks,
          )
        }
        draft.front = draft.front.filter(n => mounted.includes(n))
        if (saved !== undefined && !appliedPersistFront && mounted.length > 0) {
          appliedPersistFront = true
          const seatById = new Map<string, OverlayCardNumber>()
          for (const spec of bySeat.values()) {
            if (isOverlayCardMounted(spec)) seatById.set(spec.id, spec.seat)
          }
          const next: OverlayCardNumber[] = []
          for (const id of saved.front) {
            const seat = seatById.get(id)
            if (seat === undefined || next.includes(seat)) continue
            next.push(seat)
          }
          for (const n of mounted) {
            if (!next.includes(n)) next.push(n)
          }
          draft.front = next
        } else {
          for (const n of mounted) {
            if (!draft.front.includes(n)) draft.front.push(n)
          }
        }
      },
      setCanvas: (draft, width: number, height: number) => {
        if (!(width > 0) || !(height > 0)) return
        const next: OverlayCanvasSize = { width, height }
        if (!sameCanvas(draft.canvas, next)) draft.canvas = next
        reclampFrames(draft)
        reclampDockMap(draft.docks, draft.canvas)
        reclampDockMap(draft.parks, draft.canvas)
      },
      setPosition: (draft, n: number, x: number, y: number) => {
        const id = asCardNumber(n)
        if (id === undefined) return
        const frame = draft.frames[id]
        if (frame === undefined) return
        const origin = clampGrabOrigin(x, y, draft.canvas, frame.width)
        frame.x = origin.x
        frame.y = origin.y
        draft.preferLocked[id] = true
      },
      setFrame: (draft, n: number, frame: OverlayCardFrame) => {
        const id = asCardNumber(n)
        if (id === undefined) return
        const next = clampFrame(frame, draft.canvas)
        const previous = draft.frames[id]
        draft.preferLocked[id] = true
        if (previous !== undefined && sameFrame(previous, next)) return
        draft.frames[id] = next
      },
      bringToFront: (draft, n: number) => {
        const id = asCardNumber(n)
        if (id === undefined || !draft.numbers.includes(id)) return
        draft.front = draft.front.filter(item => item !== id)
        draft.front.push(id)
      },
      minimize: (draft, n: number) => {
        const id = asCardNumber(n)
        if (id === undefined || !draft.numbers.includes(id)) return
        if (draft.docks[id] !== undefined) return
        const frame = draft.frames[id]
        /* v8 ignore next -- syncCards writes a frame before a seat enters numbers */
        if (frame === undefined) return
        const remembered = draft.parks[id]
        const next = remembered === undefined
          ? dockFromFrame(frame, draft.canvas)
          : {
            edge: remembered.edge,
            along: clampDockAlong(remembered.edge, remembered.along, draft.canvas),
          }
        draft.docks[id] = next
        draft.parks[id] = next
      },
      restore: (draft, n: number, origin?: { x: number; y: number }) => {
        const id = asCardNumber(n)
        if (id === undefined || draft.docks[id] === undefined) return
        const docks: Partial<Record<OverlayCardNumber, OverlayDock>> = {}
        for (const key of Object.keys(draft.docks)) {
          const n = asCardNumber(Number(key))
          if (n === undefined || n === id) continue
          const value = draft.docks[n]
          if (value !== undefined) docks[n] = value
        }
        draft.docks = docks
        if (!draft.numbers.includes(id)) return
        draft.front = draft.front.filter(item => item !== id)
        draft.front.push(id)
        if (origin === undefined) return
        const frame = draft.frames[id]
        /* v8 ignore next -- syncCards writes a frame before a seat enters numbers */
        if (frame === undefined) return
        const next = clampGrabOrigin(origin.x, origin.y, draft.canvas, frame.width)
        frame.x = next.x
        frame.y = next.y
        draft.preferLocked[id] = true
      },
      setDock: (draft, n: number, dock: OverlayDock) => {
        const id = asCardNumber(n)
        if (id === undefined || draft.docks[id] === undefined) return
        if (!isOverlayDock(dock)) return
        const next: OverlayDock = {
          edge: dock.edge,
          along: clampDockAlong(dock.edge, dock.along, draft.canvas),
        }
        if (sameDock(draft.docks[id], next)) return
        draft.docks[id] = next
        draft.parks[id] = next
      },
    },
  })
}
