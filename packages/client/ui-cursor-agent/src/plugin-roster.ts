/**
 * Cursor rail roster for overlay fibers: live profile Loader rows that
 * declare `dsh.client` and are not a card page, the card desk, the desktop
 * board, Cursor, or an overlay RPC sidecar. Desktop occupants occupy
 * `overlay-desktop.body` (one inserted at a time). Shaped occupants
 * (`overlay-shaped.body`, many at a time) list as `shaped` with hide plus
 * unplug. The shaped board is unlistable, like the desktop board. Other
 * fibers have no `overlayBody`. Unplug writes Loader `disabled`. Hide for
 * shaped occupants writes the host `hidden.json` and keeps the silhouette
 * mounted. Desktop products have no hide file.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

/** Connection RPC channel for standalone overlay plugins. */
export const OVERLAY_PLUGIN_RPC_CHANNEL = '/overlay-plugins'

/**
 * Live recovery channel when {@link OVERLAY_PLUGIN_RPC_CHANNEL} still runs a
 * cached Cursor `apply` that listed the desktop host as a fiber.
 */
export const OVERLAY_PLUGIN_RAIL_RPC_CHANNEL = '/overlay-plugins-rail'

/** Loader id of the live sidecar that remounts {@link OVERLAY_PLUGIN_RAIL_RPC_CHANNEL}. */
export const OVERLAY_PLUGIN_RAIL_RPC_ID = 'overlay-plugin-rail-rpc'

/** Endpoint that returns `{ desktop, plugins }`. */
export const OVERLAY_PLUGIN_LIST_ENDPOINT = 'plugins.list'

/** Endpoint that sets Loader `disabled` on one rail plugin id. */
export const OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT = 'plugins.setInserted'

/** Endpoint that writes shaped-host `hidden.json` for one occupant Loader id. */
export const OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT = 'plugins.setHidden'

/** Hide file next to the live shaped-host plugin `lib/` copy. */
export const OVERLAY_SHAPED_HIDDEN_FILE = 'hidden.json'

/** Endpoint that exclusive-enables one `overlay-desktop.body` occupant. */
export const OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT = 'plugins.switchDesktop'

/** Loader id of the live sidecar that remounts this channel. */
export const OVERLAY_PLUGIN_ROSTER_RPC_ID = 'overlay-plugin-roster-rpc'

/** npm name of the reusable desktop board. */
export const OVERLAY_DESKTOP_PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-overlay-desktop'

/** Body slot occupied by the single desktop product page. */
export const OVERLAY_DESKTOP_BODY_SLOT = 'overlay-desktop.body'

/** npm name of the reusable shaped board. */
export const OVERLAY_SHAPED_PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-overlay-shaped'

/** List slot occupied by concurrent shaped product plugins. */
export const OVERLAY_SHAPED_BODY_SLOT = 'overlay-shaped.body'

/**
 * Loader ids this roster must not list or disable. Desk, desktop board,
 * shaped board, Cursor, and overlay RPC sidecars stay mounted. Occupant
 * rows carry hide plus unplug, matching card windows.
 */
const PROTECTED_LOADER_IDS: ReadonlySet<string> = new Set([
  'ui-float-window',
  'ui-overlay-desktop',
  'ui-overlay-shaped',
  'ui-cursor-agent',
  'cursor-agent',
  'overlay-card-roster-rpc',
  'overlay-card-plug-rpc',
  'overlay-card-hide-rpc',
  'overlay-card-rpc',
  OVERLAY_PLUGIN_ROSTER_RPC_ID,
  OVERLAY_PLUGIN_RAIL_RPC_ID,
])

/** How the rail treats this Loader row. */
export type OverlayRailKind = 'fiber' | 'desktop' | 'shaped'

/** One overlay fiber as the plugin panel lists it. */
export interface OverlayStandalonePlugin {
  /** Loader id. */
  readonly id: string
  /** Rail name from `dsh.client.panelTitle`, or the Loader id. */
  readonly title: string
  /** `true` when a shaped occupant is in the host hide file. Always `false` for desktop and other fibers. */
  readonly hidden: boolean
  /** `false` when the Loader row is `disabled: true` or missing. */
  readonly inserted: boolean
  /** This fiber's own Loader id. */
  readonly occupants: readonly string[]
  /** Discriminator for the rail; cards omit this or send `card`. */
  readonly kind: OverlayRailKind
  /** npm package name from the live copy, when present. */
  readonly moduleName: string
}

