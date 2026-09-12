import { mkdir, writeFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import {
  apply, OVERLAY_PLUGIN_LIST_ENDPOINT, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
  OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
  OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
  listOverlayRailPlugins, setDesktopOccupantExclusive, setOverlayRailPluginInserted,
} from '../src/index.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fakeConnection(handlers: Map<string, ConnectionRpcHandler>) {
  return {
    rpc: {
      handle(channel: string, handler: ConnectionRpcHandler) {
        handlers.set(channel, handler)
        return async () => { handlers.delete(channel) }
      },
      intercept() {
        throw new Error('plugin-roster tests do not intercept /api')
      },
    },
  }
}

const patchYaml = `- insert:
    - id: ui-fish-tank
      name: '@deepseek-ai/dsh-client-ui-fish-tank'
    - id: ui-notes
      name: '@deepseek-ai/dsh-client-ui-notes'
    - id: ui-cursor-agent
      name: '@deepseek-ai/dsh-client-ui-cursor-agent'
    - id: ui-overlay-desktop
      name: '@deepseek-ai/dsh-client-ui-overlay-desktop'
    - id: ui-other-desk
      name: '@deepseek-ai/dsh-client-ui-other-desk'
      disabled: true
    - id: ui-lab-fiber
      name: '@deepseek-ai/dsh-client-ui-lab-fiber'
`

async function writePlugin(
  pluginsDir: string,
  id: string,
  pkg: Record<string, unknown>,
): Promise<void> {
  const root = join(pluginsDir, id)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
}

async function seedDesktopPlugins(pluginsDir: string): Promise<void> {
  await writePlugin(pluginsDir, 'ui-fish-tank', {
    name: '@deepseek-ai/dsh-client-ui-fish-tank',
    dsh: { client: { platform: 'web', panelTitle: '摸鱼工作台', overlayBody: 'overlay-desktop.body' } },
  })
  await writePlugin(pluginsDir, 'ui-other-desk', {
    name: '@deepseek-ai/dsh-client-ui-other-desk',
    dsh: { client: { platform: 'web', panelTitle: '另一桌面', overlayBody: 'overlay-desktop.body' } },
  })
  await writePlugin(pluginsDir, 'ui-notes', {
    name: '@deepseek-ai/dsh-client-ui-notes',
    dsh: { client: { platform: 'web', overlayBody: 'overlay-card.body' } },
  })
  await writePlugin(pluginsDir, 'ui-cursor-agent', {
    name: '@deepseek-ai/dsh-client-ui-cursor-agent',
    dsh: { client: { platform: 'web' } },
  })
  await writePlugin(pluginsDir, 'ui-overlay-desktop', {
    name: '@deepseek-ai/dsh-client-ui-overlay-desktop',
    dsh: { client: { platform: 'web' } },
  })
  await writePlugin(pluginsDir, 'ui-lab-fiber', {
    name: '@deepseek-ai/dsh-client-ui-lab-fiber',
    dsh: { client: { platform: 'web', panelTitle: '实验 fiber' } },
  })
}

describe('listOverlayRailPlugins', () => {
  it('pins the inserted desktop and lists unloaded desktops, not cards or protected ids', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-plugins-'))
    temps.push(dir)
    const pluginsDir = join(dir, 'plugins')
    await seedDesktopPlugins(pluginsDir)
    expect(listOverlayRailPlugins(patchYaml, pluginsDir)).toEqual({
      desktop: {
        id: 'ui-fish-tank',
        title: '摸鱼工作台',
        hidden: false,
        inserted: true,
        occupants: ['ui-fish-tank'],
        kind: 'desktop',
      },
      plugins: [{
        id: 'ui-other-desk',
        title: '另一桌面',
        hidden: false,
        inserted: false,
        occupants: ['ui-other-desk'],
        kind: 'desktop',
      }, {
        id: 'ui-lab-fiber',
        title: '实验 fiber',
        hidden: false,
        inserted: true,
        occupants: ['ui-lab-fiber'],
        kind: 'fiber',
      }],
    })
  })
})

