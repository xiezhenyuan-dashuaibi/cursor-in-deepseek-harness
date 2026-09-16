/**
 * Occupants of overlay-shaped.body, as a HostObservable for inject hooks.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One list occupant the board wraps in a seat. */
export type ShapedBodyOccupant = {
  /** `overlay-shaped.body` list id. */
  readonly id: string
  /**
   * Slot registrant (npm package name). Empty when the ledger omitted it.
   * Hide join matches roster `moduleName` to this field, not list id.
   */
  readonly registrant: string
}

/** Slot ledger surface this source reads. */
export type ShapedBodySlotSource = {
  /**
   * Registered entries for a slot key.
   * @param key - slot name.
   */
  entries(key: 'overlay-shaped.body'): readonly {
    readonly registrant?: string | undefined
    readonly options: { readonly id?: string }
  }[]
  /**
   * Subscribe to registration changes.
   * @param key - slot name.
   * @param fn - change callback.
   */
  subscribe(key: 'overlay-shaped.body', fn: () => void): () => void
}

/**
 * Snapshot of occupant list ids and registrants. Reuses the previous array
 * when membership and order are unchanged so uSES does not loop.
 * @param slots - slot registry.
 */
export function createBodyIdsSource(
  slots: ShapedBodySlotSource,
): HostObservable<readonly ShapedBodyOccupant[]> {
  let snapshot: readonly ShapedBodyOccupant[] = readOccupants(slots)
  return {
    getSnapshot: () => {
      const next = readOccupants(slots)
      if (sameOccupants(snapshot, next)) return snapshot
      snapshot = next
      return snapshot
    },
    subscribe: fn => slots.subscribe('overlay-shaped.body', fn),
  }
}

function readOccupants(slots: ShapedBodySlotSource): readonly ShapedBodyOccupant[] {
  const occupants: ShapedBodyOccupant[] = []
  for (const entry of slots.entries('overlay-shaped.body')) {
    const id = entry.options.id
    if (id === undefined || id.length === 0) continue
    occupants.push({ id, registrant: entry.registrant ?? '' })
  }
  return occupants
}

function sameOccupants(
  left: readonly ShapedBodyOccupant[],
  right: readonly ShapedBodyOccupant[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return other !== undefined && item.id === other.id && item.registrant === other.registrant
  })
}
