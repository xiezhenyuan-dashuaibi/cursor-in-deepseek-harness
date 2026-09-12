import { describe, expect, it } from 'vitest'
import {
  appendOverlayCard, appendOverlayCardOccupant, defaultOverlayCardSpec, dropOverlayCard,
  formatOverlayCardInstances, isOverlayCardHidden, isOverlayCardInserted, isOverlayCardMounted,
  isOverlayCardRoster, isProtectedOverlayCardLoaderId, overlayCardBodySlot,
  overlayCardDeclaredSeatCount, overlayCardRosterListsInserted,
  overlayCardSeatFromBodySlot, overlayCardTrailingSlot, parseOverlayCardInstanceId,
  parseOverlayCardInstances, persistOverlayCardSpec, resolveOverlayCardInsert,
  setOverlayCardHidden, type OverlayCardSpec,
} from '../src/instances.ts'

const first = defaultOverlayCardSpec()

function spec(seat: OverlayCardSpec['seat'], extra?: Partial<OverlayCardSpec>): OverlayCardSpec {
  return {
    seat,
    id: extra?.id ?? String(seat),
    title: extra?.title ?? '卡片',
    width: extra?.width ?? 360,
    height: extra?.height ?? 280,
    ...(extra?.hidden === true ? { hidden: true } : {}),
    ...(extra?.occupants !== undefined ? { occupants: extra.occupants } : {}),
    ...(extra?.inserted !== undefined ? { inserted: extra.inserted } : {}),
  }
}

