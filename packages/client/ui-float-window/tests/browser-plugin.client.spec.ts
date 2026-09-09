/**
 * apply wiring: OverlayDesk registered into shell.overlay with body child
 * slots, and fiber-teardown unregistration.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { OverlayStackController } from '@deepseek-ai/dsh-client-ui-layout/client'
import { OverlayDesk } from '../src/client/OverlayDesk.tsx'
import { apply, inject } from '../src/client/index.ts'
import { DEFAULT_OVERLAY_CARD_ROSTER } from '../src/client/roster.ts'
import type { OverlayCardInjected } from '../src/client/contract/slots.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('overlayStack', new OverlayStackController())
  ctx.provide('connection', {
    rpc: {
      call: vi.fn(async () => ({ ok: true, value: DEFAULT_OVERLAY_CARD_ROSTER })),
    },
  })
  return { ctx }
}

describe('ui-float-window browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'overlayStack'])
  })

  it('waits until a live entry declares shell.overlay', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('overlayStack', new OverlayStackController())
    ctx.provide('connection', {
      rpc: { call: vi.fn(async () => ({ ok: true, value: DEFAULT_OVERLAY_CARD_ROSTER })) },
    })
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

  it('registers the overlay card desk and body hole', async () => {
    const { ctx } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = ctx.slots.entries('shell.overlay')[0]!
    expect(entry.component).toBe(OverlayDesk)
    expect(entry.options.id).toBe('overlay-card')
    expect(entry.locale).toBe('overlay-card')
    expect(ctx.slots.entries('overlay-card.body')).toHaveLength(0)
    expect(ctx.slots.entries('overlay-card.chrome.trailing')).toHaveLength(0)
    expect(ctx.slots.entries('overlay-card-2.body')).toHaveLength(0)
    const injected = (entry.inject as () => OverlayCardInjected)()
    injected.raiseDesk()
    expect(ctx.get('overlayStack')!.source.getSnapshot().front.at(-1)).toBe('overlay-card')
  })

  it('teardown unregisters the overlay card', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
  })
})
