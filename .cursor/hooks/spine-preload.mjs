/**
 * Node --import preload for the overlay Cursor CLI: deny fs/child_process
 * writes under the DSH spine even when hooks and --force do not.
 * Policy home: .agents/notes/implemented/process/2026-09-01-cursor-spine-write-deny.md
 */
import childProcess from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import workerThreads from 'node:worker_threads'
import { decide, isProtectedRelative, toRepoRelative } from './protect-spine.mjs'

export const SPINE_FENCE_ROOT_ENV = 'CURSOR_SPINE_FENCE_ROOT'

const INSTALL_KEY = Symbol.for('dsh.cursor.spineFence')
const require = createRequire(import.meta.url)
const fsCjs = require('fs')
const cpCjs = require('child_process')
const workerCjs = require('worker_threads')
const preloadUrl = import.meta.url
const importFlag = ['--import', preloadUrl]

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
 * @param {unknown} raw
 * @param {string} syscall
 */
function assertWritable(raw, syscall) {
  const path = pathString(raw)
  if (path === undefined) return
  const rel = toRepoRelative(path, fenceRoot())
  if (rel === undefined || !isProtectedRelative(rel)) return
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
  const tokens = [pathString(file), ...args.map(arg => typeof arg === 'string' ? arg : String(arg))]
    .filter(token => token !== undefined)
  assertCommand(tokens.join(' '), cwd)
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
  for (const name of Object.getOwnPropertyNames(fs)) {
    if (typeof fs[name] === 'function') fsCjs[name] = fs[name]
  }
}

function installChildProcess() {
  const originalSpawn = childProcess.spawn
  childProcess.spawn = function spawn(file, args, options) {
    const split = splitSpawn(args, options)
    const fenced = fenceSpawn(file, split.args, split.options)
    return originalSpawn.call(this, file, fenced.args, fenced.options)
  }
  const originalSpawnSync = childProcess.spawnSync
  childProcess.spawnSync = function spawnSync(file, args, options) {
    const split = splitSpawn(args, options)
    const fenced = fenceSpawn(file, split.args, split.options)
    return originalSpawnSync.call(this, file, fenced.args, fenced.options)
  }
  const originalExec = childProcess.exec
  childProcess.exec = function exec(command, options, callback) {
    const opts = typeof options === 'function' ? {} : (options ?? {})
    const cb = typeof options === 'function' ? options : callback
    const cwd = typeof opts.cwd === 'string' ? opts.cwd : process.cwd()
    assertCommand(String(command), cwd)
    return originalExec.call(this, command, opts, cb)
  }
  const originalExecFile = childProcess.execFile
  childProcess.execFile = function execFile(file, args, options, callback) {
    let argv = args
    let opts = options
    let cb = callback
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
    return originalExecFile.call(this, file, fenced.args, fenced.options, cb)
  }
  const originalFork = childProcess.fork
  childProcess.fork = function fork(modulePath, args, options) {
    const split = splitSpawn(args, options)
    const fenced = fenceSpawn(process.execPath, [modulePath, ...split.args], split.options)
    const execArgv = Array.isArray(fenced.options.execArgv) ? fenced.options.execArgv : []
    const nextExec = argsHaveImport(execArgv) ? execArgv : [...importFlag, ...execArgv]
    return originalFork.call(this, modulePath, split.args, { ...fenced.options, execArgv: nextExec })
  }
  cpCjs.spawn = childProcess.spawn
  cpCjs.spawnSync = childProcess.spawnSync
  cpCjs.exec = childProcess.exec
  cpCjs.execFile = childProcess.execFile
  cpCjs.fork = childProcess.fork
}

function installWorkers() {
  const Original = workerThreads.Worker
  class FencedWorker extends Original {
    /**
     * @param {string | URL} filename
     * @param {import('node:worker_threads').WorkerOptions} [options]
     */
    constructor(filename, options = {}) {
      const execArgv = [...(options.execArgv ?? [])]
      const nextExec = argsHaveImport(execArgv) ? execArgv : [...importFlag, ...execArgv]
      super(filename, { ...options, execArgv: nextExec })
    }
  }
  workerThreads.Worker = FencedWorker
  workerCjs.Worker = FencedWorker
}

if (globalThis[INSTALL_KEY] !== true) {
  globalThis[INSTALL_KEY] = true
  installFs()
  installChildProcess()
  installWorkers()
}
