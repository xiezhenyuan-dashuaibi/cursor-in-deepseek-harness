import { describe, expect, it, vi } from 'vitest'
import {
  callOverlayCardList, callOverlayCardSetHidden, callOverlayCardSetInserted, callOverlayPluginList,
  callOverlayPluginSetHidden, callOverlayPluginSetInserted, callOverlayPluginSwitchDesktop,
  isOverlayCardUnknownEndpoint,
  OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_RPC_CHANNEL,
  OVERLAY_CARD_SET_HIDDEN_ENDPOINT, OVERLAY_CARD_SET_INSERTED_ENDPOINT, OVERLAY_PLUGIN_LIST_ENDPOINT,
  OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT,
  OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
  OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT, overlayCardsFromListValue, overlayPluginsFromListValue,
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
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [], kind: 'card' },
      { id: 'draft', title: '草稿', hidden: true, inserted: false, occupants: ['ui-draft'], kind: 'card' },
      { id: 'on', title: '开', hidden: false, inserted: true, occupants: [], kind: 'card' },
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
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [], kind: 'card' },
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
      { id: '1', title: '卡片', hidden: false, inserted: false, occupants: ['ui-notes'], kind: 'card' },
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

describe('callOverlayPluginList', () => {
  it('pins the inserted desktop then appends remaining plugins after card windows', async () => {
    const call = vi.fn(async (channel: string) => {
      if (channel === OVERLAY_PLUGIN_RAIL_RPC_CHANNEL) {
        return {
          ok: true as const,
          value: {
            desktop: {
              id: 'ui-fish-tank',
              title: '摸鱼工作台',
              inserted: true,
              occupants: ['ui-fish-tank'],
              kind: 'desktop',
            },
            plugins: [
              {
                id: 'ui-other-desk',
                title: '另一桌面',
                inserted: false,
                occupants: ['ui-other-desk'],
                kind: 'desktop',
              },
              { id: 'ui-lab-fiber', title: '实验 fiber', inserted: true, occupants: ['ui-lab-fiber'] },
            ],
          },
        }
      }
      return {
        ok: true as const,
        value: { cards: [{ id: '1', title: '卡片', inserted: true }] },
      }
    })
    await expect(callOverlayPluginList({ call })).resolves.toEqual([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [], kind: 'card' },
      {
        id: 'ui-fish-tank',
        title: '摸鱼工作台',
        hidden: false,
        inserted: true,
        occupants: ['ui-fish-tank'],
        kind: 'desktop',
      },
      {
        id: 'ui-other-desk',
        title: '另一桌面',
        hidden: false,
        inserted: false,
        occupants: ['ui-other-desk'],
        kind: 'desktop',
      },
      {
        id: 'ui-lab-fiber',
        title: '实验 fiber',
        hidden: false,
        inserted: true,
        occupants: ['ui-lab-fiber'],
        kind: 'fiber',
      },
    ])
    expect(call).toHaveBeenCalledWith(OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
    expect(call).not.toHaveBeenCalledWith(OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
  })

  it('falls back to /overlay-plugins when rail list is missing', async () => {
    const call = vi.fn(async (channel: string) => {
      if (channel === OVERLAY_PLUGIN_RAIL_RPC_CHANNEL) {
        return {
          ok: false as const,
          error: { message: 'unknown overlay-plugins endpoint plugins.list' },
        }
      }
      if (channel === OVERLAY_PLUGIN_RPC_CHANNEL) {
        return {
          ok: true as const,
          value: {
            desktop: {
              id: 'ui-fish-tank',
              title: '摸鱼工作台',
              inserted: true,
              occupants: ['ui-fish-tank'],
              kind: 'desktop',
            },
            plugins: [],
          },
        }
      }
      return { ok: true as const, value: { cards: [] } }
    })
    await expect(callOverlayPluginList({ call })).resolves.toEqual([
      {
        id: 'ui-fish-tank',
        title: '摸鱼工作台',
        hidden: false,
        inserted: true,
        occupants: ['ui-fish-tank'],
        kind: 'desktop',
      },
    ])
    expect(call).toHaveBeenCalledWith(OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
  })
})

describe('callOverlayPluginSetHidden', () => {
  it('rejects hide on a fiber or desktop and hides a card window', async () => {
    const call = vi.fn(async () => ({ ok: true as const }))
    await expect(callOverlayPluginSetHidden({ call }, 'ui-lab-fiber', true, 'fiber'))
      .rejects.toThrow(/hide is not supported/)
    await expect(callOverlayPluginSetHidden({ call }, 'ui-fish-tank', true, 'desktop'))
      .rejects.toThrow(/hide is not supported/)
    expect(call).not.toHaveBeenCalled()
    await callOverlayPluginSetHidden({ call }, '1', true, 'card')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_CARD_RPC_CHANNEL,
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: '1', hidden: true },
    )
  })

  it('writes plugins.setHidden for a shaped occupant', async () => {
    const call = vi.fn(async () => ({ ok: true as const }))
    await callOverlayPluginSetHidden({ call }, 'ui-sprite', true, 'shaped')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT,
      { id: 'ui-sprite', hidden: true },
    )
  })
})

describe('callOverlayPluginSetInserted', () => {
  it('unplugs a standalone fiber or desktop occupant on /overlay-plugins-rail', async () => {
    const call = vi.fn(async () => ({ ok: true as const }))
    await callOverlayPluginSetInserted({ call }, 'ui-lab-fiber', false, 'fiber')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
      { id: 'ui-lab-fiber', inserted: false },
    )
    call.mockClear()
    await callOverlayPluginSetInserted({ call }, 'ui-fish-tank', false, 'desktop')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
      { id: 'ui-fish-tank', inserted: false },
    )
    call.mockClear()
    await callOverlayPluginSetInserted({ call }, 'ui-sprite', false, 'shaped')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
      { id: 'ui-sprite', inserted: false },
    )
  })
})

describe('callOverlayPluginSwitchDesktop', () => {
  it('exclusive-enables one overlay-desktop.body occupant', async () => {
    const call = vi.fn(async () => ({ ok: true as const }))
    await callOverlayPluginSwitchDesktop({ call }, 'ui-other-desk')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
      { id: 'ui-other-desk' },
    )
  })
})

describe('overlayPluginsFromListValue', () => {
  it('keeps kind shaped on a plugins.list occupant', () => {
    expect(overlayPluginsFromListValue({
      plugins: [{
        id: 'ui-sprite',
        title: '精灵',
        hidden: true,
        inserted: true,
        occupants: ['ui-sprite'],
        kind: 'shaped',
      }],
    })).toEqual([{
      id: 'ui-sprite',
      title: '精灵',
      hidden: true,
      inserted: true,
      occupants: ['ui-sprite'],
      kind: 'shaped',
    }])
  })
})
