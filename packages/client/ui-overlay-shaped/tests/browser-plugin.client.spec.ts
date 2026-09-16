import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { ShapedBoard } from '../src/client/ShapedBoard.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  return { ctx }
}

describe('ui-overlay-shaped browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots'])
  })

  it('waits until shell.overlay is declared', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
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
    await ctx.fiber.dispose()
  })

  it('registers the board, accepts two list occupants, and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('shell.overlay')[0]!
    expect(entry.component).toBe(ShapedBoard)
    expect(entry.options).toMatchObject({ id: 'overlay-shaped', order: 180 })
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
    ctx.slots.register(
      { name: 'overlay-shaped.body', id: 'sprite', registrant: '@deepseek-ai/dsh-client-ui-sprite' },
      () => null,
    )
    ctx.slots.register(
      { name: 'overlay-shaped.body', id: 'television', registrant: '@deepseek-ai/dsh-client-ui-television' },
      () => null,
    )
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(2)
    const injected = (entry as {
      inject?: () => {
        hooks: {
          bodyIds: { getSnapshot(): readonly { id: string; registrant: string }[] }
          hiddenRegistrants: { getSnapshot(): readonly string[] }
        }
      }
    }).inject?.()
    expect(injected?.hooks.bodyIds.getSnapshot()).toEqual([
      { id: 'sprite', registrant: '@deepseek-ai/dsh-client-ui-sprite' },
      { id: 'television', registrant: '@deepseek-ai/dsh-client-ui-television' },
    ])
    expect(injected?.hooks.hiddenRegistrants.getSnapshot()).toEqual([])
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('polls hidden registrants when connection is present', async () => {
    const { ctx } = await bench()
    const call = vi.fn(async () => ({
      ok: true,
      value: {
        plugins: [{
          kind: 'shaped',
          hidden: true,
          moduleName: '@deepseek-ai/dsh-client-ui-sprite',
        }],
      },
    }))
    ctx.provide('connection', { rpc: { call } })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const injected = (ctx.slots.entries('shell.overlay')[0] as {
      inject?: () => { hooks: { hiddenRegistrants: { getSnapshot(): readonly string[] } } }
    }).inject?.()
    await vi.waitFor(() => {
      expect(injected?.hooks.hiddenRegistrants.getSnapshot())
        .toEqual(['@deepseek-ai/dsh-client-ui-sprite'])
    })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})

describe('ui-overlay-shaped node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
