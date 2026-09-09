import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOverlayCardRoster, DEFAULT_OVERLAY_CARD_ROSTER } from '../src/client/roster.ts'
import {
  defaultOverlayCardSpec, OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_PLUG_RPC_CHANNEL,
  OVERLAY_CARD_RPC_CHANNEL, type OverlayCardSpec,
} from '../src/instances.ts'

const listed = (extra?: Partial<OverlayCardSpec>): OverlayCardSpec => ({
  ...defaultOverlayCardSpec(),
  inserted: true,
  ...extra,
})

async function settleRoster(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('createOverlayCardRoster', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates from RPC and republishes on a later poll', async () => {
    const initial = { cards: [listed()] }
    const call = vi.fn(async () => ({ ok: true, value: initial }))
    vi.useFakeTimers()
    const source = createOverlayCardRoster({ call }, 1_000)
    await settleRoster()
    expect(source.getSnapshot()).toEqual(initial)
    expect(call).toHaveBeenCalledWith(OVERLAY_CARD_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
    expect(call).not.toHaveBeenCalledWith(OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
    let ticks = 0
    const stop = source.subscribe(() => { ticks += 1 })
    const second: OverlayCardSpec = {
      seat: 2, id: '2', title: '卡片', width: 360, height: 280, inserted: true,
    }
    call.mockResolvedValueOnce({ ok: true, value: { cards: [listed(), second] } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual({ cards: [listed(), second] })
    expect(ticks).toBe(1)
    call.mockResolvedValueOnce({ ok: true, value: { cards: [listed(), second] } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ticks).toBe(1)
    call.mockResolvedValueOnce({
      ok: true,
      value: { cards: [listed({ hidden: true, inserted: false }), second] },
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot().cards[0]?.hidden).toBe(true)
    expect(source.getSnapshot().cards[0]?.inserted).toBe(false)
    expect(ticks).toBe(2)
    stop()
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'nope', details: {} } })
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'nope', details: {} } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot().cards[0]?.hidden).toBe(true)
    source.dispose()
  })

  it('lists /overlay-card-plug when /overlay-card omits inserted', async () => {
    const persistOnly = { cards: [defaultOverlayCardSpec()] }
    const unplugged = {
      cards: [{ ...defaultOverlayCardSpec(), occupants: ['ui-notes'], inserted: false }],
    }
    const call = vi.fn(async (channel: string) => {
      if (channel === OVERLAY_CARD_RPC_CHANNEL) return { ok: true, value: persistOnly }
      return { ok: true, value: unplugged }
    })
    const source = createOverlayCardRoster({ call }, 60_000)
    await settleRoster()
    expect(source.getSnapshot()).toEqual(unplugged)
    expect(call).toHaveBeenCalledWith(OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
    source.dispose()
  })

  it('ignores a successful RPC whose value is not a roster', async () => {
    const call = vi.fn(async () => ({ ok: true, value: { pid: 1 } }))
    const source = createOverlayCardRoster({ call }, 60_000)
    await settleRoster()
    expect(source.getSnapshot()).toEqual(DEFAULT_OVERLAY_CARD_ROSTER)
    source.dispose()
  })

  it('keeps the last roster when RPC throws', async () => {
    const call = vi.fn(async () => {
      throw new Error('transport failure for /overlay-card/instances.list: HTTP 405')
    })
    const source = createOverlayCardRoster({ call }, 60_000)
    await settleRoster()
    expect(source.getSnapshot()).toEqual(DEFAULT_OVERLAY_CARD_ROSTER)
    source.dispose()
  })
})
