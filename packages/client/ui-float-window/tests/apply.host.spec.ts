import { mkdir, writeFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { HostConnectionService, type ConnectionRpcHandler, type HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import {
  apply, defaultOverlayCardSpec, formatOverlayCardInstances, inject, OVERLAY_CARD_LIST_ENDPOINT,
  OVERLAY_CARD_PACKAGE_NAME, OVERLAY_CARD_RPC_CHANNEL, OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
  OVERLAY_CARD_SET_INSERTED_ENDPOINT, parseOverlayCardInstances, resolveOverlayCardInstancesDir,
  type OverlayCardSpec,
} from '../src/index.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fakeConnection(handlers: Map<string, ConnectionRpcHandler>): HostConnectionHandle {
  return {
    rpc: {
      handle(channel, handler) {
        handlers.set(channel, handler)
        return async () => { handlers.delete(channel) }
      },
      intercept() {
        throw new Error('overlay-card tests do not intercept /api')
      },
    },
  }
}

const patchYaml = `- insert:
    - id: ui-notes
      name: '@deepseek-ai/dsh-client-ui-notes'
    - id: ui-float-window
      name: '@deepseek-ai/dsh-client-ui-float-window'
`

function listed(card: OverlayCardSpec, inserted: boolean): OverlayCardSpec {
  return { ...card, inserted }
}

describe('ui-float-window node apply', () => {
  it('declares connection', () => {
    expect(inject).toEqual(['connection'])
  })

  it('lists instances.json and writes hidden without touching occupant yaml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-'))
    temps.push(dir)
    await mkdir(dir, { recursive: true })
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c, { instancesDir: dir }) },
    })
    await fiber.await()
    const listedMissing = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_LIST_ENDPOINT, {}, new AbortController().signal,
    )
    const first = defaultOverlayCardSpec()
    expect(listedMissing).toEqual({ ok: true, value: { cards: [listed(first, true)] } })
    const second: OverlayCardSpec = { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 }
    await writeFile(join(dir, 'instances.json'), formatOverlayCardInstances([first, second]))
    const next = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_LIST_ENDPOINT, {}, new AbortController().signal,
    )
    expect(next).toEqual({ ok: true, value: { cards: [listed(first, true), listed(second, true)] } })
    const unknown = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!('nope', {}, new AbortController().signal)
    expect(unknown.ok).toBe(false)
    const hidden = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft', hidden: true },
      new AbortController().signal,
    )
    expect(hidden).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed({ ...second, hidden: true }, true)] },
    })
    expect(parseOverlayCardInstances(readFileSync(join(dir, 'instances.json'), 'utf8'))).toEqual([
      first, { ...second, hidden: true },
    ])
    const shown = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft', hidden: false },
      new AbortController().signal,
    )
    expect(shown).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed(second, true)] },
    })
    const badPayload = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft' },
      new AbortController().signal,
    )
    expect(badPayload.ok).toBe(false)
    const missing = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'nope', hidden: true },
      new AbortController().signal,
    )
    expect(missing.ok).toBe(false)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('sets occupant Loader disabled on the profile patch and keeps hidden', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-'))
    temps.push(dir)
    await mkdir(dir, { recursive: true })
    const patchPath = join(dir, 'cordis.patch.yml')
    const first = defaultOverlayCardSpec()
    const occupied: OverlayCardSpec = {
      seat: 2, id: 'draft', title: '草稿', width: 520, height: 400, occupants: ['ui-notes'],
    }
    await writeFile(join(dir, 'instances.json'), formatOverlayCardInstances([first, occupied]))
    await writeFile(patchPath, patchYaml)
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c, { instancesDir: dir, patchPath }) },
    })
    await fiber.await()
    const hide = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
      { id: 'draft', hidden: true },
      new AbortController().signal,
    )
    expect(hide).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed({ ...occupied, hidden: true }, true)] },
    })
    const unplug = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: 'draft', inserted: false },
      new AbortController().signal,
    )
    expect(unplug).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed({ ...occupied, hidden: true }, false)] },
    })
    expect(readFileSync(patchPath, 'utf8')).toContain('disabled: true')
    expect(parseOverlayCardInstances(readFileSync(join(dir, 'instances.json'), 'utf8'))).toEqual([
      first, { ...occupied, hidden: true },
    ])
    const plug = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: 'draft', inserted: true },
      new AbortController().signal,
    )
    expect(plug).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed({ ...occupied, hidden: true }, true)] },
    })
    expect(readFileSync(patchPath, 'utf8')).not.toContain('disabled: true')
    const empty = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
      new AbortController().signal,
    )
    expect(empty).toEqual({
      ok: true,
      value: { cards: [listed(first, true), listed({ ...occupied, hidden: true }, true)] },
    })
    expect(readFileSync(patchPath, 'utf8')).not.toContain('disabled: true')
    const badPayload = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: 'draft' },
      new AbortController().signal,
    )
    expect(badPayload.ok).toBe(false)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('refuses a protected occupant and a Loader id missing from the patch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-'))
    temps.push(dir)
    await mkdir(dir, { recursive: true })
    const patchPath = join(dir, 'cordis.patch.yml')
    const first = defaultOverlayCardSpec()
    const protectedCard: OverlayCardSpec = {
      ...first, occupants: ['ui-float-window'],
    }
    await writeFile(join(dir, 'instances.json'), formatOverlayCardInstances([protectedCard]))
    await writeFile(patchPath, patchYaml)
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c, { instancesDir: dir, patchPath }) },
    })
    await fiber.await()
    const blocked = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
      new AbortController().signal,
    )
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.message).toMatch(/not a page fiber/)
    await writeFile(
      join(dir, 'instances.json'),
      formatOverlayCardInstances([{ ...first, occupants: ['ui-missing'] }]),
    )
    const missing = await handlers.get(OVERLAY_CARD_RPC_CHANNEL)!(
      OVERLAY_CARD_SET_INSERTED_ENDPOINT,
      { id: '1', inserted: false },
      new AbortController().signal,
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.message).toMatch(/not in the live patch/)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers /overlay-card on webServer for the plugin fiber lifetime', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-'))
    temps.push(dir)
    await mkdir(dir, { recursive: true })
    const ctx = new Context()
    const routes: { kind: string; path: string }[] = []
    ctx.provide('webServer', {
      register(route: { kind: string; path: string }) {
        routes.push(route)
        return () => {
          const at = routes.indexOf(route)
          if (at !== -1) routes.splice(at, 1)
        }
      },
      registerUpgrade: () => () => {},
      tapIndex: () => () => {},
      port: 0,
    } as never)
    const connectionFiber = ctx.plugin({
      apply(c: Context) { new HostConnectionService(c, []) },
    })
    await connectionFiber.await()
    const card = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c, { instancesDir: dir }) },
    })
    await card.await()
    expect(routes.some(route => route.kind === 'prefix' && route.path === OVERLAY_CARD_RPC_CHANNEL)).toBe(true)
    await card.dispose()
    expect(routes.some(route => route.path === OVERLAY_CARD_RPC_CHANNEL)).toBe(false)
    await connectionFiber.dispose()
    await ctx.fiber.dispose()
  })

  it('ignores a duplicate /overlay-card registration', async () => {
    const ctx = new Context()
    ctx.provide('connection', {
      rpc: {
        handle() {
          throw new Error('duplicate route /overlay-card')
        },
        intercept() {
          throw new Error('overlay-card tests do not intercept /api')
        },
      },
    })
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: (c: Context) => { apply(c) },
    })
    await fiber.await()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('prefers the live profile instances.json over the checkout template', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-home-'))
    temps.push(home)
    const live = join(home, 'profiles', 'web', 'plugins', 'ui-float-window')
    await mkdir(live, { recursive: true })
    await writeFile(join(live, 'package.json'), JSON.stringify({ name: OVERLAY_CARD_PACKAGE_NAME }))
    await writeFile(join(live, 'instances.json'), formatOverlayCardInstances([
      { seat: 1, id: 'barber', title: '青石', width: 1080, height: 820 },
    ]))
    const checkoutSrc = join(home, 'packages', 'client', 'ui-float-window', 'src')
    await mkdir(checkoutSrc, { recursive: true })
    const moduleUrl = pathToFileURL(join(checkoutSrc, 'index.ts')).href
    expect(resolveOverlayCardInstancesDir(moduleUrl, { home, argv: ['node', '--profile', 'web'] }))
      .toBe(live)
    const other = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-other-'))
    temps.push(other)
    const otherSrc = join(other, 'src')
    await mkdir(otherSrc, { recursive: true })
    const emptyHome = mkdtempSync(join(tmpdir(), 'dsh-overlay-card-empty-home-'))
    temps.push(emptyHome)
    expect(resolveOverlayCardInstancesDir(pathToFileURL(join(otherSrc, 'index.ts')).href, { home: emptyHome }))
      .toBe(other)
  })
})
