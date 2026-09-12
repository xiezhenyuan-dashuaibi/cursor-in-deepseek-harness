// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CursorPanel, cursorAgentPtyUrl, type CursorPanelProps } from '../src/client/CursorPanel.tsx'
import {
  OVERLAY_STACK_CURSOR_ID, OVERLAY_STACK_DESK_ID, type OverlayStackSnapshot,
} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  defaultOverlayBox,
  OVERLAY_PANEL_MAX_HEIGHT,
  OVERLAY_PANEL_MAX_WIDTH,
  OVERLAY_PANEL_MIN_WIDTH,
  OVERLAY_SPRITE_MARGIN,
  OVERLAY_SPRITE_SIZE,
} from '../src/client/overlay-position.ts'
import { zh } from '../src/client/locales.ts'
import {
  OVERLAY_STACK_CURSOR_ID as LOCAL_OVERLAY_STACK_CURSOR_ID, OVERLAY_STACK_SPRITE_Z,
  overlayStackZIndex,
} from '../src/client/overlay-stack-ids.ts'
import { CURSOR_AGENT_PTY_PATH } from '../src/client/pty-path.ts'
import { OVERLAY_RAIL_STORAGE_KEY } from '../src/client/rail-storage.ts'
import { CURSOR_HOST_BOOT_META } from '../src/client/host-boot.ts'
import {
  readPersistedGeometry, writePersistedGeometry,
} from '../src/client/geometry-storage.ts'
import { resetOverlaySessionIdsForTests } from '../src/client/session-id.ts'
import { resetTurnIdsForTests } from '../src/client/chat-model.ts'

const harness = vi.hoisted(() => ({
  sockets: [] as Array<{
    readyState: number
    url: string
    send: (data: unknown) => void
    emit: (type: string, event?: MessageEvent) => void
    sent: unknown[]
    close: () => void
  }>,
}))

type WsHandler = (event?: MessageEvent) => void
type WsHandlerMap = Map<string, Set<WsHandler>>

function wsAddListener(handlers: WsHandlerMap, type: string, handler: WsHandler): void {
  const set = handlers.get(type) ?? new Set()
  set.add(handler)
  handlers.set(type, set)
}

function wsRemoveListener(handlers: WsHandlerMap, type: string, handler: WsHandler): void {
  handlers.get(type)?.delete(handler)
}

function wsEmit(handlers: WsHandlerMap, type: string, event?: MessageEvent): void {
  for (const handler of handlers.get(type) ?? []) handler(event)
}

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  url: string
  sent: unknown[] = []
  private readonly handlers: WsHandlerMap = new Map()
  constructor(url: string) {
    this.url = url
    harness.sockets.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit('open')
      this.emit('message', {
        data: JSON.stringify({ op: 'ready' }),
      } as MessageEvent)
      this.emit('message', {
        data: JSON.stringify({ op: 'status', status: 'starting' }),
      } as MessageEvent)
      this.emit('message', {
        data: JSON.stringify({ op: 'status', status: 'idle' }),
      } as MessageEvent)
    })
  }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close') }
  addEventListener(type: string, handler: WsHandler) {
    wsAddListener(this.handlers, type, handler)
  }
  removeEventListener(type: string, handler: WsHandler) {
    wsRemoveListener(this.handlers, type, handler)
  }
  emit(type: string, event?: MessageEvent) {
    wsEmit(this.handlers, type, event)
  }
}

const PANEL_BOOT = 'test-boot'

function setHostBootMeta(id: string | undefined): void {
  for (const el of document.querySelectorAll(`meta[name="${CURSOR_HOST_BOOT_META}"]`)) el.remove()
  if (id === undefined) return
  const meta = document.createElement('meta')
  meta.setAttribute('name', CURSOR_HOST_BOOT_META)
  meta.setAttribute('content', id)
  document.head.append(meta)
}

afterEach(() => {
  cleanup()
  harness.sockets.length = 0
  resetOverlaySessionIdsForTests()
  resetTurnIdsForTests()
  localStorage.clear()
  setHostBootMeta(undefined)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  resetOverlaySessionIdsForTests()
  resetTurnIdsForTests()
  localStorage.clear()
  setHostBootMeta(PANEL_BOOT)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:3080' })
  window.innerWidth = 1920
  window.innerHeight = 1080
  const captured = new WeakSet<Element>()
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
})

function panelProps(extra?: Partial<CursorPanelProps>): CursorPanelProps {
  const stack: OverlayStackSnapshot = {
    front: [OVERLAY_STACK_DESK_ID, OVERLAY_STACK_CURSOR_ID],
  }
  return {
    t: (key: keyof typeof zh) => zh[key],
    raiseWindow: vi.fn(),
    listOverlayCards: vi.fn(async () => []),
    setOverlayCardHidden: vi.fn(async () => {}),
    setOverlayCardInserted: vi.fn(async () => {}),
    switchOverlayDesktop: vi.fn(async () => {}),
    useOverlayStack: (selector: (snapshot: OverlayStackSnapshot) => unknown) => selector(stack),
    ...extra,
  } as unknown as CursorPanelProps
}

function renderPanel(extra?: Partial<CursorPanelProps>) {
  return render(<CursorPanel {...panelProps(extra)} />)
}

/** Hover long enough for the 150ms rail open delay. */
async function openRail(rail: HTMLElement): Promise<void> {
  fireEvent.mouseEnter(rail)
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 150)
    })
  })
}

function lastSocket() {
  const socket = harness.sockets.at(-1)
  expect(socket).toBeDefined()
  return socket!
}

/**
 * Chromium moves the caret to the end when `style.height` is assigned; jsdom does not.
 * @param input - the compose textarea under test.
 */
function yankCaretToEndOnHeightWrite(input: HTMLTextAreaElement): void {
  const style = input.style
  const proto = Object.getPrototypeOf(style) as CSSStyleDeclaration
  const desc = Object.getOwnPropertyDescriptor(proto, 'height')
    ?? Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'height')
  const write = desc?.set
  const read = desc?.get
  Object.defineProperty(style, 'height', {
    configurable: true,
    enumerable: true,
    get() {
      return read !== undefined ? read.call(this) : style.getPropertyValue('height')
    },
    set(value: string) {
      if (write !== undefined) write.call(this, value)
      else style.setProperty('height', value)
      const end = input.value.length
      input.setSelectionRange(end, end)
    },
  })
}

