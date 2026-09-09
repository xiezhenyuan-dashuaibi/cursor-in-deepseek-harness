/**
 * Checkout landing for an overlay page occupant: inventory, aggregate
 * tsconfig, Model Experience, and the web-app omit list. Inverse of
 * `overlay:new-page`. Never writes the web-app bundle patch.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Directory and npm name of a `packages/client/<dir>` occupant. */
export interface OverlayPageIdentity {
  /** Directory under `packages/client/`. */
  readonly dirName: string
  /** npm name `@deepseek-ai/dsh-client-<dirName>`. */
  readonly npmName: string
}

/** Canonical card module: live remove unloads the desk, not this checkout tree. */
export const OVERLAY_CARD_DIR = 'ui-float-window'

const LANDING_FILES = {
  clientTsconfig: 'tsconfig.client.json',
  baseTsconfig: 'tsconfig.base.json',
  hostTsconfig: 'tsconfig.host.json',
  inventoryEn: join('packages', 'client', 'README.md'),
  inventoryZh: join('packages', 'client', 'README.zh.md'),
  modelExperience: join('scripts', 'verify-package-readme-model-experience.ts'),
  omitList: join('packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
  bundlePatch: join('packages', 'bundle', 'web-app', 'cordis.patch.yml'),
  bundleManifest: join('packages', 'bundle', 'web-app', 'package.json'),
} as const

/**
 * Insert inventory, aggregate tsconfig, Model Experience, and bundle-omit
 * rows when those checkout files exist. Never writes the web-app bundle patch.
 * @param repoRoot - repository root.
 * @param name - parsed page identity.
 */
export function landCheckoutSurfaces(repoRoot: string, name: OverlayPageIdentity): void {
  insertAfterMarker(
    join(repoRoot, LANDING_FILES.clientTsconfig),
    '{ "path": "./packages/client/ui-float-window/tsconfig.client.json" },',
    `    { "path": "./packages/client/${name.dirName}" },`,
    `./packages/client/${name.dirName}`,
  )
  insertAfterMarker(
    join(repoRoot, LANDING_FILES.baseTsconfig),
    '"@deepseek-ai/dsh-client-ui-float-window": ["./packages/client/ui-float-window/src"],',
    `      "${name.npmName}": ["./packages/client/${name.dirName}/src"],`,
    name.npmName,
  )
  insertAfterMarker(
    join(repoRoot, LANDING_FILES.inventoryEn),
    '| [`ui-float-window/`](ui-float-window/README.md) | Canonical reusable overlay card desk on `shell.overlay`; insert this package with `--title` / `--card-id` / `--width` / `--height` (repeat insert adds another card), then occupy `overlay-card.body`. |',
    `| [\`${name.dirName}/\`](${name.dirName}/README.md) | Occupant of \`overlay-card.body\`. Not in the default web-app roster. |`,
    `[\`${name.dirName}/\`](${name.dirName}/README.md)`,
  )
  insertAfterMarker(
    join(repoRoot, LANDING_FILES.inventoryZh),
    '| [`ui-float-window/`](ui-float-window/README.md) | 规范的可复用 overlay 卡片桌面，占据 `shell.overlay`；插入本包并传入 `--title` / `--card-id` / `--width` / `--height`（再次插入会再加一张卡片），再占据 `overlay-card.body`。 |',
    `| [\`${name.dirName}/\`](${name.dirName}/README.md) | \`overlay-card.body\` 的占用者。默认 web-app 名录不挂载。 |`,
    `[\`${name.dirName}/\`](${name.dirName}/README.md)`,
  )
  insertAfterMarker(
    join(repoRoot, LANDING_FILES.modelExperience),
    "'packages/client/ui-float-window': { kind: 'none', reason: 'Reusable overlay card desk; registers nothing model-facing.' },",
    `  'packages/client/${name.dirName}': { kind: 'none', reason: 'Browser-only overlay-card.body occupant; registers nothing model-facing.' },`,
    `'packages/client/${name.dirName}'`,
  )
  prependInFile(
    join(repoRoot, LANDING_FILES.omitList),
    'const OMITTED_IDS = [',
    `const OMITTED_IDS = ['${name.dirName}', `,
    `'${name.dirName}'`,
  )
  prependInFile(
    join(repoRoot, LANDING_FILES.omitList),
    'const OMITTED_PACKAGES = [',
    `const OMITTED_PACKAGES = [\n  '${name.npmName}',`,
    name.npmName,
  )
}

/**
 * Strip landing rows for this occupant. Leaves the package directory in place.
 * @param repoRoot - repository root.
 * @param name - directory and npm name.
 */
export function unlandCheckoutSurfaces(repoRoot: string, name: OverlayPageIdentity): void {
  const mentions = packageMention(name)
  dropMatchingLines(join(repoRoot, LANDING_FILES.clientTsconfig), mentions)
  dropMatchingLines(join(repoRoot, LANDING_FILES.baseTsconfig), mentions)
  dropMatchingLines(join(repoRoot, LANDING_FILES.hostTsconfig), mentions)
  dropMatchingLines(join(repoRoot, LANDING_FILES.inventoryEn), mentions)
  dropMatchingLines(join(repoRoot, LANDING_FILES.inventoryZh), mentions)
  dropMatchingLines(join(repoRoot, LANDING_FILES.modelExperience), mentions)
  const omitPath = join(repoRoot, LANDING_FILES.omitList)
  if (!existsSync(omitPath)) return
  const omit = readFileSync(omitPath, 'utf8')
  const next = dropQuotedListItem(dropQuotedListItem(omit, name.dirName), name.npmName)
  if (next !== omit) writeFileSync(omitPath, next)
}

/**
 * Delete a lab overlay occupant from checkout and strip its landing rows.
 * Default-roster packages and the card module stay.
 * @param repoRoot - repository root.
 * @param dirName - `packages/client/<dirName>`.
 * @returns whether the directory was removed.
 */
export function purgeCheckoutOccupant(repoRoot: string, dirName: string): boolean {
  const dest = join(repoRoot, 'packages', 'client', dirName)
  if (!existsSync(dest)) return false
  if (!isLabOverlayOccupant(repoRoot, dirName)) return false
  const npmName = readNpmName(dest) ?? `@deepseek-ai/dsh-client-${dirName}`
  unlandCheckoutSurfaces(repoRoot, { dirName, npmName })
  rmSync(dest, { recursive: true, force: true })
  return true
}

/**
 * True when live `remove` should delete checkout: omitted lab occupant, not
 * the card desk, not a web-app bundle Loader or dependency.
 * @param repoRoot - repository root.
 * @param dirName - client package directory name.
 */
export function isLabOverlayOccupant(repoRoot: string, dirName: string): boolean {
  if (dirName === OVERLAY_CARD_DIR) return false
  if (isWebAppRosterPackage(repoRoot, dirName)) return false
  const dest = join(repoRoot, 'packages', 'client', dirName)
  if (!existsSync(dest)) return false
  return omitListMentions(repoRoot, dirName)
}

function isWebAppRosterPackage(repoRoot: string, dirName: string): boolean {
  const patchPath = join(repoRoot, LANDING_FILES.bundlePatch)
  if (existsSync(patchPath)) {
    const patch = readFileSync(patchPath, 'utf8')
    if (new RegExp(`^\\s+- id: ${escapeRegExp(dirName)}$`, 'm').test(patch)) return true
    const npmName = readNpmName(join(repoRoot, 'packages', 'client', dirName))
    if (npmName !== undefined && patch.includes(npmName)) return true
  }
  const manifestPath = join(repoRoot, LANDING_FILES.bundleManifest)
  if (!existsSync(manifestPath)) return false
  const npmName = readNpmName(join(repoRoot, 'packages', 'client', dirName))
  if (npmName === undefined) return false
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  const dependencies = (parsed as { dependencies?: unknown }).dependencies
  return isStringMap(dependencies) && Object.hasOwn(dependencies, npmName)
}

function omitListMentions(repoRoot: string, dirName: string): boolean {
  const path = join(repoRoot, LANDING_FILES.omitList)
  if (!existsSync(path)) return false
  return readFileSync(path, 'utf8').includes(`'${dirName}'`)
}

function readNpmName(packageDir: string): string | undefined {
  const manifest = join(packageDir, 'package.json')
  if (!existsSync(manifest)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const name = (parsed as { name?: unknown }).name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

function packageMention(name: OverlayPageIdentity): (line: string) => boolean {
  const dir = new RegExp(`packages/client/${escapeRegExp(name.dirName)}(?![A-Za-z0-9-])`)
  const npm = new RegExp(`${escapeRegExp(name.npmName)}(?![A-Za-z0-9-])`)
  const inventory = `[\`${name.dirName}/\`](${name.dirName}/README.md)`
  return (line: string) => dir.test(line) || npm.test(line) || line.includes(inventory)
}

function dropMatchingLines(path: string, match: (line: string) => boolean): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const next = text.split('\n').filter(line => !match(line)).join('\n')
  if (next !== text) writeFileSync(path, next)
}

/**
 * Remove one quoted list item without treating a prefix name as a hit.
 * @param text - file contents.
 * @param value - exact token inside single quotes.
 */
export function dropQuotedListItem(text: string, value: string): string {
  const quoted = `'${value}'`
  let next = text.replaceAll(`\n  ${quoted},`, '')
  next = next.replaceAll(`\n  ${quoted}`, '')
  next = next.replaceAll(`, ${quoted}`, '')
  next = next.replaceAll(`${quoted}, `, '')
  return next.replaceAll(quoted, '')
}

/**
 * Insert `inserted` on the line after `marker` when the file exists and does
 * not already contain `needle`.
 * @param path - checkout file.
 * @param marker - existing line to follow.
 * @param inserted - full next line, including indent.
 * @param needle - skip when already present.
 */
export function insertAfterMarker(path: string, marker: string, inserted: string, needle: string): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  if (text.includes(needle) || !text.includes(marker)) return
  writeFileSync(path, text.replace(marker, `${marker}\n${inserted}`))
}

/**
 * Replace `marker` with `replacement` when the file exists and does not
 * already contain `needle`.
 * @param path - checkout file.
 * @param marker - unique prefix to replace.
 * @param replacement - prefix plus the new token.
 * @param needle - skip when already present.
 */
export function prependInFile(path: string, marker: string, replacement: string, needle: string): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  if (text.includes(needle) || !text.includes(marker)) return
  writeFileSync(path, text.replace(marker, replacement))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isStringMap(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
