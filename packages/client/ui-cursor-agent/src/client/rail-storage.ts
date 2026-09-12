/** Persist overlay rail ids so a later page load can rebind the host CLI. */

import {
  adoptOverlaySessionId,
  type OverlaySessionId,
} from './session-id.ts'
import { readHostBootId } from './host-boot.ts'

/** localStorage key for the overlay session rail. */
export const OVERLAY_RAIL_STORAGE_KEY = 'dsh.cursor-overlay.rail'

/** Labels and ids only; connection status is always live from the socket. */
export type PersistedRail = {
  readonly bootId: string
  readonly sessions: readonly {
    readonly id: OverlaySessionId
    readonly label: string
  }[]
  readonly activeId: OverlaySessionId
}

/**
 * Read a previously written rail for this `dsh web` process. Invalid JSON, an
 * empty list, or a boot id that is not `bootId` is ignored.
 * @param bootId - index meta from this host process.
 * @returns the stored rail, or `undefined` when nothing usable is stored.
 */
export function readPersistedRail(bootId: string): PersistedRail | undefined {
  if (typeof localStorage === 'undefined') return undefined
  let raw: string | null
  try {
    raw = localStorage.getItem(OVERLAY_RAIL_STORAGE_KEY)
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
  const storedBoot = (parsed as { bootId?: unknown }).bootId
  if (typeof storedBoot !== 'string' || storedBoot !== bootId) return undefined
  const sessionsRaw = (parsed as { sessions?: unknown }).sessions
  if (!Array.isArray(sessionsRaw) || sessionsRaw.length === 0) return undefined
  const sessions: Array<{ id: OverlaySessionId; label: string }> = []
  for (const row of sessionsRaw) {
    if (typeof row !== 'object' || row === null) return undefined
    const id = (row as { id?: unknown }).id
    const label = (row as { label?: unknown }).label
    if (typeof id !== 'string' || id.length === 0) return undefined
    if (typeof label !== 'string' || label.length === 0) return undefined
    sessions.push({ id: adoptOverlaySessionId(id), label })
  }
  const activeRaw = (parsed as { activeId?: unknown }).activeId
  const first = sessions[0]
  if (first === undefined) return undefined
  const activeId = typeof activeRaw === 'string' && sessions.some(row => row.id === activeRaw)
    ? adoptOverlaySessionId(activeRaw)
    : first.id
  return { bootId, sessions, activeId }
}

/**
 * Write the rail. Storage failures are ignored so the overlay still runs.
 * @param rail - boot id, ids, and labels to restore on the next page load of this process.
 */
export function writePersistedRail(rail: PersistedRail): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify(rail))
  } catch {
    // Quota or private-mode storage must not take down the overlay.
  }
}

/**
 * Persist the live rail when this page has a host boot id.
 * @param sessions - current rail rows.
 * @param activeId - selected session.
 */
export function persistLiveRail(
  sessions: readonly { id: OverlaySessionId; label: string }[],
  activeId: OverlaySessionId,
): void {
  const bootId = readHostBootId()
  if (bootId === undefined) return
  writePersistedRail({
    bootId,
    sessions: sessions.map(row => ({ id: row.id, label: row.label })),
    activeId,
  })
}