/** Pinned desktop occupant plus the lower rail list. */
export interface OverlayRailRoster {
  /** Currently inserted `overlay-desktop.body` occupant, or `null`. */
  readonly desktop: OverlayStandalonePlugin | null
  /** Unloaded desktop products plus other overlay fibers. */
  readonly plugins: readonly OverlayStandalonePlugin[]
}

/** Test overrides for the live profile paths. */
export interface OverlayPluginRosterOptions {
  /** Absolute `cordis.patch.yml`. */
  patchPath?: string
  /** Absolute `plugins/` directory. */
  pluginsDir?: string
}

/** One Loader insert row as this roster reads it. */
interface LoaderRow {
  readonly id: string
  readonly name: string
  readonly disabled: boolean
}

/**
 * Register `/overlay-plugins` and `/overlay-plugins-rail`. Duplicate
 * `rpc.handle` is ignored so a live sidecar can own a channel without
 * failing this fiber.
 * @param ctx - host plugin context that already has `connection`.
 * @param options - optional profile path overrides for tests.
 */
export function applyOverlayPluginRoster(ctx: Context, options?: OverlayPluginRosterOptions): void {
  registerOverlayPluginRosterChannel(ctx, OVERLAY_PLUGIN_RPC_CHANNEL, options)
  registerOverlayPluginRosterChannel(ctx, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, options)
}

