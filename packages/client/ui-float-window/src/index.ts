/**
 * Overlay card plugin, node half: reads `instances.json` and serves
 * `instances.list` / `instances.setHidden` / `occupants.setInserted` on
 * `/overlay-card`. The browser half mounts a window when the spec is not
 * hidden and occupant fibers are inserted. Removing the Loader row unloads
 * both halves.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  defaultOverlayCardSpec,
  formatOverlayCardInstances,
  isOverlayCardId,
  isProtectedOverlayCardLoaderId,
  OVERLAY_CARD_INSTANCES_FILE,
  OVERLAY_CARD_LIST_ENDPOINT,
  OVERLAY_CARD_RPC_CHANNEL,
  OVERLAY_CARD_SET_HIDDEN_ENDPOINT,
  OVERLAY_CARD_SET_INSERTED_ENDPOINT,
  OVERLAY_CARD_PACKAGE_NAME,
  parseOverlayCardInstances,
  persistOverlayCardSpec,
  setOverlayCardHidden,
  type OverlayCardSpec,
} from './instances.ts'
import {
  overlayCardInsertedFromOccupants,
  scanProfileLoaderRows,
  setProfileLoaderRowsInserted,
  type OverlayCardLoaderRow,
} from './profile-patch.ts'

export {
  appendOverlayCard, appendOverlayCardOccupant, defaultOverlayCardSpec, dropOverlayCard,
  formatOverlayCardInstances, isOverlayCardHidden, isOverlayCardId, isOverlayCardInserted,
  isOverlayCardMounted, isOverlayCardNumber, isOverlayCardRoster, isProtectedOverlayCardLoaderId,
  OVERLAY_CARD_DEFAULT_HEIGHT, OVERLAY_CARD_DEFAULT_TITLE, OVERLAY_CARD_DEFAULT_WIDTH,
  OVERLAY_CARD_INSTANCES_FILE, OVERLAY_CARD_LIST_ENDPOINT, OVERLAY_CARD_MAX,
  OVERLAY_CARD_NUMBERS, OVERLAY_CARD_PACKAGE_NAME, OVERLAY_CARD_PLUG_RPC_CHANNEL,
  OVERLAY_CARD_RPC_CHANNEL, OVERLAY_CARD_SET_HIDDEN_ENDPOINT, OVERLAY_CARD_SET_INSERTED_ENDPOINT,
  overlayCardBodySlot, overlayCardSeatFromBodySlot, overlayCardTrailingSlot,
  parseOverlayCardInstanceId, parseOverlayCardInstances, persistOverlayCardSpec,
  resolveOverlayCardInsert, setOverlayCardHidden,
} from './instances.ts'
export type {
  OverlayCardBodySlot, OverlayCardChildSlot, OverlayCardInsertRequest, OverlayCardNumber,
  OverlayCardRoster, OverlayCardSpec, OverlayCardTrailingSlot,
} from './instances.ts'
export {
  overlayCardInsertedFromOccupants, scanProfileLoaderRows, setProfileLoaderRowsInserted,
} from './profile-patch.ts'
export type { OverlayCardLoaderRow } from './profile-patch.ts'

/** Directory that holds `instances.json`. Tests pass a temp dir. */
export interface OverlayCardHostOptions {
  /** Absolute directory containing `instances.json`. */
  instancesDir?: string
  /** Absolute `cordis.patch.yml`. Tests pass a temp file. */
  patchPath?: string
}

/**
 * Plugin root next to `lib/index.js` (profile copy) or `src/index.ts` (tests).
 * @param moduleUrl - `import.meta.url` of this module.
 */
export function overlayCardPluginRoot(moduleUrl: string): string {
  return join(dirname(fileURLToPath(moduleUrl)), '..')
}

