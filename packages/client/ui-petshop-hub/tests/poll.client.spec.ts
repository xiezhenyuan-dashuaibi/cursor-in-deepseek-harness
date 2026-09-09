import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPetshopHubSignals, EMPTY_PETSHOP_HUB_SIGNALS,
} from '../src/client/poll.ts'
import {
  PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT, type PetshopHubSignals,
} from '../src/wire.ts'

const snap: PetshopHubSignals = {
  lastStage: 'home-ack',
  lastError: null,
  signals: [{ id: '1', at: '2026-09-06T10:00:00.000Z', stage: 'home-ack', detail: 'row' }],
}

describe('createPetshopHubSignals', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates from RPC and republishes on a later poll', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: EMPTY_PETSHOP_HUB_SIGNALS }))
    vi.useFakeTimers()
    const source = createPetshopHubSignals({ call }, 1_000)
    await Promise.resolve()
    expect(source.getSnapshot()).toEqual(EMPTY_PETSHOP_HUB_SIGNALS)
    expect(call).toHaveBeenCalledWith(PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT, {})
    let ticks = 0
    const stop = source.subscribe(() => { ticks += 1 })
    call.mockResolvedValueOnce({ ok: true, value: snap })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual(snap)
    expect(ticks).toBe(1)
    call.mockResolvedValueOnce({ ok: true, value: snap })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ticks).toBe(1)
    stop()
    call.mockResolvedValueOnce({ ok: false, error: { message: 'nope' } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual(snap)
    source.dispose()
  })

  it('keeps the last snapshot when RPC throws or the value is not a snapshot', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    vi.useFakeTimers()
    const source = createPetshopHubSignals({ call }, 1_000)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual(EMPTY_PETSHOP_HUB_SIGNALS)
    source.dispose()
  })
})
