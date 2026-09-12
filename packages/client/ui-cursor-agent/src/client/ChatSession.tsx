/** One Cursor chat session: stream-json transcript plus a compose dock. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent as ReactChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  countActiveTasks,
  emptyChatFold,
  foldCursorEvent,
  formatUsageLine,
  settleStreaming,
  toolHintFromDetail,
  type ChatFold,
  type ChatTurn,
} from './chat-model.ts'
import { cursorAgentChatUrl } from './chat-url.ts'
import { OptionMirror, type OptionMirrorLine } from './OptionMirror.tsx'
import {
  flattenPtyPaste,
  insertAtRange,
  isAbortChromeDraft,
  isClipboardEditShortcut,
  normalizeComposerPaste,
  ptyOwnsComposer,
  readClipboardText,
} from './composer-clipboard.ts'
import { encodePtyKey } from './pty-keys.ts'
import type { OverlaySessionId } from './session-id.ts'
import css from './CursorPanel.module.css'

/** Props for one overlay chat session host. */
export type ChatSessionProps = {
  /** Overlay rail session this socket belongs to. */
  sessionId: OverlaySessionId
  /** Whether this host is the visible/active session. */
  active: boolean
  /** Report connecting / live / disconnected for the chrome status. */
  onStatus: (sessionId: OverlaySessionId, status: 'connecting' | 'live' | 'disconnected') => void
  /**
   * Report `{op:"dsh_mcp"}` / `snapshot.dshMcp` for the drag-strip chrome.
   * Omitted in tests that do not assert overlay chrome.
   */
  onDshMcp?: (sessionId: OverlaySessionId, status: DshMcpChromeStatus) => void
  /**
   * Register a host shutdown sender for the rail close control.
   * Socket close without this call leaves the Cursor CLI running.
   */
  registerShutdown?: (
    sessionId: OverlaySessionId,
    shutdown: () => void,
  ) => () => void
  /** Locale strings for the composer, activity rows, and usage footer. */
  labels: {
    readonly placeholder: string
    /** Shown in the compose dock while the CLI PTY is still booting. */
    readonly starting: string
    readonly heroTitle: string
    readonly heroTip1: string
    readonly heroTip2: string
    readonly running: string
    readonly jumpBottom: string
    readonly toolRunning: string
    readonly toolDone: string
    readonly toolError: string
    readonly taskRunning: string
    readonly taskDone: string
    readonly taskBackground: string
    readonly taskError: string
    readonly tasksRunningAgents: string
    readonly tasksCount: string
    readonly thinkingRunning: string
    readonly thinkingDone: string
    readonly systemReady: string
    readonly usageLabel: string
    readonly usageInput: string
    readonly usageOutput: string
    readonly usageCacheRead: string
    readonly usageCacheWrite: string
    readonly copy: string
    readonly copied: string
    readonly followupQueued: string
    readonly followupQueueHint: string
    readonly followupSteerNow: string
    readonly followupCancelLast: string
  }
}

type HostStatus = 'starting' | 'idle' | 'running'
type FollowUpMode = 'queue' | 'steer'

/** Reserved transcript bottom pad when only the compose pill is docked. */
const COMPOSER_DOCK_BASE_PAD_PX = 128
/** Extra space under the measured dock (`bottom: 14px` plus breathing room). */
const COMPOSER_DOCK_BOTTOM_GAP_PX = 28
/** Minimum extra pad when a queue float is visible above the composer. */
const QUEUE_STRIP_MIN_EXTRA_PAD_PX = 72
/** Distance from the true bottom that still counts as parked there. */
const STICK_BOTTOM_PX = 16

/**
 * Drop a composer draft that is only the failed-turn banner.
 * @param current - textarea value.
 * @param message - host error text, when present.
 * @returns the next draft.
 */
function draftAfterFailure(current: string, message: string | undefined): string {
  if (isAbortChromeDraft(current)) return ''
  if (typeof message === 'string' && message.length > 0 && current === message) return ''
  return current
}

/** Values on `{op:"dsh_mcp"}.status` and `snapshot.dshMcp`. */
export type DshMcpChromeStatus = 'checking' | 'connected' | 'disconnected'

function readDshMcpStatus(value: unknown): DshMcpChromeStatus | undefined {
  if (value === 'connected' || value === 'disconnected' || value === 'checking') return value
  return undefined
}

