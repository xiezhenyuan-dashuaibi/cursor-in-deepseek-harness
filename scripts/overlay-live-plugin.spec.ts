import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  appendInsertRow,
  copyProfileLib,
  dumpProfilePatch,
  findInsertRowByName,
  hasOverlayCardPlugRpc,
  hasOverlayCardRosterRpc,
  OVERLAY_CARD_HIDE_RPC_MODULE,
  OVERLAY_CARD_PLUG_RPC_ID,
  OVERLAY_CARD_PLUG_RPC_MODULE,
  OVERLAY_CARD_ROSTER_RPC_ID,
  OVERLAY_CARD_ROSTER_RPC_MODULE,
  parseProfilePatch,
  patchHasId,
  profileDir,
  removeInsertRow,
  resolveOverlayHome,
  runOverlayLivePlugin,
  stripProfileManifest,
} from './overlay-live-plugin.ts'
import {
  OVERLAY_CARD_PACKAGE_NAME, defaultOverlayCardSpec, formatOverlayCardInstances,
  parseOverlayCardInstances,
} from '../packages/client/ui-float-window/src/instances.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-live-'))
  temps.push(dir)
  return dir
}

async function seedProfile(home: string): Promise<string> {
  const root = profileDir(home, 'web')
  await mkdir(join(root, 'plugins'), { recursive: true })
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'web-profile',
    private: true,
    dependencies: { keep: 'file:./plugins/keep' },
  }, null, 4)}\n`)
  await writeFile(join(root, 'cordis.patch.yml'), [
    '# live Loader rows — do not restart dsh web',
    '- insert:',
    '    - id: keep',
    '      name: keep',
    '',
  ].join('\n'))
  return root
}

async function seedCheckout(dir: string, opts?: {
  client?: boolean
  lib?: boolean
  name?: string
  overlayBody?: string
}): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({
    name: opts?.name ?? '@deepseek-ai/dsh-client-demo',
    dependencies: { '@deepseek-ai/cordis': 'workspace:^' },
    ...(opts?.client === false ? {} : {
      dsh: {
        client: {
          platform: 'web',
          ...(opts?.overlayBody !== undefined ? { overlayBody: opts.overlayBody } : {}),
        },
      },
    }),
  }, null, 2)}\n`)
  if (opts?.lib === false) return
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'lib/index.js'), 'export function apply() {}\n')
  await writeFile(join(dir, 'lib/invariant.js'), 'export function apply() {}\n')
  if (opts?.client !== false) {
    await writeFile(join(dir, 'lib/client.js'), 'export function apply() {}\n')
    await writeFile(join(dir, 'lib/client.js.map'), '{}\n')
  }
}

