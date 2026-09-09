/**
 * Overlay Cursor CLI spawn fence: inject a Node `--import` preload that
 * denies writes under the DSH spine. Project hooks do not reliably run on
 * headless `--print --force` turns; this wrap is inside the CLI process.
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Env var the preload reads for the checkout root (must survive `scrubbedParentEnv`). */
export const SPINE_FENCE_ROOT_ENV = 'CURSOR_SPINE_FENCE_ROOT'

/** argv/env after optional spine-fence injection. */
export interface FencedAgentSpawn {
  /** Unchanged program path. */
  readonly file: string
  /** Program arguments, possibly with a leading `--import` preload. */
  readonly args: readonly string[]
  /** Child environment, including the fence root and `NODE_OPTIONS`. */
  readonly env: NodeJS.ProcessEnv
}

/**
 * True when `cwd` is this DeepSeek Harness checkout, so spine prefixes refer
 * to harness sources rather than a consumer's `packages/core`.
 * @param cwd - overlay spawn working directory.
 * @returns whether the spine fence must wrap this CLI child.
 */
export function isDshHarnessCheckout(cwd: string): boolean {
  const marker = join(cwd, 'packages', 'cursor', 'agent-gateway', 'package.json')
  if (!existsSync(marker)) return false
  if (!existsSync(join(cwd, 'packages', 'core'))) return false
  if (!existsSync(join(cwd, 'packages', 'boot'))) return false
  if (!existsSync(join(cwd, 'vendor'))) return false
  if (!existsSync(join(cwd, 'native'))) return false
  try {
    const name = (JSON.parse(readFileSync(marker, 'utf8')) as { name?: unknown }).name
    return name === '@deepseek-ai/dsh-cursor-agent-gateway'
  } catch {
    return false
  }
}

/**
 * Locate `fence/preload.mjs` by walking up from a module file (source, bundle, or test).
 * @param fromFile - absolute path of the caller module; omitted uses this file.
 * @returns the preload path when present.
 */
export function resolvePackagedPreload(fromFile = fileURLToPath(import.meta.url)): string | undefined {
  let dir = dirname(fromFile)
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'fence', 'preload.mjs')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * True when `file` is a Node executable so `--import` is a valid argv slot.
 * @param file - spawn program path.
 * @returns whether argv injection of `--import` is valid for this program.
 */
export function isNodeProgram(file: string): boolean {
  const base = basename(file).toLowerCase()
  return base === 'node' || base === 'node.exe'
}

/**
 * Merge `--import <url>` into an existing `NODE_OPTIONS` string.
 * @param existing - current `NODE_OPTIONS`, if any.
 * @param importUrl - file URL of the spine preload.
 * @returns `NODE_OPTIONS` containing one `--import` of `importUrl`.
 */
export function mergeNodeOptions(existing: string | undefined, importUrl: string): string {
  if (existing !== undefined && existing.includes(importUrl)) return existing
  const flag = `--import ${importUrl}`
  return existing !== undefined && existing.length > 0 ? `${existing} ${flag}` : flag
}

function argsHaveImport(args: readonly string[], importUrl: string): boolean {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === '--import' && args[i + 1] === importUrl) return true
  }
  return false
}

/**
 * Wrap overlay CLI argv/env so the child (and Node grandchildren) load the
 * spine preload when `cwd` is this harness. A harness checkout with a missing
 * packaged preload fails closed rather than spawning an unfenced CLI.
 * @param input - resolved program, turn argv, spawn cwd, and scrubbed env.
 * @returns the argv and env to pass to `spawn`.
 */
export function applySpineFence(input: {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  /** Test override for {@link resolvePackagedPreload}. */
  readonly preloadPath?: string | undefined
  /** Test override for the module path {@link resolvePackagedPreload} walks from. */
  readonly locateFrom?: string
}): FencedAgentSpawn {
  if (!isDshHarnessCheckout(input.cwd)) {
    return { file: input.file, args: input.args, env: input.env }
  }
  const preload = input.preloadPath !== undefined
    ? input.preloadPath
    : resolvePackagedPreload(input.locateFrom)
  if (preload === undefined || !existsSync(preload)) {
    throw new Error(
      'cursor-agent-gateway: DSH checkout is missing fence/preload.mjs; '
      + 'refusing to spawn an unfenced Cursor CLI',
    )
  }
  const importUrl = pathToFileURL(preload).href
  const alreadyImported = argsHaveImport(input.args, importUrl)
  const args = isNodeProgram(input.file) && !alreadyImported
    ? ['--import', importUrl, ...input.args]
    : input.args
  return {
    file: input.file,
    args,
    env: {
      ...input.env,
      [SPINE_FENCE_ROOT_ENV]: input.cwd,
      NODE_OPTIONS: mergeNodeOptions(input.env.NODE_OPTIONS, importUrl),
    },
  }
}