function registerOverlayPluginRosterChannel(
  ctx: Context,
  channel: string,
  options?: OverlayPluginRosterOptions,
): void {
  try {
    ctx.connection.rpc.handle(
      channel,
      (endpoint, payload) => {
        const paths = resolveRosterPaths(options)
        return dispatchOverlayPluginRpc(paths.patchPath, paths.pluginsDir, endpoint, payload)
      },
      { authority: 'trusted-host' },
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate')) return
    throw error
  }
}

/**
 * Live profile `cordis.patch.yml` and `plugins/` for this `dsh web` process.
 * @param options - test overrides.
 */
export function resolveRosterPaths(
  options?: OverlayPluginRosterOptions,
): { patchPath: string; pluginsDir: string } {
  if (options?.patchPath !== undefined) {
    return {
      patchPath: options.patchPath,
      pluginsDir: options.pluginsDir ?? join(dirname(options.patchPath), 'plugins'),
    }
  }
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const profile = overlayProfileName(process.argv)
  const root = join(home, 'profiles', profile)
  return {
    patchPath: join(root, 'cordis.patch.yml'),
    pluginsDir: options?.pluginsDir ?? join(root, 'plugins'),
  }
}

/**
 * Desktop occupant and remaining overlay fibers in a live profile patch.
 * @param patchText - `cordis.patch.yml` contents.
 * @param pluginsDir - profile `plugins/` directory.
 */
export function listOverlayRailPlugins(patchText: string, pluginsDir: string): OverlayRailRoster {
  let desktop: OverlayStandalonePlugin | null = null
  const plugins: OverlayStandalonePlugin[] = []
  const hiddenIds = new Set(readShapedHiddenIds(pluginsDir))
  for (const row of scanLoaderRows(patchText)) {
    const kind = overlayRailKind(row.id, pluginsDir)
    if (kind === undefined) continue
    const inserted = row.disabled === false
    const item: OverlayStandalonePlugin = {
      id: row.id,
      title: standalonePluginTitle(row.id, pluginsDir),
      hidden: kind === 'shaped' && hiddenIds.has(row.id),
      inserted,
      occupants: [row.id],
      kind,
      moduleName: standalonePluginModuleName(row.id, pluginsDir),
    }
    if (kind === 'desktop' && inserted && desktop === null) {
      desktop = item
      continue
    }
    plugins.push(item)
  }
  return { desktop, plugins }
}

/**
 * Whether this Loader id is a rail overlay fiber this roster may list.
 * @param id - Loader id.
 * @param pluginsDir - profile `plugins/` directory.
 */
export function isOverlayRailPlugin(id: string, pluginsDir: string): boolean {
  return overlayRailKind(id, pluginsDir) !== undefined
}

/**
 * Whether this Loader id is a non-desktop standalone overlay fiber.
 * @param id - Loader id.
 * @param pluginsDir - profile `plugins/` directory.
 */
export function isStandaloneOverlayPlugin(id: string, pluginsDir: string): boolean {
  return overlayRailKind(id, pluginsDir) === 'fiber'
}

/**
 * Set `disabled: true` or delete it on one rail Loader row. Inserting a
 * desktop occupant exclusive-disables every other desktop occupant.
 * @param patchText - `cordis.patch.yml` contents.
 * @param pluginsDir - profile `plugins/` directory.
 * @param id - Loader id.
 * @param inserted - `false` writes `disabled: true`.
 * @throws when the id is protected, not a rail plugin, or missing from the patch.
 */
export function setOverlayRailPluginInserted(
  patchText: string,
  pluginsDir: string,
  id: string,
  inserted: boolean,
): string {
  const kind = overlayRailKind(id, pluginsDir)
  if (kind === undefined) {
    throw new Error(`overlay-plugins: ${JSON.stringify(id)} is not a rail overlay plugin`)
  }
  if (kind === 'desktop' && inserted) {
    return setDesktopOccupantExclusive(patchText, pluginsDir, id)
  }
  return setLoaderRowInserted(patchText, id, inserted)
}

/**
 * Hide or show one `overlay-shaped.body` occupant. The silhouette stays
 * mounted. The shaped host Loader row and other fibers have no hide file.
 * @param pluginsDir - profile `plugins/` directory.
 * @param id - occupant Loader id.
 * @param hidden - `true` hides the silhouette with CSS visibility; the occupant stays mounted.
 * @throws when the id is not a shaped occupant.
 */
export function setOverlayRailPluginHidden(
  pluginsDir: string,
  id: string,
  hidden: boolean,
): void {
  if (overlayRailKind(id, pluginsDir) !== 'shaped') {
    throw new Error(`overlay-plugins: ${JSON.stringify(id)} is not a shaped occupant`)
  }
  const hostDir = findShapedHostPluginDir(pluginsDir)
  if (hostDir === undefined) {
    throw new Error('overlay-plugins: overlay shaped plugin is not loaded')
  }
  const next = setShapedHiddenId(readShapedHiddenIds(pluginsDir), id, hidden)
  writeFileSync(join(hostDir, OVERLAY_SHAPED_HIDDEN_FILE), formatShapedHiddenFile(next))
}

/**
 * Exclusive-enable one `overlay-desktop.body` occupant and disable the rest.
 * @param patchText - `cordis.patch.yml` contents.
 * @param pluginsDir - profile `plugins/` directory.
 * @param id - Loader id of the desktop occupant to insert.
 * @throws when the id is not a desktop occupant or is missing from the patch.
 */
export function setDesktopOccupantExclusive(
  patchText: string,
  pluginsDir: string,
  id: string,
): string {
  if (overlayRailKind(id, pluginsDir) !== 'desktop') {
    throw new Error(`overlay-plugins: ${JSON.stringify(id)} is not a desktop occupant`)
  }
  let next = patchText
  for (const row of scanLoaderRows(next)) {
    if (overlayRailKind(row.id, pluginsDir) !== 'desktop') continue
    next = setLoaderRowInserted(next, row.id, row.id === id)
  }
  return next
}

/**
 * Lower-list overlay fibers (unloaded desktops plus non-desktop fibers).
 * @param patchText - `cordis.patch.yml` contents.
 * @param pluginsDir - profile `plugins/` directory.
 */
export function listStandaloneOverlayPlugins(
  patchText: string,
  pluginsDir: string,
): OverlayStandalonePlugin[] {
  return [...listOverlayRailPlugins(patchText, pluginsDir).plugins]
}

/**
 * Set Loader `disabled` on one rail plugin. Same as {@link setOverlayRailPluginInserted}.
 * @param patchText - `cordis.patch.yml` contents.
 * @param pluginsDir - profile `plugins/` directory.
 * @param id - Loader id.
 * @param inserted - `false` writes `disabled: true`.
 */
export function setStandaloneOverlayPluginInserted(
  patchText: string,
  pluginsDir: string,
  id: string,
  inserted: boolean,
): string {
  return setOverlayRailPluginInserted(patchText, pluginsDir, id, inserted)
}

function dispatchOverlayPluginRpc(
  patchPath: string,
  pluginsDir: string,
  endpoint: string,
  payload: unknown,
): { ok: true; value: OverlayRailRoster } | {
  ok: false
  error: { code: 'bad-request'; message: string; details: { issues: [] } }
} {
  if (endpoint === OVERLAY_PLUGIN_LIST_ENDPOINT) {
    return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }
  }
  if (endpoint === OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT) {
    const request = parseSetInsertedPayload(payload)
    if (request === undefined) {
      return badRequest('overlay-plugins: plugins.setInserted needs { id, inserted }')
    }
    try {
      const text = readFileSync(patchPath, 'utf8')
      writeFileSync(
        patchPath,
        setOverlayRailPluginInserted(text, pluginsDir, request.id, request.inserted),
      )
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'overlay-plugins: setInserted failed')
    }
    return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }
  }
  if (endpoint === OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT) {
    const request = parseSetHiddenPayload(payload)
    if (request === undefined) {
      return badRequest('overlay-plugins: plugins.setHidden needs { id, hidden }')
    }
    try {
      setOverlayRailPluginHidden(pluginsDir, request.id, request.hidden)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'overlay-plugins: setHidden failed')
    }
    return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }
  }
  if (endpoint === OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT) {
    const request = parseSwitchDesktopPayload(payload)
    if (request === undefined) {
      return badRequest('overlay-plugins: plugins.switchDesktop needs { id }')
    }
    try {
      const text = readFileSync(patchPath, 'utf8')
      writeFileSync(patchPath, setDesktopOccupantExclusive(text, pluginsDir, request.id))
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'overlay-plugins: switchDesktop failed')
    }
    return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }
  }
  return badRequest(`unknown overlay-plugins endpoint ${endpoint}`)
}

