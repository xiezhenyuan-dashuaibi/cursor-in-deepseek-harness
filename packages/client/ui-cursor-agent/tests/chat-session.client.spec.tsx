// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSession, type ChatSessionProps } from '../src/client/ChatSession.tsx'
import { zh } from '../src/client/locales.ts'
import {
  mintOverlaySessionId,
  resetOverlaySessionIdsForTests,
} from '../src/client/session-id.ts'
import { resetTurnIdsForTests } from '../src/client/chat-model.ts'

const harness = vi.hoisted(() => ({
  sockets: [] as Array<{
    readyState: number
    sent: unknown[]
    close: () => void
    emit: (type: string, event?: MessageEvent) => void
  }>,
}))

type WsHandler = (event?: MessageEvent) => void

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  url: string
  sent: unknown[] = []
  private readonly handlers = new Map<string, Set<WsHandler>>()
  constructor(url: string) {
    this.url = url
    harness.sockets.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit('open')
      this.emit('message', { data: JSON.stringify({ op: 'ready' }) } as MessageEvent)
      this.emit('message', {
        data: JSON.stringify({ op: 'status', status: 'idle' }),
      } as MessageEvent)
    })
  }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close') }
  addEventListener(type: string, handler: WsHandler) {
    const set = this.handlers.get(type) ?? new Set()
    set.add(handler)
    this.handlers.set(type, set)
  }
  removeEventListener(type: string, handler: WsHandler) {
    this.handlers.get(type)?.delete(handler)
  }
  emit(type: string, event?: MessageEvent) {
    for (const handler of this.handlers.get(type) ?? []) handler(event)
  }
}

const labels: ChatSessionProps['labels'] = {
  placeholder: zh['composer.placeholder'],
  starting: zh['composer.starting'],
  heroTitle: zh['chat.heroTitle'],
  heroTip1: zh['chat.heroTip1'],
  heroTip2: zh['chat.heroTip2'],
  running: zh['chat.running'],
  jumpBottom: zh['chat.jumpBottom'],
  toolRunning: zh['tool.running'],
  toolDone: zh['tool.done'],
  toolError: zh['tool.error'],
  taskRunning: zh['task.running'],
  taskDone: zh['task.done'],
  taskBackground: zh['task.background'],
  taskError: zh['task.error'],
  tasksRunningAgents: zh['tasks.runningAgents'],
  tasksCount: zh['tasks.count'],
  thinkingRunning: zh['thinking.running'],
  thinkingDone: zh['thinking.done'],
  systemReady: zh['system.ready'],
  usageLabel: zh['usage.label'],
  usageInput: zh['usage.input'],
  usageOutput: zh['usage.output'],
  usageCacheRead: zh['usage.cacheRead'],
  usageCacheWrite: zh['usage.cacheWrite'],
  copy: zh['chat.copy'],
  copied: zh['chat.copied'],
  followupQueued: zh['followup.queued'],
  followupQueueHint: zh['followup.queueHint'],
  followupSteerNow: zh['followup.steerNow'],
  followupCancelLast: zh['followup.cancelLast'],
}

function lastSocket() {
  const socket = harness.sockets.at(-1)
  expect(socket).toBeDefined()
  return socket!
}

beforeEach(() => {
  resetOverlaySessionIdsForTests()
  resetTurnIdsForTests()
  harness.sockets.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:3080' })
})

afterEach(() => {
  cleanup()
  harness.sockets.length = 0
  vi.unstubAllGlobals()
})

describe('ChatSession reconnect', () => {
  it('ignores malformed frames and applies error and starting snapshots', async () => {
    const sessionId = mintOverlaySessionId()
    const onStatus = vi.fn()
    const view = render(
      <ChatSession
        sessionId={sessionId}
        active
        onStatus={onStatus}
        labels={labels}
      />,
    )
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(sessionId, 'live')
    })
    lastSocket().emit('message', { data: 1 } as unknown as MessageEvent)
    lastSocket().emit('message', { data: '{' } as MessageEvent)
    lastSocket().emit('message', { data: 'null' } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'snapshot', status: 'nope' }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'snapshot',
        status: 'error',
        message: 'boom',
        events: [null, { type: 'user', message: { content: [{ type: 'text', text: 'x' }] } }],
        mirror: 'nope',
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('boom')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'snapshot',
        status: 'starting',
        events: [],
        followUps: [],
        mirror: { input: 1, below: [] },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'error', message: 'late' }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'event', event: 'nope' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('late')
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('does not send shutdown when the socket is not open', async () => {
    let shutdown: (() => void) | undefined
    const sessionId = mintOverlaySessionId()
    render(
      <ChatSession
        sessionId={sessionId}
        active
        onStatus={() => {}}
        registerShutdown={(_id, fn) => {
          shutdown = fn
          return () => {}
        }}
        labels={labels}
      />,
    )
    lastSocket().readyState = FakeWebSocket.CONNECTING
    shutdown?.()
    expect(lastSocket().sent.some(item => String(item).includes('shutdown'))).toBe(false)
    await act(async () => {
      await Promise.resolve()
    })
  })
})

