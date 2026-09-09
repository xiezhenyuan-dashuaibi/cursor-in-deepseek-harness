import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import {
  apply, createPetshopHub, inject, parsePetshopHubDraft, PETSHOP_HUB_BOOK_ENDPOINT,
  PETSHOP_HUB_RPC_CHANNEL, PETSHOP_HUB_SIGNALS_ENDPOINT, PETSHOP_HUB_SIGNALS_MAX,
  asPetshopHubAck, asPetshopHubSignals,
} from '../src/index.ts'
import type { PetshopHubDraft } from '../src/wire.ts'
import {
  apply as applyStore, inject as storeInject, PETSHOP_STORE_LIST_ENDPOINT,
  PETSHOP_STORE_RPC_CHANNEL,
} from '../../ui-petshop-store/src/index.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const draft: PetshopHubDraft = {
  dogName: '豆豆',
  breed: '柯基',
  owner: '林小姐',
  phone: '13800138000',
  packageId: 'cut',
  slot: '14:00',
}

function fakeConnection(handlers: Map<string, ConnectionRpcHandler>) {
  return {
    rpc: {
      handle(channel: string, handler: ConnectionRpcHandler) {
        handlers.set(channel, handler)
        return async () => { handlers.delete(channel) }
      },
      intercept() {
        throw new Error('petshop-hub tests do not intercept /api')
      },
    },
  }
}

describe('parsePetshopHubDraft', () => {
  it('accepts a complete booking and rejects incomplete ones', () => {
    expect(parsePetshopHubDraft(1)).toBeUndefined()
    expect(parsePetshopHubDraft(draft)).toEqual(draft)
    expect(parsePetshopHubDraft(null)).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, dogName: '  ' })).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, breed: '' })).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, owner: 1 })).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, phone: '12345' })).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, packageId: 'nope' })).toBeUndefined()
    expect(parsePetshopHubDraft({ ...draft, slot: 'nope' })).toBeUndefined()
  })
})

describe('hub wire guards', () => {
  it('narrows acks and signal snapshots', () => {
    expect(asPetshopHubAck(null)).toBeUndefined()
    expect(asPetshopHubAck({ id: '' })).toBeUndefined()
    expect(asPetshopHubAck({ id: '1', createdAt: '' })).toBeUndefined()
    expect(asPetshopHubAck({ id: '1', createdAt: 't' })).toEqual({ id: '1', createdAt: 't' })
    expect(asPetshopHubSignals(null)).toBeUndefined()
    expect(asPetshopHubSignals({ signals: 'nope' })).toBeUndefined()
    expect(asPetshopHubSignals({ signals: [{}], lastStage: null, lastError: null })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: 't', stage: 'home-in', detail: 'x' }],
      lastStage: 'nope',
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: 't', stage: 'home-in', detail: 'x' }],
      lastStage: 'home-in',
      lastError: 1,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: 't', stage: 'home-in', detail: 'x' }],
      lastStage: 'home-in',
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '', at: 't', stage: 'home-in', detail: 'x' }],
      lastStage: null,
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: '', stage: 'home-in', detail: 'x' }],
      lastStage: null,
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: 't', stage: 'home-in', detail: 1 }],
      lastStage: null,
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [null],
      lastStage: null,
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [],
      lastError: null,
    })).toBeUndefined()
    expect(asPetshopHubSignals({
      signals: [],
      lastStage: null,
      lastError: null,
    })).toEqual({ signals: [], lastStage: null, lastError: null })
    expect(asPetshopHubSignals({
      signals: [{ id: '1', at: 't', stage: 'failed', detail: 'x' }],
      lastStage: 'failed',
      lastError: 'x',
    })).toEqual({
      signals: [{ id: '1', at: 't', stage: 'failed', detail: 'x' }],
      lastStage: 'failed',
      lastError: 'x',
    })
  })
})