function confirmNewSession(view: ReturnType<typeof renderPanel>, name?: string) {
  fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
  const input = view.container.querySelector('[data-cursor-agent-create-name]') as HTMLInputElement
  expect(input).toBeTruthy()
  if (name !== undefined) fireEvent.change(input, { target: { value: name } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

function sessionListSiblingPlus(view: ReturnType<typeof renderPanel>): boolean {
  const list = view.container.querySelector('[data-cursor-agent-session-list]')
  const create = view.container.querySelector('[data-cursor-agent-create]')
  const plus = view.container.querySelector('[data-cursor-agent-new-session]')
  return list?.nextElementSibling === (create ?? plus)
}

describe('cursorAgentPtyUrl', () => {
  it('rewrites the page origin to the chat WebSocket path', () => {
    expect(cursorAgentPtyUrl()).toBe(`ws://127.0.0.1:3080${CURSOR_AGENT_PTY_PATH}`)
    expect(cursorAgentPtyUrl('cursor-cli-1')).toBe(
      `ws://127.0.0.1:3080${CURSOR_AGENT_PTY_PATH}?session=cursor-cli-1`,
    )
    vi.stubGlobal('location', { origin: 'https://app.internal' })
    expect(cursorAgentPtyUrl()).toBe(`wss://app.internal${CURSOR_AGENT_PTY_PATH}`)
    vi.stubGlobal('location', { origin: 'null' })
    expect(cursorAgentPtyUrl()).toBe(`ws://127.0.0.1${CURSOR_AGENT_PTY_PATH}`)
  })
})

describe('CursorPanel chat', () => {
  it('renders a title-less card, Cursor mark, terminal session icons, and live status', async () => {
    const view = renderPanel()
    expect(view.container.querySelector('[data-cursor-agent-title]')).toBeNull()
    expect(view.container.querySelector('[data-cursor-agent-rail-handle]')).toBeNull()
    expect(view.getByLabelText('Cursor 对话')).toBeTruthy()
    const empty = view.container.querySelector('[data-cursor-agent-empty]')
    expect(empty?.textContent).toContain('Cursor in deepseek-harness')
    expect(empty?.textContent).toContain('左侧会话栏管理多个 Cursor 终端')
    expect(empty?.textContent).toContain('输入 /')
    const drag = view.container.querySelector('[data-cursor-agent-drag]')
    expect(drag).toBeTruthy()
    expect(drag?.textContent).toBe('C')
    const strip = view.container.querySelector('[data-cursor-agent-drag-strip]')
    expect(strip).toBeTruthy()
    expect(view.container.querySelector('[data-cursor-agent-minimize]')?.getAttribute('aria-label')).toBe('收起')
    expect(strip?.contains(view.container.querySelector('[data-cursor-agent-minimize]')!)).toBe(true)
    const chatColumn = view.container.querySelector('[data-cursor-agent-chat-column]')
    expect(chatColumn).toBeTruthy()
    expect(chatColumn?.contains(strip)).toBe(true)
    expect(chatColumn?.querySelector('[data-cursor-agent-chat-stack]')).toBeTruthy()
    expect(chatColumn?.querySelector('[data-cursor-agent-rail]')).toBeNull()
    const body = chatColumn?.parentElement
    expect(body?.firstElementChild?.hasAttribute('data-cursor-agent-rail')).toBe(true)
    expect(body?.firstElementChild?.nextElementSibling).toBe(chatColumn)
    expect(view.container.querySelector('[data-cursor-agent-icon-list]')).toBeTruthy()
    expect(
      view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"] [data-cursor-agent-session-icon]'),
    ).toBeTruthy()
    expect(view.container.querySelectorAll('[data-cursor-agent-session-icon]').length).toBe(1)
    expect(view.container.querySelectorAll('[data-cursor-agent-drag]').length).toBe(1)
    expect(view.container.querySelector('[data-cursor-agent-new-session]')).toBeTruthy()
    expect(view.container.querySelector('[data-cursor-agent-new-session]')?.getAttribute('aria-label')).toBe('新建')
    const sessionList = view.container.querySelector('[data-cursor-agent-session-list]')
    expect(sessionList?.nextElementSibling).toBe(
      view.container.querySelector('[data-cursor-agent-new-session]'),
    )
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.hasAttribute('data-active')).toBe(true)
    expect(view.container.querySelector('[data-cursor-agent-rail]')?.hasAttribute('data-rail-open')).toBe(false)
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    fireEvent.mouseEnter(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(false)
    await act(async () => {
      await new Promise<void>((resolve) => { setTimeout(resolve, 80) })
    })
    expect(rail.hasAttribute('data-rail-open')).toBe(false)
    fireEvent.mouseLeave(rail)
    await act(async () => {
      await new Promise<void>((resolve) => { setTimeout(resolve, 150) })
    })
    expect(rail.hasAttribute('data-rail-open')).toBe(false)
    await openRail(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    fireEvent.mouseLeave(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(false)
    expect(view.container.querySelector('[data-cursor-agent-rail]')?.getAttribute('title'))
      .toBe('')
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const mcp = view.container.querySelector('[data-cursor-agent-dsh-mcp]')
    expect(mcp?.textContent).toBe('dsh_mcp 启动中')
    expect(mcp?.getAttribute('data-connected')).toBe('checking')
    expect(strip?.contains(mcp)).toBe(true)
    act(() => {
      harness.sockets[0]?.emit('message', {
        data: JSON.stringify({ op: 'dsh_mcp', status: 'connected' }),
      } as MessageEvent)
    })
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-dsh-mcp]')?.textContent).toBe('dsh_mcp 已连接')
    })
    act(() => {
      harness.sockets[0]?.emit('message', {
        data: JSON.stringify({ op: 'dsh_mcp', status: 'disconnected' }),
      } as MessageEvent)
    })
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-dsh-mcp]')?.textContent).toBe('dsh_mcp 启动中')
    })
  })

  it('collapses after a session click on mouse leave, but keeps open for create input', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    await openRail(rail)
    const session = view.container.querySelector(
      '[data-cursor-agent-session="cursor-cli-1"]',
    ) as HTMLButtonElement
    session.focus()
    fireEvent.click(session)
    expect(document.activeElement).toBe(session)
    fireEvent.mouseLeave(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(false)
    expect(document.activeElement).not.toBe(session)
    await openRail(rail)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
    const create = view.container.querySelector('[data-cursor-agent-create-name]') as HTMLInputElement
    create.focus()
    fireEvent.mouseLeave(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    expect(document.activeElement).toBe(create)
    expect(sessionListSiblingPlus(view)).toBe(true)
  })

  it('duplicates overlay-stack occupant ids without importing layout values', () => {
    expect(LOCAL_OVERLAY_STACK_CURSOR_ID).toBe('cursor-agent')
    expect(overlayStackZIndex([], LOCAL_OVERLAY_STACK_CURSOR_ID)).toBe(40)
    expect(overlayStackZIndex(['cursor-agent'], LOCAL_OVERLAY_STACK_CURSOR_ID)).toBe(40)
    expect(overlayStackZIndex(['overlay-card', 'cursor-agent'], LOCAL_OVERLAY_STACK_CURSOR_ID)).toBe(41)
    expect(OVERLAY_STACK_SPRITE_Z).toBeGreaterThan(41)
  })

  it('raises the Cursor window on primary-button pointer down', async () => {
    const raiseWindow = vi.fn()
    const view = renderPanel({ raiseWindow })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const windowEl = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    expect(windowEl.style.zIndex).toBe('41')
    fireEvent.pointerDown(windowEl, { button: 1, pointerId: 2 })
    expect(raiseWindow).not.toHaveBeenCalled()
    fireEvent.pointerDown(windowEl, { button: 0, pointerId: 1 })
    expect(raiseWindow).toHaveBeenCalledTimes(1)
  })

  it('keeps the minimized sprite above the overlay-card desk', async () => {
    const view = renderPanel({
      useOverlayStack: (selector: (snapshot: OverlayStackSnapshot) => unknown) => selector({
        front: [OVERLAY_STACK_CURSOR_ID, OVERLAY_STACK_DESK_ID],
      }),
    })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const windowEl = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    expect(windowEl.style.zIndex).toBe('40')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-minimize]')!)
    expect(windowEl.hasAttribute('data-minimized')).toBe(true)
    expect(windowEl.style.zIndex).toBe(String(OVERLAY_STACK_SPRITE_Z))
  })

  it('scrolls only the session strip between the Cursor mark and plugin control', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const mark = view.container.querySelector('[data-cursor-agent-drag]')
    const scroller = view.container.querySelector('[data-cursor-agent-session-scroll]')
    const list = view.container.querySelector('[data-cursor-agent-session-list]')
    const plus = view.container.querySelector('[data-cursor-agent-new-session]')
    const toggle = view.container.querySelector('[data-cursor-agent-plugins-toggle]')
    expect(scroller).toBeTruthy()
    expect(scroller?.contains(list)).toBe(true)
    expect(scroller?.contains(plus)).toBe(true)
    expect(scroller?.contains(mark)).toBe(false)
    expect(scroller?.contains(toggle)).toBe(false)
    const dock = view.container.querySelector('[data-cursor-agent-plugins]')
    expect(mark?.nextElementSibling).toBe(scroller)
    expect(scroller?.nextElementSibling).toBe(dock)
    expect(dock?.contains(toggle)).toBe(true)
    expect(sessionListSiblingPlus(view)).toBe(true)
  })

  it('lists overlay cards above the rail plugin control and hides or unplugs without deleting', async () => {
    const setOverlayCardHidden = vi.fn(async () => {})
    const setOverlayCardInserted = vi.fn(async () => {})
    const switchOverlayDesktop = vi.fn(async () => {})
    const listOverlayCards = vi.fn(async () => ([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: ['ui-notes'], kind: 'card' as const },
      { id: 'draft', title: '草稿', hidden: true, inserted: false, occupants: ['ui-draft'], kind: 'card' as const },
      {
        id: 'ui-fish-tank',
        title: '摸鱼工作台',
        hidden: false,
        inserted: true,
        occupants: ['ui-fish-tank'],
        kind: 'desktop' as const,
      },
      {
        id: 'ui-other-desk',
        title: '另一桌面',
        hidden: false,
        inserted: false,
        occupants: ['ui-other-desk'],
        kind: 'desktop' as const,
      },
      {
        id: 'ui-lab-fiber',
        title: '实验 fiber',
        hidden: false,
        inserted: true,
        occupants: ['ui-lab-fiber'],
        kind: 'fiber' as const,
      },
    ]))
    const view = renderPanel({
      listOverlayCards, setOverlayCardHidden, setOverlayCardInserted, switchOverlayDesktop,
    })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const toggle = view.container.querySelector('[data-cursor-agent-plugins-toggle]') as HTMLButtonElement
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    expect(toggle.getAttribute('aria-label')).toBe('插件')
    expect(rail.contains(toggle)).toBe(true)
    expect(sessionListSiblingPlus(view)).toBe(true)
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')).toBeTruthy()
    })
    const panel = view.container.querySelector('[data-cursor-agent-plugins-panel]') as HTMLElement
    const chat = view.container.querySelector('[data-cursor-agent-chat-column]') as HTMLElement
    const dock = view.container.querySelector('[data-cursor-agent-plugins]') as HTMLElement
    expect(rail.contains(panel)).toBe(true)
    expect(chat.contains(panel)).toBe(false)
    expect(dock.contains(panel)).toBe(true)
    expect(dock.contains(toggle)).toBe(true)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    expect(view.container.querySelector('[data-cursor-agent-plugin-desktop]')?.textContent)
      .toContain('摸鱼工作台')
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="1"]')?.textContent).toContain('卡片')
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="draft"]')?.textContent).toContain('草稿')
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="ui-other-desk"]')?.textContent)
      .toContain('另一桌面')
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="ui-lab-fiber"]')?.textContent)
      .toContain('实验 fiber')
    expect(view.container.querySelector(
      '[data-cursor-agent-plugin-id="ui-fish-tank"] [data-cursor-agent-plugin-hide]',
    )).toBeNull()
    expect(view.container.querySelector(
      '[data-cursor-agent-plugin-id="ui-lab-fiber"] [data-cursor-agent-plugin-hide]',
    )).toBeNull()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-hide]')!)
    await waitFor(() => {
      expect(setOverlayCardHidden).toHaveBeenCalledWith('1', true, 'card')
    })
    expect(setOverlayCardInserted).not.toHaveBeenCalled()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-unplug]')!)
    await waitFor(() => {
      expect(setOverlayCardInserted).toHaveBeenCalledWith('1', false, 'card')
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-show]')!)
    await waitFor(() => {
      expect(setOverlayCardHidden).toHaveBeenCalledWith('draft', false, 'card')
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-plug]')!)
    await waitFor(() => {
      expect(setOverlayCardInserted).toHaveBeenCalledWith('draft', true, 'card')
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-unload]')!)
    await waitFor(() => {
      expect(setOverlayCardInserted).toHaveBeenCalledWith('ui-fish-tank', false, 'desktop')
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-switch]')!)
    await waitFor(() => {
      expect(switchOverlayDesktop).toHaveBeenCalledWith('ui-other-desk')
    })
    fireEvent.click(
      view.container.querySelector('[data-cursor-agent-plugin-id="ui-lab-fiber"] [data-cursor-agent-plugin-unplug]')!,
    )
    await waitFor(() => {
      expect(setOverlayCardInserted).toHaveBeenCalledWith('ui-lab-fiber', false, 'fiber')
    })
  })

  it('switches 拔出 to 插入 after unplug succeeds', async () => {
    const setOverlayCardInserted = vi.fn(async () => {})
    const listOverlayCards = vi.fn()
      .mockResolvedValueOnce([{
        id: 'draft', title: '草稿', hidden: false, inserted: true, occupants: ['ui-lab'],
      }])
      .mockResolvedValue([{
        id: 'draft', title: '草稿', hidden: false, inserted: false, occupants: ['ui-lab'],
      }])
    const view = renderPanel({ listOverlayCards, setOverlayCardInserted })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugin-unplug]')?.textContent).toBe('拔出')
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-unplug]')!)
    await waitFor(() => {
      expect(setOverlayCardInserted).toHaveBeenCalledWith('draft', false, undefined)
    })
    await waitFor(() => {
      const action = view.container.querySelector('[data-cursor-agent-plugin-plug]')
      expect(action?.textContent).toBe('插入')
    })
  })

  it('closes the plugin list when the pointer leaves it', async () => {
    const listOverlayCards = vi.fn(async () => ([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [] },
    ]))
    const view = renderPanel({ listOverlayCards })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')).toBeTruthy()
    })
    fireEvent.mouseLeave(view.container.querySelector('[data-cursor-agent-plugins-panel]')!)
    expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')).toBeNull()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')).toBeTruthy()
    })
    fireEvent.mouseLeave(view.container.querySelector('[data-cursor-agent-plugins]')!)
    expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')).toBeNull()
  })

  it('shows empty copy and keeps the last list when list or hide RPC fails', async () => {
    const listOverlayCards = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([{
        id: '1', title: '卡片', hidden: false, inserted: true, occupants: ['ui-notes'],
      }])
    const setOverlayCardHidden = vi.fn(async () => {
      throw new Error('denied')
    })
    const view = renderPanel({ listOverlayCards, setOverlayCardHidden })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const toggle = view.container.querySelector('[data-cursor-agent-plugins-toggle]') as HTMLButtonElement
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugins-panel]')?.textContent)
        .toContain('没有插件')
    })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugin-id="1"]')).toBeTruthy()
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugin-hide]')!)
    await waitFor(() => {
      expect(setOverlayCardHidden).toHaveBeenCalledWith('1', true, undefined)
    })
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="1"]')).toBeTruthy()
    expect(view.container.querySelector('[data-cursor-agent-plugins-error]')?.textContent)
      .toBe('没有写入名册')
  })

  it('polls the overlay-card list while the plugin panel is open', async () => {
    const listOverlayCards = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'draft', title: '草稿', hidden: false, inserted: true, occupants: [] }])
    const view = renderPanel({ listOverlayCards })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    vi.useFakeTimers()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await act(async () => { await Promise.resolve() })
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="draft"]')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(view.container.querySelector('[data-cursor-agent-plugin-id="draft"]')).toBeTruthy()
    vi.useRealTimers()
  })

  it('disables hide and unplug while a write is in flight', async () => {
    let finishHide: (() => void) | undefined
    const setOverlayCardHidden = vi.fn(() => new Promise<void>((resolve) => {
      finishHide = resolve
    }))
    const listOverlayCards = vi.fn(async () => ([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: ['ui-notes'] },
    ]))
    const view = renderPanel({ listOverlayCards, setOverlayCardHidden })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugin-hide]')).toBeTruthy()
    })
    const action = view.container.querySelector('[data-cursor-agent-plugin-hide]') as HTMLButtonElement
    fireEvent.click(action)
    await waitFor(() => { expect(action.disabled).toBe(true) })
    finishHide!()
    await waitFor(() => { expect(action.disabled).toBe(false) })
  })

  it('dims 插入/拔出 when the card has no occupants', async () => {
    const setOverlayCardInserted = vi.fn(async () => {})
    const listOverlayCards = vi.fn(async () => ([
      { id: '1', title: '卡片', hidden: false, inserted: true, occupants: [] },
    ]))
    const view = renderPanel({ listOverlayCards, setOverlayCardInserted })
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-plugins-toggle]')!)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-plugin-unplug]')).toBeTruthy()
    })
    const action = view.container.querySelector('[data-cursor-agent-plugin-unplug]') as HTMLButtonElement
    expect(action.disabled).toBe(true)
    fireEvent.click(action)
    expect(setOverlayCardInserted).not.toHaveBeenCalled()
  })


  it('sends prompt on Enter and paints gray user / unframed assistant bands from host events', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    for (const key of 'hello') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('hello') })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => String(item).includes('"prompt"') && String(item).includes('hello'))).toBe(true)
    // Client must not invent a transcript turn — only the host user event paints it.
    expect(view.container.querySelector('[data-role="user"]')).toBeNull()
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'user',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: 'hello' }] },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 2,
          message: { content: [{ type: 'text', text: 'world' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="user"]')?.textContent).toContain('hello')
      expect(view.container.querySelector('[data-role="assistant"]')?.textContent).toContain('world')
      expect(view.container.querySelector('[data-role="assistant"]')?.hasAttribute('data-streaming')).toBe(true)
    })
  })

  it('queues follow-ups while busy and paints the queue float', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    for (const key of 'next') fireEvent.keyDown(input, { key })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => (
      String(item).includes('"prompt"')
      && String(item).includes('"queue"')
      && String(item).includes('next')
    ))).toBe(true)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-queued]')).toBeTruthy()
      expect(view.container.querySelector('[data-cursor-agent-queue-item]')?.textContent).toContain('next')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'followup',
        status: 'queued',
        text: 'next',
        items: ['next', 'also'],
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-cursor-agent-queue-item]')).toHaveLength(2)
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-queue-cancel]')!)
    expect(lastSocket().sent.some(item => String(item).includes('followup_cancel'))).toBe(true)
  })

  it('grows the composer height with multiline slash-mirrored draft and scrolls only past the cap', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('textarea')).toBeTruthy() })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    const realStyle = window.getComputedStyle.bind(window)
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = realStyle(element)
      if (element !== input) return style
      return new Proxy(style, {
        get(target, prop, receiver) {
          if (prop === 'maxHeight') return '80px'
          const value = Reflect.get(target, prop, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    })
    let scrollHeight = 48
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    try {
      // Slash drafts stay PTY-mirrored so multiline height still tracks `{op:"mirror"}`.
      lastSocket().emit('message', {
        data: JSON.stringify({ op: 'mirror', input: '/one\ntwo', below: [] }),
      } as MessageEvent)
      await waitFor(() => {
        expect(input.style.height).toBe('48px')
        expect(input.hasAttribute('data-overflow')).toBe(false)
      })
      scrollHeight = 120
      lastSocket().emit('message', {
        data: JSON.stringify({ op: 'mirror', input: '/one\ntwo\nthree\nfour\nfive', below: [] }),
      } as MessageEvent)
      await waitFor(() => {
        expect(input.style.height).toBe('80px')
        expect(input.hasAttribute('data-overflow')).toBe(true)
      })
    } finally {
      styleSpy.mockRestore()
    }
  })

  it('settles assistant markdown when the complete event has no timestamp', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'settled' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="assistant"]')?.textContent).toContain('settled')
      expect(view.container.querySelector('[data-role="assistant"]')?.hasAttribute('data-streaming')).toBe(false)
    })
  })

  it('renders assistant markdown instead of a pre block', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: '# Title\n\n**bold**' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      const band = view.container.querySelector('[data-role="assistant"]')
      expect(band?.querySelector('h1')?.textContent).toContain('Title')
      expect(band?.querySelector('strong')?.textContent).toContain('bold')
      expect(band?.querySelector('pre')).toBeNull()
    })
  })

  it('hides the floating composer when scrolled up and keeps it out of scrollHeight', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('[data-cursor-agent-composer]')).toBeTruthy() })
    const host = view.container.querySelector('[data-cursor-agent-transcript]')!.parentElement as HTMLElement
    const composer = view.container.querySelector('[data-cursor-agent-composer]') as HTMLElement
    expect(host.contains(composer)).toBe(true)
    expect(view.container.querySelector('[data-cursor-agent-transcript]')!.contains(composer)).toBe(false)
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(scroller)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-jump-bottom]')).toBeTruthy()
    })
    expect(view.container.querySelector('[data-cursor-agent-composer]')).toBeNull()
  })

  it('keeps queue dock pad and does not yank after a modest scroll-up', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    for (const key of 'next') fireEvent.keyDown(input, { key })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-queued]')).toBeTruthy()
    })
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    await waitFor(() => {
      expect(Number.parseInt(scroller.style.paddingBottom, 10)).toBeGreaterThanOrEqual(200)
    })
    const padBefore = scroller.style.paddingBottom
    let top = 760
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => { top = value },
    })
    fireEvent.scroll(scroller)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-queued]')).toBeNull()
      expect(view.container.querySelector('[data-cursor-agent-composer]')).toBeNull()
    })
    expect(scroller.style.paddingBottom).toBe(padBefore)
    expect(top).toBe(760)
  })

  it('hides the queue float with the composer when scrolled up', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    for (const key of 'next') fireEvent.keyDown(input, { key })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-queued]')).toBeTruthy()
    })
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(scroller)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-queued]')).toBeNull()
      expect(view.container.querySelector('[data-cursor-agent-composer]')).toBeNull()
      expect(view.container.querySelector('[data-cursor-agent-jump-bottom]')).toBeTruthy()
    })
  })

  it('hides the compose dock when scrolled up and keeps transcript pad while docked', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '/',
        below: [{ text: '→ /model Select model', highlighted: true }],
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-selection="cli_option_mirror"]')).toBeTruthy()
    })
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(scroller)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-composer]')).toBeNull()
      expect(view.container.querySelector('[data-cursor-agent-jump-bottom]')).toBeTruthy()
    })
  })

  it('does not snap the transcript to the bottom after the user scrolls up', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    let top = 0
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => { top = value },
    })
    fireEvent.scroll(scroller)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: 'later' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="assistant"]')?.textContent).toContain('later')
    })
    expect(top).toBe(0)
  })

  it('does not snap back while streaming after the user scrolls up', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    let top = 0
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => { top = value },
    })
    fireEvent.scroll(scroller)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: 'Hel' }] },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 2,
          message: { content: [{ type: 'text', text: 'lo' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="assistant"]')?.textContent).toContain('Hello')
    })
    expect(top).toBe(0)
  })

  it('paints task tool rows and a running-agents summary', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'started',
          call_id: 'task-1',
          tool_call: { taskToolCall: { args: { description: '盘点 Cursor 技能' } } },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'started',
          call_id: 'task-2',
          tool_call: { taskToolCall: { args: { description: '盘点钉钉 DWS 技能' } } },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-tool-family="task"] summary')?.textContent)
        .toContain('运行子 agent · 盘点 Cursor 技能')
      expect(view.container.querySelector('[data-cursor-agent-tasks]')?.textContent)
        .toContain('正在运行 2 个 agent')
      expect(view.container.querySelector('[data-cursor-agent-tasks]')?.textContent)
        .toContain('2 个任务')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'task-1',
          tool_call: {
            taskToolCall: {
              args: { description: '盘点 Cursor 技能' },
              result: { success: { is_background: true } },
            },
          },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-background] summary')?.textContent)
        .toContain('后台运行中')
      expect(view.container.querySelector('[data-cursor-agent-tasks]')?.textContent)
        .toContain('正在运行 2 个 agent')
    })
  })

  it('paints collapsed thinking/tool lines and keeps 生成中 in the transcript', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: { type: 'system', subtype: 'init', model: 'Auto' },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: { type: 'thinking', subtype: 'delta', text: 'reason' },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'started',
          call_id: 't1',
          tool_call: { readToolCall: { args: { path: 'a' } } },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="activity"]')?.textContent).toContain('已就绪')
      const thinking = view.container.querySelector('[data-role="thinking"]') as HTMLDetailsElement
      expect(thinking.querySelector('summary')?.textContent).toContain('思考中')
      expect(thinking.hasAttribute('data-streaming')).toBe(true)
      expect(thinking.open).toBe(false)
      expect(thinking.querySelector('pre')?.textContent).toContain('reason')
      const tool = view.container.querySelector('[data-tool-status="running"]') as HTMLDetailsElement
      expect(tool.querySelector('summary')?.textContent).toContain('正在 read a')
      const running = view.container.querySelector('[data-cursor-agent-running]') as HTMLElement
      expect(running.textContent).toBe('生成中…')
      expect(view.container.querySelector('[data-cursor-agent-transcript]')!.contains(running)).toBe(true)
      expect(view.container.querySelector('[data-cursor-agent-composer]')!.contains(running)).toBe(false)
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'completed',
          call_id: 't1',
          tool_call: { readToolCall: { result: { ok: true } } },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'result',
          usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 8, cacheWriteTokens: 0 },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'idle' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-tool-status="done"] summary')?.textContent)
        .toContain('已 read')
      expect(view.container.querySelector('[data-cursor-agent-usage-line]')?.textContent)
        .toBe('已用 token 输入 10 · 输出 4 · 缓存命中 8 · 缓存写入 0')
      expect(view.container.querySelector('[data-role="thinking"]')?.hasAttribute('data-streaming')).toBe(false)
      expect(view.container.querySelector('[data-cursor-agent-running]')).toBeNull()
    })
  })

  it('clears 生成中 on stream-json result even without a host idle status', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'assistant',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: '你好。' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-running]')?.textContent).toBe('生成中…')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: { type: 'result', timestamp_ms: 2 },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-running]')).toBeNull()
    })
  })

  it('does not paint a second user band when the stream echoes after init', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'user',
          message: { content: [{ type: 'text', text: '你知道你的环境嘛' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-role="user"]')).toHaveLength(1)
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: { type: 'system', subtype: 'init', model: 'Auto' },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'user',
          message: { content: [{ type: 'text', text: '你知道你的环境嘛' }] },
        },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="activity"]')?.textContent).toContain('已就绪')
    })
    expect(view.container.querySelectorAll('[data-role="user"]')).toHaveLength(1)
  })

  it('ignores malformed frames and still sends Enter as prompt', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', { data: 1 } as unknown as MessageEvent)
    lastSocket().emit('message', { data: '{not-json' } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify(null) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'status', status: 'other' }) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'event', event: 'nope' }) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'error' }) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'status', status: 'error' }) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'status', status: 'idle' }) } as MessageEvent)
    lastSocket().emit('message', { data: JSON.stringify({ op: 'error', message: 'bad frame' }) } as MessageEvent)
    await waitFor(() => {
      expect(view.getByRole('alert').textContent).toBe('bad frame')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'event', event: { type: 'widget' } }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'event', event: { type: 'system', subtype: 'init' } }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-activity-kind="notice"]')?.textContent).toBe('widget')
      expect(view.container.querySelector('[data-activity-kind="init"]')?.textContent).toBe('已就绪')
    })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    for (const key of 'enter-send') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('enter-send') })
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    await waitFor(() => { expect(input.value).toBe('enter-send\n') })
    const before = lastSocket().sent.length
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.length).toBeGreaterThan(before)
    expect(lastSocket().sent.some(item => String(item).includes('"prompt"'))).toBe(true)
  })

  it('inserts a newline on Shift+Enter without sending', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('textarea')).toBeTruthy() })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    for (const key of 'ab') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('ab') })
    input.setSelectionRange(1, 1)
    const before = lastSocket().sent.length
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    await waitFor(() => { expect(input.value).toBe('a\nb') })
    expect(lastSocket().sent.length).toBe(before)
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
  })

  it('deletes at the caret on Backspace, not only the last character', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('textarea')).toBeTruthy() })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    for (const key of 'abc') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('abc') })
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() => { expect(input.value).toBe('ac') })
    expect(input.selectionStart).toBe(1)
    input.setSelectionRange(0, 2)
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() => { expect(input.value).toBe('') })
    fireEvent.keyDown(input, { key: 'x' })
    fireEvent.keyDown(input, { key: 'y' })
    await waitFor(() => { expect(input.value).toBe('xy') })
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(input.value).toBe('xy')
    input.setSelectionRange(1, 1)
    fireEvent.keyDown(input, { key: 'z' })
    await waitFor(() => { expect(input.value).toBe('xzy') })
  })

  it('keeps the caret after Backspace when a height write would yank it to the end', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('textarea')).toBeTruthy() })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    yankCaretToEndOnHeightWrite(input)
    for (const key of 'abc') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('abc') })
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() => { expect(input.value).toBe('ac') })
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() => { expect(input.value).toBe('c') })
    expect(input.selectionStart).toBe(0)
  })

  it('keeps a clicked caret when the below-prompt card relayouts the composer', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.container.querySelector('textarea')).toBeTruthy() })
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    yankCaretToEndOnHeightWrite(input)
    for (const key of 'abc') fireEvent.keyDown(input, { key })
    await waitFor(() => { expect(input.value).toBe('abc') })
    input.setSelectionRange(1, 1)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: 'abc',
        below: [{ text: 'hint row', highlighted: false }],
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-mirror-line]')).toBeTruthy()
    })
    expect(input.value).toBe('abc')
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
  })

  it('keeps a local draft while running and jumps back to the bottom', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'running' }),
    } as MessageEvent)
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(input, { key: 'x' })
    expect(input.value).toBe('x')
    expect(lastSocket().sent.some(item => String(item).includes('"keys"') && String(item).includes('x'))).toBe(false)
    lastSocket().readyState = FakeWebSocket.CLOSED
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'idle' }),
    } as MessageEvent)
    const sentBeforeClose = lastSocket().sent.length
    fireEvent.keyDown(input, { key: 'y' })
    expect(lastSocket().sent.length).toBe(sentBeforeClose)
    const scroller = view.container.querySelector('[data-cursor-agent-transcript]') as HTMLDivElement
    let top = 0
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 800 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => { top = value },
    })
    fireEvent.scroll(scroller)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-jump-bottom]')).toBeTruthy()
    })
    fireEvent.click(view.container.querySelector('[data-cursor-agent-jump-bottom]')!)
    expect(top).toBe(800)
    lastSocket().close()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已断开') })
  })

  it('closes a rail session and ignores non-primary chrome gestures', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    await openRail(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    confirmNewSession(view)
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')).toBeTruthy()
    const rename = view.container.querySelector('[data-cursor-agent-rename="cursor-cli-2"]') as HTMLElement
    expect(rename.getAttribute('aria-label')).toBe('重命名')
    expect(rename.textContent).not.toContain('重命名')
    fireEvent.click(rename)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-close-session="cursor-cli-2"]')!)
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')).toBeNull()
    confirmNewSession(view)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')!)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-close-session="cursor-cli-3"]')!)
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-3"]')).toBeNull()
    fireEvent.mouseLeave(rail)
    const drag = view.container.querySelector('[data-cursor-agent-drag]') as HTMLElement
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const left = panel.style.left
    fireEvent.pointerDown(drag, { pointerId: 1, button: 1, clientX: 100, clientY: 40 })
    fireEvent.pointerMove(drag, { pointerId: 1, clientX: 180, clientY: 80 })
    expect(panel.style.left).toBe(left)
    fireEvent.pointerMove(drag, { pointerId: 99, clientX: 200, clientY: 90 })
    fireEvent.pointerUp(drag, { pointerId: 99 })
    fireEvent.pointerDown(drag, { pointerId: 2, button: 0, clientX: 100, clientY: 40 })
    drag.releasePointerCapture(2)
    fireEvent.pointerMove(drag, { pointerId: 2, clientX: 160, clientY: 90 })
    fireEvent.pointerUp(drag, { pointerId: 2 })
  })

  it('shows a failed tool and a system error band', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: {
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'bad',
          is_error: true,
          tool_call: { shellToolCall: { result: { exit: 1 } } },
        },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'event',
        event: { type: 'result', is_error: true, result: 'Turn failed hard' },
      }),
    } as MessageEvent)
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'error', message: 'CLI died' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-tool-status="error"]')?.textContent).toContain('失败')
      expect(view.container.querySelector('[data-role="system"]')?.textContent).toContain('Turn failed hard')
      expect(view.getByRole('alert').textContent).toBe('CLI died')
    })
  })

  it('opens a second chat session from the rail with a name prompt', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    confirmNewSession(view, 'Alpha')
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')).toBeTruthy()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')?.getAttribute('title')).toBe('Alpha')
    expect(harness.sockets.length).toBe(2)
  })

  it('renames a session and falls back to a default name when the create field is blank', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    await openRail(rail)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
    expect(view.container.querySelector('[data-cursor-agent-create-name]')).toBeTruthy()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-rename="cursor-cli-1"]')!)
    expect(view.container.querySelector('[data-cursor-agent-create-name]')).toBeNull()
    const rename = view.container.querySelector('[data-cursor-agent-rename-input="cursor-cli-1"]') as HTMLInputElement
    fireEvent.change(rename, { target: { value: 'Beta' } })
    fireEvent.keyDown(rename, { key: 'Enter' })
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.getAttribute('title')).toBe('Beta')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-rename="cursor-cli-1"]')!)
    const renameAgain = view.container.querySelector('[data-cursor-agent-rename-input="cursor-cli-1"]') as HTMLInputElement
    fireEvent.change(renameAgain, { target: { value: '   ' } })
    fireEvent.blur(renameAgain)
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.getAttribute('title')).toBe('Beta')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
    fireEvent.mouseLeave(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    const create = view.container.querySelector('[data-cursor-agent-create-name]') as HTMLInputElement
    fireEvent.keyDown(create, { key: 'a' })
    fireEvent.change(create, { target: { value: '   ' } })
    fireEvent.keyDown(create, { key: 'Enter' })
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')?.getAttribute('title')).toBe('Chat 2')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
    const abandoned = view.container.querySelector('[data-cursor-agent-create-name]') as HTMLInputElement
    fireEvent.keyDown(abandoned, { key: 'Escape' })
    expect(view.container.querySelector('[data-cursor-agent-create-name]')).toBeNull()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-3"]')).toBeNull()
  })

  it('activates a session from the expanded rail and ignores non-Enter name keys', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    confirmNewSession(view, 'Alpha')
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')?.hasAttribute('data-active')).toBe(true)
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    await openRail(rail)
    fireEvent.click(view.getByText('Chat 1'))
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.hasAttribute('data-active')).toBe(true)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-rename="cursor-cli-2"]')!)
    const rename = view.container.querySelector('[data-cursor-agent-rename-input="cursor-cli-2"]') as HTMLInputElement
    fireEvent.change(rename, { target: { value: 'Nope' } })
    fireEvent.keyDown(rename, { key: 'Escape' })
    fireEvent.blur(rename)
    expect(view.container.querySelector('[data-cursor-agent-rename-input="cursor-cli-2"]')).toBeNull()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')?.getAttribute('title')).toBe('Alpha')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-rename="cursor-cli-2"]')!)
    const renameAgain = view.container.querySelector('[data-cursor-agent-rename-input="cursor-cli-2"]') as HTMLInputElement
    fireEvent.mouseLeave(rail)
    expect(rail.hasAttribute('data-rail-open')).toBe(true)
    fireEvent.change(renameAgain, { target: { value: 'Gamma' } })
    fireEvent.keyDown(renameAgain, { key: 'a' })
    fireEvent.keyDown(renameAgain, { key: 'Enter' })
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')?.getAttribute('title')).toBe('Gamma')
    fireEvent.click(view.container.querySelector('[data-cursor-agent-new-session]')!)
    const create = view.container.querySelector('[data-cursor-agent-create-name]') as HTMLInputElement
    fireEvent.keyDown(create, { key: 'Escape' })
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-3"]')).toBeNull()
  })

  it('moves from the Cursor mark and ignores pointer on the transcript', () => {
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const origin = defaultOverlayBox(1920, 1080)
    expect(panel.style.width).toBe(`${OVERLAY_PANEL_MAX_WIDTH}px`)
    expect(panel.style.height).toBe(`${OVERLAY_PANEL_MAX_HEIGHT}px`)
    const drag = view.container.querySelector('[data-cursor-agent-drag]') as HTMLElement
    fireEvent.pointerDown(drag, { pointerId: 1, button: 0, clientX: 100, clientY: 40 })
    fireEvent.pointerMove(drag, { pointerId: 1, clientX: 160, clientY: 90 })
    expect(panel.style.left).toBe(`${origin.left + 60}px`)
    fireEvent.pointerUp(drag, { pointerId: 1 })
  })

  it('restores the stored overlay box on a later mount', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      minimized: false,
    })
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    expect(panel.style.left).toBe('120px')
    expect(panel.style.top).toBe('80px')
    expect(panel.style.width).toBe('500px')
    expect(panel.style.height).toBe('360px')
    expect(panel.hasAttribute('data-minimized')).toBe(false)
  })

  it('restores a minimized sprite origin', () => {
    writePersistedGeometry({
      box: { left: 120, top: 80, width: 500, height: 360 },
      sprite: { left: 100, top: 200, width: 52, height: 52 },
      minimized: true,
    })
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    expect(panel.hasAttribute('data-minimized')).toBe(true)
    expect(panel.style.left).toBe('100px')
    expect(panel.style.top).toBe('200px')
    expect(Number.parseFloat(panel.style.width)).toBe(OVERLAY_SPRITE_SIZE)
  })

  it('writes the box after a drag so a later mount can restore it', () => {
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const origin = defaultOverlayBox(1920, 1080)
    const drag = view.container.querySelector('[data-cursor-agent-drag]') as HTMLElement
    fireEvent.pointerDown(drag, { pointerId: 1, button: 0, clientX: 100, clientY: 40 })
    fireEvent.pointerMove(drag, { pointerId: 1, clientX: 160, clientY: 90 })
    fireEvent.pointerUp(drag, { pointerId: 1 })
    expect(readPersistedGeometry()?.box).toEqual({
      left: origin.left + 60,
      top: origin.top + 50,
      width: origin.width,
      height: origin.height,
    })
    expect(panel.style.left).toBe(`${origin.left + 60}px`)
  })

  it('moves from the empty top drag strip', () => {
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const origin = defaultOverlayBox(1920, 1080)
    const strip = view.container.querySelector('[data-cursor-agent-drag-strip]') as HTMLElement
    fireEvent.pointerDown(strip, { pointerId: 1, button: 0, clientX: 100, clientY: 40 })
    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 160, clientY: 90 })
    expect(panel.style.left).toBe(`${origin.left + 60}px`)
    expect(panel.style.top).toBe(`${origin.top + 50}px`)
    fireEvent.pointerUp(strip, { pointerId: 1 })
  })

  it('grows from the east edge and stops at the min width', () => {
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const origin = defaultOverlayBox(1920, 1080)
    const east = view.container.querySelector('[data-resize-edge="e"]') as HTMLElement
    fireEvent.pointerDown(east, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(east, { pointerId: 1, clientX: 80, clientY: 0 })
    expect(panel.style.width).toBe(`${origin.width + 80}px`)
    fireEvent.pointerUp(east, { pointerId: 1 })
    fireEvent.pointerDown(east, { pointerId: 2, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(east, { pointerId: 2, clientX: -2000, clientY: 0 })
    expect(panel.style.width).toBe(`${OVERLAY_PANEL_MIN_WIDTH}px`)
  })

  it('reclamps size and position on viewport resize', () => {
    const view = renderPanel()
    const panel = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const drag = view.container.querySelector('[data-cursor-agent-drag]') as HTMLElement
    fireEvent.pointerDown(drag, { pointerId: 1, button: 0, clientX: 100, clientY: 40 })
    fireEvent.pointerMove(drag, { pointerId: 1, clientX: 800, clientY: 400 })
    fireEvent.pointerUp(drag, { pointerId: 1 })
    window.innerWidth = 200
    window.innerHeight = 200
    fireEvent(window, new Event('resize'))
    expect(Number.parseFloat(panel.style.width)).toBe(200)
  })

  it('connects with the overlay session query and reconnects after a drop', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    expect(lastSocket().url).toContain(`${CURSOR_AGENT_PTY_PATH}?session=cursor-cli-1`)
    lastSocket().close()
    await waitFor(() => {
      expect(view.getByRole('status').textContent).toBe('已断开')
    })
    await waitFor(() => {
      expect(harness.sockets).toHaveLength(2)
      expect(view.getByRole('status').textContent).toBe('已连接')
    })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'snapshot',
        status: 'idle',
        events: [{
          type: 'user',
          message: { content: [{ type: 'text', text: 'kept' }] },
        }],
        followUps: ['later'],
        cursorSessionId: 'sess',
        mirror: { input: '/model', below: [{ text: 'Auto', highlighted: true }] },
      }),
    } as MessageEvent)
    await waitFor(() => {
      expect(view.container.querySelector('[data-role="user"]')?.textContent).toContain('kept')
    })
    expect(view.container.querySelector('[data-cursor-agent-queued]')?.textContent).toContain('later')
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => String(item).includes('"prompt"') || String(item).includes('"keys"'))).toBe(true)
  })

  it('reopens immediately when the tab becomes visible after a drop', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().close()
    await waitFor(() => {
      expect(view.getByRole('status').textContent).toBe('已断开')
    })
    fireEvent(window, new Event('online'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => {
      expect(harness.sockets.length).toBeGreaterThanOrEqual(2)
      expect(view.getByRole('status').textContent).toBe('已连接')
    })
  })

  it('sends shutdown when a rail session is closed', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    confirmNewSession(view, 'Temp')
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')).toBeTruthy()
    })
    expect(harness.sockets.length).toBeGreaterThanOrEqual(2)
    const child = harness.sockets[1]
    expect(child).toBeDefined()
    const rail = view.container.querySelector('[data-cursor-agent-rail]') as HTMLElement
    await openRail(rail)
    fireEvent.click(view.container.querySelector('[data-cursor-agent-close-session="cursor-cli-2"]')!)
    expect(child!.sent.some(item => String(item).includes('"shutdown"'))).toBe(true)
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-2"]')).toBeNull()
  })

  it('restores named sessions from localStorage and mints the next id', async () => {
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: PANEL_BOOT,
      sessions: [{ id: 'cursor-cli-4', label: 'Keep' }],
      activeId: 'cursor-cli-4',
    }))
    const view = renderPanel()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-4"]')).toBeTruthy()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-4"]')?.getAttribute('title')).toBe('Keep')
    confirmNewSession(view)
    await waitFor(() => {
      expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-5"]')).toBeTruthy()
    })
  })

  it('starts at Chat 1 when the stored rail belongs to a previous dsh web process', () => {
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: 'previous-process',
      sessions: [{ id: 'cursor-cli-24', label: 'Chat 24' }],
      activeId: 'cursor-cli-24',
    }))
    const view = renderPanel()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-24"]')).toBeNull()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.getAttribute('title')).toBe('Chat 1')
  })

  it('starts at Chat 1 when the index has no host boot meta', () => {
    setHostBootMeta(undefined)
    localStorage.setItem(OVERLAY_RAIL_STORAGE_KEY, JSON.stringify({
      bootId: PANEL_BOOT,
      sessions: [{ id: 'cursor-cli-24', label: 'Chat 24' }],
      activeId: 'cursor-cli-24',
    }))
    const view = renderPanel()
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')?.getAttribute('title')).toBe('Chat 1')
  })
})

