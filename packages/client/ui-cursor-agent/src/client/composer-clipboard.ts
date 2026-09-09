/** Overlay composer clipboard helpers. Copy/cut/paste are not PTY keys. */

/**
 * Ctrl/Cmd plus C/V/X, with no Alt. Keydown must not preventDefault these,
 * or the matching `copy` / `cut` / `paste` event never fires.
 * @param key - `KeyboardEvent.key`.
 * @param mods - modifier flags from the event.
 * @returns true when this chord is a clipboard edit.
 */
export function isClipboardEditShortcut(
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean },
): boolean {
  if (mods.alt === true) return false
  if (mods.ctrl !== true && mods.meta !== true) return false
  const letter = key.toLowerCase()
  return letter === 'c' || letter === 'v' || letter === 'x'
}

/**
 * Whether a slash menu or below-prompt option surface owns the composer bar.
 * @param draft - current composer text.
 * @param belowCount - `{op:"mirror"}` rows under the bar.
 * @param mirrorOwns - latched after `/` or a picker frame.
 */
export function ptyOwnsComposer(
  draft: string,
  belowCount: number,
  mirrorOwns: boolean,
): boolean {
  return belowCount > 0 || mirrorOwns || draft.startsWith('/')
}

/**
 * True when composer text is a failed-turn banner, not an operator draft.
 * Matches Cursor `Error: [aborted] …` and Node `ECONNRESET` lines that the
 * PTY paints onto the gray bar.
 * @param text - composer or mirror row text.
 */
export function isAbortChromeDraft(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  if (/^Error:\s*\[/iu.test(trimmed)) return true
  if (/\bECONNRESET\b/iu.test(trimmed)) return true
  return false
}

/**
 * Replace `source.slice(start, end)` (either selection direction) with `insert`.
 * @param source - current draft.
 * @param start - textarea `selectionStart`.
 * @param end - textarea `selectionEnd`.
 * @param insert - replacement, possibly empty (cut).
 * @returns the next draft.
 */
export function insertAtRange(
  source: string,
  start: number,
  end: number,
  insert: string,
): string {
  const lo = clampIndex(Math.min(start, end), source.length)
  const hi = clampIndex(Math.max(start, end), source.length)
  return `${source.slice(0, lo)}${insert}${source.slice(hi)}`
}

/**
 * Normalize clipboard newlines for the local `{op:"prompt"}` draft.
 * @param text - `text/plain` clipboard payload.
 * @returns the payload with CRLF/CR turned into `\n`.
 */
export function normalizeComposerPaste(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Flatten clipboard text so a PTY-owned bar cannot treat a newline as Enter.
 * @param text - `text/plain` clipboard payload.
 * @returns the payload with newlines replaced by spaces.
 */
export function flattenPtyPaste(text: string): string {
  return normalizeComposerPaste(text).replace(/\n+/gu, ' ')
}

/**
 * Read `text/plain` from a paste/cut `clipboardData`.
 * @param data - event clipboard store, which browsers may omit.
 * @returns the payload, or empty when absent.
 */
export function readClipboardText(data: DataTransfer | null | undefined): string {
  if (data === null || data === undefined) return ''
  if (typeof data.getData !== 'function') return ''
  const text = data.getData('text/plain')
  return typeof text === 'string' ? text : ''
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0
  if (index > length) return length
  return index
}
