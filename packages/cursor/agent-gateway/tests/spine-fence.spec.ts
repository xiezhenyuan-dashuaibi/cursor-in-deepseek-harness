import { symlinkSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applySpineFence,
  isDshHarnessCheckout,
  isNodeProgram,
  mergeNodeOptions,
  resolvePackagedPreload,
  SPINE_FENCE_ROOT_ENV,
} from '../src/spine-fence.ts'

const trees: string[] = []
const preload = resolvePackagedPreload()

afterEach(async () => {
  await Promise.all(trees.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function harnessCheckout(options?: {
  readonly name?: string
  readonly json?: string
  readonly skipCore?: boolean
  readonly skipBoot?: boolean
  readonly skipVendor?: boolean
  readonly skipNative?: boolean
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-spine-cwd-'))
  trees.push(root)
  await mkdir(join(root, 'packages', 'cursor', 'agent-gateway'), { recursive: true })
  if (options?.skipBoot !== true) await mkdir(join(root, 'packages', 'boot'), { recursive: true })
  if (options?.skipVendor !== true) await mkdir(join(root, 'vendor'), { recursive: true })
  if (options?.skipNative !== true) await mkdir(join(root, 'native'), { recursive: true })
  if (options?.skipCore !== true) await mkdir(join(root, 'packages', 'core'), { recursive: true })
  const body = options?.json ?? JSON.stringify({
    name: options?.name ?? '@deepseek-ai/dsh-cursor-agent-gateway',
  })
  await writeFile(join(root, 'packages', 'cursor', 'agent-gateway', 'package.json'), body)
  return root
}

describe('isDshHarnessCheckout', () => {
  it('rejects a directory that is not this harness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-not-harness-'))
    trees.push(root)
    expect(isDshHarnessCheckout(root)).toBe(false)
  })

  it('rejects a partial tree or a wrong package name', async () => {
    const missingCore = await harnessCheckout({ skipCore: true })
    expect(isDshHarnessCheckout(missingCore)).toBe(false)
    const missingBoot = await harnessCheckout({ skipBoot: true })
    expect(isDshHarnessCheckout(missingBoot)).toBe(false)
    const missingVendor = await harnessCheckout({ skipVendor: true })
    expect(isDshHarnessCheckout(missingVendor)).toBe(false)
    const missingNative = await harnessCheckout({ skipNative: true })
    expect(isDshHarnessCheckout(missingNative)).toBe(false)
    const wrongName = await harnessCheckout({ name: '@acme/other' })
    expect(isDshHarnessCheckout(wrongName)).toBe(false)
    const broken = await harnessCheckout({ json: '{not json' })
    expect(isDshHarnessCheckout(broken)).toBe(false)
  })

  it('accepts this package name plus the spine directories', async () => {
    const root = await harnessCheckout()
    expect(isDshHarnessCheckout(root)).toBe(true)
    expect(isDshHarnessCheckout(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'))).toBe(true)
  })
})

describe('resolvePackagedPreload', () => {
  it('finds fence/preload.mjs from this module', () => {
    expect(preload).toBeDefined()
    expect(preload?.replaceAll('\\', '/')).toMatch(/fence\/preload\.mjs$/)
  })

  it('returns undefined when no ancestor carries the preload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-no-fence-'))
    trees.push(root)
    expect(resolvePackagedPreload(join(root, 'nested', 'file.ts'))).toBeUndefined()
    expect(resolvePackagedPreload(join(root, 'file.ts'))).toBeUndefined()
    let deep = root
    for (let i = 0; i < 10; i += 1) deep = join(deep, 'd')
    await mkdir(deep, { recursive: true })
    expect(resolvePackagedPreload(join(deep, 'file.ts'))).toBeUndefined()
    const rootish = process.platform === 'win32' ? 'C:\\dsh-spine-walk.ts' : '/dsh-spine-walk.ts'
    expect(resolvePackagedPreload(rootish)).toBeUndefined()
  })
})

