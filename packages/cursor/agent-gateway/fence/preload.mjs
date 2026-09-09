/**
 * Node `--import` preload injected by the overlay gateway into the Cursor CLI.
 * Denies fs and child_process writes under the DSH spine when `--force` and
 * project hooks do not. Policy: .cursor/hooks/protect-spine.mjs
 *
 * `child_process` methods are wrapped with `Proxy` (not plain function
 * replacement). Replacing `spawn` with a JS function breaks headless
 * `--print` project MCP mounting; a Proxy `apply` trap does not.
 *
 * `worker-server` and `packages/cursor/mcp-server/bin/stdio.mjs` children keep
 * `decide()` checks but must not load this preload (strip `--import` /
 * preload-bearing `NODE_OPTIONS`); otherwise `--print` never starts project
 * `dsh` and `getMcpTools` only lists the built-in `cursor` namespace.
 */
import childProcess from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import workerThreads from 'node:worker_threads'
import { decide, isProtectedRelative, toRepoRelative } from '../../../../.cursor/hooks/protect-spine.mjs'

export const SPINE_FENCE_ROOT_ENV = 'CURSOR_SPINE_FENCE_ROOT'

const INSTALL_KEY = Symbol.for('dsh.cursor.spineFence')
const require = createRequire(import.meta.url)
const fsCjs = require('fs')
const fsPromisesCjs = require('fs/promises')
const cpCjs = require('child_process')
const workerCjs = require('worker_threads')
const preloadUrl = import.meta.url
const importFlag = ['--import', preloadUrl]
const realpathSync = fs.realpathSync.bind(fs)

/**
 * @returns {string}
 */