function listedFromDisk(patchPath: string, pluginsDir: string): OverlayRailRoster {
  try {
    return listOverlayRailPlugins(readFileSync(patchPath, 'utf8'), pluginsDir)
  } catch (error) {
    if (isMissingFile(error)) return { desktop: null, plugins: [] }
    throw error
  }
}

function overlayRailKind(id: string, pluginsDir: string): OverlayRailKind | undefined {
  if (PROTECTED_LOADER_IDS.has(id)) return undefined
  const pkg = readPluginPackage(pluginsDir, id)
  if (pkg === undefined) return undefined
  if (typeof pkg.name === 'string' && pkg.name === OVERLAY_DESKTOP_PACKAGE_NAME) return undefined
  if (typeof pkg.name === 'string' && pkg.name === OVERLAY_SHAPED_PACKAGE_NAME) return undefined
  const client = dshClientRecord(pkg)
  if (client === undefined) return undefined
  if (typeof client.overlayBody === 'string') {
    if (client.overlayBody === OVERLAY_DESKTOP_BODY_SLOT) return 'desktop'
    if (client.overlayBody === OVERLAY_SHAPED_BODY_SLOT) return 'shaped'
    return undefined
  }
  return 'fiber'
}

function standalonePluginModuleName(id: string, pluginsDir: string): string {
  const pkg = readPluginPackage(pluginsDir, id)
  return typeof pkg?.name === 'string' ? pkg.name : ''
}

function findShapedHostPluginDir(pluginsDir: string): string | undefined {
  let names: string[]
  try {
    names = readdirSync(pluginsDir)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
  for (const name of names) {
    const root = join(pluginsDir, name)
    const pkg = readPluginPackage(pluginsDir, name)
    if (pkg?.name === OVERLAY_SHAPED_PACKAGE_NAME) return root
  }
  return undefined
}

function readShapedHiddenIds(pluginsDir: string): readonly string[] {
  const hostDir = findShapedHostPluginDir(pluginsDir)
  if (hostDir === undefined) return []
  try {
    return parseShapedHiddenFile(readFileSync(join(hostDir, OVERLAY_SHAPED_HIDDEN_FILE), 'utf8'))
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
}

function parseShapedHiddenFile(text: string): readonly string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return []
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const hidden = (parsed as { hidden?: unknown }).hidden
  if (!Array.isArray(hidden)) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of hidden) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function formatShapedHiddenFile(ids: readonly string[]): string {
  return `${JSON.stringify({ hidden: [...ids] }, null, 2)}\n`
}

function setShapedHiddenId(ids: readonly string[], id: string, hidden: boolean): readonly string[] {
  const next = ids.filter(item => item !== id)
  if (hidden) return [...next, id]
  return next
}

function standalonePluginTitle(id: string, pluginsDir: string): string {
  const pkg = readPluginPackage(pluginsDir, id)
  const client = pkg === undefined ? undefined : dshClientRecord(pkg)
  if (typeof client?.panelTitle === 'string' && client.panelTitle.trim().length > 0) {
    return client.panelTitle.trim()
  }
  return id
}

function readPluginPackage(pluginsDir: string, id: string): Record<string, unknown> | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(pluginsDir, id, 'package.json'), 'utf8')) as unknown
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    return raw as Record<string, unknown>
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