/**
 * Mount one WebSocket chat session over `/cursor-agent`.
 * Chat turns use `{op:"prompt"}` so the host can spawn headless stream-json;
 * the fold paints Markdown / thinking / tools from those events. Slash menus
 * still go through `{op:"keys"}` + `{op:"mirror"}` on the interactive PTY.
 * Composer copy/cut/paste use clipboard events; they are not encoded as PTY keys.
 * Shift+Enter inserts a newline in the local draft. Backspace and printable
 * keys apply at the caret. Enter sends `{op:"prompt"}`.
 * Busy Enter appends `mode:"queue"` into a multi-item strip above the composer.
 * The host CLI outlives this socket; the effect reconnects until unmount or
 * an explicit shutdown from the rail close control.
 * @param props - session identity, visibility, status callback, and copy.
 * @returns the chat body for one rail session.
 */
export function ChatSession({
  sessionId,
  active,
  onStatus,
  onDshMcp,
  registerShutdown,
  labels,
}: ChatSessionProps) {
  const [fold, setFold] = useState<ChatFold>(emptyChatFold)
  const [draft, setDraft] = useState('')
  const [below, setBelow] = useState<readonly OptionMirrorLine[]>([])
  const [queuedFollowUps, setQueuedFollowUps] = useState<readonly string[]>([])
  const [hostStatus, setHostStatus] = useState<HostStatus>('starting')
  /** Latches true after the first CLI `idle`/`running` — errors must not hide the dock again. */
  const [cliReady, setCliReady] = useState(false)
  const [nearBottom, setNearBottom] = useState(true)
  const [dockPad, setDockPad] = useState(COMPOSER_DOCK_BASE_PAD_PX)
  const [error, setError] = useState<string | undefined>(undefined)
  const [composing, setComposing] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const composeDockRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  /** True only while the user is parked at the bottom; cleared on intentional scroll-up. */
  const stickRef = useRef(true)
  /** Mirrors `composing` for the socket callback (avoids stale closures during IME). */
  const composingRef = useRef(false)
  /** When true, `{op:"mirror"}` owns the draft (slash / option surfaces). */
  const mirrorOwnsDraftRef = useRef(false)
  /** Caret to apply after a clipboard insert/cut; consumed on the next composer layout. */
  const pendingCaretRef = useRef<number | undefined>(undefined)
  const codeLabels = useMemo(
    () => ({ copyLabel: labels.copy, copiedLabel: labels.copied }),
    [labels.copy, labels.copied],
  )
  const usageLabels = useMemo(
    () => ({
      input: labels.usageInput,
      output: labels.usageOutput,
      cacheRead: labels.usageCacheRead,
      cacheWrite: labels.usageCacheWrite,
    }),
    [labels.usageInput, labels.usageOutput, labels.usageCacheRead, labels.usageCacheWrite],
  )
  const usageLine = fold.usage === undefined ? '' : formatUsageLine(fold.usage, usageLabels)
  const busy = hostStatus === 'running'
  const activeTaskCount = countActiveTasks(fold.turns)
  const mirrorOpen = below.length > 0
  const showDock = nearBottom

  useEffect(() => {
    let cancelled = false
    let shuttingDown = false
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const clearRetry = (): void => {
      if (retryTimer === undefined) return
      clearTimeout(retryTimer)
      retryTimer = undefined
    }

    const applyFailedTurn = (message: unknown): void => {
      if (typeof message === 'string' && message.length > 0) setError(message)
      setHostStatus('idle')
      setCliReady(true)
      setBelow([])
      mirrorOwnsDraftRef.current = false
      setDraft(current => draftAfterFailure(
        current,
        typeof message === 'string' ? message : undefined,
      ))
    }

    const applyMirror = (belowRaw: unknown, input: unknown): void => {
      const nextBelow = readMirrorBelow(belowRaw).filter(line => !isAbortChromeDraft(line.text))
      if (typeof input === 'string' && isAbortChromeDraft(input)) {
        setBelow(nextBelow)
        mirrorOwnsDraftRef.current = nextBelow.length > 0
        setDraft(current => (isAbortChromeDraft(current) ? '' : current))
        return
      }
      setBelow(nextBelow)
      const pickerOpen = nextBelow.length > 0
      if (pickerOpen) mirrorOwnsDraftRef.current = true
      if (typeof input !== 'string' || composingRef.current) return
      if (pickerOpen || mirrorOwnsDraftRef.current || input.startsWith('/')) {
        setDraft(input)
        if (!pickerOpen && input.length === 0) mirrorOwnsDraftRef.current = false
      }
    }

    const applySnapshot = (parsed: Record<string, unknown>): void => {
      const eventsRaw = parsed.events
      if (Array.isArray(eventsRaw)) {
        let nextFold = emptyChatFold()
        for (const item of eventsRaw) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            nextFold = foldCursorEvent(nextFold, item as Record<string, unknown>)
          }
        }
        const status = parsed.status
        setFold(status === 'idle' ? settleStreaming(nextFold) : nextFold)
      }
      const followUps = readFollowUpItems(parsed.followUps)
      if (followUps !== undefined) setQueuedFollowUps(followUps)
      const status = parsed.status
      if (
        status === 'starting'
        || status === 'idle'
        || status === 'running'
        || status === 'error'
      ) {
        if (status === 'error') {
          applyFailedTurn(parsed.message)
        } else {
          setHostStatus(status)
          if (status === 'idle' || status === 'running') setCliReady(true)
          setError(undefined)
        }
      }
      const mirror = parsed.mirror
      if (typeof mirror === 'object' && mirror !== null) {
        applyMirror(
          (mirror as { below?: unknown }).below,
          (mirror as { input?: unknown }).input,
        )
      }
    }

    const onMessage = (event: MessageEvent): void => {
      if (typeof event.data !== 'string') return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data) as unknown
      } catch {
        return
      }
      if (typeof parsed !== 'object' || parsed === null) return
      const record = parsed as Record<string, unknown>
      const op = record.op
      if (op === 'snapshot') {
        applySnapshot(record)
        const listed = readDshMcpStatus(record.dshMcp)
        if (listed !== undefined) onDshMcp?.(sessionId, listed)
        return
      }
      if (op === 'dsh_mcp') {
        const listed = readDshMcpStatus(record.status)
        if (listed !== undefined) onDshMcp?.(sessionId, listed)
        return
      }
      if (op === 'status') {
        const status = record.status
        if (
          status === 'starting'
          || status === 'idle'
          || status === 'running'
          || status === 'error'
        ) {
          if (status === 'error') {
            applyFailedTurn(record.message)
          } else {
            setHostStatus(status)
            if (status === 'idle' || status === 'running') setCliReady(true)
            if (status === 'idle') setFold(current => settleStreaming(current))
            setError(undefined)
          }
        }
        return
      }
      if (op === 'error') {
        applyFailedTurn(record.message)
        return
      }
      if (op === 'followup') {
        const items = readFollowUpItems(record.items)
        if (items !== undefined) setQueuedFollowUps(items)
        return
      }
      if (op === 'mirror') {
        applyMirror(record.below, record.input)
        return
      }
      if (op === 'event') {
        const streamEvent = record.event
        if (typeof streamEvent === 'object' && streamEvent !== null && !Array.isArray(streamEvent)) {
          const eventRecord = streamEvent as Record<string, unknown>
          setFold(current => foldCursorEvent(current, eventRecord))
          if (eventRecord.type === 'result') {
            setHostStatus('idle')
            setCliReady(true)
          }
        }
      }
    }

    const connect = (): void => {
      if (cancelled || shuttingDown) return
      clearRetry()
      onStatus(sessionId, 'connecting')
      const next = new WebSocket(cursorAgentChatUrl(sessionId))
      socket = next
      socketRef.current = next
      const onOpen = (): void => { onStatus(sessionId, 'live') }
      const onDead = (): void => {
        if (socket === next) socketRef.current = null
        next.removeEventListener('open', onOpen)
        next.removeEventListener('message', onMessage)
        next.removeEventListener('close', onDead)
        next.removeEventListener('error', onDead)
        if (cancelled || shuttingDown) return
        onStatus(sessionId, 'disconnected')
        clearRetry()
        retryTimer = setTimeout(connect, RECONNECT_MS)
      }
      next.addEventListener('open', onOpen)
      next.addEventListener('message', onMessage)
      next.addEventListener('close', onDead)
      next.addEventListener('error', onDead)
    }

    const kickReconnect = (): void => {
      if (cancelled || shuttingDown) return
      const current = socket
      if (current !== null && (
        current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING
      )) {
        return
      }
      clearRetry()
      connect()
    }

    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return
      kickReconnect()
    }

    const shutdown = (): void => {
      shuttingDown = true
      clearRetry()
      const current = socketRef.current
      if (current?.readyState === WebSocket.OPEN) {
        current.send(JSON.stringify({ op: 'shutdown' }))
      }
    }

    connect()
    document.addEventListener('visibilitychange', onVisible)
    globalThis.addEventListener('online', kickReconnect)
    const disposeShutdown = registerShutdown?.(sessionId, shutdown)
    return () => {
      cancelled = true
      clearRetry()
      document.removeEventListener('visibilitychange', onVisible)
      globalThis.removeEventListener('online', kickReconnect)
      disposeShutdown?.()
      const current = socket
      if (current !== null && (
        current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.OPEN
      )) {
        current.close()
      }
      socketRef.current = null
    }
  }, [sessionId, onStatus, onDshMcp, registerShutdown])

  useLayoutEffect(() => {
    if (!active || !stickRef.current) return
    const scroller = scrollerRef.current
    /* v8 ignore next -- the scroller ref is attached before this layout effect runs. */
    if (scroller === null) return
    scroller.scrollTop = scroller.scrollHeight
  }, [fold, active, hostStatus, queuedFollowUps.length])

  useLayoutEffect(() => {
    const input = composerRef.current
    /* v8 ignore next -- the composer mounts with the active near-bottom dock. */
    if (input === null) return
    syncComposerHeight(input)
    const caret = pendingCaretRef.current
    if (caret !== undefined) {
      pendingCaretRef.current = undefined
      input.setSelectionRange(caret, caret)
    }
  }, [draft, active, nearBottom, below, cliReady, queuedFollowUps.length])

  useLayoutEffect(() => {
    const applyPad = (next: number): void => {
      setDockPad(current => (current === next ? current : next))
    }
    if (!showDock) {
      // Keep the last measured pad. Shrinking it here shortens scrollHeight and
      // yanks a just-released scroll back into the stick zone.
      return
    }
    const dock = composeDockRef.current
    /* v8 ignore next -- the dock mounts with nearBottom before this layout effect. */
    if (dock === null) {
      applyPad(COMPOSER_DOCK_BASE_PAD_PX)
      return
    }
    const queueCount = queuedFollowUps.length
    const syncPad = (): void => {
      const measured = Math.ceil(dock.getBoundingClientRect().height) + COMPOSER_DOCK_BOTTOM_GAP_PX
      const floor = queueCount > 0
        ? COMPOSER_DOCK_BASE_PAD_PX + QUEUE_STRIP_MIN_EXTRA_PAD_PX
        : COMPOSER_DOCK_BASE_PAD_PX
      const next = Math.max(floor, measured)
      applyPad(next)
      if (!stickRef.current) return
      const scroller = scrollerRef.current
      /* v8 ignore next -- scroller is mounted with the active session. */
      if (scroller === null) return
      scroller.scrollTop = scroller.scrollHeight
    }
    syncPad()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncPad)
    observer.observe(dock)
    return () => { observer.disconnect() }
  }, [showDock, nearBottom, draft, usageLine, below, active, cliReady, queuedFollowUps.length])

  const onScroll = (): void => {
    const scroller = scrollerRef.current
    /* v8 ignore next -- scroll events fire on the scroller that holds this handler. */
    if (scroller === null) return
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const atBottom = distance <= STICK_BOTTOM_PX
    stickRef.current = atBottom
    setNearBottom(atBottom)
  }

  const jumpToBottom = (): void => {
    const scroller = scrollerRef.current
    stickRef.current = true
    setNearBottom(true)
    /* v8 ignore next -- the jump control mounts only while the scroller is attached. */
    if (scroller === null) return
    scroller.scrollTop = scroller.scrollHeight
  }

  const sendKeys = (data: string): void => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ op: 'keys', data }))
  }

  const sendPrompt = (text: string, mode?: FollowUpMode): void => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    if (mode === 'queue') {
      setQueuedFollowUps(current => [...current, text])
    } else {
      // Mark busy immediately so a second Enter queues before the host status
      // frame arrives (bare prompts while a child runs are treated as queue).
      setHostStatus('running')
    }
    socket.send(JSON.stringify(
      mode === undefined ? { op: 'prompt', text } : { op: 'prompt', text, mode },
    ))
  }

  const send = (): void => {
    const text = draft.trim()
    if (text.length === 0) return
    stickRef.current = true
    setNearBottom(true)
    setError(undefined)
    setDraft('')
    mirrorOwnsDraftRef.current = false
    // Clear any leftover PTY bar draft so mirror chrome cannot repaint it.
    sendKeys('\x15')
    if (busy || hostStatus === 'running') {
      sendPrompt(text, 'queue')
      return
    }
    sendPrompt(text)
  }

  const steerQueued = (): void => {
    const next = queuedFollowUps[0]
    if (next === undefined) return
    setQueuedFollowUps(current => current.slice(1))
    sendPrompt(next, 'steer')
  }

  const cancelQueued = (): void => {
    if (queuedFollowUps.length === 0) return
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    const removed = queuedFollowUps[queuedFollowUps.length - 1]
    /* v8 ignore next -- length check guarantees a string. */
    if (removed === undefined) return
    setQueuedFollowUps(current => current.slice(0, -1))
    setDraft(removed)
    socket.send(JSON.stringify({ op: 'followup_cancel' }))
  }

  const interrupt = (): void => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ op: 'interrupt' }))
    setHostStatus('idle')
    setFold(current => settleStreaming(current))
  }

  const restoreCaret = (offset: number): void => {
    pendingCaretRef.current = offset
  }

  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    if (composingRef.current) return
    event.preventDefault()
    const raw = readClipboardText(event.clipboardData)
    if (raw.length === 0) return
    const el = event.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    if (ptyOwnsComposer(draft, below.length, mirrorOwnsDraftRef.current)) {
      const data = flattenPtyPaste(raw)
      setDraft(insertAtRange(draft, start, end, data))
      sendKeys(data)
      restoreCaret(Math.min(start, end) + data.length)
      return
    }
    const insert = normalizeComposerPaste(raw)
    setDraft(insertAtRange(draft, start, end, insert))
    restoreCaret(Math.min(start, end) + insert.length)
  }

  const onCut = (event: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    if (composingRef.current) return
    const el = event.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start === end) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    const lo = Math.min(start, end)
    const hi = Math.max(start, end)
    const selected = draft.slice(lo, hi)
    event.clipboardData?.setData('text/plain', selected)
    setDraft(insertAtRange(draft, start, end, ''))
    if (ptyOwnsComposer(draft, below.length, mirrorOwnsDraftRef.current)) {
      sendKeys('\x7f'.repeat(selected.length))
    }
    restoreCaret(lo)
  }

  const forwardSurfaceKey = (event: ReactKeyboardEvent<HTMLElement>): boolean => {
    if (isImeKeydown(event, composing)) return false
    const pickerOpen = below.length > 0 || mirrorOwnsDraftRef.current
    const slashMode = draft.startsWith('/') || (draft.length === 0 && event.key === '/')
    if (!pickerOpen && !slashMode) return false
    const data = encodePtyKey(event.key, {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      meta: event.metaKey,
    })
    if (data === undefined) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.key === '/') mirrorOwnsDraftRef.current = true
    if (!below.some(line => line.text.includes('AskQuestion'))) {
      applyLocalEcho(data, setDraft)
    }
    sendKeys(data)
    return true
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    // CJK IMEs mark keydown with keyCode 229 / key "Process" before composition
    // starts — must not preventDefault or forward those strokes to the PTY.
    if (isImeKeydown(event, composing)) return

    if (event.key === 'Escape' && queuedFollowUps.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      cancelQueued()
      return
    }

    const pickerOpen = below.length > 0 || mirrorOwnsDraftRef.current
    const slashMode = draft.startsWith('/') || (draft.length === 0 && event.key === '/')
    const el = event.currentTarget

    if (isClipboardEditShortcut(event.key, {
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      alt: event.altKey,
    })) {
      const letter = event.key.toLowerCase()
      if (letter === 'v' || letter === 'x') return
      if (el.selectionStart !== el.selectionEnd) return
      if (event.metaKey === true) return
      if (busy && !pickerOpen && !slashMode) {
        event.preventDefault()
        event.stopPropagation()
        interrupt()
        return
      }
      if (!pickerOpen && !slashMode) return
    }

    if (forwardSurfaceKey(event)) return

    const applyAt = (start: number, end: number, insert: string): void => {
      setDraft(current => insertAtRange(current, start, end, insert))
      restoreCaret(Math.min(start, end) + insert.length)
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      applyAt(el.selectionStart, el.selectionEnd, '\n')
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      send()
      return
    }

    // Local chat draft — do not forward printable keys into the PTY.
    if (event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      const start = el.selectionStart
      const end = el.selectionEnd
      if (start !== end) {
        applyAt(start, end, '')
        return
      }
      if (start === 0) return
      applyAt(start - 1, start, '')
      return
    }
    if (event.key === 'Delete') {
      event.preventDefault()
      event.stopPropagation()
      const start = el.selectionStart
      const end = el.selectionEnd
      if (start !== end) {
        applyAt(start, end, '')
        return
      }
      applyAt(start, start + 1, '')
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      applyAt(el.selectionStart, el.selectionEnd, event.key)
    }
  }

  const onChange = (event: ReactChangeEvent<HTMLTextAreaElement>): void => {
    // Controlled value must track the browser during IME; otherwise React
    // resets the textarea every render and Chinese input freezes.
    if (composingRef.current || event.nativeEvent.isComposing) {
      setDraft(event.target.value)
    }
  }

  const onCompositionStart = (): void => {
    composingRef.current = true
    setComposing(true)
  }

  const onCompositionEnd = (event: ReactCompositionEvent<HTMLTextAreaElement>): void => {
    composingRef.current = false
    setComposing(false)
    const next = event.currentTarget.value
    setDraft(next)
    const text = event.data
    // Only forward IME commits into the PTY while a picker/slash owns the bar.
    if (text.length > 0 && (below.length > 0 || mirrorOwnsDraftRef.current || next.startsWith('/'))) {
      sendKeys(text)
      if (below.some(line => line.text.includes('AskQuestion'))) {
        setDraft('')
      }
    }
  }

  return (
    <div
      className={css.chatSession}
      data-cursor-agent-chat=""
      data-session={sessionId}
      data-active={active || undefined}
      hidden={!active}
    >
      <div className={css.transcriptHost}>
        <div
          ref={scrollerRef}
          className={css.transcript}
          data-cursor-agent-transcript=""
          style={{ paddingBottom: dockPad }}
          onScroll={onScroll}
        >
          {fold.turns.length === 0 && !busy && (
            <div className={css.emptyHero} data-cursor-agent-empty="">
              <p className={css.emptyHeroTitle}>{labels.heroTitle}</p>
              <p className={css.emptyHeroTip}>{labels.heroTip1}</p>
              <p className={css.emptyHeroTip}>{labels.heroTip2}</p>
            </div>
          )}
          {fold.turns.map(turn => (
            <TurnBand key={turn.id} turn={turn} labels={labels} codeLabels={codeLabels} />
          ))}
          {busy && activeTaskCount > 0 && (
            <div className={css.tasksRow} data-cursor-agent-tasks="">
              {labels.tasksRunningAgents.replace('{n}', String(activeTaskCount))}
              <span className={css.tasksCount}>
                {labels.tasksCount.replace('{n}', String(activeTaskCount))}
              </span>
            </div>
          )}
          {busy && (
            <div className={css.runningRow} data-cursor-agent-running="">
              {labels.running}
            </div>
          )}
          {error !== undefined && (
            <div className={css.systemBand} role="alert">{error}</div>
          )}
        </div>
        {!nearBottom && (
          <button
            type="button"
            className={css.jumpBottom}
            data-cursor-agent-jump-bottom=""
            onClick={jumpToBottom}
          >
            {labels.jumpBottom}
          </button>
        )}
        {nearBottom && !cliReady && (
          <div
            ref={composeDockRef}
            className={css.composeDock}
            data-cursor-agent-composer-starting=""
          >
            <div className={css.composerStarting} aria-live="polite">
              {error ?? labels.starting}
            </div>
          </div>
        )}
        {cliReady && showDock && (
          <div
            ref={composeDockRef}
            className={css.composeDock}
            data-cursor-agent-composer=""
          >
            {queuedFollowUps.length > 0 && (
              <div className={css.queueFloat} data-cursor-agent-queued="">
                <div className={css.queueFloatHeader}>
                  <span className={css.queueFloatTitle}>
                    {labels.followupQueued}
                    {' · '}
                    {queuedFollowUps.length}
                  </span>
                  <span className={css.queueFloatHint}>{labels.followupQueueHint}</span>
                </div>
                <ol className={css.queueFloatList}>
                  {queuedFollowUps.map((item, index) => (
                    <li
                      key={`${String(index)}:${item}`}
                      className={index === queuedFollowUps.length - 1
                        ? css.queueFloatItemLatest
                        : css.queueFloatItem}
                      data-cursor-agent-queue-item=""
                      data-latest={index === queuedFollowUps.length - 1 ? '' : undefined}
                    >
                      {item}
                    </li>
                  ))}
                </ol>
                <div className={css.queueFloatActions}>
                  <button
                    type="button"
                    className={css.queueFloatAction}
                    data-cursor-agent-queue-steer=""
                    onClick={steerQueued}
                  >
                    {labels.followupSteerNow}
                  </button>
                  <button
                    type="button"
                    className={css.queueFloatActionSecondary}
                    data-cursor-agent-queue-cancel=""
                    onClick={cancelQueued}
                  >
                    {labels.followupCancelLast}
                  </button>
                </div>
              </div>
            )}
            {nearBottom && usageLine.length > 0 && (
              <div className={css.usageFooter} data-cursor-agent-usage="">
                <span data-cursor-agent-usage-line="">
                  {labels.usageLabel}
                  {' '}
                  {usageLine}
                </span>
              </div>
            )}
            {nearBottom && (
              <OptionMirror
                lines={below}
                onKeyDown={forwardSurfaceKey}
                onCommitText={sendKeys}
              />
            )}
            {nearBottom && (
              <div className={css.composer}>
                <textarea
                  ref={composerRef}
                  className={css.composerInput}
                  value={draft}
                  placeholder={labels.placeholder}
                  rows={1}
                  aria-expanded={mirrorOpen || undefined}
                  onChange={onChange}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onCut={onCut}
                  onCompositionStart={onCompositionStart}
                  onCompositionEnd={onCompositionEnd}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Whether this keydown belongs to an IME composition (Chinese / Japanese / …).
 * @param event - surface keydown.
 * @param composing - React composition flag.
 * @returns true when the browser must keep the event (no PTY forward).
 */
function isImeKeydown(
  event: ReactKeyboardEvent<HTMLElement>,
  composing: boolean,
): boolean {
  if (composing || event.nativeEvent.isComposing) return true
  if (event.key === 'Process') return true
  // Legacy Windows / Chrome IME marker before compositionstart fires.
  if (event.nativeEvent.keyCode === 229) return true
  return false
}

/**
 * Optimistic composer text for keys that change the CLI draft.
 * Arrows / Enter / Esc leave the draft alone — menu navigation must not type.
 * @param data - bytes already chosen for the PTY.
 * @param setDraft - React draft setter.
 */
function applyLocalEcho(
  data: string,
  setDraft: React.Dispatch<React.SetStateAction<string>>,
): void {
  if (data === '\x7f') {
    setDraft(current => current.slice(0, -1))
    return
  }
  if (data === '\x15') {
    setDraft('')
    return
  }
  if (data.length === 1 && data >= ' ') {
    setDraft(current => `${current}${data}`)
  }
}

/** Host `followup.items` snapshot; ignore malformed frames so local queue stays. */
function readFollowUpItems(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const items: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') return undefined
    items.push(item)
  }
  return items
}

function readMirrorBelow(raw: unknown): readonly OptionMirrorLine[] {
  if (!Array.isArray(raw)) return []
  const lines: OptionMirrorLine[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const text = (item as { text?: unknown }).text
    if (typeof text !== 'string') continue
    lines.push({
      text,
      highlighted: (item as { highlighted?: unknown }).highlighted === true,
    })
  }
  return lines
}

function TurnBand({
  turn,
  labels,
  codeLabels,
}: {
  turn: ChatTurn
  labels: ChatSessionProps['labels']
  codeLabels: { copyLabel: string; copiedLabel: string }
}) {
  if (turn.role === 'user') {
    return (
      <div className={css.userBand} data-role="user">
        <pre className={css.userText}>{turn.text}</pre>
      </div>
    )
  }
  if (turn.role === 'assistant') {
    return (
      <div
        className={css.assistantBand}
        data-role="assistant"
        data-streaming={turn.streaming || undefined}
      >
        <div className={css.assistantMarkdown}>
          <MarkdownText
            text={turn.text}
            streaming={turn.streaming === true}
            codeLabels={codeLabels}
          />
        </div>
      </div>
    )
  }
  if (turn.role === 'thinking') {
    const summary = turn.streaming === true ? labels.thinkingRunning : labels.thinkingDone
    return (
      <AuxLine
        role="thinking"
        summary={summary}
        detail={turn.text}
        streaming={turn.streaming === true}
      />
    )
  }
  if (turn.role === 'tool') {
    return (
      <AuxLine
        role="tool"
        summary={formatToolSummary(turn, labels)}
        detail={turn.detail}
        toolStatus={turn.status}
        toolFamily={turn.family}
        background={turn.background === true}
      />
    )
  }
  if (turn.role === 'activity') {
    const text = turn.kind === 'init'
      ? (turn.label.length > 0 ? `${labels.systemReady} · ${turn.label}` : labels.systemReady)
      : turn.label
    return (
      <div className={css.auxRow} data-role="activity" data-activity-kind={turn.kind}>
        {text}
      </div>
    )
  }
  return (
    <div className={css.systemBand} data-role="system">
      {turn.text}
    </div>
  )
}

/**
 * Cursor-style one-line summary for a folded tool turn.
 * @param turn - tool transcript row.
 * @param labels - locale strings.
 * @returns the collapsed summary text.
 */
function formatToolSummary(
  turn: Extract<ChatTurn, { role: 'tool' }>,
  labels: ChatSessionProps['labels'],
): string {
  const title = turn.title ?? toolHintFromDetail(turn.detail)
  if (turn.family === 'task') {
    const verb = turn.status === 'running'
      ? labels.taskRunning
      : turn.status === 'error'
        ? labels.taskError
        : turn.background === true
          ? labels.taskBackground
          : labels.taskDone
    return title.length > 0 ? `${verb} · ${title}` : verb
  }
  if (turn.family === 'shell') {
    const verb = turn.status === 'running'
      ? labels.toolRunning
      : turn.status === 'error'
        ? labels.toolError
        : labels.toolDone
    if (title.length > 0) return `${verb} $ ${title}`
    return `${verb} ${turn.name}`
  }
  const verb = turn.status === 'running'
    ? labels.toolRunning
    : turn.status === 'error'
      ? labels.toolError
      : labels.toolDone
  return title.length > 0 ? `${verb} ${turn.name} ${title}` : `${verb} ${turn.name}`
}

/**
 * Grow the composer with its draft; show a scrollbar only past the 3.5-line cap.
 * Chromium moves the caret to the end on each `style.height` write; this
 * function restores the selection captured before those writes. Callers that
 * queued `pendingCaretRef` must apply that offset after this returns.
 * @param input - the visible compose textarea.
 */
function syncComposerHeight(input: HTMLTextAreaElement): void {
  const start = input.selectionStart
  const end = input.selectionEnd
  input.style.height = 'auto'
  input.removeAttribute('data-overflow')
  const maxHeight = Number.parseFloat(getComputedStyle(input).maxHeight)
  const contentHeight = input.scrollHeight
  if (Number.isFinite(maxHeight) && contentHeight > maxHeight + 0.5) {
    input.style.height = `${String(maxHeight)}px`
    input.setAttribute('data-overflow', '')
  } else {
    input.style.height = `${String(contentHeight)}px`
  }
  input.setSelectionRange(start, end)
}

/**
 * Cursor-style faint activity row: one-line summary, optional expandable detail.
 */
function AuxLine({
  role,
  summary,
  detail,
  streaming,
  toolStatus,
  toolFamily,
  background,
}: {
  role: 'thinking' | 'tool'
  summary: string
  detail?: string
  streaming?: boolean
  toolStatus?: 'running' | 'done' | 'error'
  toolFamily?: string
  background?: boolean
}) {
  const body = detail !== undefined && detail.trim().length > 0 ? detail : undefined
  if (body === undefined) {
    return (
      <div
        className={css.auxRow}
        data-role={role}
        data-streaming={streaming || undefined}
        data-tool-status={toolStatus}
        data-tool-family={toolFamily}
        data-background={background || undefined}
      >
        {summary}
      </div>
    )
  }
  return (
    <details
      className={css.auxRow}
      data-role={role}
      data-streaming={streaming || undefined}
      data-tool-status={toolStatus}
      data-tool-family={toolFamily}
      data-background={background || undefined}
      data-expandable=""
    >
      <summary className={css.auxSummary}>{summary}</summary>
      <pre className={css.auxDetail}>{body}</pre>
    </details>
  )
}
