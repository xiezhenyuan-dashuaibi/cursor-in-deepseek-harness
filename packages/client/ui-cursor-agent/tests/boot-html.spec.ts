import { describe, expect, it } from 'vitest'
import { CURSOR_HOST_BOOT_META, injectCursorHostBoot } from '../src/boot-html.ts'

describe('cursor host boot html', () => {
  it('inserts an escaped meta tag after the opening head', () => {
    expect(injectCursorHostBoot('<head></head>', 'a"b&c<d')).toBe(
      `<head><meta name="${CURSOR_HOST_BOOT_META}" content="a&quot;b&amp;c&lt;d"></head>`,
    )
  })

  it('prefixes when the document has no head', () => {
    expect(injectCursorHostBoot('<body></body>', 'boot-1')).toBe(
      `<meta name="${CURSOR_HOST_BOOT_META}" content="boot-1"><body></body>`,
    )
  })
})
