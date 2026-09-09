/** Opaque overlay session ids for the floating Cursor CLI window. */

/** Brand for one overlay Cursor CLI session. */
export type OverlaySessionId = string & { readonly __brand: 'OverlaySessionId' }

let nextSession = 1

/**
 * Mint a new overlay session id for this browser page.
 * @returns a unique session id string.
 */
export function mintOverlaySessionId(): OverlaySessionId {
  const id = `cursor-cli-${nextSession}`
  nextSession += 1
  return id as OverlaySessionId
}

/**
 * Adopt a restored overlay id and keep the mint counter past `cursor-cli-N`.
 * @param id - stored rail id.
 * @returns the same id branded as {@link OverlaySessionId}.
 */
export function adoptOverlaySessionId(id: string): OverlaySessionId {
  const match = /^cursor-cli-(\d+)$/.exec(id)
  if (match !== null) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n >= nextSession) nextSession = n + 1
  }
  return id as OverlaySessionId
}

/**
 * Reset the session counter (tests only).
 */
export function resetOverlaySessionIdsForTests(): void {
  nextSession = 1
}
