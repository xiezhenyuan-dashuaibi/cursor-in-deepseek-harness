import { describe, expect, it } from 'vitest'
import {
  BLOOM_MS, FEED_AMOUNT, GROWTH_MOISTURE_FLOOR, STORAGE_KEY, WATER_AMOUNT,
  createPlant, fertilize, loadPlant, parsePlant, savePlant, serializePlant,
  stageOf, tick, water,
} from '../src/client/plant.ts'

describe('flower pot growth', () => {
  it('starts as soil and maps later growth to later stages', () => {
    expect(stageOf(0)).toBe('soil')
    expect(stageOf(0.06)).toBe('sprout')
    expect(stageOf(0.22)).toBe('seedling')
    expect(stageOf(0.48)).toBe('bud')
    expect(stageOf(0.78)).toBe('bloom')
  })

  it('does not grow when the soil is too dry', () => {
    const dry = { moisture: GROWTH_MOISTURE_FLOOR - 0.01, nutrients: 1, growth: 0.2, updatedAt: 0 }
    expect(tick(dry, BLOOM_MS).growth).toBe(0.2)
  })

  it('grows toward bloom while wet and fed', () => {
    const start = { moisture: 1, nutrients: 1, growth: 0, updatedAt: 0 }
    const later = tick(start, BLOOM_MS)
    expect(later.growth).toBeGreaterThan(0.5)
    expect(stageOf(later.growth)).not.toBe('soil')
  })

  it('water and fertilizer raise the matching fields after catching up', () => {
    const start = createPlant(0)
    const wet = water(start, 1_000)
    expect(wet.moisture).toBeGreaterThan(start.moisture)
    expect(wet.moisture).toBeLessThanOrEqual(1)
    const fed = fertilize(wet, 2_000)
    expect(fed.nutrients).toBeGreaterThan(wet.nutrients)
    expect(water({ ...start, moisture: 0.9 }, 0).moisture).toBe(1)
    expect(fertilize({ ...start, nutrients: 0.9 }, 0).nutrients).toBe(1)
    expect(WATER_AMOUNT).toBeGreaterThan(0)
    expect(FEED_AMOUNT).toBeGreaterThan(0)
  })

  it('treats a clock that moved backwards as zero elapsed time', () => {
    const start = createPlant(10_000)
    expect(tick(start, 1_000).updatedAt).toBe(1_000)
    expect(tick(start, 1_000).growth).toBe(start.growth)
  })

  it('replants when storage is missing or unusable', () => {
    expect(parsePlant(null, 5).updatedAt).toBe(5)
    expect(parsePlant('{', 5).updatedAt).toBe(5)
    expect(parsePlant('[]', 5).updatedAt).toBe(5)
    expect(parsePlant('null', 5).updatedAt).toBe(5)
    expect(parsePlant('{"moisture":2,"nutrients":0,"growth":0,"updatedAt":1}', 5).updatedAt).toBe(5)
    expect(parsePlant('{"moisture":0,"nutrients":0,"growth":0,"updatedAt":"x"}', 5).updatedAt).toBe(5)
  })

  it('round-trips a valid snapshot through storage', () => {
    const store: Record<string, string> = {}
    const state = { moisture: 0.4, nutrients: 0.3, growth: 0.1, updatedAt: 9 }
    savePlant({ setItem(key, value) { store[key] = value } }, state)
    expect(store[STORAGE_KEY]).toBe(serializePlant(state))
    const loaded = loadPlant({ getItem(key) { return store[key] ?? null } }, 9)
    expect(loaded).toEqual(state)
  })
})
