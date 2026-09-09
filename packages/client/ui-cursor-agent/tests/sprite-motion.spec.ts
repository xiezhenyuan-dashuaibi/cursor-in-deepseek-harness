import { describe, expect, it } from 'vitest'
import {
  headingToOpeningDegrees,
  lerpDegrees,
  spriteIdlePose,
} from '../src/client/sprite-motion.ts'

describe('headingToOpeningDegrees', () => {
  it('returns undefined when the drawing is still', () => {
    expect(headingToOpeningDegrees(0, 0)).toBeUndefined()
  })

  it('points the C gap opposite travel', () => {
    expect(headingToOpeningDegrees(1, 0)).toBe(180)
    expect(headingToOpeningDegrees(-1, 0)).toBe(0)
    expect(headingToOpeningDegrees(0, 1)).toBe(-90)
    expect(headingToOpeningDegrees(0, -1)).toBe(90)
  })
})

describe('lerpDegrees', () => {
  it('takes the shortest arc across the 180/-180 wrap', () => {
    expect(lerpDegrees(170, -170, 0.5)).toBe(180)
    expect(lerpDegrees(-170, 170, 0.5)).toBe(-180)
  })
})

describe('spriteIdlePose', () => {
  it('holds the origin while disconnected', () => {
    expect(spriteIdlePose(800, 'disconnected')).toEqual({ x: 0, y: 0, heading: 0 })
  })

  it('starts by moving right so the C opens left', () => {
    const pose = spriteIdlePose(0, 'live')
    expect(pose.x).toBe(0)
    expect(pose.y).toBeCloseTo(1.8)
    expect(pose.heading).toBe(180)
  })

  it('swims faster while connecting than while live', () => {
    const live = spriteIdlePose(400, 'live')
    const connecting = spriteIdlePose(400, 'connecting')
    expect(Math.abs(connecting.x)).toBeGreaterThan(Math.abs(live.x))
  })
})
