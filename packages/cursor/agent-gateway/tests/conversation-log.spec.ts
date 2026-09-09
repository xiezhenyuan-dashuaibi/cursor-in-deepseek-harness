import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capLogText,
  conversationLogFilePath,
  createFileConversationLog,
  DEFAULT_CONVERSATION_LOG_MAX_BYTES,
  MAX_CONVERSATION_LOG_RECORD_CHARS,
  REDACTED,
  redactSecrets,
  resolveConversationLogRoot,
} from '../src/conversation-log.ts'

const trees: string[] = []

afterEach(async () => {
  await Promise.all(trees.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cursor-log-'))
  trees.push(dir)
  return dir
}

function linesOf(path: string): Record<string, unknown>[] {
  const raw = readFileSync(path, 'utf8').trimEnd()
  if (raw.length === 0) return []
  return raw.split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('resolveConversationLogRoot', () => {
  it('defaults under cwd and joins a relative override', () => {
    expect(resolveConversationLogRoot('', '/work')).toBe(join('/work', '.cursor', 'dsh-logs', 'conversations'))
    expect(resolveConversationLogRoot('logs', '/work')).toBe(join('/work', 'logs'))
  })

  it('keeps an absolute override', () => {
    const absolute = process.platform === 'win32' ? 'D:\\overlay-logs' : '/tmp/overlay-logs'
    expect(resolveConversationLogRoot(absolute, '/work')).toBe(absolute)
  })
})

describe('conversationLogFilePath', () => {
  it('uses the local calendar day and sanitizes the session id', () => {
    const at = new Date(2026, 0, 5, 12, 0, 0)
    expect(conversationLogFilePath('/root', 'ab/c def', at)).toBe(join('/root', '2026-01-05', 'abcdef.jsonl'))
    expect(conversationLogFilePath('/root', '@@@', at)).toBe(join('/root', '2026-01-05', 'session.jsonl'))
    expect(conversationLogFilePath('/root', 'sess-1_2', at)).toBe(join('/root', '2026-01-05', 'sess-1_2.jsonl'))
  })
})

describe('redactSecrets and capLogText', () => {
  it('replaces keys, bearer tokens, and login query secrets', () => {
    expect(redactSecrets('sk-abcdefghijk')).toBe(REDACTED)
    expect(redactSecrets('Bearer abc.def')).toBe(`Bearer ${REDACTED}`)
    expect(redactSecrets('CURSOR_API_KEY=secret-value')).toBe(`CURSOR_API_KEY=${REDACTED}`)
    expect(capLogText('x'.repeat(MAX_CONVERSATION_LOG_RECORD_CHARS + 8)).length)
      .toBe(MAX_CONVERSATION_LOG_RECORD_CHARS)
  })
})

describe('createFileConversationLog', () => {
  it('writes prompt and cursor_event rows with lifecycle bookends', async () => {
    const root = await tempDir()
    const log = createFileConversationLog({
      rootDir: root,
      sessionId: 'chat-1',
      maxFileBytes: DEFAULT_CONVERSATION_LOG_MAX_BYTES,
      now: () => new Date(2026, 7, 31, 12, 0, 0),
    })
    log.append({ kind: 'event', event: 'open' })
    log.append({ kind: 'prompt', text: 'hello' })
    log.append({
      kind: 'spawn',
      file: 'agent',
      cwd: '/work',
      args: ['--approve-mcps', '--trust', '--print', '--', 'secret sk-abcdefghijklmnop'],
      approveMcps: true,
      resume: false,
    })
    log.append({ kind: 'cursor_event', event: { type: 'assistant', message: { role: 'assistant' } } })
    log.append({ kind: 'event', event: 'exit', exitCode: 0, message: 'done' })
    log.close()
    const files = globSync('**/*.jsonl', { cwd: root })
    expect(files).toHaveLength(1)
    const rows = linesOf(join(root, files[0]!))
    expect(rows.map(row => row.kind)).toEqual([
      'event',
      'prompt',
      'spawn',
      'cursor_event',
      'event',
      'event',
    ])
    expect(rows[1]).toMatchObject({ kind: 'prompt', text: 'hello' })
    expect(rows[2]).toMatchObject({
      kind: 'spawn',
      approveMcps: true,
      resume: false,
      args: ['--approve-mcps', '--trust', '--print', '--', '[prompt]'],
    })
  })

  it('emits truncated once the sized payload would exceed the cap', async () => {
    const root = await tempDir()
    const log = createFileConversationLog({
      rootDir: root,
      sessionId: 'big',
      maxFileBytes: 220,
      now: () => new Date(2026, 7, 31, 12, 0, 0),
    })
    log.append({ kind: 'prompt', text: 'x'.repeat(40) })
    log.append({ kind: 'prompt', text: 'y'.repeat(40) })
    log.append({ kind: 'prompt', text: 'ignored' })
    log.close()
    const rows = linesOf(log.path)
    expect(rows.some(row => row.event === 'truncated')).toBe(true)
    expect(rows.filter(row => row.kind === 'prompt')).toHaveLength(1)
  })

  it('swallows disk errors when a parent path is a file', async () => {
    const root = await tempDir()
    const blocker = join(root, '2026-08-31')
    writeFileSync(blocker, 'not-a-dir')
    const log = createFileConversationLog({
      rootDir: root,
      sessionId: 'blocked',
      maxFileBytes: 1024,
      now: () => new Date(2026, 7, 31, 12, 0, 0),
    })
    log.append({ kind: 'prompt', text: 'hello' })
    log.close()
    expect(globSync('**/*.jsonl', { cwd: root })).toEqual([])
  })

  it('creates nested directories', async () => {
    const root = await tempDir()
    mkdirSync(join(root, 'keep'), { recursive: true })
    const log = createFileConversationLog({
      rootDir: join(root, 'nested'),
      sessionId: 'ok',
      maxFileBytes: 1024,
      now: () => new Date(2026, 0, 1, 0, 0, 0),
    })
    log.append({ kind: 'event', event: 'open' })
    log.close()
    expect(readFileSync(log.path, 'utf8')).toContain('"event":"open"')
  })

  it('uses the wall clock when now is omitted', async () => {
    const root = await tempDir()
    const log = createFileConversationLog({
      rootDir: root,
      sessionId: 'clock',
      maxFileBytes: 1024,
    })
    log.append({ kind: 'event', event: 'open' })
    log.close()
    expect(readFileSync(log.path, 'utf8')).toContain('"event":"open"')
  })
})