/**
 * Directory that holds the durable card roster.
 * Overlay insert, hide/unplug, the desk poll, and the Cursor plugin panel all
 * use `$DSH_HOME/profiles/<name>/plugins/<id>/instances.json`. Source launch
 * maps this package to checkout `src/`, whose file is only the one-card
 * template; prefer the live copy whenever that profile plugin exists.
 * @param moduleUrl - `import.meta.url` of this module.
 * @param options - test overrides for harness home and argv.
 */
export function resolveOverlayCardInstancesDir(
  moduleUrl: string,
  options?: { home?: string; argv?: readonly string[] },
): string {
  const home = options?.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const profile = overlayCardProfileName(options?.argv ?? process.argv)
  return findLiveOverlayCardInstancesDir(home, profile) ?? overlayCardPluginRoot(moduleUrl)
}

/**
 * Live profile `cordis.patch.yml` next to the plugins directory.
 * @param instancesDir - plugin root that holds `instances.json`.
 */
export function overlayCardPatchPathFromInstancesDir(instancesDir: string): string {
  return join(instancesDir, '..', '..', 'cordis.patch.yml')
}

function overlayCardProfileName(argv: readonly string[]): string {
  const eq = argv.find(flag => flag.startsWith('--profile='))
  if (eq !== undefined && eq.length > '--profile='.length) return eq.slice('--profile='.length)
  const index = argv.indexOf('--profile')
  const named = index >= 0 ? argv[index + 1] : undefined
  if (named !== undefined && named.length > 0 && !named.startsWith('-')) return named
  return 'web'
}

/**
 * First profile plugin directory whose `package.json` name is the card package.
 * @param home - DeepSeek Harness home.
 * @param profileName - `dsh --profile` value; tried before sibling profiles.
 */
export function findLiveOverlayCardInstancesDir(home: string, profileName: string): string | undefined {
  const profiles = join(home, 'profiles')
  let names: string[]
  try {
    names = readdirSync(profiles, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .map(entry => entry.name)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
  const ordered = [profileName, ...names.filter(name => name !== profileName)]
  const seen = new Set<string>()
  for (const name of ordered) {
    if (seen.has(name)) continue
    seen.add(name)
    const found = liveOverlayCardPluginRoot(join(profiles, name, 'plugins'))
    if (found !== undefined) return found
  }
  return undefined
}

function liveOverlayCardPluginRoot(plugins: string): string | undefined {
  let names: string[]
  try {
    names = readdirSync(plugins)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
  for (const name of names) {
    const root = join(plugins, name)
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown }
      if (pkg.name !== OVERLAY_CARD_PACKAGE_NAME) continue
      return root
    } catch (error) {
      if (isMissingFile(error)) continue
      throw error
    }
  }
  return undefined
}

/**
 * Read the roster file; missing file means the default first-card spec.
 * @param root - directory that holds `instances.json`.
 */
export function readOverlayCardInstancesFile(root: string): OverlayCardSpec[] {
  try {
    return parseOverlayCardInstances(readFileSync(join(root, OVERLAY_CARD_INSTANCES_FILE), 'utf8'))
  } catch (error) {
    if (isMissingFile(error)) return [defaultOverlayCardSpec()]
    throw error
  }
}

/** Required service: Connection RPC registry. */
export const inject = ['connection']

/**
 * Register `/overlay-card` roster endpoints. `rpc.handle` already owns the
 * route effect on this fiber; wrapping it in another `ctx.effect` is not
 * required. A duplicate route is ignored so a live sidecar can own the
 * channel without failing this fiber.
 * @param ctx - host plugin context.
 * @param options - optional `instancesDir` / `patchPath` overrides for tests.
 */
export function apply(ctx: Context, options?: OverlayCardHostOptions): void {
  try {
    ctx.connection.rpc.handle(
      OVERLAY_CARD_RPC_CHANNEL,
      async (endpoint, payload) => {
        const root = options?.instancesDir ?? resolveOverlayCardInstancesDir(import.meta.url)
        const patchPath = options?.patchPath ?? overlayCardPatchPathFromInstancesDir(root)
        return dispatchOverlayCardRpc(root, patchPath, endpoint, payload)
      },
      { authority: 'trusted-host' },
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate')) return
    throw error
  }
}

function dispatchOverlayCardRpc(
  root: string,
  patchPath: string,
  endpoint: string,
  payload: unknown,
): RpcResult<{ cards: OverlayCardSpec[] }> {
  if (endpoint === OVERLAY_CARD_LIST_ENDPOINT) {
    return { ok: true, value: { cards: listedCards(root, patchPath) } }
  }
  if (endpoint === OVERLAY_CARD_SET_HIDDEN_ENDPOINT) {
    const request = parseSetHiddenPayload(payload)
    if (request === undefined) {
      return badRequest('overlay-card: instances.setHidden needs { id, hidden }')
    }
    let next: OverlayCardSpec[]
    try {
      next = setOverlayCardHidden(readOverlayCardInstancesFile(root), request.id, request.hidden)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'overlay-card: setHidden failed')
    }
    writeFileSync(join(root, OVERLAY_CARD_INSTANCES_FILE), formatOverlayCardInstances(next))
    return { ok: true, value: { cards: listedCards(root, patchPath) } }
  }
  if (endpoint === OVERLAY_CARD_SET_INSERTED_ENDPOINT) {
    const request = parseSetInsertedPayload(payload)
    if (request === undefined) {
      return badRequest('overlay-card: occupants.setInserted needs { id, inserted }')
    }
    try {
      setOccupantsInserted(root, patchPath, request.id, request.inserted)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'overlay-card: setInserted failed')
    }
    return { ok: true, value: { cards: listedCards(root, patchPath) } }
  }
  return badRequest(`unknown overlay-card endpoint ${endpoint}`)
}

