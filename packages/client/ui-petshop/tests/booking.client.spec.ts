import { describe, expect, it } from 'vitest'
import {
  asPetshopHomeAck, postPetshopBooking, type PetshopHomeDraft,
} from '../src/client/booking.ts'

const draft: PetshopHomeDraft = {
  dogName: '豆豆',
  breed: '柯基',
  owner: '林小姐',
  phone: '13800138000',
  packageId: 'cut',
  slot: '14:00',
}

describe('asPetshopHomeAck', () => {
  it('rejects malformed acks', () => {
    expect(asPetshopHomeAck(null)).toBeUndefined()
    expect(asPetshopHomeAck({ id: '' })).toBeUndefined()
    expect(asPetshopHomeAck({ id: '1', createdAt: '' })).toBeUndefined()
    expect(asPetshopHomeAck({ id: '1', createdAt: 't' })).toEqual({ id: '1', createdAt: 't' })
  })
})

describe('postPetshopBooking', () => {
  it('returns the ack on success', async () => {
    const outcome = await postPetshopBooking(
      { call: async () => ({ ok: true, value: { id: 'row', createdAt: 't' } }) },
      draft,
    )
    expect(outcome).toEqual({ ok: true, ack: { id: 'row', createdAt: 't' } })
  })

  it('returns the RPC error message', async () => {
    const outcome = await postPetshopBooking(
      { call: async () => ({ ok: false, error: { message: 'rejected' } }) },
      draft,
    )
    expect(outcome).toEqual({ ok: false, message: 'rejected' })
  })

  it('returns a catch message when the caller throws', async () => {
    const outcome = await postPetshopBooking(
      { call: async () => { throw new Error('offline') } },
      draft,
    )
    expect(outcome).toEqual({ ok: false, message: 'offline' })
    const raw = await postPetshopBooking(
      { call: async () => { throw 'boom' } },
      draft,
    )
    expect(raw).toEqual({ ok: false, message: 'boom' })
  })

  it('rejects a success value that is not an ack', async () => {
    const outcome = await postPetshopBooking(
      { call: async () => ({ ok: true, value: { pid: 1 } }) },
      draft,
    )
    expect(outcome).toEqual({ ok: false, message: 'petshop: hub ack rejected' })
  })
})
