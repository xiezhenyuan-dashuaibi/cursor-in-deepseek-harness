/**
 * Write a frontend-only overlay-card.body page package.
 * Card chrome stays `ui-float-window` (insert, do not copy).
 * Lands checkout inventory, tsconfig, and omit-list rows when those files
 * exist. `overlay:live remove` unlands and deletes an omitted occupant.
 * Does not edit the web-app bundle patch.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { landCheckoutSurfaces } from './overlay-page-checkout.ts'
import { pageKitFiles } from './overlay-new-page-files.ts'

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Parsed page identity. */
export interface PageName {
  /** Directory under `packages/client/`. */
  readonly dirName: string
  /** npm name `@deepseek-ai/dsh-client-<dirName>`. */
  readonly npmName: string
  /** Locale namespace `overlay-<slug>`. */
  readonly localeNs: string
}

/** Paths and version used when writing the package. */
export interface OverlayNewPageOptions {
  /** Repository root that contains `packages/client`. */
  readonly repoRoot: string
  /** Package version; defaults to the root `package.json` version. */
  readonly version?: string
}

/**
 * Parse `foo`, `ui-foo`, or `packages/client/foo` into directory and npm name.
 * @param raw - CLI operand.
 * @returns directory, npm name, locale namespace.
 * @throws when the name is empty, nested, or not kebab-case.
 */
export function parsePageName(raw: string, command = 'overlay-new-page'): PageName {
  const trimmed = raw.trim().replaceAll('\\', '/')
  if (trimmed.length === 0) {
    throw new Error(`${command}: name is required`)
  }
  if (trimmed.includes('..') || isAbsolute(trimmed)) {
    throw new Error(`${command}: name must be a packages/client directory segment`)
  }
  const stripped = trimmed.startsWith('packages/client/')
    ? trimmed.slice('packages/client/'.length)
    : trimmed
  if (stripped.includes('/')) {
    throw new Error(`${command}: name must be a single packages/client directory`)
  }
  if (!NAME_PATTERN.test(stripped)) {
    throw new Error(`${command}: name must be kebab-case (e.g. ui-notes or notes)`)
  }
  const slug = stripped.startsWith('ui-') ? stripped.slice('ui-'.length) : stripped
  return {
    dirName: stripped,
    npmName: `@deepseek-ai/dsh-client-${stripped}`,
    localeNs: `overlay-${slug}`,
  }
}

/**
 * Write the page package under `packages/client/<name>/`.
 * @param argv - CLI args after the script name; first operand is the name.
 * @param options - repo root and optional version.
 * @returns a short next-step message.
 * @throws when the destination exists or the name is invalid.
 */
export function runOverlayNewPage(argv: readonly string[], options: OverlayNewPageOptions): string {
  const raw = argv[0]
  if (raw === undefined || raw.startsWith('--')) {
    throw new Error('overlay-new-page: usage: pnpm overlay:new-page <name>')
  }
  const name = parsePageName(raw)
  const dest = join(options.repoRoot, 'packages', 'client', name.dirName)
  if (existsSync(dest)) {
    throw new Error(`overlay-new-page: ${relative(options.repoRoot, dest).replaceAll('\\', '/')} already exists`)
  }
  const version = options.version ?? readRootVersion(options.repoRoot)
  const files = pageKitFiles({
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
  landCheckoutSurfaces(options.repoRoot, name)
  const relDest = `packages/client/${name.dirName}`
  return [
    `Wrote ${relDest} (${name.npmName}).`,
    'Next:',
    '  pnpm overlay:live insert packages/client/ui-float-window',
    `  pnpm install --filter ./${relDest}...`,
    '  # edit Page.tsx, locales.ts, and Page.module.css only; keep OverlayPageKey',
    `  pnpm overlay:live insert ${relDest}`,
  ].join('\n')
}

function readRootVersion(repoRoot: string): string {
  const text = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('overlay-new-page: root package.json must be an object')
  }
  const version = (parsed as { version?: unknown }).version
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('overlay-new-page: root package.json is missing version')
  }
  return version
}

const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (invokedDirectly) {
  try {
    const repoRoot = resolve(import.meta.dirname, '..')
    const message = runOverlayNewPage(process.argv.slice(2), { repoRoot })
    process.stdout.write(`${message}\n`)
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${text}\n`)
    process.exitCode = 1
  }
}