describe('createPetshopHub', () => {
  it('writes the store and records the happy-path hops', () => {
    const hub = createPetshopHub({
      insert: input => ({ id: 'row-1', createdAt: 't', ...input }),
    })
    const booked = hub.dispatch(PETSHOP_HUB_BOOK_ENDPOINT, draft)
    expect(booked).toEqual({ ok: true, value: { id: 'row-1', createdAt: 't' } })
    const snap = hub.snapshot()
    expect(snap.lastStage).toBe('home-ack')
    expect(snap.signals.map(s => s.stage)).toEqual(['home-ack', 'store-ok', 'store-out', 'home-in'])
  })

  it('records a rejected payload and a store throw', () => {
    const hub = createPetshopHub({
      insert: () => { throw new Error('sqlite locked') },
    })
    const bad = hub.dispatch(PETSHOP_HUB_BOOK_ENDPOINT, { dogName: 'x' })
    expect(bad.ok).toBe(false)
    const failed = hub.dispatch(PETSHOP_HUB_BOOK_ENDPOINT, draft)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error.message).toBe('sqlite locked')
    expect(hub.snapshot().lastStage).toBe('failed')
    const unknown = hub.dispatch('nope', {})
    expect(unknown.ok).toBe(false)
    const listed = hub.dispatch(PETSHOP_HUB_SIGNALS_ENDPOINT, {})
    expect(listed.ok).toBe(true)
  })

  it('caps the in-memory signal log', () => {
    const hub = createPetshopHub({
      insert: () => ({ id: 'row', createdAt: 't' }),
    })
    const cycles = Math.ceil(PETSHOP_HUB_SIGNALS_MAX / 4) + 2
    for (let i = 0; i < cycles; i += 1) hub.dispatch(PETSHOP_HUB_BOOK_ENDPOINT, draft)
    expect(hub.snapshot().signals).toHaveLength(PETSHOP_HUB_SIGNALS_MAX)
  })

  it('stringifies a non-Error store throw', () => {
    const hub = createPetshopHub({
      insert: () => { throw 'boom' },
    })
    const failed = hub.dispatch(PETSHOP_HUB_BOOK_ENDPOINT, draft)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error.message).toBe('boom')
  })
})

describe('ui-petshop-hub node apply', () => {
  it('declares connection and petshopStore', () => {
    expect(inject).toEqual(['connection', 'petshopStore'])
  })

  it('serves book and signals over RPC', async () => {
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    ctx.provide('petshopStore', {
      insert: (input: PetshopHubDraft) => ({ id: 'row-9', createdAt: 't', ...input }),
    })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const booked = await handlers.get(PETSHOP_HUB_RPC_CHANNEL)!(
      PETSHOP_HUB_BOOK_ENDPOINT, draft, new AbortController().signal,
    )
    expect(booked).toEqual({ ok: true, value: { id: 'row-9', createdAt: 't' } })
    const listed = await handlers.get(PETSHOP_HUB_RPC_CHANNEL)!(
      PETSHOP_HUB_SIGNALS_ENDPOINT, {}, new AbortController().signal,
    )
    expect(listed.ok).toBe(true)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('unloads hub book when the store fiber is disposed and writes again after remount', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-petshop-hub-store-'))
    temps.push(dir)
    const databasePath = join(dir, 'live.sqlite')
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const storeFiber = ctx.plugin({
      inject: [...storeInject],
      apply: (c: Context) => { applyStore(c, { databasePath }) },
    })
    await storeFiber.await()
    const hubFiber = ctx.plugin({ inject: [...inject], apply })
    await hubFiber.await()
    try {
      const booked = await handlers.get(PETSHOP_HUB_RPC_CHANNEL)!(
        PETSHOP_HUB_BOOK_ENDPOINT, draft, new AbortController().signal,
      )
      expect(booked.ok).toBe(true)
      expect(ctx.get('petshopStore')).toBeDefined()
      await storeFiber.dispose()
      expect(handlers.has(PETSHOP_HUB_RPC_CHANNEL)).toBe(false)
      expect(handlers.has(PETSHOP_STORE_RPC_CHANNEL)).toBe(false)
      expect(ctx.get('petshopStore')).toBeUndefined()
      const storeAgain = ctx.plugin({
        inject: [...storeInject],
        apply: (c: Context) => { applyStore(c, { databasePath }) },
      })
      await storeAgain.await()
      const hubAgain = ctx.plugin({ inject: [...inject], apply })
      await hubAgain.await()
      const bookedAgain = await handlers.get(PETSHOP_HUB_RPC_CHANNEL)!(
        PETSHOP_HUB_BOOK_ENDPOINT, draft, new AbortController().signal,
      )
      expect(bookedAgain.ok).toBe(true)
      const listed = await handlers.get(PETSHOP_STORE_RPC_CHANNEL)!(
        PETSHOP_STORE_LIST_ENDPOINT, {}, new AbortController().signal,
      )
      expect(listed.ok).toBe(true)
      if (listed.ok) {
        expect((listed.value as { rows: { dogName: string }[] }).rows).toHaveLength(2)
      }
      await hubAgain.dispose()
      await storeAgain.dispose()
    } finally {
      await hubFiber.dispose()
      await storeFiber.dispose()
      await ctx.fiber.dispose()
    }
  })
})