describe('isNodeProgram / mergeNodeOptions', () => {
  it('detects node executables and merges --import', () => {
    expect(isNodeProgram('/usr/bin/node')).toBe(true)
    expect(isNodeProgram('C:\\\\Program Files\\\\nodejs\\\\node.exe')).toBe(true)
    expect(isNodeProgram('/usr/bin/agent')).toBe(false)
    const url = 'file:///preload.mjs'
    expect(mergeNodeOptions('', url)).toBe(`--import ${url}`)
    expect(mergeNodeOptions('--trace-uncaught', url)).toBe(`--trace-uncaught --import ${url}`)
    expect(mergeNodeOptions(`--import ${url}`, url)).toBe(`--import ${url}`)
  })
})

describe('applySpineFence', () => {
  it('leaves a non-harness cwd unchanged', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-user-proj-'))
    trees.push(cwd)
    const env = { PATH: '/bin' }
    expect(applySpineFence({
      file: process.execPath,
      args: ['index.js', '--print'],
      cwd,
      env,
    })).toEqual({ file: process.execPath, args: ['index.js', '--print'], env })
  })

  it('injects --import and NODE_OPTIONS for Node on a harness checkout', async () => {
    const cwd = await harnessCheckout()
    const fenced = applySpineFence({
      file: process.execPath,
      args: ['index.js', '--force'],
      cwd,
      env: { PATH: '/bin' },
    })
    expect(fenced.args[0]).toBe('--import')
    expect(fenced.args[1]).toMatch(/preload\.mjs$/)
    expect(fenced.args.slice(2)).toEqual(['index.js', '--force'])
    expect(fenced.env[SPINE_FENCE_ROOT_ENV]).toBe(cwd)
    expect(fenced.env.NODE_OPTIONS).toContain('--import')
  })

  it('does not duplicate an already-injected --import', async () => {
    const cwd = await harnessCheckout()
    const first = applySpineFence({
      file: process.execPath,
      args: ['index.js'],
      cwd,
      env: {},
    })
    const second = applySpineFence({
      file: process.execPath,
      args: first.args,
      cwd,
      env: first.env,
    })
    expect(second.args.filter(arg => arg === '--import')).toHaveLength(1)
  })

  it('uses NODE_OPTIONS when the program is not Node', async () => {
    const cwd = await harnessCheckout()
    const fenced = applySpineFence({
      file: '/usr/bin/agent',
      args: ['--print'],
      cwd,
      env: {},
    })
    expect(fenced.args).toEqual(['--print'])
    expect(fenced.env.NODE_OPTIONS).toContain('--import')
  })

  it('fails closed when the packaged preload is missing', async () => {
    const cwd = await harnessCheckout()
    expect(() => applySpineFence({
      file: process.execPath,
      args: [],
      cwd,
      env: {},
      preloadPath: join(cwd, 'missing-preload.mjs'),
    })).toThrow(/missing fence\/preload\.mjs/)
    const isolated = await mkdtemp(join(tmpdir(), 'dsh-locate-'))
    trees.push(isolated)
    expect(() => applySpineFence({
      file: process.execPath,
      args: [],
      cwd,
      env: {},
      locateFrom: join(isolated, 'file.ts'),
    })).toThrow(/missing fence\/preload\.mjs/)
  })
})

