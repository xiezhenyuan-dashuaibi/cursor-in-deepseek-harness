import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { PassThrough, Readable } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer, { type WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import WebSocket, { WebSocketServer } from 'ws'
import {
  apply,
  attachAgentChat,
  CURSOR_AGENT_PTY_PATH,
  inject,
  mountCursorAgentGateway,
  name,
} from '../src/index.ts'
import type { AgentChatRuntime } from '../src/chat-session.ts'
import type { InteractivePty } from '../src/pty-session.ts'
import type { ConversationLog } from '../src/conversation-log.ts'

const running: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(running.splice(0).map(close => close()))
})

function fakeWebServer(upgrades: WebUpgradeRoute[]): Pick<WebServer, 'registerUpgrade'> {
  return {
    registerUpgrade(route) {
      upgrades.push(route)
      return () => { upgrades.splice(upgrades.indexOf(route), 1) }
    },
  }
}

function fakeRequest(headers: Record<string, string>): IncomingMessage {
  const request = Readable.from([]) as unknown as IncomingMessage
  Object.assign(request, { url: CURSOR_AGENT_PTY_PATH, method: 'GET', headers })
  return request
}

interface PtyHarness {
  readonly writes: string[]
  readonly spawns: Array<{ file: string; args: readonly string[]; cwd: string }>
  killed: boolean
  emitData(data: string): void
  emitExit(code: number): void
  readonly pty: InteractivePty
}

interface HeadlessHarness {
  readonly spawns: Array<{ file: string; args: readonly string[]; cwd: string }>
  readonly children: FakeChild[]
  spawn: (
    file: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  ) => ChildProcessWithoutNullStreams
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false

  kill(): void {
    this.killed = true
    queueMicrotask(() => { this.emit('close', 0) })
  }

  emitLine(line: string): void {
    this.stdout.write(`${line}\n`)
  }

  emitExit(code: number, stderr = ''): void {
    if (stderr.length > 0) this.stderr.write(stderr)
    queueMicrotask(() => { this.emit('close', code) })
  }
}

function memoryLog(): { records: object[]; log: ConversationLog } {
  const records: object[] = []
  let closed = false
  return {
    records,
    log: {
      sessionId: 's',
      path: 's.jsonl',
      append(input) { records.push(input) },
      close() {
        if (closed) return
        closed = true
        records.push({ kind: 'event', event: 'close' })
      },
    },
  }
}

function createPtyHarness(): PtyHarness {
  const writes: string[] = []
  const spawns: Array<{ file: string; args: readonly string[]; cwd: string }> = []
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(code: number) => void>()
  const harness: PtyHarness = {
    writes,
    spawns,
    killed: false,
    emitData(data) {
      for (const listener of dataListeners) listener(data)
    },
    emitExit(code) {
      for (const listener of exitListeners) listener(code)
    },
    pty: {
      write(data) { writes.push(data) },
      resize() {},
      kill() { harness.killed = true },
      onData(listener) { dataListeners.add(listener) },
      onExit(listener) { exitListeners.add(listener) },
    },
  }
  return harness
}

function createHeadlessHarness(): HeadlessHarness {
  const spawns: Array<{ file: string; args: readonly string[]; cwd: string }> = []
  const children: FakeChild[] = []
  return {
    spawns,
    children,
    spawn(file, args, options) {
      spawns.push({ file, args: [...args], cwd: options.cwd })
      const child = new FakeChild()
      children.push(child)
      return child as unknown as ChildProcessWithoutNullStreams
    },
  }
}

function messagePump(client: WebSocket): {
  next: () => Promise<Record<string, unknown>>
  readonly seen: readonly Record<string, unknown>[]
} {
  const queue: Record<string, unknown>[] = []
  const seen: Record<string, unknown>[] = []
  const waiters: Array<(value: Record<string, unknown>) => void> = []
  client.on('message', (frame) => {
    const msg = JSON.parse(String(frame)) as Record<string, unknown>
    seen.push(msg)
    const waiter = waiters.shift()
    if (waiter !== undefined) waiter(msg)
    else queue.push(msg)
  })
  return {
    seen,
    next: () => {
      if (queue.length > 0) return Promise.resolve(queue.shift()!)
      return new Promise((resolve) => { waiters.push(resolve) })
    },
  }
}

