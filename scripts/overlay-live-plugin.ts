/**
 * Live-insert overlay plugins into a running `dsh web` profile without
 * restarting the process. Overlay Cursor is that process; a restart drops
 * this session. Card insert also mounts `/overlay-card` through
 * `./overlay-card-roster-rpc.mjs` when that roster channel is missing, and
 * `./overlay-card-plug-rpc.mjs` so `instances.setHidden` and
 * `occupants.setInserted` can mount beside a cached list-only `/overlay-card`
 * handler.
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
import { purgeCheckoutOccupant } from './overlay-page-checkout.ts'

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
        `overlay-live-plugin: missing ${index}; run tsc -p <pkg>/tsconfig.json and tsdown in that package first`,
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
      return `overlay-live-plugin: added card ${added.id} (${existing.id})`
    }
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
    if (source.name === OVERLAY_CARD_PACKAGE_NAME) {
      await ensureOverlayCardHostChannels(profileRoot, patchPath, true)
    }
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
  await bindOverlayCardOccupant(profileRoot, patchPath, source, id)
  return `overlay-live-plugin: inserted ${id} (${source.name}) into ${profileRoot}`
}

interface ParsedArgv {
  command: 'insert' | 'update' | 'remove'
  packageDir: string
  id?: string
  profile?: string
  keepFiles: boolean
  cardTitle?: string
  cardId?: string
  cardWidth?: number
  cardHeight?: number
}

function parseArgv(argv: string[]): ParsedArgv {
  const command = argv[0]
  if (command !== 'insert' && command !== 'update' && command !== 'remove') {
    throw new Error(
      'overlay-live-plugin: usage: insert|update <pkgDir> | remove <id> [--profile web] [--id <id>] [--keep-files] [--title <name>] [--card-id <id>] [--width <px>] [--height <px>]',
    )
  }
  let profile: string | undefined
  let id: string | undefined
  let keepFiles = false
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
  const parsed: ParsedArgv = { command, packageDir: '', id, profile, keepFiles, cardTitle, cardId, cardWidth, cardHeight }
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
    "const PROTECTED = new Set(['ui-float-window', 'ui-cursor-agent', 'cursor-agent', 'overlay-card-roster-rpc', 'overlay-card-plug-rpc', 'overlay-card-hide-rpc', 'overlay-card-rpc'])",
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

async function bindOverlayCardOccupant(
  profileRoot: string,
  patchPath: string,
  source: CheckoutManifest & { name: string },
  loaderId: string,
): Promise<void> {
  if (source.name === OVERLAY_CARD_PACKAGE_NAME) return
  const body = overlayBodyFromClient(source.dsh?.client)
  if (body === undefined) return
  const seat = overlayCardSeatFromBodySlot(body)
  if (seat === undefined) {
    throw new Error(
      `overlay-live-plugin: dsh.client.overlayBody ${JSON.stringify(body)} must be overlay-card.body or overlay-card-N.body`,
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
  }).then((message) => {
    process.stdout.write(`${message}\n`)
  }).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${text}\n`)
    process.exitCode = 1
  })
}
