import { describe, expect, it, vi } from 'vitest'
import {
  callOverlayCardList, callOverlayCardSetHidden, callOverlayCardSetInserted, isOverlayCardUnknownEndpoint,
  OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_RPC_CHANNEL,
  OVERLAY_CARD_SET_HIDDEN_ENDPOINT, OVERLAY_CARD_SET_INSERTED_ENDPOINT, overlayCardsFromListValue,
} from '../src/client/overlay-card-rpc.ts'

describe('overlayCardsFromListValue', () => {
  it('maps roster rows and treats omitted hidden as visible and omitted inserted as inserted', () => {
    expect(overlayCardsFromListValue({
      cards: [
        { id: '1', title: '卡片' },
        { id: 'draft', title: '草稿', hidden: true, inserted: false, occupants: ['ui-draft'] },
        { id: 'on', title: '开', hidden: false, inserted: true },
      ],
    })).toEqual([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [] },
      { id: 'draft', title: '草稿', hidden: true, inserted: false, occupants: ['ui-draft'] },
      { id: 'on', title: '开', hidden: false, inserted: true, occupants: [] },
    ])
  })

  it('rejects a value that is not a unique card roster', () => {
    expect(overlayCardsFromListValue(null)).toBeUndefined()
    expect(overlayCardsFromListValue([])).toBeUndefined()
    expect(overlayCardsFromListValue({ pid: 1 })).toBeUndefined()
    expect(overlayCardsFromListValue({ cards: [1] })).toBeUndefined()
    expect(overlayCardsFromListValue({ cards: [{ id: '', title: '卡片' }] })).toBeUndefined()
    expect(overlayCardsFromListValue({ cards: [{ id: '1', title: '  ' }] })).toBeUndefined()
    expect(overlayCardsFromListValue({ cards: [{ id: '1' }] })).toBeUndefined()
    expect(overlayCardsFromListValue({ cards: [[]] })).toBeUndefined()
    expect(overlayCardsFromListValue({
      cards: [
        { id: '1', title: '卡片' },
        { id: '1', title: '二' },
      ],
    })).toBeUndefined()
  })
})

describe('callOverlayCardSetHidden', () => {
  it('detects a list-only unknown-endpoint error', () => {
    expect(isOverlayCardUnknownEndpoint('unknown overlay-card endpoint instances.setHidden')).toBe(true)
    expect(isOverlayCardUnknownEndpoint('overlay-card: card "1" is not loaded')).toBe(false)
  })

  it('writes hidden on /overlay-card when that handler accepts setHidden', async () => {
    const call = vi.fn(async () => ({ ok: true as const }))
    await callOverlayCardSetHidden({ call }, '1', true)
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(
      OVERLAY_CARD_RPC_CHANNEL,
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: '1', hidden: true },
    )
  })

  it('falls back to /overlay-card-plug when /overlay-card is list-only', async () => {
    const call = vi.fn(async (channel: string) => {
      if (channel === OVERLAY_CARD_RPC_CHANNEL) {
        return {
          ok: false as const,
          error: { message: 'unknown overlay-card endpoint instances.setHidden' },
        }
      }
      return { ok: true as const }
    })
    await callOverlayCardSetHidden({ call }, 'draft', false)
    expect(call).toHaveBeenNthCalledWith(
      1,
      OVERLAY_CARD_RPC_CHANNEL,
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft', hidden: false },
    )
    expect(call).toHaveBeenNthCalledWith(
      2,
      OVERLAY_CARD_PLUG_RPC_CHANNEL,
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft', hidden: false },
    )
  })
})

describe('callOverlayCardList', () => {
  it('uses /overlay-card when that list sets inserted', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { cards: [{ id: '1', title: '卡片', inserted: true }] },
    }))
    await expect(callOverlayCardList({ call })).resolves.toEqual([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [] },
    ])
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(OVERLAY_CARD_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
  })

  it('lists /overlay-card-plug when /overlay-card omits inserted', async () => {
    const call = vi.fn(async (channel: string) => {
      if (channel === OVERLAY_CARD_RPC_CHANNEL) {
        return { ok: true as const, value: { cards: [{ id: '1', title: '卡片' }] } }
      }
      return {
        ok: true as const,
        value: { cards: [{ id: '1', title: '卡片', inserted: false, occupants: ['ui-notes'] }] },
      }
    })
    await expect(callOverlayCardList({ call })).resolves.toEqual([
      { id: '1', title: '卡片', hidden: false, inserted: false, occupants: ['ui-notes'] },
    ])
    expect(call).toHaveBeenCalledWith(OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
  })
})

describe('callOverlayCardSetInserted', () => {
  it('falls back when /overlay-card throws and rejects a real primary error', async () => {
    const throwing = vi.fn()
      .mockRejectedValueOnce(new Error('405'))
      .mockResolvedValueOnce({ ok: true as const })
    await callOverlayCardSetInserted({ call: throwing }, '1', false)
    expect(throwing).toHaveBeenNthCalledWith(
      2,
      OVERLAY_CARD_PLUG_RPC_CHANNEL,
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
    )
    const real = vi.fn(async () => ({
      ok: false as const,
      error: { message: 'overlay-card: card "nope" is not loaded' },
    }))
    await expect(callOverlayCardSetInserted({ call: real }, 'nope', false))
      .rejects.toThrow('overlay-card: card "nope" is not loaded')
    expect(real).toHaveBeenCalledTimes(1)
  })
})
