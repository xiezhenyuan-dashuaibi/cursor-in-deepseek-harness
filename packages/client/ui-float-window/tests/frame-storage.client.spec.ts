// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OVERLAY_CARD_FRAMES_STORAGE_KEY,
  readPersistedCardFrames,
  snapshotCardLayout,
  writePersistedCardFrames,
} from '../src/client/frame-storage.ts'

beforeEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('overlay card frame storage', () => {
  it('round-trips frames, front, and per-card docks, skipping unknown ids', () => {
    writePersistedCardFrames({
      frames: {
        barber: { x: 40, y: 80, width: 500, height: 400 },
        '1': { x: 36, y: 56, width: 360, height: 280 },
      },
      front: ['1', 'barber', '1', 'nope!'],
      docks: {
        barber: { edge: 'left', along: 80 },
        'nope!': { edge: 'top', along: 0 },
      },
      parks: {
        barber: { edge: 'bottom', along: 24 },
        'nope!': { edge: 'top', along: 0 },
      },
    })
    expect(readPersistedCardFrames()).toEqual({
      frames: {
        barber: { x: 40, y: 80, width: 500, height: 400 },
        '1': { x: 36, y: 56, width: 360, height: 280 },
      },
      front: ['1', 'barber'],
      docks: { barber: { edge: 'left', along: 80 } },
      parks: { barber: { edge: 'bottom', along: 24 } },
    })
  })

  it('snapshots only seats that have both identity and frame', () => {
    expect(snapshotCardLayout(
      {
        1: { id: 'barber' },
        2: { id: 'hub' },
        3: { id: 'bad id!' },
        4: undefined,
      },
      { 1: { x: 10, y: 20, width: 360, height: 280 } },
      [9, 1, 1, 2],
      {
        1: { edge: 'bottom', along: 24 },
        2: undefined,
        3: { edge: 'left', along: 0 },
        6: { edge: 'north', along: 0 } as never,
        9: { edge: 'right', along: 0 },
      },
      {
        1: { edge: 'left', along: 80 },
        2: undefined,
        3: { edge: 'top', along: 0 },
        6: { edge: 'north', along: 0 } as never,
        9: { edge: 'right', along: 0 },
      },
    )).toEqual({
      frames: { barber: { x: 10, y: 20, width: 360, height: 280 } },
      front: ['barber'],
      docks: { barber: { edge: 'bottom', along: 24 } },
      parks: { barber: { edge: 'left', along: 80 } },
    })
  })

  it('keeps a legacy rail blob so the store can migrate it', () => {
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({
      frames: { '1': { x: 8, y: 9, width: 360, height: 280 } },
      front: ['1'],
      dockEdge: 'left',
      minimized: ['1', '1', 'nope!'],
    }))
    expect(readPersistedCardFrames()).toEqual({
      frames: { '1': { x: 8, y: 9, width: 360, height: 280 } },
      front: ['1'],
      dockEdge: 'left',
      minimized: ['1'],
    })
  })

  it('ignores missing, invalid, or empty storage', () => {
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, '{')
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, '[]')
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, 'null')
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({ frames: [] }))
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({ frames: {} }))
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({
      frames: { '1': null },
    }))
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({
      frames: { '1': { x: 'nope', y: 1, width: 360, height: 280 } },
    }))
    expect(readPersistedCardFrames()).toBeUndefined()
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({
      frames: {
        'bad id': { x: 0, y: 0, width: 360, height: 280 },
        '1': { x: 8, y: 9, width: 360, height: 280 },
      },
      front: 'nope',
      docks: [],
    }))
    expect(readPersistedCardFrames()).toEqual({
      frames: { '1': { x: 8, y: 9, width: 360, height: 280 } },
      front: [],
    })
  })

  it('ignores an invalid dockEdge, empty minimized list, and invalid docks', () => {
    localStorage.setItem(OVERLAY_CARD_FRAMES_STORAGE_KEY, JSON.stringify({
      frames: { '1': { x: 8, y: 9, width: 360, height: 280 } },
      front: ['1'],
      dockEdge: 'north',
      minimized: [],
      docks: { '1': { edge: 'north', along: 0 }, 'bad id': { edge: 'top', along: 1 } },
      parks: { '1': { edge: 'north', along: 0 }, 'bad id': { edge: 'left', along: 1 } },
    }))
    expect(readPersistedCardFrames()).toEqual({
      frames: { '1': { x: 8, y: 9, width: 360, height: 280 } },
      front: ['1'],
    })
  })

  it('swallows storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    })
    expect(readPersistedCardFrames()).toBeUndefined()
    writePersistedCardFrames({
      frames: { '1': { x: 0, y: 0, width: 360, height: 280 } },
      front: ['1'],
    })
  })

  it('no-ops when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPersistedCardFrames()).toBeUndefined()
    writePersistedCardFrames({
      frames: { '1': { x: 0, y: 0, width: 360, height: 280 } },
      front: ['1'],
    })
  })
})
