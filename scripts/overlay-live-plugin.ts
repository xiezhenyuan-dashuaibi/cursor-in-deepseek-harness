/**
 * Live-insert overlay plugins into a running `dsh web` profile without
 * restarting the process. Overlay Cursor is that process; a restart drops
 * this session. Card insert also mounts `/overlay-card` through
 * `./overlay-card-roster-rpc.mjs` when that roster channel is missing, and
 * `./overlay-card-plug-rpc.mjs` so `instances.setHidden` and
 * `occupants.setInserted` can mount beside a cached list-only `/overlay-card`
 * handler. Any insert or update also writes `./overlay-plugin-roster-rpc.mjs`
 * and `./overlay-plugin-rail-rpc.mjs` so `/overlay-plugins-rail` can list
 * desktop occupants when the cached `ui-cursor-agent` `apply` already owns
 * `/overlay-plugins`.
 */

import { spawnSync } from 'node:child_process'
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import {
  appendOverlayCard,
  appendOverlayCardOccupant,
  defaultOverlayCardSpec,
  dropOverlayCard,
  formatOverlayCardInstances,
  OVERLAY_CARD_INSTANCES_FILE,
  OVERLAY_CARD_LIST_ENDPOINT,
  OVERLAY_CARD_PACKAGE_NAME,
  OVERLAY_CARD_PLUG_RPC_CHANNEL,
  OVERLAY_CARD_RPC_CHANNEL,
  OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
  OVERLAY_CARD_SET_INSERTED_ENDPOINT,
  overlayCardSeatFromBodySlot,
  parseOverlayCardInstanceId,
  parseOverlayCardInstances,
  resolveOverlayCardInsert,
  type OverlayCardInsertRequest,
} from '../packages/client/ui-float-window/src/instances.ts'
import {
  OVERLAY_DESKTOP_BODY_SLOT,
  OVERLAY_DESKTOP_PACKAGE_NAME,
  OVERLAY_PLUGIN_LIST_ENDPOINT,
  OVERLAY_PLUGIN_RAIL_RPC_CHANNEL,
  OVERLAY_PLUGIN_RAIL_RPC_ID,
  OVERLAY_PLUGIN_RPC_CHANNEL,
  OVERLAY_PLUGIN_ROSTER_RPC_ID,
  OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
  OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT,
  setDesktopOccupantExclusive,
} from '../packages/client/ui-cursor-agent/src/plugin-roster.ts'
import { purgeCheckoutOccupant } from './overlay-page-checkout.ts'

export { OVERLAY_PLUGIN_RAIL_RPC_ID, OVERLAY_PLUGIN_ROSTER_RPC_ID }

/** Loader id for the profile-relative `/overlay-card` module. */
export const OVERLAY_CARD_ROSTER_RPC_ID = 'overlay-card-roster-rpc'

/** File name written at the profile root. */
const OVERLAY_CARD_ROSTER_RPC_FILE = 'overlay-card-roster-rpc.mjs'

/** Loader name for that module (profile-relative, never the npm package). */
export const OVERLAY_CARD_ROSTER_RPC_MODULE = `./${OVERLAY_CARD_ROSTER_RPC_FILE}`

/** Loader id for the never-imported hide/insert channel. */
export const OVERLAY_CARD_PLUG_RPC_ID = 'overlay-card-plug-rpc'

/** File name for {@link OVERLAY_CARD_PLUG_RPC_CHANNEL}. */
const OVERLAY_CARD_PLUG_RPC_FILE = 'overlay-card-plug-rpc.mjs'

/** Loader name for the plug channel module. */
export const OVERLAY_CARD_PLUG_RPC_MODULE = `./${OVERLAY_CARD_PLUG_RPC_FILE}`

/**
 * Second specifier for the same `/overlay-card-plug` handlers. `overlay:live
 * update` of the card package retargets an existing plug-rpc row here so Node
 * imports hide/insert `apply` after the first plug-rpc URL is already cached.
 */
export const OVERLAY_CARD_HIDE_RPC_FILE = 'overlay-card-hide-rpc.mjs'

/** Loader name for {@link OVERLAY_CARD_HIDE_RPC_FILE}. */
export const OVERLAY_CARD_HIDE_RPC_MODULE = `./${OVERLAY_CARD_HIDE_RPC_FILE}`

/** File name written at the profile root for `/overlay-plugins`. */
const OVERLAY_PLUGIN_ROSTER_RPC_FILE = 'overlay-plugin-roster-rpc.mjs'

/** Loader name for that never-imported specifier. */
export const OVERLAY_PLUGIN_ROSTER_RPC_MODULE = `./${OVERLAY_PLUGIN_ROSTER_RPC_FILE}`

/** File name written at the profile root for `/overlay-plugins-rail`. */
const OVERLAY_PLUGIN_RAIL_RPC_FILE = 'overlay-plugin-rail-rpc.mjs'

/** Loader name for {@link OVERLAY_PLUGIN_RAIL_RPC_FILE}. */
export const OVERLAY_PLUGIN_RAIL_RPC_MODULE = `./${OVERLAY_PLUGIN_RAIL_RPC_FILE}`

/** Second specifier so a later rewrite remounts {@link OVERLAY_PLUGIN_RAIL_RPC_CHANNEL}. */
const OVERLAY_PLUGIN_RAIL_REMOUNT_FILE = 'overlay-plugin-rail-rpc-2.mjs'

/** Loader name for {@link OVERLAY_PLUGIN_RAIL_REMOUNT_FILE}. */
export const OVERLAY_PLUGIN_RAIL_REMOUNT_MODULE = `./${OVERLAY_PLUGIN_RAIL_REMOUNT_FILE}`

/** Files copied from a built checkout package into the profile plugin dir. */
export const PROFILE_LIB_FILES = [
  'lib/index.js',
  'lib/invariant.js',
  'lib/client.js',
  'lib/client.js.map',
] as const

/** Loader patch document: a list of insert groups. */
export interface ProfilePatchDocument {
  /** Insert groups in file order. */
  readonly entries: ProfilePatchEntry[]
}

/** One `- insert:` group in `cordis.patch.yml`. */
export interface ProfilePatchEntry {
  /** Rows appended to this group. */
  insert: LoaderInsertRow[]
}

/** One Loader row. */
export interface LoaderInsertRow {
  /** Cordis entry id. */
  id: string
  /** Package name the Loader resolves. */
  name: string
  /** When true, Cordis does not mount this fiber. */
  disabled?: boolean
}

/** Checkout `package.json` fields this helper reads. */
export interface CheckoutManifest {
  /** npm package name. */
  name?: string
  /** Optional `dsh.client` block; presence means a browser half exists. */
  dsh?: { client?: unknown }
}

/**
 * Resolve the Harness home: `$DSH_HOME` when set, otherwise `~/.dsh`.
 * @param env - environment map; tests pass a stub.
 * @returns an absolute home path.
 */