function listedCards(root: string, patchPath: string): OverlayCardSpec[] {
  const rows = readLoaderRows(patchPath)
  return readOverlayCardInstancesFile(root).map(card => enrichListedCard(card, rows))
}

function enrichListedCard(card: OverlayCardSpec, rows: readonly OverlayCardLoaderRow[]): OverlayCardSpec {
  const persisted = persistOverlayCardSpec(card)
  return {
    ...persisted,
    inserted: overlayCardInsertedFromOccupants(persisted.occupants ?? [], rows),
  }
}

function setOccupantsInserted(root: string, patchPath: string, id: string, inserted: boolean): void {
  const cards = readOverlayCardInstancesFile(root)
  const spec = cards.find(card => card.id === id)
  if (spec === undefined) {
    throw new Error(`overlay-card: card ${JSON.stringify(id)} is not loaded`)
  }
  const occupants = spec.occupants ?? []
  if (occupants.length === 0) return
  for (const occupant of occupants) {
    if (isProtectedOverlayCardLoaderId(occupant)) {
      throw new Error(`overlay-card: occupant ${JSON.stringify(occupant)} is not a page fiber`)
    }
  }
  const text = readFileSync(patchPath, 'utf8')
  writeFileSync(patchPath, setProfileLoaderRowsInserted(text, occupants, inserted))
}

function readLoaderRows(patchPath: string): OverlayCardLoaderRow[] {
  try {
    return scanProfileLoaderRows(readFileSync(patchPath, 'utf8'))
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
}

function parseSetHiddenPayload(value: unknown): { id: string; hidden: boolean } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !isOverlayCardId(record.id)) return undefined
  if (typeof record.hidden !== 'boolean') return undefined
  return { id: record.id, hidden: record.hidden }
}

function parseSetInsertedPayload(value: unknown): { id: string; inserted: boolean } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !isOverlayCardId(record.id)) return undefined
  if (typeof record.inserted !== 'boolean') return undefined
  return { id: record.id, inserted: record.inserted }
}

function badRequest(message: string): RpcResult<{ cards: OverlayCardSpec[] }> {
  return {
    ok: false,
    error: {
      code: 'bad-request',
      message,
      details: { issues: [] },
    },
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