describe('composer PTY mirror', () => {
  it('hides the composer until the host reports the CLI is idle', async () => {
    cleanup()
    harness.sockets.length = 0
    class BootSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      readyState = BootSocket.CONNECTING
      url: string
      sent: unknown[] = []
      private readonly handlers = new Map<string, Set<(event?: MessageEvent) => void>>()
      constructor(url: string) {
        this.url = url
        harness.sockets.push(this as never)
        queueMicrotask(() => {
          this.readyState = BootSocket.OPEN
          this.emit('open')
          this.emit('message', { data: JSON.stringify({ op: 'ready' }) } as MessageEvent)
          this.emit('message', {
            data: JSON.stringify({ op: 'status', status: 'starting' }),
          } as MessageEvent)
        })
      }
      send(data: unknown) { this.sent.push(data) }
      close() { this.readyState = BootSocket.CLOSED; this.emit('close') }
      addEventListener(type: string, handler: WsHandler) {
        wsAddListener(this.handlers, type, handler)
      }
      removeEventListener(type: string, handler: WsHandler) {
        wsRemoveListener(this.handlers, type, handler)
      }
      emit(type: string, event?: MessageEvent) {
        wsEmit(this.handlers, type, event)
      }
    }
    vi.stubGlobal('WebSocket', BootSocket)
    const boot = render(<CursorPanel {...panelProps()} />)
    await waitFor(() => {
      expect(boot.container.querySelector('[data-cursor-agent-composer-starting]')).toBeTruthy()
    })
    expect(boot.container.querySelector('[data-cursor-agent-composer]')).toBeNull()
    expect(boot.container.querySelector('[data-cursor-agent-composer-starting]')?.textContent)
      .toContain('Cursor 启动中')
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'status', status: 'idle' }),
    } as MessageEvent)
    await waitFor(() => {
      expect(boot.container.querySelector('[data-cursor-agent-composer]')).toBeTruthy()
    })
    expect(boot.container.querySelector('[data-cursor-agent-composer-starting]')).toBeNull()
  })

  it('forwards focused keystrokes and paints a display-only below-prompt mirror', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    fireEvent.keyDown(input, { key: '/' })
    expect(lastSocket().sent.some(item => (
      String(item).includes('"keys"') && String(item).includes('/')
    ))).toBe(true)
    HTMLElement.prototype.scrollIntoView = vi.fn()
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '/',
        below: [
          { text: '', highlighted: false },
          { text: '', highlighted: false },
          { text: '→ /model [filter]           Select model', highlighted: true },
          { text: '', highlighted: false },
          { text: '     /ask                      Toggle ask', highlighted: false },
          { text: '', highlighted: false },
        ],
      }),
    } as MessageEvent)
    await waitFor(() => {
      const composer = view.container.querySelector(
        '[data-cursor-agent-composer] textarea',
      ) as HTMLTextAreaElement
      expect(composer.value).toBe('/')
      const mirror = view.container.querySelector(
        '[data-cursor-agent-selection="cli_option_mirror"]',
      ) as HTMLElement
      expect(mirror).toBeTruthy()
      const rows = [...mirror.querySelectorAll('[data-cursor-agent-mirror-line]')]
      expect(rows).toHaveLength(3)
      expect(rows[0]?.textContent).toContain('/model')
      expect(rows[0]?.textContent).toContain('  ')
      expect(rows[0]?.textContent).not.toMatch(/\s{3,}/u)
      expect(rows[0]?.hasAttribute('data-active')).toBe(true)
      expect(rows[1]?.hasAttribute('data-empty')).toBe(true)
      expect(rows[2]?.textContent).toContain('/ask')
    })
    // Display-only: clicks must not send select/prompt frames.
    fireEvent.mouseDown(
      view.container.querySelector(
        '[data-cursor-agent-selection="cli_option_mirror"] [data-cursor-agent-mirror-line][data-active]',
      ) as HTMLElement,
    )
    expect(lastSocket().sent.some(item => String(item).includes('"select"'))).toBe(false)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(lastSocket().sent.some(item => String(item).includes('[B'))).toBe(true)
    const mirror = view.container.querySelector(
      '[data-cursor-agent-selection="cli_option_mirror"]',
    ) as HTMLElement
    fireEvent.mouseDown(mirror)
    fireEvent.keyDown(mirror, { key: 'ArrowUp' })
    expect(lastSocket().sent.some(item => String(item).includes('[A'))).toBe(true)
  })

  it('marks the leading → row as active when the host omits reverse-video', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '/',
        below: [
          { text: '  /model [filter]  Select model', highlighted: false },
          { text: '  /goal [objective]  Start a durable goal', highlighted: false },
          { text: '  → /Ask  Toggle ask mode (Q&A, read-only / no edits or command execution)', highlighted: false },
          { text: '  ↓ more below', highlighted: false },
        ],
      }),
    } as MessageEvent)
    await waitFor(() => {
      const rows = [...view.container.querySelectorAll('[data-cursor-agent-mirror-line]')]
      expect(rows).toHaveLength(4)
      expect(rows[2]?.hasAttribute('data-active')).toBe(true)
      expect(rows[0]?.hasAttribute('data-active')).toBe(false)
      expect(rows[3]?.hasAttribute('data-active')).toBe(false)
    })
  })

  it('paints an AskQuestion mirror on the same glass card and forwards answer keys', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    HTMLElement.prototype.scrollIntoView = vi.fn()
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '',
        below: [
          { text: 'AskQuestion demo', highlighted: false },
          { text: 'Question 1 of 1', highlighted: false },
          { text: '> [ ] hotpot', highlighted: true },
          { text: '  [ ] noodles', highlighted: false },
          { text: 'Space toggle · Enter confirm highlighted', highlighted: false },
        ],
      }),
    } as MessageEvent)
    await waitFor(() => {
      const mirror = view.container.querySelector(
        '[data-cursor-agent-selection="cli_option_mirror"]',
      ) as HTMLElement
      expect(mirror?.textContent).toContain('AskQuestion demo')
      expect(mirror?.textContent).toContain('hotpot')
      expect(mirror.querySelector('[data-active]')?.textContent).toContain('hotpot')
    })
    fireEvent.keyDown(input, { key: ' ' })
    fireEvent.keyDown(input, { key: 'Enter' })
    const mirrorCard = view.container.querySelector(
      '[data-cursor-agent-selection="cli_option_mirror"]',
    ) as HTMLElement
    fireEvent.mouseDown(mirrorCard)
    const ime = view.container.querySelector(
      '[data-cursor-agent-mirror-ime]',
    ) as HTMLInputElement
    expect(ime).toBeTruthy()
    fireEvent.keyDown(mirrorCard, { key: 'ArrowDown' })
    const sent = lastSocket().sent.map(item => String(item))
    expect(sent.filter(item => item.includes('"keys"')).length).toBeGreaterThanOrEqual(3)
    expect(sent.some(item => item.includes('"data":" "'))).toBe(true)
    expect(sent.some(item => item.includes('[B'))).toBe(true)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '\u5348\u7761' } })
    fireEvent.compositionEnd(input, { data: '\u5348\u7761' })
    expect(lastSocket().sent.some(
      item => String(item).includes('"keys"') && String(item).includes('\u5348\u7761'),
    )).toBe(true)
    expect(input.value).toBe('')
    fireEvent.compositionStart(ime)
    expect(ime.hasAttribute('data-composing')).toBe(true)
    fireEvent.compositionEnd(ime, { data: '\u5348\u7761' })
    expect(ime.value).toBe('')
    expect(ime.getAttribute('data-composing')).toBeNull()
    expect(lastSocket().sent.filter(
      item => String(item).includes('"keys"') && String(item).includes('\u5348\u7761'),
    ).length).toBeGreaterThanOrEqual(2)
    fireEvent.compositionEnd(ime, { data: '' })
    fireEvent.mouseDown(ime)
    fireEvent.paste(ime, { clipboardData: { getData: () => '' } })
    fireEvent.paste(ime, { clipboardData: { getData: () => '\u81EA\u5B9A\u4E49' } })
    expect(lastSocket().sent.some(
      item => String(item).includes('"keys"') && String(item).includes('\u81EA\u5B9A\u4E49'),
    )).toBe(true)
    expect(view.container.querySelector('[data-role="user"]')).toBeNull()
  })

  it('forwards Enter into the PTY without inventing a transcript user band', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '/',
        below: [{ text: '→ /model Select model', highlighted: true }],
      }),
    } as MessageEvent)
    await waitFor(() => { expect(input.value).toBe('/') })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSocket().sent.some(item => String(item).includes('"keys"'))).toBe(true)
    expect(view.container.querySelector('[data-role="user"]')).toBeNull()
  })

  it('keeps CJK IME composition in the local chat draft without PTY keys', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    const before = lastSocket().sent.length
    // keyCode 229 must not be forwarded / preventDefault'd (breaks Windows IME).
    fireEvent.keyDown(input, { key: 'z', keyCode: 229, which: 229 })
    expect(lastSocket().sent.length).toBe(before)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '中' } })
    expect(input.value).toBe('中')
    // Host mirror must not wipe the in-progress composition.
    lastSocket().emit('message', {
      data: JSON.stringify({ op: 'mirror', input: '', below: [] }),
    } as MessageEvent)
    expect(input.value).toBe('中')
    fireEvent.compositionEnd(input, { data: '中' })
    // Chat draft stays local; only slash / picker IME commits go to the PTY.
    expect(lastSocket().sent.some(item => String(item).includes('中'))).toBe(false)
    expect(input.value).toBe('中')
  })

  it('forwards CJK IME commits into the PTY while a slash picker is open', async () => {
    const view = renderPanel()
    await waitFor(() => { expect(view.getByRole('status').textContent).toBe('已连接') })
    const input = view.container.querySelector(
      '[data-cursor-agent-composer] textarea',
    ) as HTMLTextAreaElement
    lastSocket().emit('message', {
      data: JSON.stringify({
        op: 'mirror',
        input: '/',
        below: [{ text: '→ /model', highlighted: true }],
      }),
    } as MessageEvent)
    await waitFor(() => { expect(input.value).toBe('/') })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '/中' } })
    fireEvent.compositionEnd(input, { data: '中' })
    await waitFor(() => {
      expect(lastSocket().sent.some(item => String(item).includes('"keys"') && String(item).includes('中'))).toBe(true)
    })
  })
})

