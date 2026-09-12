import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  buildMcpListArgs,
  classifyDshMcpListOutput,
  DSH_MCP_RETRY_CONNECTED_MS,
  DSH_MCP_RETRY_DISCONNECTED_MS,
  DSH_MCP_RETRY_TIMEOUT_MS,
  dshMcpConnectedFromCliOutput,
  readChildOutput,
  settleDshMcpProbe,
} from '../src/dsh-mcp-status.ts'

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false

  kill(): void {
    this.killed = true
    this.emit('close', 1)
  }
}

describe('dshMcpConnectedFromCliOutput', () => {
  it('treats dsh: ready as connected and ignores pms_mcp', () => {
    expect(dshMcpConnectedFromCliOutput([
      'pms_mcp: Error: Connection failed',
      'dsh: ready',
    ].join('\n'))).toBe(true)
  })

  it('treats a dsh error row as disconnected', () => {
    expect(dshMcpConnectedFromCliOutput('dsh: Error: Connection failed\n')).toBe(false)
    expect(dshMcpConnectedFromCliOutput('→ dsh - error\n')).toBe(false)
  })

  it('accepts list-tools catalog names', () => {
    expect(dshMcpConnectedFromCliOutput('dsh_skill\ndsh_system_prompt\n')).toBe(true)
    expect(dshMcpConnectedFromCliOutput('mcp__dsh__dsh_skill\n')).toBe(true)
  })

  it('returns false when dsh is absent', () => {
    expect(dshMcpConnectedFromCliOutput('pms_mcp: ready\n')).toBe(false)
    expect(dshMcpConnectedFromCliOutput('')).toBe(false)
  })
})

describe('classifyDshMcpListOutput', () => {
  it('stays unknown until dsh speaks', () => {
    expect(classifyDshMcpListOutput('pms_mcp: ready\n')).toBe('unknown')
    expect(classifyDshMcpListOutput('dsh: \n')).toBe('unknown')
    expect(classifyDshMcpListOutput('dsh: starting\n')).toBe('unknown')
  })

  it('accepts ready synonyms on the dsh row', () => {
    expect(classifyDshMcpListOutput('dsh: ok\n')).toBe('connected')
    expect(classifyDshMcpListOutput('dsh_mcp: connected\n')).toBe('connected')
  })
})

describe('settleDshMcpProbe', () => {
  it('keeps checking after a hang that never classified dsh', () => {
    expect(settleDshMcpProbe({ text: 'pms_mcp: Error: timeout\n', timedOut: true })).toEqual({
      status: 'checking',
      retryMs: DSH_MCP_RETRY_TIMEOUT_MS,
    })
  })

  it('treats a clean listing with no dsh row as disconnected', () => {
    expect(settleDshMcpProbe({ text: '', timedOut: false })).toEqual({
      status: 'disconnected',
      retryMs: DSH_MCP_RETRY_DISCONNECTED_MS,
    })
  })

  it('retries connected listings on the long interval', () => {
    expect(settleDshMcpProbe({ text: 'dsh: ready\n', timedOut: false })).toEqual({
      status: 'connected',
      retryMs: DSH_MCP_RETRY_CONNECTED_MS,
    })
  })

  it('retries a dsh error row on the disconnected interval', () => {
    expect(settleDshMcpProbe({
      text: 'dsh: Error: Connection failed\n',
      timedOut: false,
    })).toEqual({
      status: 'disconnected',
      retryMs: DSH_MCP_RETRY_DISCONNECTED_MS,
    })
  })
})

describe('buildMcpListArgs', () => {
  it('keeps trust flags and appends mcp list-tools dsh', () => {
    expect(buildMcpListArgs(['index.js', '--approve-mcps', '--trust', '--print'])).toEqual([
      'index.js',
      '--approve-mcps',
      '--trust',
      'mcp',
      'list-tools',
      'dsh',
    ])
  })
})

describe('readChildOutput', () => {
  it('joins stdout and stderr then settles on close', async () => {
    const child = new FakeChild()
    const pending = readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 5_000)
    child.stdout.write('hello ')
    child.stderr.write('world\n')
    child.emit('close', 0)
    await expect(pending).resolves.toEqual({ text: 'hello world\n', timedOut: false })
  })

  it('kills the child when dsh classifies before close', async () => {
    const child = new FakeChild()
    const pending = readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 5_000)
    child.stdout.write('dsh: ready\n')
    await expect(pending).resolves.toEqual({ text: 'dsh: ready\n', timedOut: false })
    expect(child.killed).toBe(true)
  })

  it('keeps timedOut when kill emits close', async () => {
    const child = new FakeChild()
    await expect(
      readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 20),
    ).resolves.toEqual({ text: '', timedOut: true })
    expect(child.killed).toBe(true)
  })

  it('keeps timedOut when deadline kill throws', async () => {
    const child = new FakeChild()
    child.kill = () => {
      child.killed = true
      throw new Error('ESRCH')
    }
    await expect(
      readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 20),
    ).resolves.toEqual({ text: '', timedOut: true })
    expect(child.killed).toBe(true)
  })

  it('settles on child error', async () => {
    const child = new FakeChild()
    const pending = readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 5_000)
    child.emit('error', new Error('spawn'))
    await expect(pending).resolves.toEqual({ text: '', timedOut: false })
  })

  it('kills on a dsh error row even if kill throws', async () => {
    const child = new FakeChild()
    child.kill = () => {
      child.killed = true
      throw new Error('ESRCH')
    }
    const pending = readChildOutput(child as unknown as ChildProcessWithoutNullStreams, 5_000)
    child.stdout.write('dsh: failed\n')
    await expect(pending).resolves.toEqual({ text: 'dsh: failed\n', timedOut: false })
    expect(child.killed).toBe(true)
  })
})
