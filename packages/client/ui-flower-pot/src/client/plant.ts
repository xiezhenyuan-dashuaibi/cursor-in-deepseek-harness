/**
 * Local flower-pot growth. Moisture and nutrients decay in real time; growth
 * advances only while the soil is wet. Snapshot fields are JSON-safe.
 */

/** `localStorage` key for this origin's pot. */
export const STORAGE_KEY = 'dsh.overlay-flower-pot.state'

/** Moisture halves in this many milliseconds. */
export const MOISTURE_HALF_LIFE_MS = 80_000

/** Nutrients halves in this many milliseconds. */
export const NUTRIENT_HALF_LIFE_MS = 180_000

/** Ideal wet+fed time from seed to full bloom. */
export const BLOOM_MS = 240_000

/** Moisture added by one watering. */
export const WATER_AMOUNT = 0.45

/** Nutrients added by one feeding. */
export const FEED_AMOUNT = 0.4

/** Soil must stay at least this wet for the vine to grow. */
export const GROWTH_MOISTURE_FLOOR = 0.18

/** Visible wilt below this moisture. */
export const WILT_MOISTURE = 0.16

/** "土有点干" below this moisture. */
export const THIRSTY_MOISTURE = 0.35

/** Growth stage painted by the pot. */
export type PlantStage = 'soil' | 'sprout' | 'seedling' | 'bud' | 'bloom'

/** Persisted pot snapshot. */
export interface PlantSnapshot {
  /** 0..1 soil wetness. */
  readonly moisture: number
  /** 0..1 fertilizer remaining. */
  readonly nutrients: number
  /** 0..1 vine progress. */
  readonly growth: number
  /** Epoch ms of this snapshot. */
  readonly updatedAt: number
}

/**
 * A newly planted seed in slightly damp soil.
 * @param now - epoch ms.
 * @returns the starting snapshot.
 */
export function createPlant(now: number): PlantSnapshot {
  return { moisture: 0.55, nutrients: 0.2, growth: 0, updatedAt: now }
}

/**
 * Advance decay and growth to `now`.
 * @param state - last snapshot.
 * @param now - epoch ms.
 * @returns the snapshot at `now`.
 */
export function tick(state: PlantSnapshot, now: number): PlantSnapshot {
  const dt = Math.max(0, now - state.updatedAt)
  let growth = state.growth
  if (state.moisture >= GROWTH_MOISTURE_FLOOR) {
    const feed = 0.4 + 0.6 * state.nutrients
    growth = clamp01(growth + (dt / BLOOM_MS) * feed * state.moisture)
  }
  const moisture = clamp01(state.moisture * Math.pow(0.5, dt / MOISTURE_HALF_LIFE_MS))
  const nutrients = clamp01(state.nutrients * Math.pow(0.5, dt / NUTRIENT_HALF_LIFE_MS))
  return { moisture, nutrients, growth, updatedAt: now }
}

/**
 * Water the soil after catching up to `now`.
 * @param state - last snapshot.
 * @param now - epoch ms.
 * @returns the watered snapshot.
 */
export function water(state: PlantSnapshot, now: number): PlantSnapshot {
  const current = tick(state, now)
  return { ...current, moisture: clamp01(current.moisture + WATER_AMOUNT) }
}

/**
 * Feed the soil after catching up to `now`.
 * @param state - last snapshot.
 * @param now - epoch ms.
 * @returns the fed snapshot.
 */
export function fertilize(state: PlantSnapshot, now: number): PlantSnapshot {
  const current = tick(state, now)
  return { ...current, nutrients: clamp01(current.nutrients + FEED_AMOUNT) }
}

/**
 * Map vine progress to a painted stage.
 * @param growth - 0..1.
 * @returns the stage.
 */
export function stageOf(growth: number): PlantStage {
  if (growth < 0.06) return 'soil'
  if (growth < 0.22) return 'sprout'
  if (growth < 0.48) return 'seedling'
  if (growth < 0.78) return 'bud'
  return 'bloom'
}

/**
 * Read and catch up a stored snapshot, or plant a new seed.
 * @param storage - `localStorage` or a test double.
 * @param now - epoch ms.
 * @returns a live snapshot.
 */
export function loadPlant(storage: Pick<Storage, 'getItem'>, now: number): PlantSnapshot {
  return tick(parsePlant(storage.getItem(STORAGE_KEY), now), now)
}

/**
 * Persist a snapshot.
 * @param storage - `localStorage` or a test double.
 * @param state - snapshot to write.
 */
export function savePlant(storage: Pick<Storage, 'setItem'>, state: PlantSnapshot): void {
  storage.setItem(STORAGE_KEY, serializePlant(state))
}

/**
 * Parse operator residue from `localStorage`.
 * @param raw - stored JSON, or `null` when missing.
 * @param now - epoch ms used when the payload is unusable.
 * @returns a valid snapshot.
 */
export function parsePlant(raw: string | null, now: number): PlantSnapshot {
  if (raw === null) return createPlant(now)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createPlant(now)
    }
    const record = parsed as Record<string, unknown>
    if (
      !isUnit(record.moisture)
      || !isUnit(record.nutrients)
      || !isUnit(record.growth)
      || typeof record.updatedAt !== 'number'
      || !Number.isFinite(record.updatedAt)
    ) {
      return createPlant(now)
    }
    return {
      moisture: record.moisture,
      nutrients: record.nutrients,
      growth: record.growth,
      updatedAt: record.updatedAt,
    }
  } catch {
    // Operator residue in localStorage is not a plant snapshot.
    return createPlant(now)
  }
}

/**
 * JSON for `localStorage`.
 * @param state - snapshot.
 * @returns a JSON object string.
 */
export function serializePlant(state: PlantSnapshot): string {
  return JSON.stringify({
    moisture: state.moisture,
    nutrients: state.nutrients,
    growth: state.growth,
    updatedAt: state.updatedAt,
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
