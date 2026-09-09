import { describe, expect, it } from 'vitest'
import {
  flattenPtyPaste,
  insertAtRange,
  isAbortChromeDraft,
  isClipboardEditShortcut,
  normalizeComposerPaste,
  ptyOwnsComposer,
  readClipboardText,
} from '../src/client/composer-clipboard.ts'

describe('composer clipboard helpers', () => {
  it('recognizes Ctrl/Cmd clipboard chords and ignores Alt or bare keys', () => {
    expect(isClipboardEditShortcut('c', { ctrl: true })).toBe(true)
    expect(isClipboardEditShortcut('V', { meta: true })).toBe(true)
    expect(isClipboardEditShortcut('x', { ctrl: true, meta: true })).toBe(true)
    expect(isClipboardEditShortcut('c', { ctrl: true, alt: true })).toBe(false)
    expect(isClipboardEditShortcut('c', {})).toBe(false)
    expect(isClipboardEditShortcut('Enter', { ctrl: true })).toBe(false)
  })

  it('treats slash drafts, picker rows, and the mirror latch as PTY-owned', () => {
    expect(ptyOwnsComposer('hello', 0, false)).toBe(false)
    expect(ptyOwnsComposer('/model', 0, false)).toBe(true)
    expect(ptyOwnsComposer('', 1, false)).toBe(true)
    expect(ptyOwnsComposer('', 0, true)).toBe(true)
  })

  it('recognizes abort banners so they cannot own the composer', () => {
    expect(isAbortChromeDraft('')).toBe(false)
    expect(isAbortChromeDraft('hello')).toBe(false)
    expect(isAbortChromeDraft('Error: [aborted] read ECONNRESET')).toBe(true)
    expect(isAbortChromeDraft('  read ECONNRESET  ')).toBe(true)
  })

  it('inserts at either selection direction and clamps out-of-range indices', () => {
    expect(insertAtRange('abcd', 1, 3, 'X')).toBe('aXd')
    expect(insertAtRange('abcd', 3, 1, 'X')).toBe('aXd')
    expect(insertAtRange('ab', -2, 99, 'Z')).toBe('Z')
    expect(insertAtRange('ab', 1, 1, '')).toBe('ab')
  })

  it('normalizes composer newlines and flattens PTY paste so Enter cannot sneak in', () => {
    expect(normalizeComposerPaste('a\r\nb\rc')).toBe('a\nb\nc')
    expect(flattenPtyPaste('a\r\nb\n\nc')).toBe('a b c')
  })

  it('reads text/plain and treats a missing clipboard store as empty', () => {
    expect(readClipboardText(undefined)).toBe('')
    expect(readClipboardText(null)).toBe('')
    expect(readClipboardText({} as DataTransfer)).toBe('')
    expect(readClipboardText({ getData: () => 1 } as unknown as DataTransfer)).toBe('')
    expect(readClipboardText({ getData: () => 'ok' } as unknown as DataTransfer)).toBe('ok')
  })
})
