/**
 * Overlay shaped hide file: Loader ids skipped on the board while occupants
 * stay mounted. Unplug remains Loader `disabled` on the live patch.
 */

/** File name next to the live shaped-host plugin `lib/` copy. */
export const OVERLAY_SHAPED_HIDDEN_FILE = 'hidden.json'

/**
 * Parse a hide-file payload. Invalid JSON or a non-object yields `[]`.
 * @param text - raw file contents.
 */
export function parseOverlayShapedHidden(text: string): readonly string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return []
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const hidden = (parsed as { hidden?: unknown }).hidden
  if (!Array.isArray(hidden)) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of hidden) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * Serialize Loader ids that should stay hidden.
 * @param ids - live shaped occupant Loader ids.
 */
export function formatOverlayShapedHidden(ids: readonly string[]): string {
  return `${JSON.stringify({ hidden: [...ids] }, null, 2)}\n`
}

/**
 * Add or remove one Loader id from the hide list. `false` omits the id.
 * @param ids - current hidden Loader ids.
 * @param id - occupant Loader id.
 * @param hidden - `true` skips the silhouette.
 */
export function setOverlayShapedHiddenIds(
  ids: readonly string[],
  id: string,
  hidden: boolean,
): readonly string[] {
  const next = ids.filter(item => item !== id)
  if (hidden) return [...next, id]
  return next
}
