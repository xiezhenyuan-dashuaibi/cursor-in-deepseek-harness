import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import {
  apply, inject, openPetshopLedger, PETSHOP_STORE_FILE, PETSHOP_STORE_LIST_ENDPOINT,
  PETSHOP_STORE_RPC_CHANNEL, resolvePetshopStorePath,
} from '../src/index.ts'
import {
  asPetshopBookingRow, asPetshopPackageId, asPetshopSlotId, asPetshopStoreList,
} from '../src/wire.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const draft = {
  dogName: '豆豆',
  breed: '柯基',
  owner: '林小姐',
  phone: '13800138000',
  packageId: 'cut' as const,
  slot: '14:00' as const,
}

function fakeConnection(handlers: Map<string, ConnectionRpcHandler>) {
  return {
    rpc: {
      handle(channel: string, handler: ConnectionRpcHandler) {
        handlers.set(channel, handler)
        return async () => { handlers.delete(channel) }
      },
      intercept() {
        throw new Error('petshop-store tests do not intercept /api')
      },
    },
  }
}

describe('resolvePetshopStorePath', () => {
  it('joins the harness home when no override is given', () => {
    expect(resolvePetshopStorePath().endsWith(PETSHOP_STORE_FILE)).toBe(true)
  })

  it('returns the override path', () => {
    expect(resolvePetshopStorePath('/tmp/x.sqlite')).toBe('/tmp/x.sqlite')
  })
})

describe('openPetshopLedger', () => {
  it('inserts and lists newest first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-petshop-store-'))
    temps.push(dir)
    const path = join(dir, 'db.sqlite')
    const ledger = openPetshopLedger(path)
    const first = ledger.insert(draft)
    const second = ledger.insert({ ...draft, dogName: '黑豆', packageId: 'bath' })
    expect(first.id.length).toBeGreaterThan(0)
    expect(ledger.list().map(row => row.dogName)).toEqual(['黑豆', '豆豆'])
    expect(second.packageId).toBe('bath')
    ledger.close()
  })

  it('throws when a persisted row fails booking validation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-petshop-store-'))
    temps.push(dir)
    const path = join(dir, 'bad.sqlite')
    const ledger = openPetshopLedger(path)
    ledger.close()
    const db = new DatabaseSync(path)
    db.prepare(
      'INSERT INTO bookings (id, dog_name, breed, owner, phone, package_id, slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('x', 'a', 'b', 'c', 'd', 'nope', '10:00', 't')
    db.close()
    const again = openPetshopLedger(path)
    expect(() => again.list()).toThrow('sqlite row failed booking validation')
    again.close()
  })
})

describe('petshop-store wire guards', () => {
  it('rejects malformed package, slot, row, and list values', () => {
    expect(asPetshopPackageId('bath')).toBe('bath')
    expect(asPetshopSlotId('10:00')).toBe('10:00')
    expect(asPetshopBookingRow(1)).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', dogName: '' })).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', breed: '' })).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', owner: '' })).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', phone: '' })).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', packageId: 'nope' })).toBeUndefined()
    expect(asPetshopBookingRow({ ...draft, id: '1', createdAt: 't', slot: 'nope' })).toBeUndefined()
    expect(asPetshopBookingRow(null)).toBeUndefined()
    expect(asPetshopBookingRow({ packageId: 'cut', slot: '10:00' })).toBeUndefined()
    expect(asPetshopBookingRow({
      ...draft, id: '', createdAt: 't',
    })).toBeUndefined()
    expect(asPetshopBookingRow({
      ...draft, id: '1', createdAt: '',
    })).toBeUndefined()
    expect(asPetshopStoreList(null)).toBeUndefined()
    expect(asPetshopStoreList({ rows: [{}] })).toBeUndefined()
    expect(asPetshopStoreList({ rows: 'nope' })).toBeUndefined()
  })

  it('accepts a valid list payload', () => {
    const row = { ...draft, id: '1', createdAt: '2026-09-06T00:00:00.000Z' }
    expect(asPetshopStoreList({ rows: [] })).toEqual({ rows: [] })
    expect(asPetshopStoreList({ rows: [row] })).toEqual({ rows: [row] })
  })
})

describe('ui-petshop-store node apply', () => {
  it('declares connection', () => {
    expect(inject).toEqual(['connection'])
  })

  it('lists rows and rejects an unknown endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-petshop-store-'))
    temps.push(dir)
    const path = join(dir, 'live.sqlite')
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c, { databasePath: path }) },
    })
    await fiber.await()
    const listed = await handlers.get(PETSHOP_STORE_RPC_CHANNEL)!(
      PETSHOP_STORE_LIST_ENDPOINT, {}, new AbortController().signal,
    )
    expect(listed).toEqual({ ok: true, value: { rows: [] } })
    ctx.petshopStore.insert(draft)
    const next = await handlers.get(PETSHOP_STORE_RPC_CHANNEL)!(
      PETSHOP_STORE_LIST_ENDPOINT, {}, new AbortController().signal,
    )
    expect(next.ok).toBe(true)
    if (next.ok) expect((next.value as { rows: { dogName: string }[] }).rows[0]?.dogName).toBe('豆豆')
    const unknown = await handlers.get(PETSHOP_STORE_RPC_CHANNEL)!(
      'nope', {}, new AbortController().signal,
    )
    expect(unknown.ok).toBe(false)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
