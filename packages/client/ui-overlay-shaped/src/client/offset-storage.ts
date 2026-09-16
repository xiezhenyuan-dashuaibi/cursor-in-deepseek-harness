/**
 * Browser-local persistence for shaped-seat drag offsets. Host `apply` is
 * cached for the process lifetime, so this store lives in the browser half.
 */

import type { ShapedOffset } from './geometry.ts'

/** `localStorage` key for `{ [listId]: { x, y } }`. */
export const SHAPED_OFFSETS_STORAGE_KEY = 'dsh.overlay-shaped.offsets'

type OffsetMap = Record<string, ShapedOffset>

let memory: OffsetMap = {}
let hydrated = false

/**
 * Forget in-memory offsets. Tests call this between cases.
 */
export function resetShapedOffsets(): void {
  memory = {}
  hydrated = false
}

/**
 * Offset for one list id, or the origin when none is stored.
 * @param id - `overlay-shaped.body` list id.
 */
export function readShapedOffset(id: string): ShapedOffset {
  hydrate()
  return memory[id] ?? { x: 0, y: 0 }
}

/**
 * Persist one list id's offset.
 * @param id - `overlay-shaped.body` list id.
 * @param offset - translation from the occupant's rest pose.
 */
export function writeShapedOffset(id: string, offset: ShapedOffset): void {
  hydrate()
  memory = { ...memory, [id]: offset }
  persist()
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  memory = parseOffsetMap(readStorage())
}

function persist(): void {
  const storage = localStorageOrUndefined()
  if (storage === undefined) return
  try {
    storage.setItem(SHAPED_OFFSETS_STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Quota or a disabled store: the in-memory map still serves this session.
  }
}

function readStorage(): string | undefined {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (storage === undefined) return undefined
    return storage.getItem(SHAPED_OFFSETS_STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function localStorageOrUndefined(): Storage | undefined {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (storage === undefined) return undefined
    return storage
  } catch {
    return undefined
  }
}

/**
 * Parse a storage payload. Invalid JSON or a non-object yields `{}`.
 * @param text - raw `localStorage` value.
 */
export function parseOffsetMap(text: string | undefined): OffsetMap {
  if (text === undefined || text.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const next: OffsetMap = {}
  for (const [id, value] of Object.entries(parsed)) {
    const offset = asOffset(value)
    if (offset === undefined) continue
    next[id] = offset
  }
  return next
}

function asOffset(value: unknown): ShapedOffset | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as { x?: unknown; y?: unknown }
  if (typeof record.x !== 'number' || typeof record.y !== 'number') return undefined
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return undefined
  return { x: record.x, y: record.y }
}