describe('overlay chrome CSS', () => {
  it('hides DSH chrome, stretches one rail slab, and floats the composer', () => {
    const source = readFileSync(
      resolve('packages/client/ui-cursor-agent/src/client/CursorPanel.module.css'),
      'utf8',
    )
    expect(source).toContain('[data-dsh-conversation-surface]')
    expect(source).toContain('display: none !important')
    expect(source).toContain(':global([data-shell-overlay])')
    expect(source).toMatch(
      /:global\(\[data-shell-overlay\]\) \{[\s\S]*?\n  overflow: hidden;/,
    )
    expect(source).toContain('.railOpen')
    expect(source).toContain('.railInner')
    expect(source).toContain('.railSessions')
    expect(source).toContain('.pluginDock')
    expect(source).toContain('.pluginToggle')
    expect(source).toContain('.pluginPanel')
    expect(source).toContain('.pluginList')
    expect(source).toContain('--plugin-row-height: 36px')
    expect(source).toContain('--rail-collapsed: 40px')
    expect(source).toContain('--rail-expanded: 228px')
    expect(source).toContain('transition: width 180ms ease')
    expect(source).toContain('--dsw-specific-sidebar-fill')
    expect(source).toContain('.mark')
    expect(source).toContain('.chatColumn')
    expect(source).toContain('.dragStrip')
    expect(source).toContain('.mcpStatus')
    expect(source).toContain(".mcpStatus[data-connected='connected']")
    expect(source).toMatch(
      /\.mcpStatus\[data-connected='connected'\] \{[\s\S]*?color: var\(--dsw-alias-label-primary\);[\s\S]*?font-weight: 700;/,
    )
    expect(source).toMatch(
      /\.mcpStatus\[data-connected='disconnected'\] \{[\s\S]*?color: var\(--dsw-alias-label-primary\);[\s\S]*?font-weight: 400;/,
    )
    expect(source).toContain('--dsw-alias-state-error-secondary')
    expect(source).toMatch(
      /\.spriteHint\[data-sprite-status='live'\] \{[\s\S]*?color: var\(--dsw-alias-label-primary\);[\s\S]*?font-weight: 700;/,
    )
    expect(source).toContain('height: 1cm')
    expect(source).toContain('linear-gradient')
    expect(source).toContain('margin-bottom: -20px')
    expect(source).toContain('cursor: default')
    expect(source).toContain('.spriteFace')
    expect(source).toContain('cursor: grab')
    expect(source).toContain('cursor: grabbing')
    expect(source).toContain('--cursor-overlay-type: 0.9')
    expect(source).toContain('.emptyHero')
    expect(source).toContain('.emptyHeroTitle')
    expect(source).not.toContain('.emptyState')
    expect(source).toContain('.sessionList')
    expect(source).toContain('flex: none')
    expect(source).toContain('.sessionGlyph')
    expect(source).toContain('.iconButton')
    expect(source).toContain('.composeDock')
    expect(source).toContain('position: absolute')
    expect(source).toContain('border-radius: 20px')
    expect(source).toContain('var(--composer-lh) * 3.5')
    expect(source).toContain('overflow-y: hidden')
    expect(source).toContain('.composerInput[data-overflow]')
    expect(source).toContain('width: 4px')
    expect(source).toContain('.suggestList')
    expect(source).toContain('.cliBelow')
    expect(source).toMatch(/\.cliBelow \{[\s\S]*?white-space: pre-wrap/)
    expect(source).toMatch(/\.cliBelow \{[\s\S]*?overflow-x: hidden/)
    expect(source).toMatch(/\.cliBelow \{[\s\S]*?overscroll-behavior: contain/)
    expect(source).toContain('backdrop-filter: blur(14px)')
    expect(source).toContain('var(--dsw-shadow-lv3)')
    expect(source).toContain('.cliBelowRow')
    expect(source).toContain('.cliBelowRow[data-empty]')
    expect(source).toContain('min-height: 0.6em')
    expect(source).toContain('.userBand')
    expect(source).toContain('--cursor-resize-hit: 4px')
    expect(source).toMatch(
      /\.edgeN,\s*\n\.edgeS,\s*\n\.edgeE,\s*\n\.edgeW \{\s*\n  pointer-events: none;/,
    )
    expect(source).toMatch(/\.edgeE::before \{[\s\S]*?width: var\(--cursor-resize-hit\)/)
    const sessionSource = readFileSync(
      resolve('packages/client/ui-cursor-agent/src/client/ChatSession.tsx'),
      'utf8',
    )
    expect(sessionSource.indexOf('onCommitText={sendKeys}'))
      .toBeLessThan(sessionSource.indexOf('className={css.composer}'))
    expect(source).toContain('.assistantBand')
    expect(source).toContain('background: transparent')
    expect(source).toContain('.assistantMarkdown')
    expect(source).toContain('--dsw-font-markdown-base: calc(13px * var(--cursor-overlay-type))')
    expect(source).toContain('.minimizeButton')
    expect(source).toContain('.spriteFace')
    expect(source).toContain('.spriteBob')
    expect(source).toContain('.spriteLens')
    expect(source).toContain('.spriteMark')
    expect(source).toContain('.spriteRing')
    expect(source).toContain('.spriteInner')
    expect(source).not.toContain('stroke-dasharray')
    expect(source).not.toContain('spriteRingWander')
    expect(source).not.toContain('spriteRingSpin')
    expect(source).not.toContain('.spriteAura')
    expect(source).not.toContain('.spriteKernel')
    expect(source).not.toContain('--sprite-accent')
    expect(source).not.toContain('clip-path')
    expect(source).toContain('[data-geometry-animating]')
    expect(source).toContain('.auxRow')
    expect(source).toContain('.auxSummary')
    expect(source).toContain('.runningRow')
    expect(source).toContain('.tasksRow')
    expect(source).toContain('.queueFloat')
    expect(source).toContain('.usageFooter')
    expect(source).toContain('.jumpBottom')
    expect(source).toContain('.transcriptHost')
    expect(source).not.toContain('.thinkingCard')
    expect(source).not.toContain('.toolCard')
    expect(source).not.toContain('.activityRow')
    expect(source).not.toContain('.composerSend')
    expect(source).not.toContain('.railPanel')
    expect(source).not.toContain('.titleBar')
    expect(source).not.toContain('.traffic')
    expect(source).not.toContain('.railHandle')
    expect(source).not.toContain('.sessionMonogram')
    expect(source).not.toContain('.sessionDot')
    expect(source).not.toContain('.dotLive')
    expect(source).not.toContain('.dotConnecting')
    expect(source).not.toContain('.dotDead')
    expect(source).not.toContain('.rail:focus-within')
    expect(source).toMatch(/\.railInner \{[^}]*overflow: hidden/)
    expect(source).toMatch(/\.railSessions \{[^}]*overflow-y: auto/)
    expect(source).toMatch(/\.pluginPanel \{[^}]*bottom: 100%/)
    expect(source).toMatch(/\.pluginList \{[^}]*--plugin-row-height\) \* 3\.5/)
    expect(source).not.toMatch(/\.pluginPanel \{[^}]*max-height: min\(360px/)
    expect(source).not.toMatch(/\.pluginToggle \{[^}]*margin-top: auto/)
    expect(source).toMatch(/\.newSession \{[^}]*margin-top: 2px/)
  })

  it('minimizes into a bottom-right sprite and expands on a click without drag', async () => {
    const view = renderPanel()
    const windowEl = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    const socketsBefore = harness.sockets.length
    fireEvent.click(view.container.querySelector('[data-cursor-agent-minimize]')!)
    expect(windowEl.hasAttribute('data-minimized')).toBe(true)
    expect(view.container.querySelector('[data-cursor-agent-sprite]')?.getAttribute('aria-label')).toBe('展开 Cursor')
    // Panel chrome stays mounted (hidden) so chat sockets are not torn down.
    expect(view.container.querySelector('[data-cursor-agent-body]')?.getAttribute('aria-hidden')).toBe('true')
    expect(Number.parseFloat(windowEl.style.width)).toBe(OVERLAY_SPRITE_SIZE)
    expect(Number.parseFloat(windowEl.style.height)).toBe(OVERLAY_SPRITE_SIZE)
    expect(Number.parseFloat(windowEl.style.left)).toBe(1920 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN)
    expect(Number.parseFloat(windowEl.style.top)).toBe(1080 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN)
    expect(view.container.querySelector('[data-cursor-agent-sprite]')?.getAttribute('data-sprite-status')).toBe('connecting')
    expect(view.container.querySelectorAll('[data-cursor-agent-sprite] svg circle')).toHaveLength(1)
    expect(view.container.querySelector('[data-cursor-agent-sprite] svg text')?.textContent).toBe('C')
    await act(async () => {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve() }) })
    })
    expect(view.container.querySelector('[data-cursor-agent-sprite] g')?.getAttribute('transform')).toContain('translate')
    expect(view.container.querySelector('[data-cursor-agent-session="cursor-cli-1"]')).toBeTruthy()
    expect(harness.sockets.length).toBe(socketsBefore)

    const sprite = view.container.querySelector('[data-cursor-agent-sprite]') as HTMLElement
    fireEvent.pointerDown(sprite, { button: 0, pointerId: 9, clientX: 1800, clientY: 1000 })
    fireEvent.pointerUp(sprite, { button: 0, pointerId: 9, clientX: 1800, clientY: 1000 })
    expect(windowEl.hasAttribute('data-minimized')).toBe(false)
    expect(view.container.querySelector('[data-cursor-agent-sprite]')).toBeNull()
    expect(view.container.querySelector('[data-cursor-agent-body]')?.hasAttribute('aria-hidden')).toBe(false)
    expect(Number.parseFloat(windowEl.style.width)).toBeGreaterThan(200)
  })

  it('drags the minimized sprite without expanding', async () => {
    const view = renderPanel()
    const windowEl = view.container.querySelector('[data-cursor-agent-window]') as HTMLElement
    fireEvent.click(view.container.querySelector('[data-cursor-agent-minimize]')!)
    const sprite = view.container.querySelector('[data-cursor-agent-sprite]') as HTMLElement
    fireEvent.pointerDown(sprite, { button: 0, pointerId: 11, clientX: 1800, clientY: 1000 })
    await act(async () => {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve() }) })
    })
    fireEvent.pointerMove(sprite, { button: 0, pointerId: 11, clientX: 1700, clientY: 900 })
    expect(Number(view.container.querySelector('[data-sprite-heading]')?.getAttribute('data-sprite-heading'))).toBe(45)
    fireEvent.pointerUp(sprite, { button: 0, pointerId: 11, clientX: 1700, clientY: 900 })
    expect(windowEl.hasAttribute('data-minimized')).toBe(true)
    expect(Number.parseFloat(windowEl.style.left)).toBeLessThan(1920 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN)
    expect(Number.parseFloat(windowEl.style.top)).toBeLessThan(1080 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN)
  })

  it('holds the sprite drawing still when reduced motion is preferred', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false },
    })) as typeof window.matchMedia
    try {
      const view = renderPanel()
      fireEvent.click(view.container.querySelector('[data-cursor-agent-minimize]')!)
      expect(view.container.querySelector('[data-cursor-agent-sprite] g')?.getAttribute('transform')).toBe('translate(0 0)')
    } finally {
      window.matchMedia = original
    }
  })

  it('clears sprite drag on pointer cancel', () => {
    const view = renderPanel()
    fireEvent.click(view.container.querySelector('[data-cursor-agent-minimize]')!)
    const sprite = view.container.querySelector('[data-cursor-agent-sprite]') as HTMLElement
    fireEvent.pointerDown(sprite, { button: 0, pointerId: 13, clientX: 1800, clientY: 1000 })
    fireEvent.pointerCancel(sprite, { button: 0, pointerId: 13, clientX: 1800, clientY: 1000 })
    expect(view.container.querySelector('[data-cursor-agent-window]')?.hasAttribute('data-minimized')).toBe(true)
  })
})
