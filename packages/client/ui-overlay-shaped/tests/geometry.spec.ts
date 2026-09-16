import { describe, expect, it } from 'vitest'
import {
  clampShapedOffset, isShapedClick, offsetAfterMove, restBoxFromRects,
  sameShapedCanvas, sameShapedOffset, SHAPED_CLICK_SLOP, unionViewportBoxes,
} from '../src/client/geometry.ts'

const rest = { x: 40, y: 50, width: 120, height: 80 }
const canvas = { width: 800, height: 600 }

describe('shaped seat geometry', () => {
  it('treats travel at the slop radius as a click', () => {
    expect(isShapedClick(SHAPED_CLICK_SLOP, 0)).toBe(true)
    expect(isShapedClick(SHAPED_CLICK_SLOP + 1, 0)).toBe(false)
    expect(isShapedClick(0, 0)).toBe(true)
  })

  it('adds pointer delta onto the origin offset', () => {
    expect(offsetAfterMove({ x: 4, y: -2 }, 10, 3)).toEqual({ x: 14, y: 1 })
  })

  it('recovers a rest box from live rects', () => {
    expect(restBoxFromRects(
      { left: 10, top: 20, width: 800, height: 600 },
      { left: 55, top: 77, width: 120, height: 80 },
      { x: 5, y: 7 },
    )).toEqual({ x: 40, y: 50, width: 120, height: 80 })
  })

  it('unions occupant painted boxes', () => {
    expect(unionViewportBoxes([])).toBeUndefined()
    expect(unionViewportBoxes([
      { left: 40, top: 50, width: 20, height: 10 },
      { left: 10, top: 80, width: 50, height: 30 },
    ])).toEqual({ left: 10, top: 50, width: 50, height: 60 })
  })

  it('keeps the occupant box on the playable board', () => {
    expect(clampShapedOffset({ x: 10, y: 12 }, rest, canvas)).toEqual({ x: 10, y: 12 })
    expect(clampShapedOffset({ x: -5000, y: -5000 }, rest, canvas)).toEqual({ x: -40, y: -50 })
    expect(clampShapedOffset({ x: 5000, y: 4000 }, rest, canvas)).toEqual({ x: 640, y: 470 })
  })

  it('leaves the offset unchanged on a non-positive canvas', () => {
    expect(clampShapedOffset({ x: 5000, y: 12 }, rest, { width: 0, height: 600 }))
      .toEqual({ x: 5000, y: 12 })
    expect(clampShapedOffset({ x: 12, y: 5000 }, rest, { width: 800, height: Number.NaN }))
      .toEqual({ x: 12, y: 5000 })
  })

  it('pins an oversized silhouette to the board origin', () => {
    expect(clampShapedOffset(
      { x: 80, y: 90 },
      { x: 10, y: 20, width: 900, height: 700 },
      canvas,
    )).toEqual({ x: -10, y: -20 })
  })

  it('compares offsets and canvases', () => {
    expect(sameShapedOffset({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
    expect(sameShapedOffset({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false)
    expect(sameShapedCanvas(canvas, { width: 800, height: 600 })).toBe(true)
    expect(sameShapedCanvas(canvas, { width: 801, height: 600 })).toBe(false)
  })
})
