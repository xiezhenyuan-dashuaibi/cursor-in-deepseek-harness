import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAgentArgv, resolveBundledAgent } from '../src/resolve-agent.ts'

const trees: string[] = []

afterEach(async () => {
  await Promise.all(trees.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function fixture(layout: 'windows-node' | 'posix-index' | 'windows-cmd' | 'empty'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cursor-cli-'))
  trees.push(root)
  if (layout === 'empty') return root
  if (layout === 'windows-cmd') {
    await writeFile(join(root, 'agent.cmd'), '@echo off\n')
    return root
  }
  const version = join(root, 'versions', '2026.08.25-3e8eec8')
  await mkdir(version, { recursive: true })
  await writeFile(join(version, 'index.js'), 'console.log("agent")\n')
  if (layout === 'windows-node') await writeFile(join(version, 'node.exe'), '')
  return root
}

describe('resolveAgentArgv', () => {
  it('uses a configured command verbatim', () => {
    expect(resolveAgentArgv('/usr/bin/agent', ['--help'])).toEqual({
      file: '/usr/bin/agent',
      args: ['--help'],
    })
    expect(resolveAgentArgv('/usr/bin/agent')).toEqual({
      file: '/usr/bin/agent',
      args: [],
    })
  })

  it('prefers the bundled versioned node.exe and index.js', async () => {
    const root = await fixture('windows-node')
    expect(resolveAgentArgv('', ['login'], root)).toEqual({
      file: join(root, 'versions', '2026.08.25-3e8eec8', 'node.exe'),
      args: [join(root, 'versions', '2026.08.25-3e8eec8', 'index.js'), 'login'],
    })
  })

  it('falls back to this process Node when the version dir has no node.exe', async () => {
    const root = await fixture('posix-index')
    expect(resolveBundledAgent(root)).toEqual({
      file: process.execPath,
      args: [join(root, 'versions', '2026.08.25-3e8eec8', 'index.js')],
    })
  })

  it('throws when nothing is configured and the bundled tree is empty', async () => {
    const root = await fixture('empty')
    expect(() => resolveAgentArgv('', [], root)).toThrow(/no bundled Cursor CLI/)
  })

  it('consults BUNDLED_CLI_ROOT when cliRoot is omitted', () => {
    try {
      const resolved = resolveAgentArgv('', ['--version'])
      expect(resolved.args.at(-1)).toBe('--version')
    } catch (error) {
      expect(String(error)).toMatch(/no bundled Cursor CLI/)
    }
  })
})

describe('resolveBundledAgent', () => {
  it('uses agent.cmd on Windows when no versions tree exists', async () => {
    const root = await fixture('windows-cmd')
    const resolved = resolveBundledAgent(root)
    if (process.platform === 'win32') {
      expect(resolved).toEqual({ file: join(root, 'agent.cmd'), args: [] })
    } else {
      expect(resolved).toBeUndefined()
    }
  })

  it('uses a bare agent file when no versions tree exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cursor-posix-'))
    trees.push(root)
    await writeFile(join(root, 'agent'), '')
    expect(resolveBundledAgent(root)).toEqual({ file: join(root, 'agent'), args: [] })
  })

  it('ignores a versions tree that has no usable index.js', async () => {
    const unmatched = await mkdtemp(join(tmpdir(), 'dsh-cursor-nover-'))
    trees.push(unmatched)
    await mkdir(join(unmatched, 'versions', 'not-a-version'), { recursive: true })
    expect(resolveBundledAgent(unmatched)).toBeUndefined()

    const noIndex = await mkdtemp(join(tmpdir(), 'dsh-cursor-emptyver-'))
    trees.push(noIndex)
    await mkdir(join(noIndex, 'versions', '2026.08.25-abcdef'), { recursive: true })
    expect(resolveBundledAgent(noIndex)).toBeUndefined()
  })
})
