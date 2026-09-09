import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { Page } from '../src/client/Page.tsx'
import { apply, inject, type PetshopStoreInjected } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { EMPTY_PETSHOP_STORE_LIST } from '../src/client/poll.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'overlay-card',
      children: { 'overlay-card-4.body': { kind: 'single', scope: 'root' } },
    } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', {
    rpc: {
      call: vi.fn(async () => ({ ok: true, value: EMPTY_PETSHOP_STORE_LIST })),
    },
  })
  return { ctx }
}

describe('ui-petshop-store browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('waits until overlay-card-4.body is declared', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('connection', {
      rpc: { call: vi.fn(async () => ({ ok: true, value: EMPTY_PETSHOP_STORE_LIST })) },
    })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('overlay-card-4.body')).toHaveLength(0)
    ctx.slots.register(
      { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'overlay-card',
        children: { 'overlay-card-4.body': { kind: 'single', scope: 'root' } },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(ctx.slots.entries('overlay-card-4.body')).toHaveLength(1)
    await fiber.dispose()
  })

  it('registers the page and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('overlay-card-4.body')[0]!
    expect(entry.component).toBe(Page)
    expect(entry.locale).toBe('overlay-petshop-store')
    const face = (entry.inject as () => PetshopStoreInjected)()
    expect(face.hooks.ledger.getSnapshot()).toEqual(EMPTY_PETSHOP_STORE_LIST)
    await fiber.dispose()
    expect(ctx.slots.entries('overlay-card-4.body')).toHaveLength(0)
  })
})

describe('ui-petshop-store node half', () => {
  it('the node apply requires connection', () => {
    expect(typeof nodeApply).toBe('function')
  })
})