describe('setOverlayRailPluginInserted', () => {
  it('writes and clears Loader disabled on a desktop occupant without listing the host', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-plugins-'))
    temps.push(dir)
    const pluginsDir = join(dir, 'plugins')
    await seedDesktopPlugins(pluginsDir)
    const disabled = setOverlayRailPluginInserted(patchYaml, pluginsDir, 'ui-fish-tank', false)
    expect(disabled).toContain('id: ui-fish-tank')
    expect(disabled).toMatch(/id: ui-fish-tank[\s\S]*?disabled: true/)
    expect(listOverlayRailPlugins(disabled, pluginsDir).desktop).toBeNull()
    expect(() => setOverlayRailPluginInserted(patchYaml, pluginsDir, 'ui-cursor-agent', false))
      .toThrow(/not a rail overlay plugin/)
    expect(() => setOverlayRailPluginInserted(patchYaml, pluginsDir, 'ui-notes', false))
      .toThrow(/not a rail overlay plugin/)
    expect(() => setOverlayRailPluginInserted(patchYaml, pluginsDir, 'ui-overlay-desktop', false))
      .toThrow(/not a rail overlay plugin/)
  })

  it('does not list the desktop board under a custom Loader id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-plugins-'))
    temps.push(dir)
    const pluginsDir = join(dir, 'plugins')
    await seedDesktopPlugins(pluginsDir)
    await writePlugin(pluginsDir, 'desk-host', {
      name: '@deepseek-ai/dsh-client-ui-overlay-desktop',
      dsh: { client: { platform: 'web' } },
    })
    const yaml = `${patchYaml}    - id: desk-host
      name: '@deepseek-ai/dsh-client-ui-overlay-desktop'
`
    const roster = listOverlayRailPlugins(yaml, pluginsDir)
    expect(roster.plugins.some(item => item.id === 'desk-host')).toBe(false)
    expect(roster.desktop?.id).toBe('ui-fish-tank')
  })

  it('exclusive-enables one desktop occupant', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-plugins-'))
    temps.push(dir)
    const pluginsDir = join(dir, 'plugins')
    await seedDesktopPlugins(pluginsDir)
    const switched = setDesktopOccupantExclusive(patchYaml, pluginsDir, 'ui-other-desk')
    const roster = listOverlayRailPlugins(switched, pluginsDir)
    expect(roster.desktop?.id).toBe('ui-other-desk')
    expect(roster.plugins.some(item => item.id === 'ui-fish-tank' && item.inserted === false)).toBe(true)
  })
})

describe('overlay-plugins RPC', () => {
  it('lists, unplugs, and switches a desktop occupant through /overlay-plugins and /overlay-plugins-rail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-plugins-'))
    temps.push(dir)
    const patchPath = join(dir, 'cordis.patch.yml')
    const pluginsDir = join(dir, 'plugins')
    await writeFile(patchPath, patchYaml)
    await seedDesktopPlugins(pluginsDir)
    const ctx = new Context()
    const handlers = new Map<string, ConnectionRpcHandler>()
    ctx.provide('connection', fakeConnection(handlers))
    const fiber = ctx.plugin({
      apply: (c: Context) => { apply(c, { patchPath, pluginsDir }) },
    })
    await fiber.await()
    const listedValue = {
      desktop: { id: 'ui-fish-tank', kind: 'desktop' },
      plugins: [
        { id: 'ui-other-desk', kind: 'desktop', inserted: false },
        { id: 'ui-lab-fiber', kind: 'fiber', inserted: true },
      ],
    }
    for (const channel of [OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL]) {
      const listed = await handlers.get(channel)!(
        OVERLAY_PLUGIN_LIST_ENDPOINT, {}, new AbortController().signal,
      )
      expect(listed.ok).toBe(true)
      if (listed.ok) expect(listed.value).toMatchObject(listedValue)
    }
    const unplug = await handlers.get(OVERLAY_PLUGIN_RPC_CHANNEL)!(
      OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
      { id: 'ui-fish-tank', inserted: false },
      new AbortController().signal,
    )
    expect(unplug.ok).toBe(true)
    expect(readFileSync(patchPath, 'utf8')).toMatch(/id: ui-fish-tank[\s\S]*?disabled: true/)
    const switched = await handlers.get(OVERLAY_PLUGIN_RPC_CHANNEL)!(
      OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
      { id: 'ui-other-desk' },
      new AbortController().signal,
    )
    expect(switched.ok).toBe(true)
    if (switched.ok) {
      expect(switched.value).toMatchObject({
        desktop: { id: 'ui-other-desk', kind: 'desktop' },
      })
    }
    const unknown = await handlers.get(OVERLAY_PLUGIN_RPC_CHANNEL)!(
      'nope', {}, new AbortController().signal,
    )
    expect(unknown.ok).toBe(false)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
