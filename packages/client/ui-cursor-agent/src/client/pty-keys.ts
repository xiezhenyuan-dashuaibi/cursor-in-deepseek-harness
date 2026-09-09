/** Map browser KeyboardEvents to Cursor CLI PTY bytes. */

/**
 * Encode a keydown into PTY bytes while a slash/option surface owns the composer.
 * Clipboard chords (Ctrl/Cmd+C/V/X) are not encoded here — `ChatSession` handles
 * `copy` / `cut` / `paste` and only forwards Ctrl+C as `\x03` when the caret is
 * collapsed on a PTY-owned bar.
 * @param key - `KeyboardEvent.key`.
 * @param mods - ctrl / alt / meta from the event.
 * @returns bytes to send as `{op:"keys"}`, or `undefined` to ignore.
 */
export function encodePtyKey(
  key: string,
  mods: { ctrl?: boolean; alt?: boolean; meta?: boolean },
): string | undefined {
  if (mods.meta === true || mods.alt === true) return undefined
  if (mods.ctrl === true) {
    if (key === 'c' || key === 'C') return '\x03'
    if (key === 'u' || key === 'U') return '\x15'
    if (key === 'a' || key === 'A') return '\x01'
    if (key === 'e' || key === 'E') return '\x05'
    if (key === 'w' || key === 'W') return '\x17'
    return undefined
  }
  switch (key) {
    case 'ArrowUp': return '\x1b[A'
    case 'ArrowDown': return '\x1b[B'
    case 'ArrowRight': return '\x1b[C'
    case 'ArrowLeft': return '\x1b[D'
    case 'Enter': return '\r'
    case 'Escape': return '\x1b'
    case 'Backspace': return '\x7f'
    case 'Tab': return '\t'
    case 'Delete': return '\x1b[3~'
    case 'Home': return '\x1b[H'
    case 'End': return '\x1b[F'
    default:
      break
  }
  if (key.length === 1) return key
  return undefined
}
