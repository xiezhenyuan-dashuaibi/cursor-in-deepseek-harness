import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { Television } from '../src/client/Television.tsx'
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
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx }
}

describe('ui-television browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('waits until a live entry declares shell.overlay', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    ctx.slots.register(
      { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    await Promise.resolve()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    await fiber.dispose()
  })

  it('registers the television fiber and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('shell.overlay')[0]!
    expect(entry.component).toBe(Television)
    expect(entry.options.id).toBe('television')
    expect(entry.options.order).toBe(180)
    expect(entry.locale).toBe(NS)
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
  })
})

describe('ui-television node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