async function serveChat(attach: (websocket: WebSocket) => void): Promise<{ origin: string }> {
  const http = createServer()
  const acceptor = new WebSocketServer({ noServer: true })
  http.on('upgrade', (request, socket, head) => {
    acceptor.handleUpgrade(request, socket, head, attach)
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  running.push(async () => {
    for (const client of acceptor.clients) client.terminate()
    acceptor.close()
    await new Promise<void>(resolve => http.close(() => { resolve() }))
  })
  const port = (http.address() as AddressInfo).port
  return { origin: `ws://127.0.0.1:${String(port)}` }
}

async function openIdleSession(options?: {
  log?: ConversationLog
}): Promise<{
  origin: string
  client: WebSocket
  messages: ReturnType<typeof messagePump>
  pty: PtyHarness
  headless: HeadlessHarness
  runtime: AgentChatRuntime
}> {
  const pty = createPtyHarness()
  const headless = createHeadlessHarness()
  let runtime: AgentChatRuntime | undefined
  const { origin } = await serveChat((websocket) => {
    if (runtime === undefined) {
      runtime = attachAgentChat(websocket, {
        file: 'agent',
        args: ['--approve-mcps', '--trust'],
        cwd: '/work',
        ...(options?.log !== undefined ? { log: options.log } : {}),
        spawnChild: (file, args, spawnOptions) => {
          pty.spawns.push({ file, args, cwd: spawnOptions.cwd })
          return pty.pty
        },
        spawnHeadless: headless.spawn,
      })
      return
    }
    runtime.bind(websocket)
  })
  running.push(async () => { runtime?.shutdown() })
  const client = new WebSocket(`${origin}/`)
  const messages = messagePump(client)
  await once(client, 'open')
  expect(await messages.next()).toEqual({ op: 'ready' })
  expect(await messages.next()).toMatchObject({
    op: 'snapshot',
    status: 'starting',
    events: [],
    followUps: [],
    cursorSessionId: null,
  })
  // First paint must differ from the empty initial mirror so `{op:"mirror"}` publishes.
  pty.emitData('\x1b[2J\x1b[H→ ready\n')
  expect(await messages.next()).toMatchObject({ op: 'mirror', input: 'ready' })
  expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })
  pty.emitData('\x1b[2J\x1b[H→ \n')
  expect(await messages.next()).toMatchObject({ op: 'mirror', input: '' })
  return { origin, client, messages, pty, headless, runtime: runtime as AgentChatRuntime }
}

