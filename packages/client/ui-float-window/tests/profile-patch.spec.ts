import { describe, expect, it } from 'vitest'
import {
  overlayCardInsertedFromOccupants, scanProfileLoaderRows, setProfileLoaderRowsInserted,
} from '../src/profile-patch.ts'

const dumpLike = `- insert:
    - id: ui-notes
      name: '@deepseek-ai/dsh-client-ui-notes'
    - id: ui-float-window
      name: '@deepseek-ai/dsh-client-ui-float-window'
`

describe('overlay-card profile patch', () => {
  it('scans overlay:live dump rows and treats empty occupants as inserted', () => {
    expect(scanProfileLoaderRows(dumpLike)).toEqual([
      { id: 'ui-notes', name: '@deepseek-ai/dsh-client-ui-notes', disabled: false },
      { id: 'ui-float-window', name: '@deepseek-ai/dsh-client-ui-float-window', disabled: false },
    ])
    expect(overlayCardInsertedFromOccupants([], scanProfileLoaderRows(dumpLike))).toBe(true)
    expect(overlayCardInsertedFromOccupants(['ui-notes'], scanProfileLoaderRows(dumpLike))).toBe(true)
    expect(overlayCardInsertedFromOccupants(['missing'], scanProfileLoaderRows(dumpLike))).toBe(false)
  })

  it('writes and deletes disabled: true on named occupant rows', () => {
    const unplugged = setProfileLoaderRowsInserted(dumpLike, ['ui-notes'], false)
    expect(unplugged).toContain('disabled: true')
    expect(scanProfileLoaderRows(unplugged)).toEqual([
      { id: 'ui-notes', name: '@deepseek-ai/dsh-client-ui-notes', disabled: true },
      { id: 'ui-float-window', name: '@deepseek-ai/dsh-client-ui-float-window', disabled: false },
    ])
    expect(overlayCardInsertedFromOccupants(['ui-notes'], scanProfileLoaderRows(unplugged))).toBe(false)
    expect(setProfileLoaderRowsInserted(unplugged, ['ui-notes'], false)).toBe(unplugged)
    const restored = setProfileLoaderRowsInserted(unplugged, ['ui-notes'], true)
    expect(restored).not.toContain('disabled: true')
    expect(scanProfileLoaderRows(restored)).toEqual(scanProfileLoaderRows(dumpLike))
    expect(setProfileLoaderRowsInserted(dumpLike, ['ui-notes'], true)).toBe(dumpLike)
    expect(() => setProfileLoaderRowsInserted(dumpLike, ['missing'], false))
      .toThrow(/not in the live patch/)
  })
})