export function resolveOverlayHome(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  if (fromEnv !== undefined && fromEnv.length > 0) return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

/**
 * Profile directory for live Loader rows and `file:` plugins.
 * @param home - Harness home.
 * @param profile - profile name, usually `web`.
 * @returns `$home/profiles/$profile`.
 */
export function profileDir(home: string, profile: string): string {
  return join(home, 'profiles', profile)
}

/**
 * Strip `workspace:` so profile `pnpm install` can resolve a `file:` copy.
 * @param source - checkout package.json object.
 * @returns a profile-safe manifest.
 * @throws when `name` is missing.
 */
export function stripProfileManifest(source: CheckoutManifest): Record<string, unknown> {
  if (typeof source.name !== 'string' || source.name.length === 0) {
    throw new Error('overlay-live-plugin: checkout package.json is missing name')
  }
  const exports: Record<string, string> = {
    '.': './lib/index.js',
    './invariant': './lib/invariant.js',
    './package.json': './package.json',
  }
  const stripped: Record<string, unknown> = {
    name: source.name,
    private: true,
    type: 'module',
    main: './lib/index.js',
    exports,
  }
  if (source.dsh?.client !== undefined) {
    stripped.dsh = { client: source.dsh.client }
    exports['./client'] = './lib/client.js'
  }
  return stripped
}

/**
 * Parse a profile `cordis.patch.yml` that is a list of insert groups.
 * @param text - file contents.
 * @returns the document plus any leading `#` comment block.
 */
export function parseProfilePatch(text: string): { comments: string } & ProfilePatchDocument {
  const comments = leadingCommentBlock(text)
  const body = text.slice(comments.length)
  if (body.trim().length === 0) return { comments, entries: [] }
  const loaded = yaml.load(body)
  if (!Array.isArray(loaded)) {
    throw new Error('overlay-live-plugin: cordis.patch.yml must be a YAML array')
  }
  const entries: ProfilePatchEntry[] = []
  for (const item of loaded) {
    if (!isJsonObject(item)) {
      throw new Error('overlay-live-plugin: each patch entry must be a mapping')
    }
    const insert = item.insert
    if (insert === undefined) {
      entries.push({ insert: [] })
      continue
    }
    if (!Array.isArray(insert)) {
      throw new Error('overlay-live-plugin: insert must be a list of { id, name } rows')
    }
    entries.push({ insert: insert.map(row => asInsertRow(row)) })
  }
  return { comments, entries }
}

/**
 * Serialize a patch document, restoring the leading comment block.
 * @param comments - leading `#` lines including trailing newlines.
 * @param entries - insert groups.
 * @returns YAML text.
 */
export function dumpProfilePatch(comments: string, entries: ProfilePatchEntry[]): string {
  const dumped = yaml.dump(entries, { lineWidth: 120, noRefs: true, quotingType: "'" })
  const body = dumped.endsWith('\n') ? dumped : `${dumped}\n`
  return `${comments}${body}`
}

/**
 * Whether any insert group already has this Loader id.
 * @param entries - parsed groups.
 * @param id - Loader id.
 * @returns true when the id is present.
 */
export function patchHasId(entries: readonly ProfilePatchEntry[], id: string): boolean {
  return entries.some(entry => entry.insert.some(row => row.id === id))
}

/**
 * Find the first Loader row whose package name matches.
 * @param entries - parsed groups.
 * @param name - package name.
 * @returns the row, or `undefined`.
 */
export function findInsertRowByName(
  entries: readonly ProfilePatchEntry[],
  name: string,
): LoaderInsertRow | undefined {
  for (const entry of entries) {
    const row = entry.insert.find(item => item.name === name)
    if (row !== undefined) return row
  }
  return undefined
}

/**
 * Whether the profile already has an overlay-card roster RPC Loader row.
 * Counts the product `./overlay-card-roster-rpc.mjs` row and a live
 * `./overlay-card-rpc.mjs` recovery row so insert does not register twice.
 * @param entries - parsed groups.
 * @returns true when a roster RPC row is present.
 */
export function hasOverlayCardRosterRpc(entries: readonly ProfilePatchEntry[]): boolean {
  return entries.some(entry => entry.insert.some(row => isOverlayCardRosterRpcRow(row)))
}

function isOverlayCardRosterRpcRow(row: LoaderInsertRow): boolean {
  return row.id === OVERLAY_CARD_ROSTER_RPC_ID
    || row.id === 'overlay-card-rpc'
    || row.name === OVERLAY_CARD_ROSTER_RPC_MODULE
    || row.name === './overlay-card-rpc.mjs'
}

/**
 * Whether the profile already has the live hide/insert channel.
 * @param entries - parsed groups.
 * @returns true when the plug RPC row is present.
 */
export function hasOverlayCardPlugRpc(entries: readonly ProfilePatchEntry[]): boolean {
  return entries.some(entry => entry.insert.some(row => (
    row.id === OVERLAY_CARD_PLUG_RPC_ID
    || row.name === OVERLAY_CARD_PLUG_RPC_MODULE
    || row.name === OVERLAY_CARD_HIDE_RPC_MODULE
  )))
}

/**
 * Whether the profile already has the standalone-fiber roster channel.
 * @param entries - parsed groups.
 * @returns true when the plugin-roster RPC row is present.
 */
export function hasOverlayPluginRosterRpc(entries: readonly ProfilePatchEntry[]): boolean {
  return entries.some(entry => entry.insert.some(row => (
    row.id === OVERLAY_PLUGIN_ROSTER_RPC_ID
    || row.name === OVERLAY_PLUGIN_ROSTER_RPC_MODULE
  )))
}

/**
 * Whether the profile already has the desktop-rail recovery channel.
 * @param entries - parsed groups.
 * @returns true when the rail RPC row is present.
 */
export function hasOverlayPluginRailRpc(entries: readonly ProfilePatchEntry[]): boolean {
  return entries.some(entry => entry.insert.some(row => (
    row.id === OVERLAY_PLUGIN_RAIL_RPC_ID
    || row.name === OVERLAY_PLUGIN_RAIL_RPC_MODULE
    || row.name === OVERLAY_PLUGIN_RAIL_REMOUNT_MODULE
  )))
}

/**
 * Append a Loader row to the last insert group, creating one if needed.
 * A second call with an existing id is a no-op.
 * @param entries - parsed groups (mutated).
 * @param id - Loader id.
 * @param name - package name.
 */
export function appendInsertRow(entries: ProfilePatchEntry[], id: string, name: string): void {
  if (patchHasId(entries, id)) return
  const last = entries.at(-1)
  if (last === undefined) {
    entries.push({ insert: [{ id, name }] })
    return
  }
  last.insert.push({ id, name })
}

/**
 * Set or clear Loader `disabled` on every row with this id.
 * @param entries - parsed groups (mutated).
 * @param id - Loader id.
 * @param disabled - true writes `disabled: true`; false removes the field.
 * @returns true when a row changed.
 */
export function setInsertRowDisabled(
  entries: ProfilePatchEntry[],
  id: string,
  disabled: boolean,
): boolean {
  let changed = false
  for (const entry of entries) {
    for (const row of entry.insert) {
      if (row.id !== id) continue
      if (disabled) {
        if (row.disabled === true) continue
        row.disabled = true
        changed = true
        continue
      }
      if (row.disabled !== true) continue
      delete row.disabled
      changed = true
    }
  }
  return changed
}

/**
 * Disable then re-enable a Loader row so Cordis remounts that fiber.
 * @param patchPath - profile `cordis.patch.yml`.
 * @param id - Loader id.
 * @param options - settle delay between the two writes. Tests stub `sleep`.
 */
export async function remountInsertRow(
  patchPath: string,
  id: string,
  options: { settleMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const settleMs = options.settleMs ?? 800
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
  const first = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (!setInsertRowDisabled(first.entries, id, true)) {
    throw new Error(`overlay-live-plugin: cannot remount missing Loader id ${id}`)
  }
  await writeFile(patchPath, dumpProfilePatch(first.comments, first.entries))
  await sleep(settleMs)
  const second = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (!setInsertRowDisabled(second.entries, id, false)) {
    throw new Error(`overlay-live-plugin: cannot re-enable Loader id ${id}`)
  }
  await writeFile(patchPath, dumpProfilePatch(second.comments, second.entries))
}

/**
 * Drop `dsh.client.overlayBody` so an older client-modules scanner can admit
 * the package. Rail and exclusive-desktop insert still read the checkout
 * `package.json`.
 * @param manifest - live plugin `package.json` object.
 * @returns a shallow copy without `overlayBody`, or `undefined` when absent.
 */
export function omitClientOverlayBody(manifest: Record<string, unknown>): Record<string, unknown> | undefined {
  const dsh = manifest.dsh
  if (!isJsonObject(dsh)) return undefined
  const client = dsh.client
  if (!isJsonObject(client) || typeof client.overlayBody !== 'string') return undefined
  const nextClient = { ...client }
  delete nextClient.overlayBody
  return { ...manifest, dsh: { ...dsh, client: nextClient } }
}

/**
 * Remove every Loader row with this id.
 * @param entries - parsed groups (mutated).
 * @param id - Loader id.
 */
export function removeInsertRow(entries: ProfilePatchEntry[], id: string): void {
  for (const entry of entries) {
    entry.insert = entry.insert.filter(row => row.id !== id)
  }
}

/**
 * Copy built `lib/` artifacts that exist. At least `lib/index.js` must exist.
 * @param fromPkg - checkout package directory.
 * @param toPkg - profile plugin directory.
 */
export async function copyProfileLib(fromPkg: string, toPkg: string): Promise<void> {
  const index = join(fromPkg, 'lib/index.js')
  try {
    await access(index)
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(
        `overlay-live-plugin: missing ${index}; overlay:live insert/update runs tsc -p tsconfig.json and pnpm run bundle when tsdown.config.ts is present`,
      )
    }
    throw error
  }
  await mkdir(join(toPkg, 'lib'), { recursive: true })
  await copyFile(index, join(toPkg, 'lib/index.js'))
  for (const relative of PROFILE_LIB_FILES) {
    if (relative === 'lib/index.js') continue
    try {
      await copyFile(join(fromPkg, relative), join(toPkg, relative))
    } catch (error) {
      if (isMissing(error)) continue
      throw error
    }
  }
}

/** Default origin of the overlay Cursor `dsh web` page. */
export const DEFAULT_OVERLAY_LIVE_ORIGIN = 'http://127.0.0.1:3080'

/** HTTP path of the Host plugin-inventory list Remote. */
export const PLUGIN_INVENTORY_LIST_ENDPOINT = '/api/pluginInventory/list'

/** Typert method name for {@link PLUGIN_INVENTORY_LIST_ENDPOINT}. */
const PLUGIN_INVENTORY_LIST_METHOD = 'pluginInventory/list'

/** Loader fiber projection used when classifying a boot-graph miss. */
export interface LiveClientFiber {
  /** Effective Loader enablement. */
  readonly enabled: boolean
  /** Root Fiber phase, or `null` when the entry has no live root Fiber. */
  readonly fiberPhase: string | null
}

/** Result of one `pluginInventory/list` probe. */
export type LiveClientFiberProbe =
  | { readonly kind: 'match'; readonly fiber: LiveClientFiber }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreachable'; readonly detail: string }

/** Context passed to {@link OverlayLiveOptions.waitForClientRow} after yaml write. */
export interface LiveClientWaitContext {
  /** Loader directory id. */
  readonly loaderId: string
  /** Profile copy of the plugin `package.json`. */
  readonly liveManifestPath: string
  /** Profile `cordis.patch.yml`. */
  readonly patchPath: string
}

/**
 * Boot-graph wait that timed out. {@link confirmLiveClientBoot} classifies this
 * against Loader inventory before the CLI prints stderr.
 */
export class LiveClientBootWaitError extends Error {
  readonly packageName: string
  readonly origin: string
  readonly lastStatus: string

  /**
   * @param packageName - npm name used as the boot-graph id.
   * @param origin - overlay origin that was polled.
   * @param lastStatus - last HTTP or network observation.
   */
  constructor(packageName: string, origin: string, lastStatus: string) {
    super(
      `overlay-live-plugin: ${packageName} is not in window.__DSH_BOOT__ at ${origin} (${lastStatus}).`,
    )
    this.name = 'LiveClientBootWaitError'
    this.packageName = packageName
    this.origin = origin
    this.lastStatus = lastStatus
  }
}

/**
 * Whether index HTML injects this package in `window.__DSH_BOOT__`.
 * The plugin rail lists profile yaml; this graph is the live Loader table.
 * @param html - `GET /` body.
 * @param packageName - npm name used as the boot-graph id.
 * @returns true when an entry id matches.
 */
export function bootGraphHasPackage(html: string, packageName: string): boolean {
  const assigned = /window\.__DSH_BOOT__\s*=\s*/.exec(html)
  if (assigned === null) return false
  const jsonStart = assigned.index + assigned[0].length
  const jsonEnd = html.indexOf('</script>', jsonStart)
  if (jsonEnd === -1) return false
  const raw = html.slice(jsonStart, jsonEnd).trim().replace(/;+\s*$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !('entries' in parsed)) return false
  const entries = parsed.entries
  if (!Array.isArray(entries)) return false
  return entries.some((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false
    return (entry as { id?: unknown }).id === packageName
  })
}

/**
 * Poll `GET origin` until the package is in the boot graph.
 * @param packageName - npm name used as the boot-graph id.
 * @param options - origin, fetch, and timing. Tests stub `fetchImpl`.
 * @returns after the row is present.
 * @throws {LiveClientBootWaitError} when the origin stays unreachable or the row is still missing.
 */
export async function waitUntilBootGraphHas(
  packageName: string,
  options: {
    origin?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
    intervalMs?: number
  } = {},
): Promise<void> {
  const origin = resolveOverlayLiveOrigin(options.origin)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8_000
  const intervalMs = options.intervalMs ?? 250
  const deadline = Date.now() + timeoutMs
  let lastStatus = 'unreachable'
  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(origin, { headers: { accept: 'text/html' } })
      const html = await response.text()
      if (bootGraphHasPackage(html, packageName)) return
      lastStatus = `http ${String(response.status)} without ${packageName}`
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new LiveClientBootWaitError(packageName, origin, lastStatus)
}

/**
 * Read one Loader fiber from `pluginInventory/list`.
 * @param packageName - npm name the Loader imports.
 * @param options - origin and fetch. Tests stub `fetchImpl`.
 * @returns a match, absence, or an unreachable probe.
 */
export async function readLiveFiberProbe(
  packageName: string,
  options: {
    origin?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<LiveClientFiberProbe> {
  const origin = resolveOverlayLiveOrigin(options.origin)
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${origin}${PLUGIN_INVENTORY_LIST_ENDPOINT}`
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `overlay-live-${PLUGIN_INVENTORY_LIST_METHOD}-${crypto.randomUUID()}`,
        method: PLUGIN_INVENTORY_LIST_METHOD,
        payload: { args: {} },
      }),
    })
    const text = await response.text()
    if (!response.ok) {
      return { kind: 'unreachable', detail: `http ${String(response.status)}` }
    }
    return matchLiveFiber(packageName, text)
  } catch (error) {
    return { kind: 'unreachable', detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Wait for the boot graph, then classify a miss against Loader inventory.
 * An active fiber with a string `overlayBody` on the live copy is remounted
 * once without that field, then the field is restored without a second remount.
 * @param packageName - npm name used as the boot-graph id.
 * @param options - origin, fetch, live copy, and remount hook.
 * @returns after the row is present.
 * @throws when the row stays missing. Stderr names fiber vs compose, not the rail.
 */
export async function confirmLiveClientBoot(
  packageName: string,
  options: {
    origin?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
    intervalMs?: number
    recoverTimeoutMs?: number
    liveManifestPath?: string
    remountFiber?: () => Promise<void>
  } = {},
): Promise<void> {
  const origin = resolveOverlayLiveOrigin(options.origin)
  const waitOpts = {
    origin,
    fetchImpl: options.fetchImpl,
    intervalMs: options.intervalMs,
  }
  try {
    await waitUntilBootGraphHas(packageName, {
      ...waitOpts,
      timeoutMs: options.timeoutMs ?? 15_000,
    })
    return
  } catch (first) {
    if (!(first instanceof LiveClientBootWaitError)) throw first
    const probe = await readLiveFiberProbe(packageName, {
      origin,
      fetchImpl: options.fetchImpl,
    })
    const recovered = await recoverComposeMiss(packageName, first, probe, options, waitOpts)
    if (recovered) return
    throw new Error(liveClientBootMissMessage(packageName, origin, first.lastStatus, probe))
  }
}

function resolveOverlayLiveOrigin(origin: string | undefined): string {
  const fromEnv = origin ?? process.env.DSH_OVERLAY_ORIGIN
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim()
  return DEFAULT_OVERLAY_LIVE_ORIGIN
}

function matchLiveFiber(packageName: string, text: string): LiveClientFiberProbe {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { kind: 'unreachable', detail: error instanceof Error ? error.message : String(error) }
  }
  const snapshot = inventorySnapshotOf(parsed)
  if (snapshot === undefined) return { kind: 'unreachable', detail: 'pluginInventory/list payload is not a snapshot' }
  const matches: LiveClientFiber[] = []
  for (const entry of snapshot) {
    if (entry.moduleName !== packageName) continue
    matches.push({ enabled: entry.enabled, fiberPhase: entry.fiberPhase })
  }
  if (matches.length === 0) return { kind: 'absent' }
  const first = matches[0]
  if (first === undefined) return { kind: 'absent' }
  const active = matches.find(fiber => fiber.enabled && fiber.fiberPhase === 'active')
  return { kind: 'match', fiber: active ?? first }
}

function inventorySnapshotOf(body: unknown): ReadonlyArray<{
  moduleName: string
  enabled: boolean
  fiberPhase: string | null
}> | undefined {
  const value = rpcValueOf(body)
  if (!isJsonObject(value) || !Array.isArray(value.entries)) return undefined
  const entries: { moduleName: string; enabled: boolean; fiberPhase: string | null }[] = []
  for (const entry of value.entries) {
    if (!isJsonObject(entry) || typeof entry.moduleName !== 'string' || typeof entry.enabled !== 'boolean') {
      return undefined
    }
    const fiberPhase = entry.fiberPhase
    if (fiberPhase !== null && typeof fiberPhase !== 'string') return undefined
    entries.push({ moduleName: entry.moduleName, enabled: entry.enabled, fiberPhase })
  }
  return entries
}

function rpcValueOf(body: unknown): unknown {
  if (!isJsonObject(body)) return undefined
  if (!('result' in body)) return body
  const result = body.result
  if (!isJsonObject(result) || typeof result.ok !== 'boolean') return undefined
  if (!result.ok) return undefined
  return result.value
}

async function recoverComposeMiss(
  packageName: string,
  first: LiveClientBootWaitError,
  probe: LiveClientFiberProbe,
  options: {
    fetchImpl?: typeof fetch
    intervalMs?: number
    recoverTimeoutMs?: number
    liveManifestPath?: string
    remountFiber?: () => Promise<void>
  },
  waitOpts: { origin: string; fetchImpl?: typeof fetch; intervalMs?: number },
): Promise<boolean> {
  if (
    probe.kind !== 'match'
    || !probe.fiber.enabled
    || probe.fiber.fiberPhase !== 'active'
    || options.liveManifestPath === undefined
    || options.remountFiber === undefined
  ) {
    return false
  }
  const original = await readFile(options.liveManifestPath, 'utf8')
  const omitted = omitClientOverlayBody(readJsonObject(original, 'live package.json'))
  if (omitted === undefined) return false
  await writeFile(options.liveManifestPath, `${JSON.stringify(omitted, null, 2)}\n`)
  try {
    await options.remountFiber()
    await waitUntilBootGraphHas(packageName, {
      ...waitOpts,
      timeoutMs: options.recoverTimeoutMs ?? 8_000,
    })
    return true
  } catch (second) {
    const status = second instanceof LiveClientBootWaitError
      ? second.lastStatus
      : second instanceof Error ? second.message : first.lastStatus
    throw new Error(liveClientBootMissMessage(packageName, first.origin, status, probe))
  } finally {
    await writeFile(options.liveManifestPath, original)
  }
}

function liveClientBootMissMessage(
  packageName: string,
  origin: string,
  lastStatus: string,
  probe: LiveClientFiberProbe,
): string {
  const head = `overlay-live-plugin: ${packageName} is not in window.__DSH_BOOT__ at ${origin} (${lastStatus}).`
  const rail = 'The plugin rail lists profile yaml; that list is not the boot graph.'
  const never = 'Do not restart dsh web.'
  if (probe.kind === 'unreachable') {
    return `${head} ${rail} pluginInventory/list was unreachable (${probe.detail}). ${never} Do not rename the package.`
  }
  if (probe.kind === 'absent') {
    return `${head} ${rail} No Loader fiber for this package name. ${never} If this process already failed the first ESM import of this package name, insert under a new npm name and a new --id.`
  }
  const fiber = probe.fiber
  if (!fiber.enabled) {
    return `${head} ${rail} Loader row is disabled (fiberPhase ${String(fiber.fiberPhase)}). ${never} Do not rename the package.`
  }
  if (fiber.fiberPhase === 'active') {
    return `${head} ${rail} Loader fiber is active; client-modules did not add this package to the boot graph. ${never} Do not rename the package.`
  }
  if (fiber.fiberPhase === 'failed') {
    return `${head} ${rail} Loader fiberPhase is failed. ${never} Insert under a new npm name and a new --id.`
  }
  return `${head} ${rail} Loader fiberPhase is ${String(fiber.fiberPhase)}. ${never} Do not rename the package.`
}

/**
 * Run checkout `tsc` + `bundle` when `tsdown.config.ts` exists.
 * @param checkout - checkout package directory.
 * @param build - `tsc -p tsconfig.json` then `pnpm run bundle` in that directory.
 * @returns after `build` runs, or immediately when `tsdown.config.ts` is absent.
 */
export async function buildCheckoutLib(checkout: string, build: (cwd: string) => void): Promise<void> {
  try {
    await access(join(checkout, 'tsdown.config.ts'))
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  build(checkout)
}

/**
 * Emit types and the tsdown artifact in a checkout package.
 * @param cwd - checkout package directory.
 * @returns after `tsc -p tsconfig.json` and `pnpm run bundle` succeed.
 */
export function defaultOverlayCheckoutBuild(cwd: string): void {
  runPnpm(
    cwd,
    ['exec', 'tsc', '--pretty', 'false', '-p', 'tsconfig.json'],
    `overlay-live-plugin: tsc -p tsconfig.json failed in ${cwd}`,
  )
  runPnpm(cwd, ['run', 'bundle'], `overlay-live-plugin: pnpm run bundle failed in ${cwd}`)
}

/** Options for {@link runOverlayLivePlugin}. */
export interface OverlayLiveOptions {
  /** Harness home. */
  home: string
  /** Profile name. */
  profile: string
  /** Spawn `pnpm install` in the profile directory. Tests stub this. */
  install: (cwd: string) => void
  /**
   * Repository root. When set, `remove` deletes a lab overlay occupant
   * checkout (`packages/client/<id>`) and its landing rows.
   */
  repoRoot?: string
  /** After deleting a checkout package. Tests stub this. */
  workspaceInstall?: (cwd: string) => void
  /** After deleting a checkout package, regenerate derived catalogs. */
  refreshCatalogs?: (cwd: string) => void
  /**
   * Emit checkout `lib/` when `tsdown.config.ts` exists. The CLI supplies
   * {@link defaultOverlayCheckoutBuild}; tests stub or omit this.
   */
  build?: (cwd: string) => void
  /**
   * After inserting a `dsh.client` package, wait until this package name is
   * in the live boot graph. The CLI supplies {@link confirmLiveClientBoot};
   * tests omit this or stub it.
   */
  waitForClientRow?: (packageName: string, wait: LiveClientWaitContext) => Promise<void>
}

/**
 * insert / update / remove a live overlay plugin. Never restarts `dsh web`.
 * @param argv - CLI args after the script name.
 * @param options - home, profile, install hook.
 * @returns a one-line status for stdout.
 */
export async function runOverlayLivePlugin(argv: string[], options: OverlayLiveOptions): Promise<string> {
  const parsed = parseArgv(argv)
  const profileRoot = profileDir(options.home, parsed.profile ?? options.profile)
  const patchPath = join(profileRoot, 'cordis.patch.yml')
  const manifestPath = join(profileRoot, 'package.json')
  if (parsed.command === 'remove') {
    if (parsed.id === undefined) throw new Error('overlay-live-plugin: remove requires an id')
    const instance = parseOverlayCardInstanceId(parsed.id)
    if (instance !== undefined) {
      return removeOverlayCardInstance(instance, profileRoot, patchPath)
    }
    return removePlugin(parsed.id, profileRoot, patchPath, manifestPath, parsed.keepFiles, options)
  }
  const checkout = resolve(parsed.packageDir)
  const source = readCheckoutManifest(await readFile(join(checkout, 'package.json'), 'utf8'))
  if (!parsed.noBuild && options.build !== undefined) {
    await buildCheckoutLib(checkout, options.build)
  }
  const cardRequest = overlayCardInsertRequest(parsed)
  if (hasOverlayCardInsertFlags(parsed) && source.name !== OVERLAY_CARD_PACKAGE_NAME) {
    throw new Error(
      'overlay-live-plugin: --title / --card-id / --width / --height apply only when inserting packages/client/ui-float-window',
    )
  }
  const patch = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (parsed.command === 'insert' && source.name === OVERLAY_CARD_PACKAGE_NAME) {
    const existing = findInsertRowByName(patch.entries, source.name)
    if (existing !== undefined) {
      const added = await addOverlayCardInstance(join(profileRoot, 'plugins', existing.id), cardRequest)
      await ensureOverlayCardHostChannels(profileRoot, patchPath)
      await ensureOverlayPluginRosterChannel(profileRoot, patchPath)
      return `overlay-live-plugin: added card ${added.id} (${existing.id})`
    }
  }
  if (parsed.command === 'insert' && source.name === OVERLAY_DESKTOP_PACKAGE_NAME) {
    const existing = findInsertRowByName(patch.entries, source.name)
    if (existing !== undefined) {
      await ensureOverlayPluginRosterChannel(profileRoot, patchPath)
      return `overlay-live-plugin: desktop host already inserted (${existing.id})`
    }
  }
  if (
    parsed.command === 'insert'
    && overlayBodyFromClient(source.dsh?.client) === OVERLAY_DESKTOP_BODY_SLOT
    && findInsertRowByName(patch.entries, OVERLAY_DESKTOP_PACKAGE_NAME) === undefined
  ) {
    throw new Error('overlay-live-plugin: overlay desktop plugin is not loaded')
  }
  const id = parsed.id
    ?? findInsertRowByName(patch.entries, source.name)?.id
    ?? basename(checkout)
  const dest = join(profileRoot, 'plugins', id)
  if (parsed.command === 'update') {
    try {
      await access(join(dest, 'lib/index.js'))
    } catch (error) {
      if (isMissing(error)) {
        throw new Error(`overlay-live-plugin: ${dest} has no lib/index.js; insert first`)
      }
      throw error
    }
    await copyProfileLib(checkout, dest)
    await writeFile(join(dest, 'package.json'), `${JSON.stringify(stripProfileManifest(source), null, 2)}\n`)
    if (source.name === OVERLAY_CARD_PACKAGE_NAME) {
      await ensureOverlayCardHostChannels(profileRoot, patchPath, true)
    }
    await ensureOverlayPluginRosterChannel(profileRoot, patchPath)
    await bindOverlayCardOccupant(profileRoot, patchPath, source, id)
    return `overlay-live-plugin: updated ${id} lib under ${dest}`
  }
  await copyProfileLib(checkout, dest)
  await writeFile(join(dest, 'package.json'), `${JSON.stringify(stripProfileManifest(source), null, 2)}\n`)
  const profilePkg = readJsonObject(await readFile(manifestPath, 'utf8'), 'profile package.json')
  const dependencies = readStringMap(profilePkg.dependencies, 'profile dependencies')
  const spec = `file:./plugins/${id}`
  const needInstall = dependencies[source.name] !== spec
  dependencies[source.name] = spec
  profilePkg.dependencies = dependencies
  await writeFile(manifestPath, `${JSON.stringify(profilePkg, null, 4)}\n`)
  if (needInstall) options.install(profileRoot)
  const latest = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (source.name === OVERLAY_CARD_PACKAGE_NAME) {
    await writeFile(
      join(dest, OVERLAY_CARD_INSTANCES_FILE),
      formatOverlayCardInstances([resolveOverlayCardInsert([], cardRequest)]),
    )
  }
  appendInsertRow(latest.entries, id, source.name)
  await writeFile(patchPath, dumpProfilePatch(latest.comments, latest.entries))
  if (source.name === OVERLAY_CARD_PACKAGE_NAME) {
    await ensureOverlayCardHostChannels(profileRoot, patchPath)
  }
  await ensureOverlayPluginRosterChannel(profileRoot, patchPath)
  await bindOverlayCardOccupant(profileRoot, patchPath, source, id)
  await confirmLiveClientRow(source, parsed, options, {
    loaderId: id,
    liveManifestPath: join(dest, 'package.json'),
    patchPath,
  })
  return `overlay-live-plugin: inserted ${id} (${source.name}) into ${profileRoot}`
}

interface ParsedArgv {
  command: 'insert' | 'update' | 'remove'
  packageDir: string
  id?: string
  profile?: string
  keepFiles: boolean
  noBuild: boolean
  noWait: boolean
  cardTitle?: string
  cardId?: string
  cardWidth?: number
  cardHeight?: number
}

function parseArgv(argv: string[]): ParsedArgv {
  const command = argv[0]
  if (command !== 'insert' && command !== 'update' && command !== 'remove') {
    throw new Error(
      'overlay-live-plugin: usage: insert|update <pkgDir> | remove <id> [--profile web] [--id <id>] [--keep-files] [--no-build] [--no-wait] [--title <name>] [--card-id <id>] [--width <px>] [--height <px>]',
    )
  }
  let profile: string | undefined
  let id: string | undefined
  let keepFiles = false
  let noBuild = false
  let noWait = false
  let cardTitle: string | undefined
  let cardId: string | undefined
  let cardWidth: number | undefined
  let cardHeight: number | undefined
  const positionals: string[] = []
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) continue
    if (token === '--profile') {
      profile = requireFlagValue(argv, index, '--profile')
      index += 1
      continue
    }
    if (token === '--id') {
      id = requireFlagValue(argv, index, '--id')
      index += 1
      continue
    }
    if (token === '--keep-files') {
      keepFiles = true
      continue
    }
    if (token === '--no-build') {
      noBuild = true
      continue
    }
    if (token === '--no-wait') {
      noWait = true
      continue
    }
    if (token === '--title') {
      cardTitle = requireFlagValue(argv, index, '--title')
      index += 1
      continue
    }
    if (token === '--card-id') {
      cardId = requireFlagValue(argv, index, '--card-id')
      index += 1
      continue
    }
    if (token === '--width') {
      cardWidth = requireIntegerFlag(argv, index, '--width')
      index += 1
      continue
    }
    if (token === '--height') {
      cardHeight = requireIntegerFlag(argv, index, '--height')
      index += 1
      continue
    }
    if (token.startsWith('--')) {
      throw new Error(`overlay-live-plugin: unknown flag ${token}`)
    }
    positionals.push(token)
  }
  const parsed: ParsedArgv = {
    command, packageDir: '', id, profile, keepFiles, noBuild, noWait, cardTitle, cardId, cardWidth, cardHeight,
  }
  if (command !== 'insert' && hasOverlayCardInsertFlags(parsed)) {
    throw new Error('overlay-live-plugin: --title / --card-id / --width / --height apply only to insert of packages/client/ui-float-window')
  }
  if (command === 'remove') {
    const removeId = id ?? positionals[0]
    if (removeId === undefined) throw new Error('overlay-live-plugin: remove requires an id')
    return { ...parsed, packageDir: '', id: removeId }
  }
  const packageDir = positionals[0]
  if (packageDir === undefined) throw new Error(`overlay-live-plugin: ${command} requires a checkout package directory`)
  return { ...parsed, packageDir }
}

function hasOverlayCardInsertFlags(parsed: ParsedArgv): boolean {
  return parsed.cardTitle !== undefined
    || parsed.cardId !== undefined
    || parsed.cardWidth !== undefined
    || parsed.cardHeight !== undefined
}

function overlayCardInsertRequest(parsed: ParsedArgv): OverlayCardInsertRequest {
  return {
    id: parsed.cardId,
    title: parsed.cardTitle,
    width: parsed.cardWidth,
    height: parsed.cardHeight,
  }
}

/**
 * After yaml write, wait until a `dsh.client` package is in the live boot graph.
 * Tests omit {@link OverlayLiveOptions.waitForClientRow}; the CLI supplies
 * {@link confirmLiveClientBoot} with the live copy path and a remount hook.
 */
async function confirmLiveClientRow(
  source: CheckoutManifest,
  parsed: ParsedArgv,
  options: OverlayLiveOptions,
  wait: LiveClientWaitContext,
): Promise<void> {
  if (
    parsed.noWait
    || options.waitForClientRow === undefined
    || source.dsh?.client === undefined
    || typeof source.name !== 'string'
  ) {
    return
  }
  await options.waitForClientRow(source.name, wait)
}

async function removePlugin(
  id: string,
  profileRoot: string,
  patchPath: string,
  manifestPath: string,
  keepFiles: boolean,
  options: OverlayLiveOptions,
): Promise<string> {
  const patch = parseProfilePatch(await readFile(patchPath, 'utf8'))
  const names = patch.entries.flatMap(entry => entry.insert.filter(row => row.id === id).map(row => row.name))
  removeInsertRow(patch.entries, id)
  await writeFile(patchPath, dumpProfilePatch(patch.comments, patch.entries))
  if (keepFiles) return `overlay-live-plugin: unloaded ${id} (files kept)`
  const profilePkg = readJsonObject(await readFile(manifestPath, 'utf8'), 'profile package.json')
  const dependencies = readStringMap(profilePkg.dependencies, 'profile dependencies')
  const drop = new Set(names)
  const next: Record<string, string> = {}
  let removedDep = false
  for (const [key, spec] of Object.entries(dependencies)) {
    if (drop.has(key)) {
      removedDep = true
      continue
    }
    next[key] = spec
  }
  if (removedDep) {
    profilePkg.dependencies = next
    await writeFile(manifestPath, `${JSON.stringify(profilePkg, null, 4)}\n`)
  }
  await rm(join(profileRoot, 'plugins', id), { recursive: true, force: true })
  if (removedDep) options.install(profileRoot)
  const purged = purgeCheckoutOnRemove(options.repoRoot, id, names)
  if (purged.length > 0) {
    const root = options.repoRoot
    if (root !== undefined) {
      options.workspaceInstall?.(root)
      options.refreshCatalogs?.(root)
    }
    return `overlay-live-plugin: removed ${id} from ${profileRoot} and deleted packages/client/${purged.join(', ')}`
  }
  return `overlay-live-plugin: removed ${id} from ${profileRoot}`
}

const CLIENT_PACKAGE_PREFIX = '@deepseek-ai/dsh-client-'

function purgeCheckoutOnRemove(repoRoot: string | undefined, id: string, npmNames: readonly string[]): string[] {
  if (repoRoot === undefined) return []
  const dirs = new Set<string>([id])
  for (const name of npmNames) {
    if (name.startsWith(CLIENT_PACKAGE_PREFIX)) {
      dirs.add(name.slice(CLIENT_PACKAGE_PREFIX.length))
    }
  }
  const purged: string[] = []
  for (const dir of dirs) {
    if (purgeCheckoutOccupant(repoRoot, dir)) purged.push(dir)
  }
  return purged
}

/**
 * Write both live overlay-card host modules and add Loader rows when missing.
 * @param profileRoot - `$DSH_HOME/profiles/<name>`.
 * @param patchPath - `cordis.patch.yml` in that directory.
 * @param remountPlug - when true, retarget an existing plug-rpc row to
 *   {@link OVERLAY_CARD_HIDE_RPC_MODULE} so a cached first specifier remounts.
 */
async function ensureOverlayCardHostChannels(
  profileRoot: string,
  patchPath: string,
  remountPlug = false,
): Promise<void> {
  await ensureOverlayCardRosterChannel(profileRoot, patchPath)
  await ensureOverlayCardPlugChannel(profileRoot, patchPath, remountPlug)
}

/**
 * Refresh `./overlay-plugin-roster-rpc.mjs` and `./overlay-plugin-rail-rpc.mjs`.
 * Node caches the first `apply` of `@deepseek-ai/dsh-client-ui-cursor-agent`,
 * so that fiber keeps `/overlay-plugins`. The rail specifier is a new URL and
 * registers `/overlay-plugins-rail`. A later rewrite whose sidecar source
 * changed retargets the rail row so Node imports the updated `apply`.
 * @param profileRoot - `$DSH_HOME/profiles/<name>`.
 * @param patchPath - `cordis.patch.yml` in that directory.
 */
async function ensureOverlayPluginRosterChannel(
  profileRoot: string,
  patchPath: string,
): Promise<void> {
  const rosterSource = overlayPluginRosterRpcSource(OVERLAY_PLUGIN_RPC_CHANNEL)
  const railSource = overlayPluginRosterRpcSource(OVERLAY_PLUGIN_RAIL_RPC_CHANNEL)
  await writeFile(join(profileRoot, OVERLAY_PLUGIN_ROSTER_RPC_FILE), rosterSource)
  const latest = parseProfilePatch(await readFile(patchPath, 'utf8'))
  let changed = false
  if (!hasOverlayPluginRosterRpc(latest.entries)) {
    appendInsertRow(latest.entries, OVERLAY_PLUGIN_ROSTER_RPC_ID, OVERLAY_PLUGIN_ROSTER_RPC_MODULE)
    changed = true
  }
  const railRow = findOverlayPluginRailRpc(latest.entries)
  const previousRail = railRow === undefined
    ? undefined
    : await readOptionalText(join(profileRoot, overlayPluginRailRpcFile(railRow.name)))
  await writeFile(join(profileRoot, OVERLAY_PLUGIN_RAIL_RPC_FILE), railSource)
  await writeFile(join(profileRoot, OVERLAY_PLUGIN_RAIL_REMOUNT_FILE), railSource)
  if (railRow === undefined) {
    appendInsertRow(latest.entries, OVERLAY_PLUGIN_RAIL_RPC_ID, OVERLAY_PLUGIN_RAIL_RPC_MODULE)
    changed = true
  } else if (previousRail !== railSource && retargetOverlayPluginRailRpc(latest.entries)) {
    changed = true
  }
  if (!changed) return
  await writeFile(patchPath, dumpProfilePatch(latest.comments, latest.entries))
}

/**
 * Loader row that registers {@link OVERLAY_PLUGIN_RAIL_RPC_CHANNEL}.
 * @param entries - parsed groups.
 */
function findOverlayPluginRailRpc(entries: readonly ProfilePatchEntry[]): LoaderInsertRow | undefined {
  for (const entry of entries) {
    for (const row of entry.insert) {
      if (
        row.id === OVERLAY_PLUGIN_RAIL_RPC_ID
        || row.name === OVERLAY_PLUGIN_RAIL_RPC_MODULE
        || row.name === OVERLAY_PLUGIN_RAIL_REMOUNT_MODULE
      ) {
        return row
      }
    }
  }
  return undefined
}

/**
 * Profile-relative file for a rail-rpc Loader `name`.
 * @param name - `./overlay-plugin-rail-rpc.mjs` or the remount specifier.
 */
function overlayPluginRailRpcFile(name: string): string {
  return name === OVERLAY_PLUGIN_RAIL_REMOUNT_MODULE
    ? OVERLAY_PLUGIN_RAIL_REMOUNT_FILE
    : OVERLAY_PLUGIN_RAIL_RPC_FILE
}

/**
 * Read a UTF-8 file, or `undefined` when it is missing.
 * @param path - absolute path.
 */
async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

/**
 * Point the rail-rpc Loader row at the specifier it is not already using.
 * @param entries - parsed groups (mutated).
 * @returns true when a row name changed.
 */
export function retargetOverlayPluginRailRpc(entries: ProfilePatchEntry[]): boolean {
  let changed = false
  for (const entry of entries) {
    for (const row of entry.insert) {
      if (row.id !== OVERLAY_PLUGIN_RAIL_RPC_ID) continue
      const next = row.name === OVERLAY_PLUGIN_RAIL_RPC_MODULE
        ? OVERLAY_PLUGIN_RAIL_REMOUNT_MODULE
        : OVERLAY_PLUGIN_RAIL_RPC_MODULE
      if (row.name === next) continue
      row.name = next
      changed = true
    }
  }
  return changed
}

/**
 * Refresh `./overlay-card-roster-rpc.mjs` and add its Loader row when the
 * profile has no overlay-card RPC row. Node caches the first `apply` of
 * {@link OVERLAY_CARD_PACKAGE_NAME}; this specifier is independent of that
 * cache so one insert command can mount `/overlay-card`. Repeat inserts
 * rewrite the module so list, setHidden, and setInserted all target the live
 * roster file.
 * @param profileRoot - `$DSH_HOME/profiles/<name>`.
 * @param patchPath - `cordis.patch.yml` in that directory.
 */
async function ensureOverlayCardRosterChannel(profileRoot: string, patchPath: string): Promise<void> {
  await writeFile(
    join(profileRoot, OVERLAY_CARD_ROSTER_RPC_FILE),
    overlayCardRosterRpcSource(OVERLAY_CARD_RPC_CHANNEL),
  )
  const latest = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (hasOverlayCardRosterRpc(latest.entries)) return
  appendInsertRow(latest.entries, OVERLAY_CARD_ROSTER_RPC_ID, OVERLAY_CARD_ROSTER_RPC_MODULE)
  await writeFile(patchPath, dumpProfilePatch(latest.comments, latest.entries))
}

/**
 * Refresh plug-channel modules and add the Loader row when missing.
 * That specifier is a new URL, so it can register {@link OVERLAY_CARD_PLUG_RPC_CHANNEL}
 * even when `/overlay-card` is already owned by a list-only `apply`. Card
 * `update` retargets a row still on {@link OVERLAY_CARD_PLUG_RPC_MODULE} to
 * {@link OVERLAY_CARD_HIDE_RPC_MODULE} so Node imports hide/insert `apply`.
 * @param profileRoot - `$DSH_HOME/profiles/<name>`.
 * @param patchPath - `cordis.patch.yml` in that directory.
 * @param remountPlug - retarget an existing first specifier.
 */
async function ensureOverlayCardPlugChannel(
  profileRoot: string,
  patchPath: string,
  remountPlug: boolean,
): Promise<void> {
  const source = overlayCardRosterRpcSource(OVERLAY_CARD_PLUG_RPC_CHANNEL)
  await writeFile(join(profileRoot, OVERLAY_CARD_PLUG_RPC_FILE), source)
  await writeFile(join(profileRoot, OVERLAY_CARD_HIDE_RPC_FILE), source)
  const latest = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (!hasOverlayCardPlugRpc(latest.entries)) {
    appendInsertRow(latest.entries, OVERLAY_CARD_PLUG_RPC_ID, OVERLAY_CARD_PLUG_RPC_MODULE)
    await writeFile(patchPath, dumpProfilePatch(latest.comments, latest.entries))
    return
  }
  if (!remountPlug) return
  if (!retargetOverlayCardPlugRpc(latest.entries, OVERLAY_CARD_HIDE_RPC_MODULE)) return
  await writeFile(patchPath, dumpProfilePatch(latest.comments, latest.entries))
}

/**
 * Point the plug-rpc Loader row at a never-imported specifier.
 * @param entries - parsed groups (mutated).
 * @param nextName - profile-relative module to load.
 * @returns true when a row name changed.
 */
export function retargetOverlayCardPlugRpc(
  entries: ProfilePatchEntry[],
  nextName: string,
): boolean {
  let changed = false
  for (const entry of entries) {
    for (const row of entry.insert) {
      if (row.id !== OVERLAY_CARD_PLUG_RPC_ID) continue
      if (row.name === nextName) continue
      row.name = nextName
      changed = true
    }
  }
  return changed
}

/**
 * Profile-relative host module that reads and writes
 * `plugins/<id>/instances.json` for the card package. Duplicate `rpc.handle`
 * is ignored so a later boot where package `apply` also registers does not
 * fail the fiber.
 * @param channel - Connection RPC channel this module registers.
 */
export function overlayCardRosterRpcSource(channel: string = OVERLAY_CARD_RPC_CHANNEL): string {
  const packageName = JSON.stringify(OVERLAY_CARD_PACKAGE_NAME)
  const channelJson = JSON.stringify(channel)
  const list = JSON.stringify(OVERLAY_CARD_LIST_ENDPOINT)
  const setHidden = JSON.stringify(OVERLAY_CARD_SET_HIDDEN_ENDPOINT)
  const setInserted = JSON.stringify(OVERLAY_CARD_SET_INSERTED_ENDPOINT)
  const instances = JSON.stringify(OVERLAY_CARD_INSTANCES_FILE)
  const fallback = JSON.stringify([defaultOverlayCardSpec()])
  return [
    "import { readdirSync, readFileSync, writeFileSync } from 'node:fs'",
    "import { dirname, join } from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    '',
    "export const inject = ['connection']",
    '',
    `const PACKAGE_NAME = ${packageName}`,
    `const CHANNEL = ${channelJson}`,
    `const LIST = ${list}`,
    `const SET_HIDDEN = ${setHidden}`,
    `const SET_INSERTED = ${setInserted}`,
    `const INSTANCES = ${instances}`,
    `const FALLBACK = ${fallback}`,
    "const PROTECTED = new Set(['ui-float-window', 'ui-overlay-desktop', 'ui-cursor-agent', 'cursor-agent', 'overlay-card-roster-rpc', 'overlay-card-plug-rpc', 'overlay-card-hide-rpc', 'overlay-card-rpc', 'overlay-plugin-roster-rpc', 'overlay-plugin-rail-rpc'])",
    '',
    'function isMissing(error) {',
    "  return error instanceof Error && 'code' in error && error.code === 'ENOENT'",
    '}',
    '',
    'function yamlScalar(raw) {',
    '  const text = raw.trim()',
    '  if (text.length >= 2) {',
    '    const start = text[0]',
    '    const end = text[text.length - 1]',
    "    if ((start === \"'\" && end === \"'\") || (start === '\"' && end === '\"')) return text.slice(1, -1)",
    '  }',
    '  return text',
    '}',
    '',
    'function persistCard(card) {',
    '  const next = { seat: card.seat, id: card.id, title: card.title, width: card.width, height: card.height }',
    '  if (card.hidden === true) next.hidden = true',
    '  if (Array.isArray(card.occupants) && card.occupants.length > 0) next.occupants = card.occupants',
    '  return next',
    '}',
    '',
    'function loaderRowBlocks(lines) {',
    '  const blocks = []',
    '  for (let index = 0; index < lines.length; index += 1) {',
    '    const line = lines[index]',
    '    const idMatch = /^(\\s*)- id:\\s*(.+?)\\s*$/.exec(line)',
    '    if (idMatch === null) continue',
    '    const dashIndent = idMatch[1]',
    '    const id = yamlScalar(idMatch[2])',
    '    if (id.length === 0) continue',
    "    let name = ''",
    '    let keyIndent = dashIndent + \'  \'',
    '    let disabledLine',
    '    let endLine = index',
    '    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {',
    '      const body = lines[cursor]',
    '      if (body.trim().length === 0) continue',
    '      const indent = /^(\\s*)/.exec(body)[1]',
    '      if (indent.length <= dashIndent.length) break',
    '      if (/^\\s*- /.test(body)) break',
    '      endLine = cursor',
    '      const nameMatch = /^\\s+name:\\s*(.+?)\\s*$/.exec(body)',
    '      if (nameMatch) { name = yamlScalar(nameMatch[1]); keyIndent = indent }',
    '      if (/^\\s+disabled:\\s*true\\s*$/.test(body)) disabledLine = cursor',
    '    }',
    '    blocks.push({ id, name, keyIndent, endLine, disabledLine })',
    '  }',
    '  return blocks',
    '}',
    '',
    'function scanRows(text) {',
    '  return loaderRowBlocks(text.split(/\\n/)).map(block => ({',
    '    id: block.id, name: block.name, disabled: block.disabledLine !== undefined,',
    '  }))',
    '}',
    '',
    'function occupantsInserted(occupants, rows) {',
    '  if (occupants.length === 0) return true',
    '  const byId = new Map(rows.map(row => [row.id, row]))',
    '  for (const id of occupants) {',
    '    const row = byId.get(id)',
    '    if (row === undefined || row.disabled) return false',
    '  }',
    '  return true',
    '}',
    '',
    'function setRowsInserted(text, ids, inserted) {',
    '  let next = text',
    '  for (const id of ids) next = setOneInserted(next, id, inserted)',
    "  return next.endsWith('\\n') ? next : next + '\\n'",
    '}',
    '',
    'function setOneInserted(text, id, inserted) {',
    '  const lines = text.split(/\\n/)',
    '  const block = loaderRowBlocks(lines).find(item => item.id === id)',
    '  if (block === undefined) {',
    "    throw new Error('overlay-card: occupant ' + JSON.stringify(id) + ' is not in the live patch')",
    '  }',
    '  if (inserted) {',
    '    if (block.disabledLine === undefined) return text',
    '    return lines.filter((_, index) => index !== block.disabledLine).join(\'\\n\')',
    '  }',
    '  if (block.disabledLine !== undefined) return text',
    '  const insertAt = block.endLine + 1',
    "  const disabled = block.keyIndent + 'disabled: true'",
    "  return [...lines.slice(0, insertAt), disabled, ...lines.slice(insertAt)].join('\\n')",
    '}',
    '',
    'function rosterRoot() {',
    "  const plugins = join(dirname(fileURLToPath(import.meta.url)), 'plugins')",
    '  let names',
    '  try {',
    '    names = readdirSync(plugins)',
    '  } catch (error) {',
    '    if (isMissing(error)) return undefined',
    '    throw error',
    '  }',
    '  for (const name of names) {',
    '    const root = join(plugins, name)',
    '    try {',
    "      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))",
    '      if (pkg.name !== PACKAGE_NAME) continue',
    '      return root',
    '    } catch (error) {',
    '      if (isMissing(error)) continue',
    '      throw error',
    '    }',
    '  }',
    '  return undefined',
    '}',
    '',
    'function patchPath() {',
    "  return join(dirname(fileURLToPath(import.meta.url)), 'cordis.patch.yml')",
    '}',
    '',
    'function readCards(root) {',
    '  try {',
    "    const parsed = JSON.parse(readFileSync(join(root, INSTANCES), 'utf8'))",
    '    return Array.isArray(parsed.cards) ? parsed.cards.map(persistCard) : FALLBACK',
    '  } catch (error) {',
    '    if (isMissing(error)) return FALLBACK',
    '    throw error',
    '  }',
    '}',
    '',
    'function readRows() {',
    '  try {',
    '    return scanRows(readFileSync(patchPath(), \'utf8\'))',
    '  } catch (error) {',
    '    if (isMissing(error)) return []',
    '    throw error',
    '  }',
    '}',
    '',
    'function listed(root) {',
    '  const rows = readRows()',
    '  const cards = root ? readCards(root) : FALLBACK',
    '  return cards.map(card => {',
    '    const persisted = persistCard(card)',
    '    return { ...persisted, inserted: occupantsInserted(persisted.occupants ?? [], rows) }',
    '  })',
    '}',
    '',
    'function writeCards(root, cards) {',
    "  writeFileSync(join(root, INSTANCES), JSON.stringify({ cards: cards.map(persistCard) }, null, 2) + '\\n')",
    '}',
    '',
    'function setHidden(cards, id, hidden) {',
    '  if (!cards.some(card => card.id === id)) {',
    "    throw new Error('overlay-card: card ' + JSON.stringify(id) + ' is not loaded')",
    '  }',
    '  return cards.map(card => {',
    '    if (card.id !== id) return persistCard(card)',
    '    const next = persistCard(card)',
    '    if (hidden) return { ...next, hidden: true }',
    '    return persistCard({ ...next, hidden: false })',
    '  })',
    '}',
    '',
    'function badRequest(message) {',
    '  return {',
    '    ok: false,',
    "    error: { code: 'bad-request', message, details: { issues: [] } },",
    '  }',
    '}',
    '',
    'export function apply(ctx) {',
    '  try {',
    '    ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {',
    '      const root = rosterRoot()',
    '      if (endpoint === LIST) {',
    '        return { ok: true, value: { cards: listed(root) } }',
    '      }',
    '      if (endpoint === SET_HIDDEN) {',
    "        if (root === undefined) return badRequest('overlay-card: card desk is not loaded')",
    '        if (payload === null || typeof payload !== \'object\' || Array.isArray(payload)) {',
    "          return badRequest('overlay-card: instances.setHidden needs { id, hidden }')",
    '        }',
    "        if (typeof payload.id !== 'string' || typeof payload.hidden !== 'boolean') {",
    "          return badRequest('overlay-card: instances.setHidden needs { id, hidden }')",
    '        }',
    '        try {',
    '          const next = setHidden(readCards(root), payload.id, payload.hidden)',
    '          writeCards(root, next)',
    '          return { ok: true, value: { cards: listed(root) } }',
    '        } catch (error) {',
    "          return badRequest(error instanceof Error ? error.message : 'overlay-card: setHidden failed')",
    '        }',
    '      }',
    '      if (endpoint === SET_INSERTED) {',
    "        if (root === undefined) return badRequest('overlay-card: card desk is not loaded')",
    '        if (payload === null || typeof payload !== \'object\' || Array.isArray(payload)) {',
    "          return badRequest('overlay-card: occupants.setInserted needs { id, inserted }')",
    '        }',
    "        if (typeof payload.id !== 'string' || typeof payload.inserted !== 'boolean') {",
    "          return badRequest('overlay-card: occupants.setInserted needs { id, inserted }')",
    '        }',
    '        try {',
    '          const cards = readCards(root)',
    '          const spec = cards.find(card => card.id === payload.id)',
    '          if (spec === undefined) {',
    "            throw new Error('overlay-card: card ' + JSON.stringify(payload.id) + ' is not loaded')",
    '          }',
    '          const occupants = spec.occupants ?? []',
    '          if (occupants.length === 0) return { ok: true, value: { cards: listed(root) } }',
    '          for (const occupant of occupants) {',
    '            if (PROTECTED.has(occupant)) {',
    "              throw new Error('overlay-card: occupant ' + JSON.stringify(occupant) + ' is not a page fiber')",
    '            }',
    '          }',
    '          writeFileSync(patchPath(), setRowsInserted(readFileSync(patchPath(), \'utf8\'), occupants, payload.inserted))',
    '          return { ok: true, value: { cards: listed(root) } }',
    '        } catch (error) {',
    "          return badRequest(error instanceof Error ? error.message : 'overlay-card: setInserted failed')",
    '        }',
    '      }',
    "      return badRequest('unknown overlay-card endpoint ' + endpoint)",
    "    }, { authority: 'trusted-host' })",
    '  } catch (error) {',
    "    if (error instanceof Error && error.message.includes('duplicate')) return",
    '    throw error',
    '  }',
    '}',
    '',
  ].join('\n')
}

/**
 * Profile-relative host module that lists overlay fibers and desktop
 * occupants and writes Loader `disabled`. Duplicate `rpc.handle` is ignored
 * so a later boot where package `apply` also registers does not fail the fiber.
 */
export function overlayPluginRosterRpcSource(
  channel: string = OVERLAY_PLUGIN_RPC_CHANNEL,
): string {
  const channelJson = JSON.stringify(channel)
  const list = JSON.stringify(OVERLAY_PLUGIN_LIST_ENDPOINT)
  const setInserted = JSON.stringify(OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT)
  const switchDesktop = JSON.stringify(OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT)
  const rosterId = JSON.stringify(OVERLAY_PLUGIN_ROSTER_RPC_ID)
  const railId = JSON.stringify(OVERLAY_PLUGIN_RAIL_RPC_ID)
  const desktopBody = JSON.stringify(OVERLAY_DESKTOP_BODY_SLOT)
  const hostName = JSON.stringify(OVERLAY_DESKTOP_PACKAGE_NAME)
  return [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    "import { dirname, join } from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    '',
    "export const inject = ['connection']",
    '',
    `const CHANNEL = ${channelJson}`,
    `const LIST = ${list}`,
    `const SET_INSERTED = ${setInserted}`,
    `const SWITCH_DESKTOP = ${switchDesktop}`,
    `const DESKTOP_BODY = ${desktopBody}`,
    `const HOST_NAME = ${hostName}`,
    `const PROTECTED = new Set(['ui-float-window', 'ui-overlay-desktop', 'ui-cursor-agent', 'cursor-agent', 'overlay-card-roster-rpc', 'overlay-card-plug-rpc', 'overlay-card-hide-rpc', 'overlay-card-rpc', ${rosterId}, ${railId}])`,
    '',
    'function isMissing(error) {',
    "  return error instanceof Error && 'code' in error && error.code === 'ENOENT'",
    '}',
    '',
    'function yamlScalar(raw) {',
    '  const text = raw.trim()',
    '  if (text.length >= 2) {',
    '    const start = text[0]',
    '    const end = text[text.length - 1]',
    "    if ((start === \"'\" && end === \"'\") || (start === '\"' && end === '\"')) return text.slice(1, -1)",
    '  }',
    '  return text',
    '}',
    '',
    'function loaderRowBlocks(lines) {',
    '  const blocks = []',
    '  for (let index = 0; index < lines.length; index += 1) {',
    '    const line = lines[index]',
    '    const idMatch = /^(\\s*)- id:\\s*(.+?)\\s*$/.exec(line)',
    '    if (idMatch === null) continue',
    '    const dashIndent = idMatch[1]',
    '    const id = yamlScalar(idMatch[2])',
    '    if (id.length === 0) continue',
    "    let keyIndent = dashIndent + '  '",
    '    let disabledLine',
    '    let endLine = index',
    '    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {',
    '      const body = lines[cursor]',
    '      if (body.trim().length === 0) continue',
    '      const indent = /^(\\s*)/.exec(body)[1]',
    '      if (indent.length <= dashIndent.length) break',
    '      if (/^\\s*- /.test(body)) break',
    '      endLine = cursor',
    '      const nameMatch = /^\\s+name:\\s*(.+?)\\s*$/.exec(body)',
    '      if (nameMatch) keyIndent = indent',
    '      if (/^\\s+disabled:\\s*true\\s*$/.test(body)) disabledLine = cursor',
    '    }',
    '    blocks.push({ id, keyIndent, endLine, disabledLine })',
    '  }',
    '  return blocks',
    '}',
    '',
    'function readPkg(pluginsDir, id) {',
    '  try {',
    "    const raw = JSON.parse(readFileSync(join(pluginsDir, id, 'package.json'), 'utf8'))",
    '    if (raw === null || typeof raw !== \'object\' || Array.isArray(raw)) return undefined',
    '    return raw',
    '  } catch (error) {',
    '    if (isMissing(error)) return undefined',
    '    throw error',
    '  }',
    '}',
    '',
    'function dshClient(pkg) {',
    '  const dsh = pkg.dsh',
    '  if (dsh === null || typeof dsh !== \'object\' || Array.isArray(dsh)) return undefined',
    '  const client = dsh.client',
    '  if (client === null || typeof client !== \'object\' || Array.isArray(client)) return undefined',
    '  return client',
    '}',
    '',
    'function railKind(id, pluginsDir) {',
    '  if (PROTECTED.has(id)) return undefined',
    '  const pkg = readPkg(pluginsDir, id)',
    '  if (pkg === undefined) return undefined',
    '  if (pkg.name === HOST_NAME) return undefined',
    '  const client = dshClient(pkg)',
    '  if (client === undefined) return undefined',
    '  if (typeof client.overlayBody === \'string\') {',
    '    return client.overlayBody === DESKTOP_BODY ? \'desktop\' : undefined',
    '  }',
    "  return 'fiber'",
    '}',
    '',
    'function titleOf(id, pluginsDir) {',
    '  const pkg = readPkg(pluginsDir, id)',
    '  const client = pkg === undefined ? undefined : dshClient(pkg)',
    '  if (typeof client?.panelTitle === \'string\' && client.panelTitle.trim().length > 0) {',
    '    return client.panelTitle.trim()',
    '  }',
    '  return id',
    '}',
    '',
    'function listed(patchText, pluginsDir) {',
    '  const plugins = []',
    '  let desktop = null',
    '  for (const block of loaderRowBlocks(patchText.split(/\\n/))) {',
    '    const kind = railKind(block.id, pluginsDir)',
    '    if (kind === undefined) continue',
    '    const inserted = block.disabledLine === undefined',
    '    const item = {',
    '      id: block.id,',
    '      title: titleOf(block.id, pluginsDir),',
    '      hidden: false,',
    '      inserted,',
    '      occupants: [block.id],',
    '      kind,',
    '    }',
    "    if (kind === 'desktop' && inserted && desktop === null) {",
    '      desktop = item',
    '      continue',
    '    }',
    '    plugins.push(item)',
    '  }',
    '  return { desktop, plugins }',
    '}',
    '',
    'function listedFromDisk(patchPath, pluginsDir) {',
    '  try {',
    '    return listed(readFileSync(patchPath, \'utf8\'), pluginsDir)',
    '  } catch (error) {',
    '    if (isMissing(error)) return { desktop: null, plugins: [] }',
    '    throw error',
    '  }',
    '}',
    '',
    'function setOneInserted(text, id, inserted) {',
    '  const lines = text.split(/\\n/)',
    '  const block = loaderRowBlocks(lines).find(item => item.id === id)',
    '  if (block === undefined) {',
    "    throw new Error('overlay-plugins: ' + JSON.stringify(id) + ' is not in the live patch')",
    '  }',
    '  if (inserted) {',
    '    if (block.disabledLine === undefined) return text.endsWith(\'\\n\') ? text : text + \'\\n\'',
    '    const next = lines.filter((_, index) => index !== block.disabledLine).join(\'\\n\')',
    "    return next.endsWith('\\n') ? next : next + '\\n'",
    '  }',
    "  if (block.disabledLine !== undefined) return text.endsWith('\\n') ? text : text + '\\n'",
    '  const insertAt = block.endLine + 1',
    "  const disabled = block.keyIndent + 'disabled: true'",
    '  const next = [...lines.slice(0, insertAt), disabled, ...lines.slice(insertAt)].join(\'\\n\')',
    "  return next.endsWith('\\n') ? next : next + '\\n'",
    '}',
    '',
    'function exclusiveDesktop(text, pluginsDir, id) {',
    "  if (railKind(id, pluginsDir) !== 'desktop') {",
    "    throw new Error('overlay-plugins: ' + JSON.stringify(id) + ' is not a desktop occupant')",
    '  }',
    '  let next = text',
    '  for (const block of loaderRowBlocks(next.split(/\\n/))) {',
    "    if (railKind(block.id, pluginsDir) !== 'desktop') continue",
    '    next = setOneInserted(next, block.id, block.id === id)',
    '  }',
    '  return next',
    '}',
    '',
    'function setInserted(text, pluginsDir, id, inserted) {',
    '  const kind = railKind(id, pluginsDir)',
    '  if (kind === undefined) {',
    "    throw new Error('overlay-plugins: ' + JSON.stringify(id) + ' is not a rail overlay plugin')",
    '  }',
    "  if (kind === 'desktop' && inserted) return exclusiveDesktop(text, pluginsDir, id)",
    '  return setOneInserted(text, id, inserted)',
    '}',
    '',
    'function badRequest(message) {',
    '  return {',
    '    ok: false,',
    "    error: { code: 'bad-request', message, details: { issues: [] } },",
    '  }',
    '}',
    '',
    'export function apply(ctx) {',
    '  try {',
    '    ctx.connection.rpc.handle(CHANNEL, (endpoint, payload) => {',
    '      const root = dirname(fileURLToPath(import.meta.url))',
    "      const patchPath = join(root, 'cordis.patch.yml')",
    "      const pluginsDir = join(root, 'plugins')",
    '      if (endpoint === LIST) {',
    '        return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }',
    '      }',
    '      if (endpoint === SET_INSERTED) {',
    '        if (payload === null || typeof payload !== \'object\' || Array.isArray(payload)) {',
    "          return badRequest('overlay-plugins: plugins.setInserted needs { id, inserted }')",
    '        }',
    '        if (typeof payload.id !== \'string\' || typeof payload.inserted !== \'boolean\') {',
    "          return badRequest('overlay-plugins: plugins.setInserted needs { id, inserted }')",
    '        }',
    '        try {',
    '          writeFileSync(',
    '            patchPath,',
    '            setInserted(readFileSync(patchPath, \'utf8\'), pluginsDir, payload.id, payload.inserted),',
    '          )',
    '        } catch (error) {',
    "          return badRequest(error instanceof Error ? error.message : 'overlay-plugins: setInserted failed')",
    '        }',
    '        return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }',
    '      }',
    '      if (endpoint === SWITCH_DESKTOP) {',
    '        if (payload === null || typeof payload !== \'object\' || Array.isArray(payload)) {',
    "          return badRequest('overlay-plugins: plugins.switchDesktop needs { id }')",
    '        }',
    '        if (typeof payload.id !== \'string\' || payload.id.length === 0) {',
    "          return badRequest('overlay-plugins: plugins.switchDesktop needs { id }')",
    '        }',
    '        try {',
    '          writeFileSync(',
    '            patchPath,',
    '            exclusiveDesktop(readFileSync(patchPath, \'utf8\'), pluginsDir, payload.id),',
    '          )',
    '        } catch (error) {',
    "          return badRequest(error instanceof Error ? error.message : 'overlay-plugins: switchDesktop failed')",
    '        }',
    '        return { ok: true, value: listedFromDisk(patchPath, pluginsDir) }',
    '      }',
    "      return badRequest('unknown overlay-plugins endpoint ' + endpoint)",
    "    }, { authority: 'trusted-host' })",
    '  } catch (error) {',
    "    if (error instanceof Error && error.message.includes('duplicate')) return",
    '    throw error',
    '  }',
    '}',
    '',
  ].join('\n')
}

async function bindOverlayCardOccupant(
  profileRoot: string,
  patchPath: string,
  source: CheckoutManifest & { name: string },
  loaderId: string,
): Promise<void> {
  if (source.name === OVERLAY_CARD_PACKAGE_NAME || source.name === OVERLAY_DESKTOP_PACKAGE_NAME) return
  const body = overlayBodyFromClient(source.dsh?.client)
  if (body === undefined) return
  if (body === OVERLAY_DESKTOP_BODY_SLOT) {
    await bindOverlayDesktopOccupant(profileRoot, patchPath, loaderId)
    return
  }
  const seat = overlayCardSeatFromBodySlot(body)
  if (seat === undefined) {
    throw new Error(
      `overlay-live-plugin: dsh.client.overlayBody ${JSON.stringify(body)} must be overlay-card.body, overlay-card-N.body, or overlay-desktop.body`,
    )
  }
  const patch = parseProfilePatch(await readFile(patchPath, 'utf8'))
  const desk = findInsertRowByName(patch.entries, OVERLAY_CARD_PACKAGE_NAME)
  if (desk === undefined) {
    throw new Error('overlay-live-plugin: overlay card plugin is not loaded')
  }
  const dest = join(profileRoot, 'plugins', desk.id)
  const next = appendOverlayCardOccupant(await readOverlayCardInstances(dest), seat, loaderId)
  await writeFile(join(dest, OVERLAY_CARD_INSTANCES_FILE), formatOverlayCardInstances(next))
}

async function bindOverlayDesktopOccupant(
  profileRoot: string,
  patchPath: string,
  loaderId: string,
): Promise<void> {
  const patch = parseProfilePatch(await readFile(patchPath, 'utf8'))
  if (findInsertRowByName(patch.entries, OVERLAY_DESKTOP_PACKAGE_NAME) === undefined) {
    throw new Error('overlay-live-plugin: overlay desktop plugin is not loaded')
  }
  const pluginsDir = join(profileRoot, 'plugins')
  const next = setDesktopOccupantExclusive(await readFile(patchPath, 'utf8'), pluginsDir, loaderId)
  await writeFile(patchPath, next)
}

function overlayBodyFromClient(client: unknown): string | undefined {
  if (!isJsonObject(client)) return undefined
  const body = client.overlayBody
  if (body === undefined) return undefined
  if (typeof body !== 'string') {
    throw new Error('overlay-live-plugin: dsh.client.overlayBody must be a string')
  }
  return body
}

async function addOverlayCardInstance(
  dest: string,
  request: OverlayCardInsertRequest,
): Promise<{ id: string }> {
  const next = appendOverlayCard(await readOverlayCardInstances(dest), request)
  await writeFile(join(dest, OVERLAY_CARD_INSTANCES_FILE), formatOverlayCardInstances(next))
  const added = next[next.length - 1]
  if (added === undefined) throw new Error('overlay-live-plugin: added card spec is missing')
  return added
}

async function removeOverlayCardInstance(
  id: string,
  profileRoot: string,
  patchPath: string,
): Promise<string> {
  const patch = parseProfilePatch(await readFile(patchPath, 'utf8'))
  const row = findInsertRowByName(patch.entries, OVERLAY_CARD_PACKAGE_NAME)
  if (row === undefined) {
    throw new Error('overlay-live-plugin: overlay card plugin is not loaded')
  }
  const dest = join(profileRoot, 'plugins', row.id)
  const next = dropOverlayCard(await readOverlayCardInstances(dest), id)
  await writeFile(join(dest, OVERLAY_CARD_INSTANCES_FILE), formatOverlayCardInstances(next))
  return `overlay-live-plugin: removed card ${id} (${row.id})`
}

async function readOverlayCardInstances(dest: string): Promise<ReturnType<typeof parseOverlayCardInstances>> {
  try {
    return parseOverlayCardInstances(await readFile(join(dest, OVERLAY_CARD_INSTANCES_FILE), 'utf8'))
  } catch (error) {
    if (isMissing(error)) return [defaultOverlayCardSpec()]
    throw error
  }
}

function requireFlagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`overlay-live-plugin: ${flag} requires a value`)
  }
  return value
}

function requireIntegerFlag(argv: readonly string[], index: number, flag: string): number {
  const raw = requireFlagValue(argv, index, flag)
  const value = Number(raw)
  if (!Number.isInteger(value)) {
    throw new Error(`overlay-live-plugin: ${flag} must be an integer`)
  }
  return value
}

function readJsonObject(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!isJsonObject(value)) {
    throw new Error(`overlay-live-plugin: ${label} must be a JSON object`)
  }
  return value
}

function readCheckoutManifest(text: string): CheckoutManifest & { name: string } {
  const value = readJsonObject(text, 'checkout package.json')
  if (typeof value.name !== 'string' || value.name.length === 0) {
    throw new Error('overlay-live-plugin: checkout package.json is missing name')
  }
  const dsh = value.dsh
  if (dsh === undefined) return { name: value.name }
  if (!isJsonObject(dsh)) {
    throw new Error('overlay-live-plugin: checkout dsh must be an object')
  }
  return { name: value.name, dsh: { client: dsh.client } }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readStringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`overlay-live-plugin: ${label} must be a string map`)
  }
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new Error(`overlay-live-plugin: ${label} entry ${key} must be a string`)
    }
    out[key] = item
  }
  return out
}

function leadingCommentBlock(text: string): string {
  const lines = text.split(/(?<=\n)/)
  const comments: string[] = []
  for (const line of lines) {
    if (line.startsWith('#') || line === '\n') comments.push(line)
    else break
  }
  return comments.join('')
}

function asInsertRow(row: unknown): LoaderInsertRow {
  if (!isJsonObject(row)) {
    throw new Error('overlay-live-plugin: insert row must be { id, name }')
  }
  const id = row.id
  const name = row.name
  if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0) {
    throw new Error('overlay-live-plugin: insert row needs non-empty id and name')
  }
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean') {
    throw new Error('overlay-live-plugin: insert row disabled must be a boolean')
  }
  return row.disabled === true ? { id, name, disabled: true } : { id, name }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Run `pnpm install` in the profile directory (never the repository root).
 * @param cwd - profile directory.
 */
export function installProfile(cwd: string): void {
  runPnpm(cwd, ['install'], `overlay-live-plugin: pnpm install failed in ${cwd}`)
}

/**
 * Relink the workspace after deleting a checkout package.
 * @param cwd - repository root.
 */
export function installWorkspace(cwd: string): void {
  runPnpm(cwd, ['install'], `overlay-live-plugin: pnpm install failed in ${cwd}`)
}

const CATALOG_SCRIPTS = ['gen-module-graph', 'gen-config-catalog', 'gen-client-catalog'] as const

/**
 * Rewrite generated catalogs so an unloaded occupant cannot remain as a
 * searchable empty record.
 * @param cwd - repository root.
 */
export function refreshDerivedCatalogs(cwd: string): void {
  for (const script of CATALOG_SCRIPTS) {
    runPnpm(cwd, ['run', script], `overlay-live-plugin: pnpm run ${script} failed in ${cwd}`)
  }
}

function runPnpm(cwd: string, args: readonly string[], failed: string): void {
  const result = spawnSync('pnpm', [...args], { cwd, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    throw new Error(`${failed} (status ${String(result.status)})`)
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (invokedDirectly) {
  const repoRoot = resolve(import.meta.dirname, '..')
  runOverlayLivePlugin(process.argv.slice(2), {
    home: resolveOverlayHome(),
    profile: 'web',
    install: installProfile,
    repoRoot,
    workspaceInstall: installWorkspace,
    refreshCatalogs: refreshDerivedCatalogs,
    build: defaultOverlayCheckoutBuild,
    waitForClientRow: (packageName, wait) => confirmLiveClientBoot(packageName, {
      liveManifestPath: wait.liveManifestPath,
      remountFiber: () => remountInsertRow(wait.patchPath, wait.loaderId),
    }),
  }).then((message) => {
    process.stdout.write(`${message}\n`)
  }).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${text}\n`)
    process.exitCode = 1
  })
}