describe('spine preload', () => {
  it('denies a spine write and allows a Cursor-tree write in a real Node child', async () => {
    expect(preload).toBeDefined()
    const repo = await mkdtemp(join(tmpdir(), 'dsh-spine-repo-'))
    trees.push(repo)
    const spine = join(repo, 'packages', 'core', 'keep.txt')
    const allowed = join(repo, 'packages', 'cursor', 'ok.txt')
    await mkdir(dirname(spine), { recursive: true })
    await mkdir(dirname(allowed), { recursive: true })
    await writeFile(spine, 'safe\n')
    const probe = join(repo, 'probe.mjs')
    await writeFile(probe, `
import { copyFileSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const spine = ${JSON.stringify(spine)}
const allowed = ${JSON.stringify(allowed)}
let denied = 0
try { writeFileSync(spine, 'owned') } catch (error) {
  if (error && error.code === 'EACCES') denied += 1
}
try { await writeFile(spine, 'owned') } catch (error) {
  if (error && error.code === 'EACCES') denied += 1
}
try { copyFileSync(spine, ${JSON.stringify(join(repo, 'packages', 'core', 'copy.txt'))}) } catch (error) {
  if (error && error.code === 'EACCES') denied += 1
}
try { openSync(spine, 'w') } catch (error) {
  if (error && error.code === 'EACCES') denied += 1
}
const readFd = openSync(spine, 'r')
if (typeof readFd !== 'number') throw new Error('read open failed')
try {
  spawnSync('rm', [spine], { encoding: 'utf8' })
} catch (error) {
  if (error && error.code === 'EACCES') denied += 1
}
writeFileSync(allowed, 'ok')
if (readFileSync(spine, 'utf8') !== 'safe\\n') throw new Error('spine mutated')
if (denied < 5) throw new Error('expected denials, got ' + denied)
`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload!).href, probe], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [SPINE_FENCE_ROOT_ENV]: repo,
        NODE_OPTIONS: '',
      },
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(await readFile(spine, 'utf8')).toBe('safe\n')
    expect(await readFile(allowed, 'utf8')).toBe('ok')
  })

  it('allows node_modules writes under spine prefixes and still denies spine source', async () => {
    expect(preload).toBeDefined()
    const repo = await mkdtemp(join(tmpdir(), 'dsh-spine-nm-'))
    trees.push(repo)
    const source = join(repo, 'native', 'keep.txt')
    const pkg = join(repo, 'native', 'landlock-run')
    const artifact = join(pkg, 'node_modules', 'react', 'index.js')
    await mkdir(dirname(source), { recursive: true })
    await mkdir(pkg, { recursive: true })
    await writeFile(source, 'safe\n')
    const probe = join(repo, 'probe.mjs')
    await writeFile(probe, `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const source = ${JSON.stringify(source)}
const artifact = ${JSON.stringify(artifact)}
mkdirSync(${JSON.stringify(dirname(artifact))}, { recursive: true })
writeFileSync(artifact, 'linked')
let denied = false
try { writeFileSync(source, 'owned') } catch (error) {
  denied = Boolean(error && error.code === 'EACCES')
}
if (!denied) throw new Error('spine source write must stay denied')
if (readFileSync(source, 'utf8') !== 'safe\\n') throw new Error('spine mutated')
if (readFileSync(artifact, 'utf8') !== 'linked') throw new Error('install artifact missing')
`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload!).href, probe], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [SPINE_FENCE_ROOT_ENV]: repo,
        NODE_OPTIONS: '',
      },
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(await readFile(source, 'utf8')).toBe('safe\n')
    expect(await readFile(artifact, 'utf8')).toBe('linked')
  })

  it('denies writes that leave node_modules through a link into spine source', async () => {
    expect(preload).toBeDefined()
    const repo = await mkdtemp(join(tmpdir(), 'dsh-spine-nm-link-'))
    trees.push(repo)
    const keepDir = join(repo, 'native', 'keep-dir')
    const source = join(keepDir, 'keep.txt')
    const nm = join(repo, 'native', 'landlock-run', 'node_modules')
    const escape = join(nm, 'escape')
    const through = join(escape, 'keep.txt')
    const artifact = join(nm, 'react', 'index.js')
    await mkdir(keepDir, { recursive: true })
    await mkdir(nm, { recursive: true })
    await writeFile(source, 'safe\n')
    symlinkSync(keepDir, escape, process.platform === 'win32' ? 'junction' : 'dir')
    const probe = join(repo, 'probe.mjs')
    await writeFile(probe, `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const source = ${JSON.stringify(source)}
const through = ${JSON.stringify(through)}
const artifact = ${JSON.stringify(artifact)}
mkdirSync(${JSON.stringify(dirname(artifact))}, { recursive: true })
writeFileSync(artifact, 'linked')
let denied = false
try { writeFileSync(through, 'owned') } catch (error) {
  denied = Boolean(error && error.code === 'EACCES')
}
if (!denied) throw new Error('symlink hop into spine source must stay denied')
if (readFileSync(source, 'utf8') !== 'safe\\n') throw new Error('spine mutated')
if (readFileSync(artifact, 'utf8') !== 'linked') throw new Error('install artifact missing')
`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload!).href, probe], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [SPINE_FENCE_ROOT_ENV]: repo,
        NODE_OPTIONS: '',
      },
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(await readFile(source, 'utf8')).toBe('safe\n')
    expect(await readFile(artifact, 'utf8')).toBe('linked')
  })

  it('allows replacing a node_modules workspace symlink whose realpath is spine source', async () => {
    expect(preload).toBeDefined()
    const repo = await mkdtemp(join(tmpdir(), 'dsh-spine-nm-relink-'))
    trees.push(repo)
    const target = join(repo, 'vendor', 'cordis')
    const source = join(target, 'keep.txt')
    const nm = join(repo, 'native', 'landlock-run', 'node_modules')
    const link = join(nm, 'cordis')
    const through = join(link, 'keep.txt')
    await mkdir(target, { recursive: true })
    await mkdir(nm, { recursive: true })
    await writeFile(source, 'safe\n')
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(target, link, linkType)
    const probe = join(repo, 'probe.mjs')
    await writeFile(probe, `
import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
const target = ${JSON.stringify(target)}
const link = ${JSON.stringify(link)}
const through = ${JSON.stringify(through)}
const source = ${JSON.stringify(source)}
const type = ${JSON.stringify(linkType)}
unlinkSync(link)
symlinkSync(target, link, type)
let denied = false
try { writeFileSync(through, 'owned') } catch (error) {
  denied = Boolean(error && error.code === 'EACCES')
}
if (!denied) throw new Error('write through relinked workspace symlink must stay denied')
if (readFileSync(source, 'utf8') !== 'safe\\n') throw new Error('spine mutated')
`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload!).href, probe], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [SPINE_FENCE_ROOT_ENV]: repo,
        NODE_OPTIONS: '',
      },
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(await readFile(source, 'utf8')).toBe('safe\n')
  })

  it('does not inject the preload into MCP stdio or worker-server children', async () => {
    expect(preload).toBeDefined()
    const repo = await mkdtemp(join(tmpdir(), 'dsh-mcp-exempt-'))
    trees.push(repo)
    const mcpEntry = join(repo, 'packages', 'cursor', 'mcp-server', 'bin', 'stdio.mjs')
    const workerEntry = join(repo, 'index.js')
    const plainEntry = join(repo, 'plain-child.mjs')
    const mcpReport = join(repo, 'mcp-report.txt')
    const workerReport = join(repo, 'worker-report.txt')
    const plainReport = join(repo, 'plain-report.txt')
    await mkdir(dirname(mcpEntry), { recursive: true })
    const childBody = (reportEnv: string) => `
const report = process.env[${JSON.stringify(reportEnv)}]
const installed = globalThis[Symbol.for('dsh.cursor.spineFence')] === true
await import('node:fs/promises').then(fs => fs.writeFile(report, installed ? 'fenced' : 'clear'))
`
    await writeFile(mcpEntry, childBody('MCP_REPORT'))
    await writeFile(workerEntry, childBody('WORKER_REPORT'))
    await writeFile(plainEntry, childBody('PLAIN_REPORT'))
    const parent = join(repo, 'parent.mjs')
    await writeFile(parent, `
import { spawnSync } from 'node:child_process'
const node = process.execPath
const runs = [
  [ [${JSON.stringify(mcpEntry)}], 'MCP_REPORT', ${JSON.stringify(mcpReport)} ],
  [ [${JSON.stringify(workerEntry)}, 'worker-server'], 'WORKER_REPORT', ${JSON.stringify(workerReport)} ],
  [ [${JSON.stringify(plainEntry)}], 'PLAIN_REPORT', ${JSON.stringify(plainReport)} ],
]
for (const [args, envKey, report] of runs) {
  const result = spawnSync(node, args, {
    encoding: 'utf8',
    env: { ...process.env, [envKey]: report },
  })
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
}
`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload!).href, parent], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [SPINE_FENCE_ROOT_ENV]: repo,
        NODE_OPTIONS: `--import ${pathToFileURL(preload!).href}`,
      },
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(await readFile(mcpReport, 'utf8')).toBe('clear')
    expect(await readFile(workerReport, 'utf8')).toBe('clear')
    expect(await readFile(plainReport, 'utf8')).toBe('fenced')
  })
})
