/**
 * Write a frontend-only overlay-shaped.body occupant package.
 * Shaped chrome stays `ui-overlay-shaped` (insert, do not copy).
 * Lands checkout inventory, tsconfig, and omit-list rows when those files
 * exist. `overlay:live remove` unlands and deletes an omitted occupant.
 * Does not edit the web-app bundle patch.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { landCheckoutSurfaces } from './overlay-page-checkout.ts'
import { parsePageName } from './overlay-new-page.ts'
import { shapedKitFiles } from './overlay-new-shaped-files.ts'

/** Paths and version used when writing the package. */
export interface OverlayNewShapedOptions {
  /** Repository root that contains `packages/client`. */
  readonly repoRoot: string
  /** Package version; defaults to the root `package.json` version. */
  readonly version?: string
}

/**
 * Write the shaped occupant package under `packages/client/<name>/`.
 * @param argv - CLI args after the script name; first operand is the name.
 * @param options - repo root and optional version.
 * @returns a short next-step message.
 * @throws when the destination exists or the name is invalid.
 */
export function runOverlayNewShaped(argv: readonly string[], options: OverlayNewShapedOptions): string {
  const raw = argv[0]
  if (raw === undefined || raw.startsWith('--')) {
    throw new Error('overlay-new-shaped: usage: pnpm overlay:new-shaped <name>')
  }
  const name = parsePageName(raw, 'overlay-new-shaped')
  const dest = join(options.repoRoot, 'packages', 'client', name.dirName)
  if (existsSync(dest)) {
    throw new Error(`overlay-new-shaped: ${relative(options.repoRoot, dest).replaceAll('\\', '/')} already exists`)
  }
  const version = options.version ?? readRootVersion(options.repoRoot)
  const files = shapedKitFiles({
    dirName: name.dirName,
    npmName: name.npmName,
    localeNs: name.localeNs,
    version,
  })
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dest, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  landCheckoutSurfaces(options.repoRoot, name, 'shaped')
  const relDest = `packages/client/${name.dirName}`
  return [
    `Wrote ${relDest} (${name.npmName}).`,
    'Next:',
    '  pnpm overlay:live insert packages/client/ui-overlay-shaped',
    `  pnpm install --filter ./${relDest}...`,
    '  # edit Occupant.tsx, locales.ts, and Occupant.module.css only; keep OverlayShapedKey',
    `  pnpm overlay:live insert ${relDest}`,
  ].join('\n')
}

function readRootVersion(repoRoot: string): string {
  const text = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('overlay-new-shaped: root package.json must be an object')
  }
  const version = (parsed as { version?: unknown }).version
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('overlay-new-shaped: root package.json is missing version')
  }
  return version
}

const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (invokedDirectly) {
  try {
    const repoRoot = resolve(import.meta.dirname, '..')
    const message = runOverlayNewShaped(process.argv.slice(2), { repoRoot })
    process.stdout.write(`${message}\n`)
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${text}\n`)
    process.exitCode = 1
  }
}
