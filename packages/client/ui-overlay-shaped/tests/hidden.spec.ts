import { describe, expect, it } from 'vitest'
import {
  formatOverlayShapedHidden, parseOverlayShapedHidden, setOverlayShapedHiddenIds,
} from '../src/hidden.ts'

describe('overlay shaped hide file', () => {
  it('parses loader ids and ignores invalid payloads', () => {
    expect(parseOverlayShapedHidden('not-json')).toEqual([])
    expect(parseOverlayShapedHidden('null')).toEqual([])
    expect(parseOverlayShapedHidden('[]')).toEqual([])
    expect(parseOverlayShapedHidden('{}')).toEqual([])
    expect(parseOverlayShapedHidden('{"hidden":{}}')).toEqual([])
    expect(parseOverlayShapedHidden('{"hidden":["", 1, "ui-sprite", "ui-sprite"]}'))
      .toEqual(['ui-sprite'])
  })

  it('formats and toggles one loader id', () => {
    expect(formatOverlayShapedHidden(['ui-sprite'])).toBe(`${JSON.stringify({ hidden: ['ui-sprite'] }, null, 2)}\n`)
    expect(setOverlayShapedHiddenIds([], 'ui-sprite', true)).toEqual(['ui-sprite'])
    expect(setOverlayShapedHiddenIds(['ui-sprite'], 'ui-sprite', true)).toEqual(['ui-sprite'])
    expect(setOverlayShapedHiddenIds(['ui-sprite'], 'ui-sprite', false)).toEqual([])
  })
})
