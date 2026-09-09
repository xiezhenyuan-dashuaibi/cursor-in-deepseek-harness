// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OVERLAY_GEOMETRY_STORAGE_KEY,
  hydrateOverlayGeometry,
  readPersistedGeometry,
  writePersistedGeometry,
} from '../src/client/geometry-storage.ts'
import {
  defaultOverlayBox,
  defaultSpriteBox,
} from '../src/client/overlay-position.ts'

beforeEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('overlay geometry storage', () => {
  it('round-trips a box and optional sprite', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      sprite: { left: 100, top: 200, width: 52, height: 52 },
      minimized: true,
    })
    expect(readPersistedGeometry()).toEqual({
      box: { left: 120, top: 80, width: 500, height: 360 },
      sprite: { left: 100, top: 200, width: 52, height: 52 },
      minimized: true,
    })
  })

  it('hydrates the centered default when nothing is stored', () => {
    expect(hydrateOverlayGeometry(1920, 1080)).toEqual({
      box: defaultOverlayBox(1920, 1080),
      minimized: false,
      expanded: defaultOverlayBox(1920, 1080),
      sprite: null,
    })
  })

  it('hydrates the expanded box from storage', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      sprite: { left: 100, top: 200, width: 52, height: 52 },
      minimized: false,
    })
    const next = hydrateOverlayGeometry(1920, 1080)
    expect(next.minimized).toBe(false)
    expect(next.box).toEqual({ left: 120, top: 80, width: 500, height: 360 })
    expect(next.sprite).toEqual({ left: 100, top: 200, width: 52, height: 52 })
  })

  it('hydrates a minimized sprite from storage', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      sprite: { left: 100, top: 200, width: 52, height: 52 },
      minimized: true,
    })
    const minimized = hydrateOverlayGeometry(1920, 1080)
    expect(minimized.minimized).toBe(true)
    expect(minimized.box).toEqual({ left: 100, top: 200, width: 52, height: 52 })
    expect(minimized.expanded).toEqual({ left: 120, top: 80, width: 500, height: 360 })
  })

  it('uses the default sprite when minimized storage omits one', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      minimized: true,
    })
    expect(hydrateOverlayGeometry(1920, 1080).box).toEqual(defaultSpriteBox(1920, 1080))
  })

  it('ignores missing, invalid, or incomplete storage', () => {
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, '{')
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, '[]')
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, 'null')
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, '4')
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, JSON.stringify({ minimized: true }))
    expect(readPersistedGeometry()).toBeUndefined()
    localStorage.setItem(OVERLAY_GEOMETRY_STORAGE_KEY, JSON.stringify({
      box: { left: 'nope', top: 0, width: 500, height: 360 },
    }))
    expect(readPersistedGeometry()).toBeUndefined()
  })

  it('swallows storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    })
    expect(readPersistedGeometry()).toBeUndefined()
    writePersistedGeometry({
      box: { left: 0, top: 0, width: 500, height: 360 },
      minimized: false,
    })
  })

  it('no-ops when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPersistedGeometry()).toBeUndefined()
    writePersistedGeometry({
      box: { left: 0, top: 0, width: 500, height: 360 },
      minimized: false,
    })
  })
})