function fenceRoot() {
  const fromEnv = process.env[SPINE_FENCE_ROOT_ENV]
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : process.cwd()
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function pathString(value) {
  if (typeof value === 'string') return value
  if (value instanceof URL) return fileURLToPath(value)
  if (Buffer.isBuffer(value)) return value.toString()
  return undefined
}

/**
 * @param {unknown} flags
 * @returns {boolean}
 */
function flagsWantWrite(flags) {
  if (flags === undefined || typeof flags === 'function') return false
  if (typeof flags === 'string') {
    const normalized = flags.toLowerCase().replaceAll('s', '')
    return normalized.includes('w') || normalized.includes('a') || normalized.includes('+')
  }
  if (typeof flags === 'number') {
    const { O_APPEND, O_CREAT, O_RDWR, O_TRUNC, O_WRONLY } = fs.constants
    return (flags & (O_WRONLY | O_RDWR | O_APPEND | O_TRUNC | O_CREAT)) !== 0
  }
  return false
}

/**
 * pnpm workspace install writes `node_modules` under spine packages.
 * Those trees are install artifacts, not spine source.
 * @param {string} rel
 * @returns {boolean}
 */
function isInstallArtifactRelative(rel) {
  return rel.replaceAll('\\', '/').split('/').includes('node_modules')
}

/**
 * Resolve the parent through existing prefixes so a write through a
 * `node_modules` directory link cannot rewrite spine source. The last
 * component is the inode being created or replaced (including a workspace
 * symlink whose realpath is spine source).
 * @param {string} path
 * @returns {string | undefined}
 */
function toCanonicalRepoRelative(path) {
  const root = fenceRoot()
  const absolute = isAbsolute(path) ? path : resolve(root, path)
  const parent = dirname(absolute)
  let probe = parent
  for (;;) {
    try {
      const real = realpathSync(probe)
      const rest = relative(probe, parent)
      const combined = resolve(rest === '' ? real : resolve(real, rest), basename(absolute))
      return toRepoRelative(combined, root)
    } catch {
      // Missing path component: realpath fails until an existing prefix.
      const next = dirname(probe)
      if (next === probe) {
        return toRepoRelative(absolute, root)
      }
      probe = next
    }
  }
}

/**
 * @param {unknown} raw
 * @param {string} syscall
 */
function assertWritable(raw, syscall) {
  const path = pathString(raw)
  if (path === undefined) return
  const rel = toCanonicalRepoRelative(path)
  if (rel === undefined || !isProtectedRelative(rel)) return
  if (isInstallArtifactRelative(rel)) return
  const error = new Error(`EACCES: permission denied, ${syscall} '${path}'`)
  error.code = 'EACCES'
  error.errno = -13
  error.path = path
  error.syscall = syscall
  throw error
}

/**
 * @param {unknown} file
 * @returns {boolean}
 */
function isNodeProgram(file) {
  const path = pathString(file)
  if (path === undefined) return false
  const base = path.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? ''
  return base === 'node' || base === 'node.exe'
}

/**
 * @param {string | undefined} existing
 * @returns {string}
 */
function mergeNodeOptions(existing) {
  if (existing !== undefined && existing.includes(preloadUrl)) return existing
  const flag = `--import ${preloadUrl}`
  return existing !== undefined && existing.length > 0 ? `${existing} ${flag}` : flag
}

/**
 * Remove this preload's `--import` from a `NODE_OPTIONS` string.
 * @param {string | undefined} existing
 * @returns {string | undefined}
 */
function stripPreloadFromNodeOptions(existing) {
  if (existing === undefined || existing.length === 0) return existing
  if (!existing.includes(preloadUrl)) return existing
  const cleaned = existing
    .replaceAll(`--import ${preloadUrl}`, ' ')
    .replaceAll(`--import=${preloadUrl}`, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * @param {unknown} file
 * @param {readonly unknown[]} args
 * @returns {boolean}
 */
function isMcpStdioLaunch(file, args) {
  const tokens = [pathString(file), ...args.map(arg => (typeof arg === 'string' ? arg : String(arg)))]
    .filter(token => token !== undefined)
  return tokens.some(token => {
    const posix = token.replaceAll('\\', '/').toLowerCase()
    return posix.includes('packages/cursor/mcp-server/bin/stdio.mjs')
  })
}

/**
 * @param {unknown} _file
 * @param {readonly unknown[]} args
 * @returns {boolean}
 */
function isWorkerServerLaunch(_file, args) {
  return args.some(arg => typeof arg === 'string' && arg === 'worker-server')
}

/**
 * @param {unknown} file
 * @param {readonly unknown[]} args
 * @returns {boolean}
 */
function isPreloadExemptLaunch(file, args) {
  return isMcpStdioLaunch(file, args) || isWorkerServerLaunch(file, args)
}

/**
 * @param {Record<string, unknown>} options
 * @returns {Record<string, unknown>}
 */
function optionsWithoutPreloadNodeOptions(options) {
  const envSource = options.env !== undefined && typeof options.env === 'object' && options.env !== null
    ? /** @type {Record<string, unknown>} */ (options.env)
    : process.env
  const env = { ...envSource }
  const stripped = stripPreloadFromNodeOptions(
    typeof env.NODE_OPTIONS === 'string' ? env.NODE_OPTIONS : undefined,
  )
  if (stripped === undefined) delete env.NODE_OPTIONS
  else env.NODE_OPTIONS = stripped
  return { ...options, env }
}

/**
 * @param {readonly unknown[]} args
 * @returns {boolean}
 */
function argsHaveImport(args) {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === '--import' && args[i + 1] === preloadUrl) return true
  }
  return false
}

/**
 * @param {string} command
 * @param {string} cwd
 */
function assertCommand(command, cwd) {
  const result = decide({ command, cwd }, fenceRoot())
  if (result.permission !== 'deny') return
  const error = new Error(result.agent_message ?? 'DSH spine write denied')
  error.code = 'EACCES'
  error.errno = -13
  error.syscall = 'spawn'
  throw error
}

/**
 * @param {object} obj
 * @param {string} name
 * @param {(args: unknown[]) => void} before
 */
function wrap(obj, name, before) {
  const original = obj[name]
  if (typeof original !== 'function') return
  obj[name] = function wrapped(...args) {
    before(args)
    return original.apply(this, args)
  }
}

/**
 * @param {unknown} args
 * @param {unknown} options
 * @returns {{ args: unknown[], options: Record<string, unknown> }}
 */
function splitSpawn(args, options) {
  if (args !== undefined && !Array.isArray(args)) {
    return { args: [], options: /** @type {Record<string, unknown>} */ (args) }
  }
  return {
    args: Array.isArray(args) ? args : [],
    options: options !== undefined && typeof options === 'object' && options !== null
      ? /** @type {Record<string, unknown>} */ (options)
      : {},
  }
}

/**
 * @param {unknown} file
 * @param {unknown[]} args
 * @param {Record<string, unknown>} options
 * @returns {{ args: unknown[], options: Record<string, unknown> }}
 */
function fenceSpawn(file, args, options) {
  const cwd = typeof options.cwd === 'string' ? options.cwd : process.cwd()
  const tokens = [pathString(file), ...args.map(arg => (typeof arg === 'string' ? arg : String(arg)))]
    .filter(token => token !== undefined)
  assertCommand(tokens.join(' '), cwd)
  if (isPreloadExemptLaunch(file, args)) {
    return { args, options: optionsWithoutPreloadNodeOptions(options) }
  }
  const nextArgs = isNodeProgram(file) && !argsHaveImport(args)
    ? [...importFlag, ...args]
    : args
  const envSource = options.env !== undefined && typeof options.env === 'object' && options.env !== null
    ? /** @type {Record<string, unknown>} */ (options.env)
    : process.env
  const env = { ...envSource }
  env[SPINE_FENCE_ROOT_ENV] = env[SPINE_FENCE_ROOT_ENV] ?? fenceRoot()
  if (typeof env.NODE_OPTIONS === 'string' || env.NODE_OPTIONS === undefined) {
    env.NODE_OPTIONS = mergeNodeOptions(
      typeof env.NODE_OPTIONS === 'string' ? env.NODE_OPTIONS : undefined,
    )
  }
  return { args: nextArgs, options: { ...options, env } }
}

/**
 * Apply fenced argv/options while preserving the original `spawn` arity.
 * @param {(...args: unknown[]) => unknown} target
 * @param {unknown} thisArg
 * @param {unknown[]} argList
 * @returns {unknown}
 */
function applyFencedSpawn(target, thisArg, argList) {
  const file = argList[0]
  const split = splitSpawn(argList[1], argList[2])
  const fenced = fenceSpawn(file, split.args, split.options)
  if (argList.length < 2) return Reflect.apply(target, thisArg, [file])
  if (argList.length === 2 && !Array.isArray(argList[1])) {
    return Reflect.apply(target, thisArg, [file, fenced.options])
  }
  return Reflect.apply(target, thisArg, [file, fenced.args, fenced.options])
}

/**
 * @param {object} owner
 * @param {string} name
 * @param {(target: Function, thisArg: unknown, argList: unknown[]) => unknown} apply
 */
function proxyFunction(owner, name, apply) {
  const original = owner[name]
  if (typeof original !== 'function') return
  owner[name] = new Proxy(original, { apply })
}

function installFs() {
  wrap(fs, 'writeFileSync', args => { assertWritable(args[0], 'write') })
  wrap(fs, 'writeFile', args => { assertWritable(args[0], 'write') })
  wrap(fs, 'appendFileSync', args => { assertWritable(args[0], 'write') })
  wrap(fs, 'appendFile', args => { assertWritable(args[0], 'write') })
  wrap(fs, 'copyFileSync', args => { assertWritable(args[1], 'copyfile') })
  wrap(fs, 'copyFile', args => { assertWritable(args[1], 'copyfile') })
  wrap(fs, 'cpSync', args => { assertWritable(args[1], 'cp') })
  wrap(fs, 'cp', args => { assertWritable(args[1], 'cp') })
  wrap(fs, 'renameSync', args => {
    assertWritable(args[0], 'rename')
    assertWritable(args[1], 'rename')
  })
  wrap(fs, 'rename', args => {
    assertWritable(args[0], 'rename')
    assertWritable(args[1], 'rename')
  })
  wrap(fs, 'unlinkSync', args => { assertWritable(args[0], 'unlink') })
  wrap(fs, 'unlink', args => { assertWritable(args[0], 'unlink') })
  wrap(fs, 'rmSync', args => { assertWritable(args[0], 'rm') })
  wrap(fs, 'rm', args => { assertWritable(args[0], 'rm') })
  wrap(fs, 'rmdirSync', args => { assertWritable(args[0], 'rmdir') })
  wrap(fs, 'rmdir', args => { assertWritable(args[0], 'rmdir') })
  wrap(fs, 'truncateSync', args => { assertWritable(args[0], 'truncate') })
  wrap(fs, 'truncate', args => { assertWritable(args[0], 'truncate') })
  wrap(fs, 'mkdirSync', args => { assertWritable(args[0], 'mkdir') })
  wrap(fs, 'mkdir', args => { assertWritable(args[0], 'mkdir') })
  wrap(fs, 'linkSync', args => { assertWritable(args[1], 'link') })
  wrap(fs, 'link', args => { assertWritable(args[1], 'link') })
  wrap(fs, 'symlinkSync', args => { assertWritable(args[1], 'symlink') })
  wrap(fs, 'symlink', args => { assertWritable(args[1], 'symlink') })
  wrap(fs, 'openSync', args => {
    if (flagsWantWrite(args[1])) assertWritable(args[0], 'open')
  })
  wrap(fs, 'open', args => {
    if (flagsWantWrite(args[1])) assertWritable(args[0], 'open')
  })
  wrap(fs, 'createWriteStream', args => { assertWritable(args[0], 'write') })
  wrap(fsPromises, 'writeFile', args => { assertWritable(args[0], 'write') })
  wrap(fsPromises, 'appendFile', args => { assertWritable(args[0], 'write') })
  wrap(fsPromises, 'copyFile', args => { assertWritable(args[1], 'copyfile') })
  wrap(fsPromises, 'cp', args => { assertWritable(args[1], 'cp') })
  wrap(fsPromises, 'rename', args => {
    assertWritable(args[0], 'rename')
    assertWritable(args[1], 'rename')
  })
  wrap(fsPromises, 'unlink', args => { assertWritable(args[0], 'unlink') })
  wrap(fsPromises, 'rm', args => { assertWritable(args[0], 'rm') })
  wrap(fsPromises, 'rmdir', args => { assertWritable(args[0], 'rmdir') })
  wrap(fsPromises, 'truncate', args => { assertWritable(args[0], 'truncate') })
  wrap(fsPromises, 'mkdir', args => { assertWritable(args[0], 'mkdir') })
  wrap(fsPromises, 'link', args => { assertWritable(args[1], 'link') })
  wrap(fsPromises, 'symlink', args => { assertWritable(args[1], 'symlink') })
  wrap(fsPromises, 'open', args => {
    if (flagsWantWrite(args[1])) assertWritable(args[0], 'open')
  })
  const patched = [
    'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
    'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename',
    'unlinkSync', 'unlink', 'rmSync', 'rm', 'rmdirSync', 'rmdir',
    'truncateSync', 'truncate', 'mkdirSync', 'mkdir', 'linkSync', 'link',
    'symlinkSync', 'symlink', 'openSync', 'open', 'createWriteStream',
  ]
  for (const name of patched) {
    if (typeof fs[name] === 'function') fsCjs[name] = fs[name]
  }
  const promisePatched = [
    'writeFile', 'appendFile', 'copyFile', 'cp', 'rename', 'unlink', 'rm',
    'rmdir', 'truncate', 'mkdir', 'link', 'symlink', 'open',
  ]
  for (const name of promisePatched) {
    if (typeof fsPromises[name] === 'function') fsPromisesCjs[name] = fsPromises[name]
  }
}

function installChildProcess() {
  proxyFunction(childProcess, 'spawn', applyFencedSpawn)
  proxyFunction(childProcess, 'spawnSync', applyFencedSpawn)

  proxyFunction(childProcess, 'exec', (target, thisArg, argList) => {
    const command = argList[0]
    const options = argList[1]
    const callback = argList[2]
    const opts = typeof options === 'function' ? {} : (options ?? {})
    const cb = typeof options === 'function' ? options : callback
    const cwd = typeof opts.cwd === 'string' ? opts.cwd : process.cwd()
    assertCommand(String(command), cwd)
    const nextOpts = isPreloadExemptLaunch(undefined, [String(command)])
      ? optionsWithoutPreloadNodeOptions(/** @type {Record<string, unknown>} */ (opts))
      : opts
    if (typeof options === 'function') return Reflect.apply(target, thisArg, [command, nextOpts, options])
    if (argList.length === 1) return Reflect.apply(target, thisArg, [command])
    if (argList.length === 2) return Reflect.apply(target, thisArg, [command, nextOpts])
    return Reflect.apply(target, thisArg, [command, nextOpts, cb])
  })

  proxyFunction(childProcess, 'execSync', (target, thisArg, argList) => {
    const command = argList[0]
    const options = argList[1]
    const opts = options ?? {}
    const cwd = typeof opts.cwd === 'string' ? opts.cwd : process.cwd()
    assertCommand(String(command), cwd)
    const nextOpts = isPreloadExemptLaunch(undefined, [String(command)])
      ? optionsWithoutPreloadNodeOptions(/** @type {Record<string, unknown>} */ (opts))
      : opts
    if (argList.length < 2) return Reflect.apply(target, thisArg, [command])
    return Reflect.apply(target, thisArg, [command, nextOpts])
  })

  proxyFunction(childProcess, 'execFile', (target, thisArg, argList) => {
    let file = argList[0]
    let argv = argList[1]
    let opts = argList[2]
    let cb = argList[3]
    if (typeof argv === 'function') {
      cb = argv
      argv = []
      opts = {}
    } else if (argv !== undefined && !Array.isArray(argv)) {
      cb = opts
      opts = argv
      argv = []
    } else if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    const fenced = fenceSpawn(file, Array.isArray(argv) ? argv : [], opts ?? {})
    if (typeof cb === 'function') {
      return Reflect.apply(target, thisArg, [file, fenced.args, fenced.options, cb])
    }
    return Reflect.apply(target, thisArg, [file, fenced.args, fenced.options])
  })

  proxyFunction(childProcess, 'execFileSync', applyFencedSpawn)

  proxyFunction(childProcess, 'fork', (target, thisArg, argList) => {
    const modulePath = argList[0]
    const split = splitSpawn(argList[1], argList[2])
    if (isPreloadExemptLaunch(process.execPath, [modulePath, ...split.args])) {
      const cleared = optionsWithoutPreloadNodeOptions(split.options)
      if (argList.length < 2) return Reflect.apply(target, thisArg, [modulePath])
      if (argList.length === 2 && !Array.isArray(argList[1])) {
        return Reflect.apply(target, thisArg, [modulePath, cleared])
      }
      return Reflect.apply(target, thisArg, [modulePath, split.args, cleared])
    }
    const fenced = fenceSpawn(process.execPath, [modulePath, ...split.args], split.options)
    const execArgv = Array.isArray(fenced.options.execArgv) ? fenced.options.execArgv : []
    const nextExec = argsHaveImport(execArgv) ? execArgv : [...importFlag, ...execArgv]
    const nextOpts = { ...fenced.options, execArgv: nextExec }
    if (argList.length < 2) return Reflect.apply(target, thisArg, [modulePath])
    if (argList.length === 2 && !Array.isArray(argList[1])) {
      return Reflect.apply(target, thisArg, [modulePath, nextOpts])
    }
    return Reflect.apply(target, thisArg, [modulePath, split.args, nextOpts])
  })

  cpCjs.spawn = childProcess.spawn
  cpCjs.spawnSync = childProcess.spawnSync
  cpCjs.exec = childProcess.exec
  cpCjs.execSync = childProcess.execSync
  cpCjs.execFile = childProcess.execFile
  cpCjs.execFileSync = childProcess.execFileSync
  cpCjs.fork = childProcess.fork
}

function installWorkers() {
  const Original = workerThreads.Worker
  workerThreads.Worker = new Proxy(Original, {
    construct(target, args, newTarget) {
      const filename = args[0]
      const options = args[1] !== undefined && typeof args[1] === 'object' && args[1] !== null
        ? /** @type {import('node:worker_threads').WorkerOptions} */ (args[1])
        : {}
      const execArgv = [...(options.execArgv ?? [])]
      const nextExec = argsHaveImport(execArgv) ? execArgv : [...importFlag, ...execArgv]
      return Reflect.construct(target, [filename, { ...options, execArgv: nextExec }], newTarget)
    },
  })
  workerCjs.Worker = workerThreads.Worker
}

if (globalThis[INSTALL_KEY] !== true) {
  globalThis[INSTALL_KEY] = true
  installFs()
  installChildProcess()
  installWorkers()
  syncBuiltinESMExports()
}
