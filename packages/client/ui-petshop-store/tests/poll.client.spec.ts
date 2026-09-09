import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPetshopStoreLedger, EMPTY_PETSHOP_STORE_LIST,
} from '../src/client/poll.ts'
import {
  PETSHOP_STORE_LIST_ENDPOINT, PETSHOP_STORE_RPC_CHANNEL, type PetshopBookingRow,
} from '../src/wire.ts'

const row: PetshopBookingRow = {
  id: '1',
  createdAt: '2026-09-06T00:00:00.000Z',
  dogName: '豆豆',
  breed: '柯基',
  owner: '林小姐',
  phone: '13800138000',
  packageId: 'cut',
  slot: '14:00',
}

describe('createPetshopStoreLedger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates from RPC and republishes on a later poll', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: EMPTY_PETSHOP_STORE_LIST }))
    vi.useFakeTimers()
    const source = createPetshopStoreLedger({ call }, 1_000)
    await Promise.resolve()
    expect(source.getSnapshot()).toEqual(EMPTY_PETSHOP_STORE_LIST)
    expect(call).toHaveBeenCalledWith(PETSHOP_STORE_RPC_CHANNEL, PETSHOP_STORE_LIST_ENDPOINT, {})
    let ticks = 0
    const stop = source.subscribe(() => { ticks += 1 })
    call.mockResolvedValueOnce({ ok: true, value: { rows: [row] } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual({ rows: [row] })
    expect(ticks).toBe(1)
    call.mockResolvedValueOnce({ ok: true, value: { rows: [row] } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ticks).toBe(1)
    stop()
    call.mockResolvedValueOnce({ ok: false, error: { message: 'nope' } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual({ rows: [row] })
    source.dispose()
  })

  it('keeps the last snapshot when RPC throws or the value is not a list', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    vi.useFakeTimers()
    const source = createPetshopStoreLedger({ call }, 1_000)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.getSnapshot()).toEqual(EMPTY_PETSHOP_STORE_LIST)
    source.dispose()
  })

  it('treats row field drift as a new snapshot', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: { rows: [row] } }))
    vi.useFakeTimers()
    const source = createPetshopStoreLedger({ call }, 1_000)
    await Promise.resolve()
    let ticks = 0
    source.subscribe(() => { ticks += 1 })
    call.mockResolvedValueOnce({
      ok: true,
      value: { rows: [{ ...row, dogName: '黑豆' }] },
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ticks).toBe(1)
    source.dispose()
  })
})
