import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { FlowerPot } from '../src/client/FlowerPot.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { NS } from '../src/client/locales.ts'

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
      id: 'overlay-shaped',
      children: { 'overlay-shaped.body': { kind: 'list', scope: 'root' } },
    } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx }
}

describe('ui-flower-pot browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('waits until overlay-shaped.body is declared', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
    ctx.slots.register(
      { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'overlay-shaped',
        children: { 'overlay-shaped.body': { kind: 'list', scope: 'root' } },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(1)
    await fiber.dispose()
  })

  it('registers the pot and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('overlay-shaped.body')[0]!
    expect(entry.component).toBe(FlowerPot)
    expect(entry.options.id).toBe('flower-pot')
    expect(entry.options.order).toBe(10)
    expect(entry.locale).toBe(NS)
    await fiber.dispose()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
  })
})

describe('ui-flower-pot node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
