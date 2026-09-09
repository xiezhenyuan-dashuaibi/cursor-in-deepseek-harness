import { describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS } from '../src/client/geometry.ts'
import {
  DEFAULT_HEIGHT, DEFAULT_WIDTH, DEFAULT_X, DEFAULT_Y,
  dropUnknownSeatKeys, placeNewCard,
} from '../src/client/stores.ts'
import type { OverlayCardNumber } from '../src/instances.ts'

describe('overlay desk store helpers', () => {
  it('drops leftover keys that are not current roster seats', () => {
    const record = { 1: true, 2: true, foo: true, 9: true } as Partial<Record<OverlayCardNumber, true>>
    expect(dropUnknownSeatKeys(record, new Set([1]))).toEqual({ 1: true })
  })

  it('places a new card without stacking from holes or docked frames', () => {
    expect(placeNewCard(
      {
        1: undefined,
        2: { x: 80, y: 90, width: 500, height: 400 },
      },
      DEFAULT_WIDTH,
      DEFAULT_HEIGHT,
      DEFAULT_CANVAS,
      { 2: { edge: 'top', along: 0 } },
    )).toEqual({
      x: DEFAULT_X, y: DEFAULT_Y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
    })
  })
})
