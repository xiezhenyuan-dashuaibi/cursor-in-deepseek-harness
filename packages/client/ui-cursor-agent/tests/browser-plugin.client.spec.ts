/**
 * apply wiring: CursorPanel registered into shell.overlay, onboarding skip,
 * dictionaries, and fiber-teardown unregistration.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { OverlayStackController, OVERLAY_STACK_CURSOR_ID } from '@deepseek-ai/dsh-client-ui-layout/client'
import { CursorPanel } from '../src/client/CursorPanel.tsx'
import type { CursorAgentInjected } from '../src/client/CursorPanel.tsx'
import { SkipOnboarding } from '../src/client/SkipOnboarding.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import {
  OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_RPC_CHANNEL,
  OVERLAY_CARD_SET_HIDDEN_ENDPOINT, OVERLAY_CARD_SET_INSERTED_ENDPOINT,
  OVERLAY_PLUGIN_LIST_ENDPOINT, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
  OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
} from '../src/client/overlay-card-rpc.ts'

vi.mock('@xterm/xterm', () => ({ Terminal: class { dispose() {} onData() { return { dispose() {} } } } }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))

const overlayAndOnboardingChildren = {
  'shell.overlay': { kind: 'list', scope: 'root' },
  'settings.onboarding': { kind: 'list', scope: 'root' },
} as never

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register(
    { name: 'root', children: overlayAndOnboardingChildren },
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('overlayStack', new OverlayStackController())
  ctx.provide('connection', {
    rpc: {
      call: vi.fn(async () => ({ ok: true, value: { cards: [] } })),
    },
  })
  return { ctx }
}

describe('ui-cursor-agent browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'overlayStack', 'connection'])
  })

  it('waits until a live entry declares shell.overlay', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('overlayStack', new OverlayStackController())
    ctx.provide('connection', {
      rpc: { call: vi.fn(async () => ({ ok: true, value: { cards: [] } })) },
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
  })

  it('registers the overlay entry and the onboarding-skip marker', async () => {
    const { ctx } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = ctx.slots.entries('shell.overlay')[0]!
    expect(entry.component).toBe(CursorPanel)
    expect(entry.options.id).toBe('cursor-agent')
    expect(entry.locale).toBe('cursor-agent')
    const skip = ctx.slots.entries('settings.onboarding')[0]!
    expect(skip.options.id).toBe('cursor-overlay-skip')
    expect(skip.component).toBe(SkipOnboarding)
  })

  it('raises the Cursor window and lists or plugs overlay cards over duplicated RPC names', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register(
      { name: 'root', children: overlayAndOnboardingChildren },
      () => null,
    )
    ctx.provide('locale', new LocaleRuntime(ctx))
    const stack = new OverlayStackController()
    ctx.provide('overlayStack', stack)
    const call = vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === OVERLAY_CARD_LIST_ENDPOINT) {
        return { ok: true, value: { cards: [{ id: '1', title: '卡片', inserted: true }] } }
      }
      return { ok: true, value: { cards: [] } }
    })
    ctx.provide('connection', { rpc: { call } })
    await ctx.plugin({ inject: [...inject], apply }).await()
    const face = (ctx.slots.entries('shell.overlay')[0]!.inject as () => CursorAgentInjected)()
    face.raiseWindow()
    expect(stack.source.getSnapshot().front.at(-1)).toBe(OVERLAY_STACK_CURSOR_ID)
    expect(await face.listOverlayCards()).toEqual([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [], kind: 'card' },
    ])
    expect(call).toHaveBeenCalledWith(OVERLAY_CARD_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
    expect(call).toHaveBeenCalledWith(OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, OVERLAY_PLUGIN_LIST_ENDPOINT, {})
    expect(call).not.toHaveBeenCalledWith(OVERLAY_CARD_PLUG_RPC_CHANNEL, OVERLAY_CARD_LIST_ENDPOINT, {})
    await face.setOverlayCardHidden('1', true)
    expect(call).toHaveBeenCalledWith(
      OVERLAY_CARD_RPC_CHANNEL,
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: '1', hidden: true },
    )
    call.mockClear()
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'bad-request', message: 'unknown overlay-card endpoint occupants.setInserted', details: { issues: [] } },
    })
    call.mockResolvedValueOnce({ ok: true, value: { cards: [] } })
    await face.setOverlayCardInserted('1', false)
    expect(call).toHaveBeenNthCalledWith(
      1,
      OVERLAY_CARD_RPC_CHANNEL,
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
    )
    expect(call).toHaveBeenNthCalledWith(
      2,
      OVERLAY_CARD_PLUG_RPC_CHANNEL,
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
    )
    call.mockClear()
    call.mockResolvedValueOnce({ ok: true, value: {} })
    await face.switchOverlayDesktop('ui-other-desk')
    expect(call).toHaveBeenCalledWith(
      OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
      OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
      { id: 'ui-other-desk' },
    )
    call.mockRejectedValueOnce(new Error('405'))
    call.mockRejectedValueOnce(new Error('405'))
    call.mockRejectedValueOnce(new Error('405'))
    call.mockRejectedValueOnce(new Error('405'))
    expect(await face.listOverlayCards()).toEqual([])
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'x', details: {} } })
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'x', details: {} } })
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'x', details: {} } })
    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'x', details: {} } })
    expect(await face.listOverlayCards()).toEqual([])
    call.mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    call.mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    call.mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    call.mockResolvedValueOnce({ ok: true, value: { pid: 1 } })
    expect(await face.listOverlayCards()).toEqual([])
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'bad-request', message: 'nope', details: { issues: [] } },
    })
    await expect(face.setOverlayCardHidden('1', false)).rejects.toThrow('nope')
  })


  it('teardown unregisters the overlay and skip entries', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    expect(ctx.slots.entries('settings.onboarding')).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    expect(ctx.slots.entries('settings.onboarding')).toHaveLength(0)
  })
})

describe('ui-cursor-agent node half', () => {
  it('the node apply waits for webServer without throwing', async () => {
    const ctx = new Context()
    await expect(ctx.plugin({ apply: nodeApply }).await()).resolves.toBeDefined()
  })
})
