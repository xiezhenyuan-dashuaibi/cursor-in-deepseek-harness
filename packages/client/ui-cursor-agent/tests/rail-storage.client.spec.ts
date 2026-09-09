// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readPersistedRail,
  writePersistedRail,
  OVERLAY_RAIL_STORAGE_KEY,
} from '../src/client/rail-storage.ts'
import {
  adoptOverlaySessionId,
  mintOverlaySessionId,
  resetOverlaySessionIdsForTests,
} from '../src/client/session-id.ts'

beforeEach(() => {
  resetOverlaySessionIdsForTests()
  vi.unstubAllGlobals()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('overlay session ids', () => {
  it('adopts cursor-cli-N and keeps minting past that ordinal', () => {
    expect(adoptOverlaySessionId('other-id')).toBe('other-id')
    expect(adoptOverlaySessionId('cursor-cli-7')).toBe('cursor-cli-7')
    expect(mintOverlaySessionId()).toBe('cursor-cli-8')
  })
})

describe('overlay rail storage', () => {
  it('round-trips a rail and falls back when activeId is unknown', () => {
    writePersistedRail({
      sessions: [
        { id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' },
        { id: adoptOverlaySessionId('cursor-cli-2'), label: 'B' },
      ],
      activeId: adoptOverlaySessionId('missing'),
    })
    expect(readPersistedRail()).toEqual({
      sessions: [
        { id: 'cursor-cli-1', label: 'A' },
        { id: 'cursor-cli-2', label: 'B' },
      ],
      activeId: 'cursor-cli-1',
    })
  })

  it('ignores missing, invalid, or incomplete storage', () => {
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, '{')
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, '[]')
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ sessions: [] }))
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ sessions: 'nope' }))
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ sessions: [null] }))
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      sessions: [{ id: 1, label: 'A' }],
    }))
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      sessions: [{ id: '', label: 'A' }],
    }))
    expect(readPersistedRail()).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      sessions: [{ id: 'cursor-cli-1', label: '' }],
    }))
    expect(readPersistedRail()).toBeUndefined()
  })

  it('swallows storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    })
    expect(readPersistedRail()).toBeUndefined()
    writePersistedRail({
      sessions: [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      activeId: adoptOverlaySessionId('cursor-cli-1'),
    })
  })

  it('no-ops when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPersistedRail()).toBeUndefined()
    writePersistedRail({
      sessions: [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      activeId: adoptOverlaySessionId('cursor-cli-1'),
    })
  })
})