describe('ChatSession composer clipboard', () => {
  async function renderLive() {
    const sessionId = mintOverlaySessionId()
    const view = render(
      <ChatSession
        sessionId={sessionId}
        active
        onStatus={() => {}}
        labels={labels}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-composer] textarea')).toBeTruthy()
    })
    return {
      view,
      input: view.container.querySelector(
        '[data-cursor-agent-composer] textarea',
      ) as HTMLTextAreaElement,
    }
  }

  function pasteText(el: HTMLTextAreaElement, text: string): void {
    fireEvent.paste(el, { clipboardData: { items: [], getData: () => text } })
  }

  it('pastes into the local draft without PTY keys and restores the caret', async () => {
    const { input } = await renderLive()
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.keyDown(input, { key: 'b' })
    input.setSelectionRange(1, 1)
    pasteText(input, 'X\r\nY')
    await waitFor(() => {
      expect(input.value).toBe('aX\nYb')
      expect(input.selectionStart).toBe(4)
    })
    expect(lastSocket().sent.some(item => String(item).includes('"keys"') && String(item).includes('X'))).toBe(false)
    pasteText(input, '')
    fireEvent.paste(input)
    expect(input.value).toBe('aX\nYb')
  })

  it('ignores paste and cut while an IME composition is open', async () => {
    const { input } = await renderLive()
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.compositionStart(input)
    pasteText(input, 'ignored')
    const setData = vi.fn()
    input.setSelectionRange(0, 1)
    fireEvent.cut(input, { clipboardData: { setData, getData: () => '' } })
    expect(input.value).toBe('a')
    expect(setData).not.toHaveBeenCalled()
  })

  it('cuts a local selection without PTY keys and no-ops a collapsed caret', async () => {
    const { input } = await renderLive()
    for (const key of 'hello') fireEvent.keyDown(input, { key })
    const setData = vi.fn()
    input.setSelectionRange(0, 2)
    fireEvent.cut(input, { clipboardData: { setData, getData: () => '' } })
    await waitFor(() => {
      expect(input.value).toBe('llo')
    })
    expect(setData).toHaveBeenCalledWith('text/plain', 'he')
    expect(lastSocket().sent.some(item => String(item).includes('"keys"'))).toBe(false)
    input.setSelectionRange(0, 1)
    fireEvent.cut(input)
    await waitFor(() => {
      expect(input.value).toBe('lo')
    })
    input.setSelectionRange(1, 1)
    fireEvent.cut(input)
    expect(input.value).toBe('lo')
  })

  function keyPayloads(): string[] {
    return lastSocket().sent.flatMap((item) => {
      if (typeof item !== 'string') return []
      try {
        const parsed = JSON.parse(item) as { op?: unknown; data?: unknown }
        if (parsed.op !== 'keys' || typeof parsed.data !== 'string') return []
        return [parsed.data]
      } catch {
        // Fake socket payloads are JSON; ignore a non-JSON frame.
        return []
      }
    })
  }

  it('forwards flattened paste and cut backspaces while a slash bar owns the composer', async () => {
    const { input } = await renderLive()
    fireEvent.keyDown(input, { key: '/' })
    pasteText(input, 'model\nnext')
    await waitFor(() => {
      expect(input.value).toContain('model next')
    })
    expect(keyPayloads().includes('model next')).toBe(true)
    input.setSelectionRange(0, input.value.length)
    fireEvent.cut(input, { clipboardData: { setData: () => {}, getData: () => '' } })
    await waitFor(() => {
      expect(input.value).toBe('')
    })
    expect(keyPayloads().some(data => data.includes('\x7f'))).toBe(true)
  })

  it('interrupts a running turn on Ctrl+C only when the caret is collapsed', async () => {
    const { input, view } = await renderLive()
    fireEvent.keyDown(input, { key: 'x' })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-running]')).toBeTruthy()
    })
    input.setSelectionRange(0, 1)
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(lastSocket().sent.some(item => String(item).includes('interrupt'))).toBe(false)
    input.setSelectionRange(1, 1)
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true, metaKey: true })
    expect(lastSocket().sent.some(item => String(item).includes('interrupt'))).toBe(false)
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(lastSocket().sent.some(item => String(item).includes('"interrupt"'))).toBe(true)
  })

  it('leaves Ctrl+V/X and idle Ctrl+C to clipboard events, and SIGINTs a slash bar without a selection', async () => {
    const { input } = await renderLive()
    const before = lastSocket().sent.length
    fireEvent.keyDown(input, { key: 'v', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(lastSocket().sent.length).toBe(before)
    fireEvent.keyDown(input, { key: '/' })
    input.setSelectionRange(0, 1)
    fireEvent.keyDown(input, { key: 'C', ctrlKey: true })
    expect(keyPayloads().includes('\x03')).toBe(false)
    input.setSelectionRange(1, 1)
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(keyPayloads().includes('\x03')).toBe(true)
  })

  it('does not lock the composer on an abort banner or host error', async () => {
    const { input, view } = await renderLive()
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: 'Error: [aborted] read ECONNRESET',
        below: [{ text: 'Error: [aborted] read ECONNRESET', highlighted: true }],
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(input.value).toBe('')
    })
    fireEvent.keyDown(input, { key: 'z' })
    expect(input.value).toBe('z')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => (
      String(item).includes('"prompt"') && String(item).includes('z')
    ))).toBe(true)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'error', message: 'Error: [aborted] read ECONNRESET' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.getByRole('alert').textContent).toBe('Error: [aborted] read ECONNRESET')
    })
    fireEvent.keyDown(input, { key: 'a' })
    await waitFor(() => {
      expect(input.value).toBe('a')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'status',
        status: 'error',
        message: 'Error: [aborted] read ECONNRESET',
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.getByRole('alert').textContent).toBe('Error: [aborted] read ECONNRESET')
      expect(input.value).toBe('a')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'error', message: 'a' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(input.value).toBe('')
      expect(view.getByRole('alert').textContent).toBe('a')
    })
  })

  it('forwards keys when abort chrome still has option rows below the bar', async () => {
    const { input } = await renderLive()
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: 'Error: [aborted] read ECONNRESET',
        below: [{ text: '  /model    Switch models', highlighted: true }],
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(input.value).toBe('')
    })
    fireEvent.keyDown(input, { key: 'z' })
    expect(keyPayloads().includes('z')).toBe(true)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => String(item).includes('"prompt"'))).toBe(false)
  })
})
