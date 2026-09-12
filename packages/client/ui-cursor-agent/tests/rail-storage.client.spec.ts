// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  persistLiveRail,
  readPersistedRail,
  writePersistedRail,
  OVERLAY_RAIL_STORAGE_KEY,
} from '../src/client/rail-storage.ts'
import { CURSOR_HOST_BOOT_META, readHostBootId } from '../src/client/host-boot.ts'
import {
  adoptOverlaySessionId,
  mintOverlaySessionId,
  resetOverlaySessionIdsForTests,
} from '../src/client/session-id.ts'

const BOOT = 'boot-test'

function setHostBootMeta(id: string | undefined): void {
  for (const el of document.querySelectorAll(`meta[name="${CURSOR_HOST_BOOT_META}"]`)) el.remove()
  if (id === undefined) return
  const meta = document.createElement('meta')
  meta.setAttribute('name', CURSOR_HOST_BOOT_META)
  meta.setAttribute('content', id)
  document.head.append(meta)
}

beforeEach(() => {
  resetOverlaySessionIdsForTests()
  vi.unstubAllGlobals()
  localStorage.clear()
  setHostBootMeta(BOOT)
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  setHostBootMeta(undefined)
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
      bootId: BOOT,
      sessions: [
        { id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' },
        { id: adoptOverlaySessionId('cursor-cli-2'), label: 'B' },
      ],
      activeId: adoptOverlaySessionId('missing'),
    })
    expect(readPersistedRail(BOOT)).toEqual({
      bootId: BOOT,
      sessions: [
        { id: 'cursor-cli-1', label: 'A' },
        { id: 'cursor-cli-2', label: 'B' },
      ],
      activeId: 'cursor-cli-1',
    })
  })

  it('ignores a rail from another host process or a legacy record', () => {
    writePersistedRail({
      bootId: BOOT,
      sessions: [{ id: adoptOverlaySessionId('cursor-cli-24'), label: 'Chat 24' }],
      activeId: adoptOverlaySessionId('cursor-cli-24'),
    })
    expect(readPersistedRail('boot-next')).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      sessions: [{ id: 'cursor-cli-24', label: 'Chat 24' }],
      activeId: 'cursor-cli-24',
    }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
  })

  it('ignores missing, invalid, or incomplete storage', () => {
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, '{')
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, '[]')
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ bootId: BOOT, sessions: [] }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ bootId: BOOT, sessions: 'nope' }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({ bootId: BOOT, sessions: [null] }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: BOOT,
      sessions: [{ id: 1, label: 'A' }],
    }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: BOOT,
      sessions: [{ id: '', label: 'A' }],
    }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: BOOT,
      sessions: [{ id: 'cursor-cli-1', label: '' }],
    }))
    expect(readPersistedRail(BOOT)).toBeUndefined()
  })

  it('swallows storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    })
    expect(readPersistedRail(BOOT)).toBeUndefined()
    writePersistedRail({
      bootId: BOOT,
      sessions: [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      activeId: adoptOverlaySessionId('cursor-cli-1'),
    })
  })

  it('no-ops when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPersistedRail(BOOT)).toBeUndefined()
    writePersistedRail({
      bootId: BOOT,
      sessions: [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      activeId: adoptOverlaySessionId('cursor-cli-1'),
    })
  })

  it('skips persist when the host boot meta is missing', () => {
    setHostBootMeta(undefined)
    persistLiveRail(
      [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      adoptOverlaySessionId('cursor-cli-1'),
    )
    expect(localStorage.getItem(OVERLAY_RAIL_STORAGE_KEY)).toBeNull()
  })

  it('writes the live rail under the index boot id', () => {
    persistLiveRail(
      [{ id: adoptOverlaySessionId('cursor-cli-1'), label: 'A' }],
      adoptOverlaySessionId('cursor-cli-1'),
    )
    expect(readPersistedRail(BOOT)).toEqual({
      bootId: BOOT,
      sessions: [{ id: 'cursor-cli-1', label: 'A' }],
      activeId: 'cursor-cli-1',
    })
  })
})

describe('host boot meta', () => {
  it('reads the index meta and ignores an empty tag', () => {
    expect(readHostBootId()).toBe(BOOT)
    setHostBootMeta('')
    expect(readHostBootId()).toBeUndefined()
    setHostBootMeta(undefined)
    expect(readHostBootId()).toBeUndefined()
  })

  it('no-ops when document is absent', () => {
    vi.stubGlobal('document', undefined)
    expect(readHostBootId()).toBeUndefined()
  })
})