describe('overlay-card instances', () => {
  it('parses slot names and remove ids', () => {
    expect(overlayCardBodySlot(1)).toBe('overlay-card.body')
    expect(overlayCardBodySlot(2)).toBe('overlay-card-2.body')
    expect(overlayCardTrailingSlot(1)).toBe('overlay-card.chrome.trailing')
    expect(overlayCardTrailingSlot(3)).toBe('overlay-card-3.chrome.trailing')
    expect(() => overlayCardBodySlot(0)).toThrow(/positive integer/)
    expect(overlayCardSeatFromBodySlot('overlay-card.body')).toBe(1)
    expect(overlayCardSeatFromBodySlot('overlay-card-4.body')).toBe(4)
    expect(overlayCardSeatFromBodySlot('overlay-card-9.body')).toBe(9)
    expect(overlayCardSeatFromBodySlot('overlay-card-10.body')).toBe(10)
    expect(overlayCardSeatFromBodySlot('overlay-card-1.body')).toBeUndefined()
    expect(parseOverlayCardInstanceId('overlay-card-2')).toBe('2')
    expect(parseOverlayCardInstanceId('overlay-card-draft')).toBe('draft')
    expect(parseOverlayCardInstanceId('ui-float-window')).toBeUndefined()
    expect(isProtectedOverlayCardLoaderId('ui-float-window')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('ui-overlay-desktop')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('overlay-card-plug-rpc')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('overlay-card-hide-rpc')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('overlay-plugin-roster-rpc')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('overlay-plugin-rail-rpc')).toBe(true)
    expect(isProtectedOverlayCardLoaderId('ui-notes')).toBe(false)
    expect(overlayCardRosterListsInserted({ cards: [first] })).toBe(false)
    expect(overlayCardRosterListsInserted({ cards: [{ ...first, inserted: false }] })).toBe(true)
  })

  it('resolves insert defaults and rejects duplicate or invalid flags', () => {
    expect(resolveOverlayCardInsert([])).toEqual(first)
    expect(appendOverlayCard([])).toEqual([first])
    expect(appendOverlayCard([first])).toEqual([first, spec(2)])
    expect(appendOverlayCard([first], {
      id: 'draft',
      title: '草稿',
      width: 520,
      height: 400,
    })).toEqual([first, spec(2, { id: 'draft', title: '草稿', width: 520, height: 400 })])
    expect(dropOverlayCard([first, spec(2)], '1')).toEqual([spec(2)])
    expect(() => dropOverlayCard([first], '2')).toThrow(/not loaded/)
    expect(() => appendOverlayCard([first], { id: '1' })).toThrow(/already loaded/)
    expect(() => appendOverlayCard([first], { width: 100 })).toThrow(/--width/)
    expect(() => appendOverlayCard([first], { title: '  ' })).toThrow(/--title/)
    let nine = [first]
    for (let n = 2; n <= 9; n += 1) nine = appendOverlayCard(nine)
    expect(nine).toHaveLength(9)
    expect(nine[8]?.seat).toBe(9)
    expect(overlayCardBodySlot(9)).toBe('overlay-card-9.body')
    expect(overlayCardDeclaredSeatCount(0)).toBe(8)
    expect(overlayCardDeclaredSeatCount(8)).toBe(8)
    expect(overlayCardDeclaredSeatCount(9)).toBe(16)
    expect(overlayCardDeclaredSeatCount(17)).toBe(32)
  })

  it('round-trips instances.json and migrates plugged:false to hidden', () => {
    const cards = [first, spec(2)]
    const text = formatOverlayCardInstances(cards)
    expect(parseOverlayCardInstances(text)).toEqual(cards)
    expect(isOverlayCardRoster({ cards })).toBe(true)
    expect(isOverlayCardRoster({ cards: [1, 2] })).toBe(false)
    expect(isOverlayCardRoster({ cards: [first, { ...first, seat: 2 }] })).toBe(false)
    expect(parseOverlayCardInstances(`${JSON.stringify({
      cards: [{ seat: 1, id: '1', title: '卡片', width: 360, height: 280, plugged: false }],
    }, null, 2)}\n`)).toEqual([{ ...first, hidden: true }])
    expect(parseOverlayCardInstances(formatOverlayCardInstances([
      first,
      { ...spec(2), hidden: true },
    ]))).toEqual([first, { ...spec(2), hidden: true }])
    expect(setOverlayCardHidden([first, spec(2)], '2', true)).toEqual([
      first, { ...spec(2), hidden: true },
    ])
    expect(setOverlayCardHidden([{ ...first, hidden: true }], '1', false)).toEqual([first])
    expect(isOverlayCardHidden(first)).toBe(false)
    expect(isOverlayCardHidden({ ...first, hidden: true })).toBe(true)
    expect(isOverlayCardInserted(first)).toBe(true)
    expect(isOverlayCardInserted({ ...first, inserted: false })).toBe(false)
    expect(isOverlayCardMounted(first)).toBe(true)
    expect(isOverlayCardMounted({ ...first, hidden: true })).toBe(false)
    expect(isOverlayCardMounted({ ...first, inserted: false })).toBe(false)
    expect(isOverlayCardMounted({ ...first, hidden: true, inserted: true })).toBe(false)
    expect(isOverlayCardRoster({ cards: [{ ...first, hidden: true }] })).toBe(true)
    expect(isOverlayCardRoster({ cards: [{ ...first, hidden: 'no' }] })).toBe(false)
    expect(isOverlayCardRoster({ cards: [{ ...first, plugged: true }] })).toBe(true)
    expect(isOverlayCardRoster({ cards: [{ ...first, plugged: 'no' }] })).toBe(false)
    expect(isOverlayCardRoster({ cards: [{ ...first, inserted: false }] })).toBe(true)
    expect(persistOverlayCardSpec({ ...first, inserted: false, hidden: true })).toEqual({
      ...first, hidden: true,
    })
    expect(() => setOverlayCardHidden([first], '2', true)).toThrow(/not loaded/)
    expect(() => parseOverlayCardInstances('{"cards":[1,2]}')).toThrow(/instances.json/)
  })

  it('records occupant Loader ids on a loaded seat', () => {
    expect(appendOverlayCardOccupant([first], 1, 'ui-notes')).toEqual([
      { ...first, occupants: ['ui-notes'] },
    ])
    expect(appendOverlayCardOccupant(
      [{ ...first, occupants: ['ui-notes'] }],
      1,
      'ui-notes',
    )).toEqual([{ ...first, occupants: ['ui-notes'] }])
    expect(appendOverlayCardOccupant(
      [first, spec(2)],
      2,
      'ui-draft',
    )).toEqual([first, { ...spec(2), occupants: ['ui-draft'] }])
    expect(() => appendOverlayCardOccupant([first], 2, 'ui-notes')).toThrow(/not loaded/)
    expect(() => appendOverlayCardOccupant([first], 1, 'ui-float-window')).toThrow(/not a page fiber/)
    expect(() => appendOverlayCardOccupant([first], 1, '')).toThrow(/occupant id/)
    expect(isOverlayCardRoster({ cards: [{ ...first, occupants: ['ui-notes'] }] })).toBe(true)
    expect(isOverlayCardRoster({ cards: [{ ...first, occupants: ['ui-notes', 'ui-notes'] }] })).toBe(false)
  })
})