function dshClientRecord(pkg: Record<string, unknown>): Record<string, unknown> | undefined {
  const dsh = pkg.dsh
  if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh)) return undefined
  const client = (dsh as Record<string, unknown>).client
  if (client === null || typeof client !== 'object' || Array.isArray(client)) return undefined
  return client as Record<string, unknown>
}

function scanLoaderRows(text: string): LoaderRow[] {
  const rows: LoaderRow[] = []
  for (const block of loaderRowBlocks(text.split(/\n/))) {
    rows.push({
      id: block.id,
      name: block.name,
      disabled: block.disabledLine !== undefined,
    })
  }
  return rows
}

function setLoaderRowInserted(text: string, id: string, inserted: boolean): string {
  const lines = text.split(/\n/)
  const block = loaderRowBlocks(lines).find(item => item.id === id)
  if (block === undefined) {
    throw new Error(`overlay-plugins: ${JSON.stringify(id)} is not in the live patch`)
  }
  if (inserted) {
    if (block.disabledLine === undefined) return text.endsWith('\n') ? text : `${text}\n`
    const next = lines.filter((_, index) => index !== block.disabledLine).join('\n')
    return next.endsWith('\n') ? next : `${next}\n`
  }
  if (block.disabledLine !== undefined) return text.endsWith('\n') ? text : `${text}\n`
  const insertAt = block.endLine + 1
  const disabled = `${block.keyIndent}disabled: true`
  const next = [...lines.slice(0, insertAt), disabled, ...lines.slice(insertAt)].join('\n')
  return next.endsWith('\n') ? next : `${next}\n`
}

interface LoaderRowBlock {
  id: string
  name: string
  keyIndent: string
  endLine: number
  disabledLine: number | undefined
}

function loaderRowBlocks(lines: readonly string[]): LoaderRowBlock[] {
  const blocks: LoaderRowBlock[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const idMatch = /^(\s*)- id:\s*(.+?)\s*$/.exec(line)
    if (idMatch === null) continue
    const dashIndent = idMatch[1] ?? ''
    const id = yamlScalar(idMatch[2] ?? '')
    if (id.length === 0) continue
    let name = ''
    let keyIndent = `${dashIndent}  `
    let disabledLine: number | undefined
    let endLine = index
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const body = lines[cursor]
      if (body === undefined) break
      if (body.trim().length === 0) continue
      const indentMatch = /^(\s*)/.exec(body)
      const indent = indentMatch?.[1] ?? ''
      if (indent.length <= dashIndent.length) break
      if (/^\s*- /.test(body)) break
      endLine = cursor
      if (indent.length > keyIndent.length && keyIndent === `${dashIndent}  `) {
        keyIndent = indent
      }
      const nameMatch = /^\s+name:\s*(.+?)\s*$/.exec(body)
      if (nameMatch !== undefined && nameMatch !== null) {
        name = yamlScalar(nameMatch[1] ?? '')
        keyIndent = indent
      }
      if (/^\s+disabled:\s*true\s*$/.test(body)) disabledLine = cursor
    }
    blocks.push({ id, name, keyIndent, endLine, disabledLine })
  }
  return blocks
}

function yamlScalar(raw: string): string {
  const text = raw.trim()
  if (text.length >= 2) {
    const start = text[0]
    const end = text[text.length - 1]
    if ((start === "'" && end === "'") || (start === '"' && end === '"')) {
      return text.slice(1, -1)
    }
  }
  return text
}

function parseSetHiddenPayload(value: unknown): { id: string; hidden: boolean } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.hidden !== 'boolean') return undefined
  return { id: record.id, hidden: record.hidden }
}

function parseSetInsertedPayload(value: unknown): { id: string; inserted: boolean } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.inserted !== 'boolean') return undefined
  return { id: record.id, inserted: record.inserted }
}

function parseSwitchDesktopPayload(value: unknown): { id: string } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  return { id: record.id }
}

function overlayProfileName(argv: readonly string[]): string {
  const eq = argv.find(flag => flag.startsWith('--profile='))
  if (eq !== undefined && eq.length > '--profile='.length) return eq.slice('--profile='.length)
  const index = argv.indexOf('--profile')
  const named = index >= 0 ? argv[index + 1] : undefined
  if (named !== undefined && named.length > 0 && !named.startsWith('-')) return named
  return 'web'
}

function badRequest(message: string): {
  ok: false
  error: { code: 'bad-request'; message: string; details: { issues: [] } }
} {
  return {
    ok: false,
    error: { code: 'bad-request', message, details: { issues: [] } },
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