async function seedLanding(repo: string, dirName: string): Promise<void> {
  const npmName = `@deepseek-ai/dsh-client-${dirName}`
  await mkdir(join(repo, 'packages', 'bundle', 'web-app', 'tests'), { recursive: true })
  await mkdir(join(repo, 'packages', 'client'), { recursive: true })
  await mkdir(join(repo, 'scripts'), { recursive: true })
  await writeFile(
    join(repo, 'tsconfig.client.json'),
    `{ "references": [\n    { "path": "./packages/client/ui-float-window/tsconfig.client.json" },\n    { "path": "./packages/client/${dirName}" }\n  ] }\n`,
  )
  await writeFile(
    join(repo, 'packages', 'client', 'README.md'),
    `| [\`ui-float-window/\`](ui-float-window/README.md) | Card. |\n| [\`${dirName}/\`](${dirName}/README.md) | Occupant of \`overlay-card.body\`. Not in the default web-app roster. |\n`,
  )
  await writeFile(
    join(repo, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
    `const OMITTED_IDS = ['${dirName}'] as const\nconst OMITTED_PACKAGES = [\n  '${npmName}',\n] as const\n`,
  )
  await writeFile(join(repo, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), '- insert:\n    - id: ui-cursor-agent\n')
}

describe('overlay-live-plugin', () => {
  it('resolves $DSH_HOME ahead of ~/.dsh', () => {
    const home = join(tempDir(), 'explicit-home')
    expect(resolveOverlayHome({ DSH_HOME: home })).toBe(resolve(home))
    expect(resolveOverlayHome({ DSH_HOME: '  ' }).endsWith('.dsh')).toBe(true)
  })

  it('strips workspace specifiers and keeps a client export only when dsh.client exists', () => {
    const host = stripProfileManifest({ name: '@pkg/host' })
    expect(host.dependencies).toBeUndefined()
    expect((host.exports as Record<string, string>)['./client']).toBeUndefined()
    const client = stripProfileManifest({
      name: '@pkg/ui',
      dsh: { client: { platform: 'web' } },
    })
    expect((client.exports as Record<string, string>)['./client']).toBe('./lib/client.js')
    expect(() => stripProfileManifest({})).toThrow(/missing name/)
  })

  it('round-trips Loader ids and keeps the leading comment block', () => {
    const source = '# keep this comment\n- insert:\n    - id: keep\n      name: keep\n'
    const parsed = parseProfilePatch(source)
    expect(parsed.comments.startsWith('# keep this comment')).toBe(true)
    expect(patchHasId(parsed.entries, 'keep')).toBe(true)
    appendInsertRow(parsed.entries, 'demo', '@pkg/demo')
    appendInsertRow(parsed.entries, 'demo', '@pkg/demo')
    expect(parsed.entries[0]?.insert.filter(row => row.id === 'demo')).toHaveLength(1)
    removeInsertRow(parsed.entries, 'demo')
    expect(patchHasId(parsed.entries, 'demo')).toBe(false)
    const dumped = dumpProfilePatch(parsed.comments, parsed.entries)
    expect(dumped.startsWith('# keep this comment')).toBe(true)
    expect(patchHasId(parseProfilePatch(dumped).entries, 'keep')).toBe(true)
    expect(findInsertRowByName(parsed.entries, 'keep')?.id).toBe('keep')
  })

  it('copies optional lib files and refuses a missing host bundle', async () => {
    const root = tempDir()
    const fromPkg = join(root, 'from')
    const toPkg = join(root, 'to')
    await seedCheckout(fromPkg)
    await copyProfileLib(fromPkg, toPkg)
    expect(await readFile(join(toPkg, 'lib/client.js'), 'utf8')).toContain('apply')
    await expect(copyProfileLib(join(root, 'missing'), toPkg)).rejects.toThrow(/missing/)
  })

  it('installs the stripped copy before writing the Loader row', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    let yamlDuringInstall = ''
    const installs: string[] = []
    const message = await runOverlayLivePlugin(['insert', checkout], {
      home,
      profile: 'web',
      install: (cwd) => {
        installs.push(cwd)
        yamlDuringInstall = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
      },
    })
    expect(installs).toEqual([profile])
    expect(yamlDuringInstall).not.toContain('demo')
    const yamlAfter = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(yamlAfter).toContain('id: demo')
    expect(yamlAfter).toContain('@deepseek-ai/dsh-client-demo')
    const destManifest = JSON.parse(await readFile(join(profile, 'plugins', 'demo', 'package.json'), 'utf8')) as {
      dependencies?: unknown
    }
    expect(destManifest.dependencies).toBeUndefined()
    const profilePkg = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(profilePkg.dependencies['@deepseek-ai/dsh-client-demo']).toBe('file:./plugins/demo')
    expect(message).toContain('inserted demo')
  })

  it('does not write a Loader row when lib/index.js is missing', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout, { lib: false })
    await expect(runOverlayLivePlugin(['insert', checkout], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install')
      },
    })).rejects.toThrow(/missing/)
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).not.toContain('demo')
  })

  it('updates lib without rewriting yaml or calling install', async () => {
    const home = tempDir()
    await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    await writeFile(join(checkout, 'lib/client.js'), 'export const rebuilt = 1\n')
    const yamlBefore = await readFile(join(profileDir(home, 'web'), 'cordis.patch.yml'), 'utf8')
    const message = await runOverlayLivePlugin(['update', checkout], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install on update')
      },
    })
    expect(message).toContain('updated demo')
    expect(await readFile(join(profileDir(home, 'web'), 'cordis.patch.yml'), 'utf8')).toBe(yamlBefore)
    expect(await readFile(join(profileDir(home, 'web'), 'plugins', 'demo', 'lib/client.js'), 'utf8')).toContain('rebuilt')
  })

  it('updates the live Loader directory even when it is not the checkout basename', async () => {
    const home = tempDir()
    await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    await runOverlayLivePlugin(['insert', checkout, '--id', 'ui-float-window-init'], {
      home, profile: 'web', install: () => undefined,
    })
    await writeFile(join(checkout, 'lib/client.js'), 'export const rebuilt = 1\n')
    const message = await runOverlayLivePlugin(['update', checkout], {
      home, profile: 'web', install: () => { throw new Error('must not install on update') },
    })
    expect(message).toContain('ui-float-window-init')
    expect(await readFile(join(profileDir(home, 'web'), 'plugins', 'ui-float-window-init', 'lib/client.js'), 'utf8')).toContain('rebuilt')
  })

  it('adds the plug RPC row on card update when the roster row already exists', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    const seeded = parseProfilePatch(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
    removeInsertRow(seeded.entries, OVERLAY_CARD_PLUG_RPC_ID)
    await writeFile(join(profile, 'cordis.patch.yml'), dumpProfilePatch(seeded.comments, seeded.entries))
    expect(hasOverlayCardPlugRpc(parseProfilePatch(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).entries)).toBe(false)
    await runOverlayLivePlugin(['update', checkout], {
      home, profile: 'web', install: () => { throw new Error('must not install on update') },
    })
    const yaml = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(hasOverlayCardPlugRpc(parseProfilePatch(yaml).entries)).toBe(true)
    expect(yaml).toContain(OVERLAY_CARD_PLUG_RPC_MODULE)
    expect(await readFile(join(profile, 'overlay-card-plug-rpc.mjs'), 'utf8')).toContain('/overlay-card-plug')
  })

  it('retargets plug RPC to overlay-card-hide-rpc.mjs on card update', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toContain(OVERLAY_CARD_PLUG_RPC_MODULE)
    await runOverlayLivePlugin(['update', checkout], {
      home, profile: 'web', install: () => { throw new Error('must not install on update') },
    })
    const yaml = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    const plug = parseProfilePatch(yaml).entries.flatMap(entry => entry.insert)
      .find(row => row.id === OVERLAY_CARD_PLUG_RPC_ID)
    expect(plug?.name).toBe(OVERLAY_CARD_HIDE_RPC_MODULE)
    expect(hasOverlayCardPlugRpc(parseProfilePatch(yaml).entries)).toBe(true)
    expect(await readFile(join(profile, 'overlay-card-hide-rpc.mjs'), 'utf8')).toContain('occupants.setInserted')
  })

  it('refuses update before insert', async () => {
    const home = tempDir()
    await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    await expect(runOverlayLivePlugin(['update', checkout], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/insert first/)
  })

  it('unloads by deleting the Loader row and leaves sqlite in place', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const sqlite = join(home, 'host-data.sqlite')
    await writeFile(sqlite, 'keep')
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    const installs: string[] = []
    await runOverlayLivePlugin(['remove', 'demo'], {
      home, profile: 'web', install: (cwd) => { installs.push(cwd) },
    })
    const yaml = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(yaml).not.toContain('demo')
    expect(yaml).toContain('id: keep')
    expect(installs).toEqual([profile])
    expect(await readFile(sqlite, 'utf8')).toBe('keep')
    await expect(readFile(join(profile, 'plugins', 'demo', 'package.json'), 'utf8')).rejects.toThrow()
  })

  it('remove deletes an omitted checkout occupant and leaves the card module', async () => {
    const home = tempDir()
    const repo = tempDir()
    await seedProfile(home)
    const occupant = join(repo, 'packages', 'client', 'ui-notes')
    await seedCheckout(occupant, { name: '@deepseek-ai/dsh-client-ui-notes' })
    await seedLanding(repo, 'ui-notes')
    const card = join(repo, 'packages', 'client', 'ui-float-window')
    await seedCheckout(card, { name: OVERLAY_CARD_PACKAGE_NAME })
    const workspace: string[] = []
    const catalogs: string[] = []
    await runOverlayLivePlugin(['insert', occupant], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
    })
    const removed = await runOverlayLivePlugin(['remove', 'ui-notes'], {
      home,
      profile: 'web',
      install: () => undefined,
      repoRoot: repo,
      workspaceInstall: (cwd) => { workspace.push(cwd) },
      refreshCatalogs: (cwd) => { catalogs.push(cwd) },
    })
    expect(removed).toContain('deleted packages/client/ui-notes')
    expect(workspace).toEqual([repo])
    expect(catalogs).toEqual([repo])
    expect(() => readFileSync(join(occupant, 'package.json'))).toThrow()
    expect(readFileSync(join(card, 'package.json'), 'utf8')).toContain(OVERLAY_CARD_PACKAGE_NAME)
    expect(readFileSync(join(repo, 'packages', 'client', 'README.md'), 'utf8')).not.toContain('ui-notes')

    await runOverlayLivePlugin(['insert', card], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
    })
    await runOverlayLivePlugin(['remove', 'ui-float-window'], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
      workspaceInstall: () => { throw new Error('must not install when keeping the card') },
    })
    expect(readFileSync(join(card, 'package.json'), 'utf8')).toContain(OVERLAY_CARD_PACKAGE_NAME)
  })

  it('remove --keep-files keeps checkout and live files', async () => {
    const home = tempDir()
    const repo = tempDir()
    const profile = await seedProfile(home)
    const occupant = join(repo, 'packages', 'client', 'ui-notes')
    await seedCheckout(occupant, { name: '@deepseek-ai/dsh-client-ui-notes' })
    await seedLanding(repo, 'ui-notes')
    await runOverlayLivePlugin(['insert', occupant], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
    })
    await runOverlayLivePlugin(['remove', 'ui-notes', '--keep-files'], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
      workspaceInstall: () => { throw new Error('must not install when keeping files') },
    })
    expect(readFileSync(join(occupant, 'package.json'), 'utf8')).toContain('ui-notes')
    expect(await readFile(join(profile, 'plugins', 'ui-notes', 'lib/index.js'), 'utf8')).toContain('apply')
  })

  it('remove of an omitted occupant not in the profile still deletes checkout', async () => {
    const home = tempDir()
    const repo = tempDir()
    await seedProfile(home)
    const occupant = join(repo, 'packages', 'client', 'ui-notes')
    await seedCheckout(occupant, { name: '@deepseek-ai/dsh-client-ui-notes' })
    await seedLanding(repo, 'ui-notes')
    const removed = await runOverlayLivePlugin(['remove', 'ui-notes'], {
      home, profile: 'web', install: () => undefined, repoRoot: repo,
      workspaceInstall: () => undefined,
      refreshCatalogs: () => undefined,
    })
    expect(removed).toContain('deleted packages/client/ui-notes')
    expect(() => readFileSync(join(occupant, 'package.json'))).toThrow()
  })

  it('remove --keep-files drops only the Loader row', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    await runOverlayLivePlugin(['remove', 'demo', '--keep-files'], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install when keeping files')
      },
    })
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).not.toContain('demo')
    expect(await readFile(join(profile, 'plugins', 'demo', 'lib/index.js'), 'utf8')).toContain('apply')
  })

  it('adds an overlay card on repeat insert and removes that card by unique id', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    let installs = 0
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => { installs += 1 },
    })
    expect(installs).toBe(1)
    const instancesPath = join(profile, 'plugins', 'ui-float-window', 'instances.json')
    const first = defaultOverlayCardSpec()
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))).toEqual([first])
    const yamlBefore = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(hasOverlayCardRosterRpc(parseProfilePatch(yamlBefore).entries)).toBe(true)
    expect(yamlBefore).toContain(OVERLAY_CARD_ROSTER_RPC_ID)
    expect(yamlBefore).toContain(OVERLAY_CARD_ROSTER_RPC_MODULE)
    expect(await readFile(join(profile, 'overlay-card-roster-rpc.mjs'), 'utf8')).toContain('/overlay-card')
    expect(await readFile(join(profile, 'overlay-card-roster-rpc.mjs'), 'utf8')).toContain('instances.setHidden')
    expect(yamlBefore).toContain(OVERLAY_CARD_PLUG_RPC_ID)
    expect(yamlBefore).toContain(OVERLAY_CARD_PLUG_RPC_MODULE)
    expect(await readFile(join(profile, 'overlay-card-plug-rpc.mjs'), 'utf8')).toContain('/overlay-card-plug')
    expect(await readFile(join(profile, 'overlay-card-plug-rpc.mjs'), 'utf8')).toContain('occupants.setInserted')
    const added = await runOverlayLivePlugin([
      'insert', checkout, '--title', '草稿', '--card-id', 'draft', '--width', '520', '--height', '400',
    ], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install when adding a card')
      },
    })
    expect(added).toContain('added card draft')
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))).toEqual([
      first,
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe(yamlBefore)
    const removed = await runOverlayLivePlugin(['remove', 'overlay-card-draft'], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install when removing a card')
      },
    })
    expect(removed).toContain('removed card draft')
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))).toEqual([first])
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('ui-float-window')
    await expect(runOverlayLivePlugin(['remove', 'overlay-card-missing'], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/not loaded/)
  })

  it('mounts roster RPC on a later card insert when the desk row exists without it', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    const dest = join(profile, 'plugins', 'ui-float-window')
    await mkdir(join(dest, 'lib'), { recursive: true })
    await writeFile(join(dest, 'lib/index.js'), 'export function apply() {}\n')
    await writeFile(join(dest, 'package.json'), `${JSON.stringify({
      name: OVERLAY_CARD_PACKAGE_NAME, private: true, type: 'module',
    })}\n`)
    await writeFile(
      join(dest, 'instances.json'),
      formatOverlayCardInstances([defaultOverlayCardSpec()]),
    )
    const seeded = parseProfilePatch(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
    appendInsertRow(seeded.entries, 'ui-float-window', OVERLAY_CARD_PACKAGE_NAME)
    await writeFile(join(profile, 'cordis.patch.yml'), dumpProfilePatch(seeded.comments, seeded.entries))
    expect(hasOverlayCardRosterRpc(seeded.entries)).toBe(false)
    const added = await runOverlayLivePlugin([
      'insert', checkout, '--title', '草稿', '--card-id', 'draft', '--width', '520', '--height', '400',
    ], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install when adding a card')
      },
    })
    expect(added).toContain('added card draft')
    const yaml = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(hasOverlayCardRosterRpc(parseProfilePatch(yaml).entries)).toBe(true)
    expect(yaml).toContain(OVERLAY_CARD_ROSTER_RPC_MODULE)
    expect(await readFile(join(profile, 'overlay-card-roster-rpc.mjs'), 'utf8')).toContain(OVERLAY_CARD_PACKAGE_NAME)
    expect(await readFile(join(profile, 'overlay-card-roster-rpc.mjs'), 'utf8')).toContain('instances.setHidden')
    expect(yaml).toContain(OVERLAY_CARD_PLUG_RPC_MODULE)
    expect(await readFile(join(profile, 'overlay-card-plug-rpc.mjs'), 'utf8')).toContain('/overlay-card-plug')
  })

  it('does not add a second roster RPC row when overlay-card-rpc already exists', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const checkout = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(checkout, { name: OVERLAY_CARD_PACKAGE_NAME })
    const seeded = parseProfilePatch(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
    appendInsertRow(seeded.entries, 'overlay-card-rpc', './overlay-card-rpc.mjs')
    await writeFile(join(profile, 'cordis.patch.yml'), dumpProfilePatch(seeded.comments, seeded.entries))
    await runOverlayLivePlugin(['insert', checkout], {
      home, profile: 'web', install: () => undefined,
    })
    const parsed = parseProfilePatch(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
    const rpcRows = parsed.entries.flatMap(entry => entry.insert.filter(row => (
      row.id === OVERLAY_CARD_ROSTER_RPC_ID || row.id === 'overlay-card-rpc'
    )))
    expect(rpcRows).toEqual([{ id: 'overlay-card-rpc', name: './overlay-card-rpc.mjs' }])
    expect(parsed.entries.flatMap(entry => entry.insert.filter(row => row.id === OVERLAY_CARD_PLUG_RPC_ID)))
      .toEqual([{ id: OVERLAY_CARD_PLUG_RPC_ID, name: OVERLAY_CARD_PLUG_RPC_MODULE }])
  })

  it('refuses card insert flags on a non-card package', async () => {
    const home = tempDir()
    await seedProfile(home)
    const checkout = join(home, 'checkout', 'demo')
    await seedCheckout(checkout)
    await expect(runOverlayLivePlugin(['insert', checkout, '--title', '草稿'], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/ui-float-window/)
  })

  it('rejects unknown commands and incomplete flags', async () => {
    const home = tempDir()
    await expect(runOverlayLivePlugin(['nope'], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/usage/)
    await expect(runOverlayLivePlugin(['insert', '--profile'], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/--profile/)
    await expect(runOverlayLivePlugin(['remove'], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/requires an id/)
  })

  it('records overlayBody occupant ids on the matching card seat', async () => {
    const home = tempDir()
    const profile = await seedProfile(home)
    const card = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(card, { name: OVERLAY_CARD_PACKAGE_NAME })
    await runOverlayLivePlugin(['insert', card], {
      home, profile: 'web', install: () => undefined,
    })
    const page = join(home, 'checkout', 'ui-notes')
    await seedCheckout(page, {
      name: '@deepseek-ai/dsh-client-ui-notes',
      overlayBody: 'overlay-card.body',
    })
    await runOverlayLivePlugin(['insert', page], {
      home, profile: 'web', install: () => undefined,
    })
    const instancesPath = join(profile, 'plugins', 'ui-float-window', 'instances.json')
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))).toEqual([
      { ...defaultOverlayCardSpec(), occupants: ['ui-notes'] },
    ])
    await runOverlayLivePlugin([
      'insert', card, '--title', '草稿', '--card-id', 'draft', '--width', '520', '--height', '400',
    ], {
      home,
      profile: 'web',
      install: () => {
        throw new Error('must not install when adding a card')
      },
    })
    const draftPage = join(home, 'checkout', 'ui-draft')
    await seedCheckout(draftPage, {
      name: '@deepseek-ai/dsh-client-ui-draft',
      overlayBody: 'overlay-card-2.body',
    })
    await runOverlayLivePlugin(['insert', draftPage, '--id', 'ui-draft'], {
      home, profile: 'web', install: () => undefined,
    })
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))).toEqual([
      { ...defaultOverlayCardSpec(), occupants: ['ui-notes'] },
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400, occupants: ['ui-draft'] },
    ])
    await runOverlayLivePlugin(['update', page], {
      home, profile: 'web', install: () => { throw new Error('must not install on update') },
    })
    expect(parseOverlayCardInstances(await readFile(instancesPath, 'utf8'))[0]?.occupants)
      .toEqual(['ui-notes'])
  })

  it('refuses overlayBody when the desk is missing or the seat is not loaded', async () => {
    const home = tempDir()
    await seedProfile(home)
    const page = join(home, 'checkout', 'ui-notes')
    await seedCheckout(page, {
      name: '@deepseek-ai/dsh-client-ui-notes',
      overlayBody: 'overlay-card.body',
    })
    await expect(runOverlayLivePlugin(['insert', page], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/overlay card plugin is not loaded/)
    const card = join(home, 'checkout', 'ui-float-window')
    await seedCheckout(card, { name: OVERLAY_CARD_PACKAGE_NAME })
    await runOverlayLivePlugin(['insert', card], {
      home, profile: 'web', install: () => undefined,
    })
    const later = join(home, 'checkout', 'ui-later')
    await seedCheckout(later, {
      name: '@deepseek-ai/dsh-client-ui-later',
      overlayBody: 'overlay-card-3.body',
    })
    await expect(runOverlayLivePlugin(['insert', later], {
      home, profile: 'web', install: () => undefined,
    })).rejects.toThrow(/seat 3 is not loaded/)
  })

  it('round-trips disabled: true so a later insert does not re-enable the row', () => {
    const dumped = dumpProfilePatch('# keep\n', [{
      insert: [
        { id: 'keep', name: 'keep' },
        { id: 'ui-notes', name: '@deepseek-ai/dsh-client-ui-notes', disabled: true },
      ],
    }])
    expect(dumped).toContain('disabled: true')
    const parsed = parseProfilePatch(dumped)
    expect(parsed.entries[0]?.insert).toEqual([
      { id: 'keep', name: 'keep' },
      { id: 'ui-notes', name: '@deepseek-ai/dsh-client-ui-notes', disabled: true },
    ])
    appendInsertRow(parsed.entries, 'demo', '@deepseek-ai/dsh-client-demo')
    const again = parseProfilePatch(dumpProfilePatch(parsed.comments, parsed.entries))
    expect(findInsertRowByName(again.entries, '@deepseek-ai/dsh-client-ui-notes')).toEqual({
      id: 'ui-notes',
      name: '@deepseek-ai/dsh-client-ui-notes',
      disabled: true,
    })
  })
})