describe('cursor-agent-gateway plugin', () => {
  it('declares its name and webServer inject', () => {
    expect(name).toBe('cursor-agent-gateway')
    expect(inject).toEqual(['webServer'])
  })

  it('registers /cursor-agent and removes it on teardown', async () => {
    const upgrades: WebUpgradeRoute[] = []
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer(upgrades))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(upgrades.map(route => route.path)).toEqual([CURSOR_AGENT_PTY_PATH])
    await fiber.dispose()
    expect(upgrades).toHaveLength(0)
  })

  it('rejects an untrusted upgrade before protocol negotiation', () => {
    const upgrades: WebUpgradeRoute[] = []
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer(upgrades))
    mountCursorAgentGateway(ctx, { trustedHosts: [], agentCommand: 'agent', logConversations: false })
    const ended: string[] = []
    const socket = Object.assign(new EventEmitter(), {
      end(payload: string) { ended.push(payload) },
    })
    void upgrades[0]!.handler(fakeRequest({ host: 'evil.example' }), socket as never, Buffer.alloc(0))
    expect(ended[0]).toMatch(/403 Forbidden/)
  })

  it('spawns an interactive PTY on connect and strips print flags', async () => {
    const harness = createPtyHarness()
    const logRoot = await mkdtemp(join(tmpdir(), 'dsh-cursor-logmount-'))
    running.push(async () => { await rm(logRoot, { recursive: true, force: true }) })
    const ctx = new Context()
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    mountCursorAgentGateway(ctx, {
      agentCommand: '/usr/bin/agent',
      agentArgs: ['--approve-mcps', '--trust', '--print', '--force'],
      trustedHosts: [],
      cwd: logRoot,
      conversationLogDir: join(logRoot, 'logs'),
      logConversations: true,
    }, (file, args, options) => {
      harness.spawns.push({ file, args, cwd: options.cwd })
      return harness.pty
    })
    running.push(async () => { await ctx.fiber.dispose() })
    const client = new WebSocket(`ws://127.0.0.1:${String(ctx.webServer.port)}${CURSOR_AGENT_PTY_PATH}`)
    const messages = messagePump(client)
    await once(client, 'open')
    expect(await messages.next()).toEqual({ op: 'ready' })
    expect(await messages.next()).toMatchObject({
      op: 'snapshot',
      status: 'starting',
    })
    expect(harness.spawns).toHaveLength(1)
    expect(harness.spawns[0]).toMatchObject({
      file: '/usr/bin/agent',
      cwd: logRoot,
    })
    expect(harness.spawns[0]!.args).toEqual(['--approve-mcps', '--trust'])
    client.close()
  })

  it('sends an error frame when the CLI cannot be resolved', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'dsh-cursor-empty-'))
    running.push(async () => { await rm(empty, { recursive: true, force: true }) })
    const ctx = new Context()
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    mountCursorAgentGateway(ctx, { agentCommand: '', cliRoot: empty, trustedHosts: [], logConversations: false })
    running.push(async () => { await ctx.fiber.dispose() })
    const client = new WebSocket(`ws://127.0.0.1:${String(ctx.webServer.port)}${CURSOR_AGENT_PTY_PATH}`)
    const messages = messagePump(client)
    await once(client, 'open')
    expect(await messages.next()).toMatchObject({ op: 'error' })
  })

  it('forwards keys into the PTY and publishes a below-prompt mirror', async () => {
    const { client, messages, pty } = await openIdleSession()
    client.send(JSON.stringify({ op: 'keys', data: '/' }))
    await vi.waitFor(() => {
      expect(pty.writes).toContain('/')
    })
    pty.emitData(
      '\x1b[2J\x1b[H→ /\n\x1b[7m→ /model [filter]           Select model\x1b[27m\n     /ask                      Toggle ask\n',
    )
    const mirror = await messages.next()
    expect(mirror).toMatchObject({
      op: 'mirror',
      input: '/',
    })
    const below = (mirror as { below: Array<{ text: string; highlighted: boolean }> }).below
    expect(below.some(row => row.text.includes('/model'))).toBe(true)
    expect(below.some(row => row.text.includes('/ask'))).toBe(true)
    expect(below[0]?.highlighted).toBe(true)
    client.close()
  })

  it('Enter on the idle home tip only reaches the PTY and does not start a headless turn', async () => {
    const { client, messages, pty, headless } = await openIdleSession()
    // Idle tip collapses to the empty bar; equal mirrors may skip a frame.
    pty.emitData(
      '\x1b[2J\x1b[H→ Plan, search, build anything\nAvailable models Max mode: OFF\n',
    )
    client.send(JSON.stringify({ op: 'keys', data: '\r' }))
    await vi.waitFor(() => {
      expect(pty.writes.some(item => item.includes('\r'))).toBe(true)
    })
    expect(headless.spawns).toHaveLength(0)
    expect(messages.seen.some(frame => (
      frame.op === 'status' && frame.status === 'running'
    ))).toBe(false)
    client.close()
  })

  it('spawns a headless stream-json turn on prompt and forwards assistant deltas', async () => {
    const { log, records } = memoryLog()
    const { client, messages, headless, pty } = await openIdleSession({ log })
    client.send(JSON.stringify({ op: 'prompt', text: 'hello' }))
    expect(await messages.next()).toMatchObject({ op: 'status', status: 'running' })
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: { type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } },
    })
    await vi.waitFor(() => {
      expect(headless.spawns).toHaveLength(1)
    })
    expect(headless.spawns[0]!.args).toEqual(expect.arrayContaining([
      '--print',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--force',
      '--',
      'hello',
    ]))
    expect(pty.writes.some(item => item.includes('\x15'))).toBe(true)
    expect(records.some(item => (
      typeof item === 'object'
      && item !== null
      && (item as { kind?: string }).kind === 'prompt'
      && (item as { text?: string }).text === 'hello'
    ))).toBe(true)

    const child = headless.children[0]!
    child.emitLine(JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'Auto',
      session_id: 'sess-1',
    }))
    expect(await messages.next()).toEqual({ op: 'cursor_session', sessionId: 'sess-1' })
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: { type: 'system', subtype: 'init', model: 'Auto' },
    })
    child.emitLine(JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hel' }] },
    }))
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hel' }] },
      },
    })
    child.emitLine(JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: 'lo **world**' }] },
    }))
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'lo **world**' }] },
      },
    })
    child.emitLine(JSON.stringify({
      type: 'result',
      subtype: 'success',
      usage: { inputTokens: 3, outputTokens: 2 },
      session_id: 'sess-1',
    }))
    // Same session_id may re-publish cursor_session before the event frame.
    let resultFrame = await messages.next()
    if (resultFrame.op === 'cursor_session') resultFrame = await messages.next()
    expect(resultFrame).toMatchObject({
      op: 'event',
      event: { type: 'result', usage: { inputTokens: 3, outputTokens: 2 } },
    })
    child.emitExit(0)
    expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })
    client.close()
  })

  it('resumes the Cursor session on the next prompt', async () => {
    const { client, messages, headless } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'first' }))
    await messages.next() // running
    await messages.next() // user
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })
    headless.children[0]!.emitLine(JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'ok' }] },
      session_id: 'sess-resume',
    }))
    expect(await messages.next()).toEqual({ op: 'cursor_session', sessionId: 'sess-resume' })
    expect(await messages.next()).toMatchObject({ op: 'event', event: { type: 'assistant' } })
    headless.children[0]!.emitExit(0)
    expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })

    client.send(JSON.stringify({ op: 'prompt', text: 'second' }))
    await messages.next() // running
    await messages.next() // user
    await vi.waitFor(() => { expect(headless.spawns).toHaveLength(2) })
    expect(headless.spawns[1]!.args).toEqual(expect.arrayContaining([
      '--resume',
      'sess-resume',
      '--',
      'second',
    ]))
    headless.children[1]!.emitLine(JSON.stringify({
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: 'only second' }] },
    }))
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'only second' }] },
      },
    })
    headless.children[1]!.emitExit(0)
    client.close()
  })

  it('queues a follow-up until the active turn exits, and steers by replacing it', async () => {
    const { client, messages, headless } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'first' }))
    await messages.next() // running
    await messages.next() // user
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })

    client.send(JSON.stringify({ op: 'prompt', text: 'queued-a', mode: 'queue' }))
    expect(await messages.next()).toMatchObject({
      op: 'followup',
      status: 'queued',
      text: 'queued-a',
      items: ['queued-a'],
    })
    client.send(JSON.stringify({ op: 'prompt', text: 'queued-b', mode: 'queue' }))
    expect(await messages.next()).toMatchObject({
      op: 'followup',
      status: 'queued',
      text: 'queued-b',
      items: ['queued-a', 'queued-b'],
    })

    client.send(JSON.stringify({ op: 'followup_cancel' }))
    expect(await messages.next()).toMatchObject({
      op: 'followup',
      status: 'popped',
      text: 'queued-b',
      items: ['queued-a'],
    })

    headless.children[0]!.emitExit(0)
    expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })
    expect(await messages.next()).toMatchObject({
      op: 'followup',
      status: 'started',
      text: 'queued-a',
      items: [],
    })
    expect(await messages.next()).toMatchObject({ op: 'status', status: 'running' })
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: { type: 'user', message: { content: [{ type: 'text', text: 'queued-a' }] } },
    })
    await vi.waitFor(() => { expect(headless.children).toHaveLength(2) })

    client.send(JSON.stringify({ op: 'prompt', text: 'steer-now', mode: 'steer' }))
    await vi.waitFor(() => { expect(headless.children[1]!.killed).toBe(true) })
    expect(await messages.next()).toMatchObject({ op: 'status', status: 'running' })
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: { type: 'user', message: { content: [{ type: 'text', text: 'steer-now' }] } },
    })
    await vi.waitFor(() => { expect(headless.children).toHaveLength(3) })
    headless.children[2]!.emitExit(0)
    client.close()
  })

  it('does not harvest PTY screen text as assistant events', async () => {
    const { client, messages, pty, headless } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'hi' }))
    await messages.next() // running
    await messages.next() // user
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })

    pty.emitData('\x1b[2J\x1b[Hhi\nHello from the screen\n→ \n')
    await vi.waitFor(() => {
      expect([...messages.seen].reverse().find(frame => frame.op === 'mirror')).toBeTruthy()
    })
    expect(messages.seen.some(frame => (
      frame.op === 'event'
      && (frame as { event?: { type?: string } }).event?.type === 'assistant'
    ))).toBe(false)

    headless.children[0]!.emitLine(JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hello from stream-json' }] },
    }))
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello from stream-json' }] },
      },
    })
    headless.children[0]!.emitExit(0)
    client.close()
  })

  it('interrupts a headless turn and resets the resume id', async () => {
    const { client, messages, headless, pty } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'run' }))
    await messages.next()
    await messages.next()
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })
    headless.children[0]!.emitLine(JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'sess-x',
    }))
    expect(await messages.next()).toEqual({ op: 'cursor_session', sessionId: 'sess-x' })
    expect(await messages.next()).toMatchObject({ op: 'event', event: { type: 'system' } })

    client.send(JSON.stringify({ op: 'interrupt' }))
    await vi.waitFor(() => {
      expect(headless.children[0]!.killed).toBe(true)
      expect(pty.writes.some(item => item.includes('\x03'))).toBe(true)
    })
    expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })

    client.send(JSON.stringify({ op: 'reset' }))
    expect(await messages.next()).toMatchObject({ op: 'followup', status: 'cleared', items: [] })
    expect(await messages.next()).toEqual({ op: 'cursor_session', sessionId: null })
    expect(await messages.next()).toEqual({ op: 'status', status: 'idle' })
    client.send('not-json')
    client.close()
  })

  it('reports non-zero PTY exit as an error status', async () => {
    const { client, messages, pty } = await openIdleSession()
    pty.emitExit(2)
    expect(await messages.next()).toMatchObject({
      op: 'status',
      status: 'error',
    })
    client.close()
  })

  it('reports spawn failures from the injectable PTY factory', async () => {
    const { origin } = await serveChat((websocket) => {
      attachAgentChat(websocket, {
        file: 'agent',
        args: [],
        cwd: '/work',
        spawnChild: () => {
          throw new Error('pty boom')
        },
      })
    })
    const client = new WebSocket(`${origin}/`)
    const messages = messagePump(client)
    await once(client, 'open')
    expect(await messages.next()).toEqual({ op: 'ready' })
    expect(await messages.next()).toMatchObject({
      op: 'snapshot',
      status: 'error',
      message: 'pty boom',
    })
    expect(await messages.next()).toMatchObject({
      op: 'error',
      message: 'pty boom',
    })
    client.close()
  })

  it('keeps the PTY when the viewer socket closes without shutdown', async () => {
    const { origin, client, messages, pty, headless } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'stay' }))
    expect(await messages.next()).toMatchObject({ op: 'status', status: 'running' })
    expect(await messages.next()).toMatchObject({
      op: 'event',
      event: { type: 'user', message: { content: [{ type: 'text', text: 'stay' }] } },
    })
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })
    client.close()
    await once(client, 'close')
    expect(pty.killed).toBe(false)
    expect(headless.children[0]!.killed).toBe(false)

    const next = new WebSocket(`${origin}/`)
    const nextMessages = messagePump(next)
    await once(next, 'open')
    expect(await nextMessages.next()).toEqual({ op: 'ready' })
    const snapshot = await nextMessages.next()
    expect(snapshot).toMatchObject({
      op: 'snapshot',
      status: 'running',
    })
    expect((snapshot as { events: Array<{ type?: string }> }).events.some(event => (
      event.type === 'user'
    ))).toBe(true)
    expect(pty.spawns).toHaveLength(1)
    next.close()
  })

  it('stops the PTY only on shutdown', async () => {
    const { client, pty } = await openIdleSession()
    client.send(JSON.stringify({ op: 'shutdown' }))
    await vi.waitFor(() => {
      expect(pty.killed).toBe(true)
    })
  })

  it('rebinds a named overlay session without spawning a second PTY', async () => {
    const harness = createPtyHarness()
    const ctx = new Context()
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    mountCursorAgentGateway(ctx, {
      agentCommand: '/usr/bin/agent',
      trustedHosts: [],
      logConversations: false,
    }, (file, args, options) => {
      harness.spawns.push({ file, args, cwd: options.cwd })
      return harness.pty
    })
    running.push(async () => { await ctx.fiber.dispose() })
    const url = `ws://127.0.0.1:${String(ctx.webServer.port)}${CURSOR_AGENT_PTY_PATH}?session=cursor-cli-1`
    const first = new WebSocket(url)
    const firstMessages = messagePump(first)
    await once(first, 'open')
    expect(await firstMessages.next()).toEqual({ op: 'ready' })
    expect(await firstMessages.next()).toMatchObject({ op: 'snapshot', status: 'starting' })
    expect(harness.spawns).toHaveLength(1)
    first.close()
    await once(first, 'close')
    expect(harness.killed).toBe(false)

    const second = new WebSocket(url)
    const secondMessages = messagePump(second)
    await once(second, 'open')
    expect(await secondMessages.next()).toEqual({ op: 'ready' })
    expect(await secondMessages.next()).toMatchObject({ op: 'snapshot', status: 'starting' })
    expect(harness.spawns).toHaveLength(1)
    second.close()
  })

  it('projects headless AskQuestion onto the glass card and answers with keys', async () => {
    const { client, messages, headless, pty } = await openIdleSession()
    client.send(JSON.stringify({ op: 'prompt', text: 'ask me' }))
    await vi.waitFor(() => { expect(headless.children).toHaveLength(1) })
    const child = headless.children[0]!
    child.emitLine(JSON.stringify({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'aq1',
      tool_call: {
        askQuestionToolCall: {
          args: {
            title: 'dinner',
            questions: [{
              id: 'food',
              prompt: 'what to eat',
              allow_multiple: true,
              options: [
                { id: 'hotpot', label: 'hotpot' },
                { id: 'noodles', label: 'noodles' },
              ],
            }],
          },
        },
      },
    }))
    await vi.waitFor(() => {
      expect(messages.seen.some(frame => (
        frame.op === 'mirror'
        && Array.isArray(frame.below)
        && (frame.below as Array<{ text?: string }>).some(row => (
          String(row.text).includes('AskQuestion dinner')
        ))
      ))).toBe(true)
    })
    child.emitLine(JSON.stringify({
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'aq1',
      tool_call: {
        askQuestionToolCall: {
          result: 'Questions skipped by the user, continue with the information you already have',
        },
      },
    }))
    await vi.waitFor(() => { expect(child.killed).toBe(true) })
    client.send(JSON.stringify({ op: 'keys', data: ' ' }))
    client.send(JSON.stringify({ op: 'keys', data: '\r' }))
    await vi.waitFor(() => { expect(headless.spawns.length).toBeGreaterThanOrEqual(2) })
    expect(pty.writes.includes(' ')).toBe(false)
    expect(headless.spawns.at(-1)?.args.some(arg => String(arg).includes('hotpot'))).toBe(true)
    client.close()
  })
})
