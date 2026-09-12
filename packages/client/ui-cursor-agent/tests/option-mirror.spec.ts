import { describe, expect, it } from 'vitest'
import { isMirrorCursorRow } from '../src/client/OptionMirror.tsx'

describe('isMirrorCursorRow', () => {
  it('follows host reverse-video even without a → glyph', () => {
    expect(isMirrorCursorRow({ text: '  /model  Select model', highlighted: true })).toBe(true)
  })

  it('follows a leading → when the host omits reverse-video', () => {
    expect(isMirrorCursorRow({
      text: '  → /Ask  Toggle ask mode (Q&A, read-only / no edits or command execution)',
      highlighted: false,
    })).toBe(true)
  })

  it('does not treat pager chrome as the selection', () => {
    expect(isMirrorCursorRow({ text: '  ↓ more below', highlighted: false })).toBe(false)
    expect(isMirrorCursorRow({ text: '  ↑ more above', highlighted: false })).toBe(false)
  })
})
