/** Floating Cursor chat card: width-stretching session rail, no title bar, overlay composer. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayStackSnapshot } from '@deepseek-ai/dsh-client-ui-layout/client'
import { OVERLAY_STACK_CURSOR_ID, OVERLAY_STACK_SPRITE_Z, overlayStackZIndex } from './overlay-stack-ids.ts'
import {
  IconCloseOutline16,
  IconEditOutline16,
  IconPlusOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ChatSession, type DshMcpChromeStatus } from './ChatSession.tsx'
import { cursorAgentChatUrl } from './chat-url.ts'
import {
  clampOverlayBox,
  clampOverlayPosition,
  clampSpriteBox,
  defaultOverlayBox,
  defaultSpriteBox,
  OVERLAY_RESIZE_EDGES,
  resizeOverlayBox,
  type OverlayBox,
  type OverlayResizeEdge,
} from './overlay-position.ts'
import {
  mintOverlaySessionId,
  type OverlaySessionId,
} from './session-id.ts'
import { persistLiveRail, readPersistedRail } from './rail-storage.ts'
import { readHostBootId } from './host-boot.ts'
import { hydrateOverlayGeometry, writePersistedGeometry } from './geometry-storage.ts'
import {
  headingToOpeningDegrees,
  lerpDegrees,
  spriteIdlePose,
} from './sprite-motion.ts'
import { PluginDock } from './PluginManager.tsx'
import type { OverlayCardManagerItem } from './overlay-card-rpc.ts'
import css from './CursorPanel.module.css'

export { cursorAgentChatUrl as cursorAgentPtyUrl }

/** Inject face: overlay stacking plus overlay-card hide/insert RPC. */
export type CursorAgentInjected = {
  /** Raise this window in `ctx.overlayStack`. */
  raiseWindow: () => void
  /** List card windows, the pinned desktop occupant, and standalone overlay fibers. */
  listOverlayCards: () => Promise<readonly OverlayCardManagerItem[]>
  /**
   * Hide or show one rail row.
   * @param id - `--card-id` or standalone Loader id.
   * @param hidden - `true` skips the window.
   * @param kind - `fiber` / `desktop` reject hide.
   */
  setOverlayCardHidden: (
    id: string,
    hidden: boolean,
    kind?: OverlayCardManagerItem['kind'],
  ) => Promise<void>
  /**
   * Insert or unplug occupant fibers for one rail row.
   * @param id - `--card-id` or standalone Loader id.
   * @param inserted - `false` sets Loader `disabled: true`.
   * @param kind - `fiber` / `desktop` writes that Loader row.
   */
  setOverlayCardInserted: (
    id: string,
    inserted: boolean,
    kind?: OverlayCardManagerItem['kind'],
  ) => Promise<void>
  /**
   * Exclusive-enable one overlay-desktop.body occupant.
   * @param id - Loader id of the desktop occupant.
   */
  switchOverlayDesktop: (id: string) => Promise<void>
  hooks: {
    /** Cursor window vs overlay-card desk in `shell.overlay`. */
    overlayStack: HostObservable<OverlayStackSnapshot>
  }
}

/** Full props composed from the shell.overlay slot. */
export type CursorPanelProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'cursor-agent'>
  & InjectFace<CursorAgentInjected>

type OverlayStatus = 'connecting' | 'live' | 'disconnected'

function mcpChromeLabel(
  status: DshMcpChromeStatus,
  t: (key: 'mcp.checking' | 'mcp.connected' | 'mcp.disconnected') => string,
): string {
  switch (status) {
    case 'connected':
      return t('mcp.connected')
    case 'checking':
      return t('mcp.checking')
    case 'disconnected':
      return t('mcp.disconnected')
    default: {
      const exhausted: never = status
      return exhausted
    }
  }
}

type SessionRow = {
  id: OverlaySessionId
  label: string
  status: OverlayStatus
}

type OverlayGesture = {
  pointerId: number
  originX: number
  originY: number
  start: OverlayBox
} & ({ kind: 'move' } | { kind: 'resize'; edge: OverlayResizeEdge })

const EDGE_CLASS: Record<OverlayResizeEdge, string> = {
  n: css.edgeN ?? '',
  s: css.edgeS ?? '',
  e: css.edgeE ?? '',
  w: css.edgeW ?? '',
  ne: css.edgeNe ?? '',
  nw: css.edgeNw ?? '',
  se: css.edgeSe ?? '',
  sw: css.edgeSw ?? '',
}

/** How long the pointer must stay on the rail before it expands. */
const RAIL_HOVER_OPEN_MS = 150
/** Pointer travel (CSS px) above which a sprite press counts as a drag, not expand. */
const SPRITE_CLICK_SLOP_PX = 5
/** Hover must stay still this long before the expand hint appears. */
const SPRITE_HINT_DELAY_MS = 1000
/** Pointer travel that resets the expand-hint stagnation timer. */
const SPRITE_HINT_STILL_PX = 3
/** Offset from the cursor hotspot to the floating hint. */
const SPRITE_HINT_OFFSET_PX = 12

function viewportSize(): { width: number; height: number } {
  return { width: globalThis.innerWidth, height: globalThis.innerHeight }
}

function createSession(index: number, label?: string): SessionRow {
  return {
    id: mintOverlaySessionId(),
    label: label !== undefined && label.length > 0 ? label : `Chat ${index}`,
    status: 'connecting',
  }
}

function hydrateSessions(): {
  sessions: SessionRow[]
  activeId: OverlaySessionId
  ordinal: number
} {
  const bootId = readHostBootId()
  const stored = bootId === undefined ? undefined : readPersistedRail(bootId)
  if (stored === undefined) {
    const seed = createSession(1)
    return { sessions: [seed], activeId: seed.id, ordinal: 1 }
  }
  const sessions = stored.sessions.map(row => ({
    id: row.id,
    label: row.label,
    status: 'connecting' as const,
  }))
  return {
    sessions,
    activeId: stored.activeId,
    ordinal: maxCursorCliOrdinal(sessions),
  }
}

function maxCursorCliOrdinal(sessions: readonly SessionRow[]): number {
  let max = 0
  for (const row of sessions) {
    const match = /^cursor-cli-(\d+)$/.exec(row.id)
    if (match === null) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return max > 0 ? max : sessions.length
}

/**
 * Compact terminal-window glyph for rail session rows (not the Cursor mark).
 * @param props.size - CSS pixel edge length (default 14).
 * @returns an inline SVG matching DSH stroke weight.
 */
function SessionTerminalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-cursor-agent-session-icon=""
    >
      <rect
        x="1.75"
        y="2.75"
        width="12.5"
        height="10.5"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M4.75 6.35 L7 8.1 L4.75 9.85"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Gray-and-black line mark: a complete ring around a right-opening C.
 * The parent writes translate on the group and rotate on the letter.
 * @param props.drawRef - group that swims inside the gray disc.
 * @param props.letterRef - C whose gap faces the back of travel.
 * @returns an inline SVG.
 */
function SpriteMark({
  drawRef,
  letterRef,
}: {
  drawRef: Ref<SVGGElement>
  letterRef: Ref<SVGTextElement>
}) {
  return (
    <svg
      className={css.spriteMark}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g ref={drawRef}>
        <circle className={css.spriteRing} cx="16" cy="16" r="11" />
        <text
          ref={letterRef}
          className={css.spriteInner}
          x="16"
          y="16"
          textAnchor="middle"
          dominantBaseline="central"
        >
          C
        </text>
      </g>
    </svg>
  )
}

/**
 * Window-minimize glyph (horizontal dash) for the overlay chrome control.
 * @param props.size - CSS pixel edge length (default 16).
 * @returns an inline SVG matching DSH stroke weight.
 */
function MinimizeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.25 H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Floating gray card around headless Cursor CLI chat sessions.
 * There is no title bar. An empty 1cm top strip and the Cursor mark drag the
 * card. A top-right control shrinks the card into a draggable gray-and-black
 * line sprite (default bottom-right): a complete ring that translates, and a
 * letter C whose gap faces the back of travel. A click with little pointer
 * travel expands it again.
 * Chat sessions stay mounted while minimized. The host Cursor CLI outlives
 * the WebSocket: hiding or closing the page only detaches the viewer, and the
 * overlay reconnects to the same session id while this `dsh web` process is
 * up. A new process starts the rail at Chat 1. The rail close control is the
 * only overlay gesture that sends `{op:"shutdown"}`.
 * Overlay type is 90% of DSH chrome. A left session rail expands after the pointer
 * stays on the rail for 150ms (`railOpen`) or while a create/rename field is
 * open (not from ordinary button focus). The Cursor mark stays at the top of
 * the slab and the plugin control stays at the bottom; only the session strip
 * between them scrolls. Session rows use a terminal-window icon; the + control
 * sits immediately after the last session row inside that strip. A plugin
 * control lists overlay cards and standalone overlay fibers by name and id
 * and can hide, unplug, or switch the desktop. The list opens in the expanded rail, directly
 * above that control, and closes when the pointer leaves it. Primary-button
 * pointer down raises this window above the overlay-card desk.
 * @param props - locale share and overlay-stack / overlay-card inject face.
 * @returns the overlay window.
 */
export function CursorPanel({
  t, raiseWindow, useOverlayStack, listOverlayCards, setOverlayCardHidden, setOverlayCardInserted,
  switchOverlayDesktop,
}: CursorPanelProps) {
  const gestureRef = useRef<OverlayGesture | null>(null)
  const railRef = useRef<HTMLElement | null>(null)
  const geometrySeedRef = useRef<ReturnType<typeof hydrateOverlayGeometry> | null>(null)
  if (geometrySeedRef.current === null) {
    const viewport = viewportSize()
    geometrySeedRef.current = hydrateOverlayGeometry(viewport.width, viewport.height)
  }
  const geometrySeed = geometrySeedRef.current
  const [box, setBox] = useState(() => geometrySeed.box)
  const seedRef = useRef<ReturnType<typeof hydrateSessions> | null>(null)
  if (seedRef.current === null) seedRef.current = hydrateSessions()
  const seed = seedRef.current
  const [sessions, setSessions] = useState<SessionRow[]>(() => seed.sessions)
  const [activeId, setActiveId] = useState<OverlaySessionId>(() => seed.activeId)
  const [railOpen, setRailOpen] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const [minimized, setMinimized] = useState(() => geometrySeed.minimized)
  const [geometryAnimating, setGeometryAnimating] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined)
  const [renameId, setRenameId] = useState<OverlaySessionId | undefined>(undefined)
  const [renameDraft, setRenameDraft] = useState('')
  const sessionOrdinal = useRef(seed.ordinal)
  const shutdownsRef = useRef(new Map<OverlaySessionId, () => void>())
  const ignoreRenameBlurRef = useRef(false)
  const railOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometryAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandedBoxRef = useRef<OverlayBox | null>(geometrySeed.expanded)
  const spriteBoxRef = useRef<OverlayBox | null>(geometrySeed.sprite)
  const spriteDragMovedRef = useRef(false)
  const spriteDraggingRef = useRef(false)
  const spriteDrawRef = useRef<SVGGElement>(null)
  const spriteLetterRef = useRef<SVGTextElement>(null)
  const spriteHeadingRef = useRef(0)
  const spritePointerRef = useRef({ x: 0, y: 0 })
  const spriteStatusRef = useRef<OverlayStatus>('connecting')
  const spriteHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spriteHintAnchorRef = useRef({ x: 0, y: 0 })
  const [spriteHint, setSpriteHint] = useState<{ x: number; y: number } | null>(null)

  const applySpriteDrawing = (x: number, y: number, heading: number): void => {
    spriteHeadingRef.current = heading
    spriteDrawRef.current?.setAttribute('transform', `translate(${x} ${y})`)
    spriteLetterRef.current?.setAttribute('transform', `rotate(${heading} 16 16)`)
    spriteLetterRef.current?.setAttribute('data-sprite-heading', String(heading))
  }

  const clearRailOpenTimer = (): void => {
    if (railOpenTimerRef.current === null) return
    clearTimeout(railOpenTimerRef.current)
    railOpenTimerRef.current = null
  }

  const clearGeometryAnimTimer = (): void => {
    if (geometryAnimTimerRef.current === null) return
    clearTimeout(geometryAnimTimerRef.current)
    geometryAnimTimerRef.current = null
  }

  const clearSpriteHintTimer = (): void => {
    if (spriteHintTimerRef.current === null) return
    clearTimeout(spriteHintTimerRef.current)
    spriteHintTimerRef.current = null
  }

  const hideSpriteHint = (): void => {
    clearSpriteHintTimer()
    setSpriteHint(null)
  }

  const armSpriteHint = (clientX: number, clientY: number): void => {
    if (spriteDraggingRef.current) return
    spriteHintAnchorRef.current = { x: clientX, y: clientY }
    clearSpriteHintTimer()
    setSpriteHint(null)
    spriteHintTimerRef.current = setTimeout(() => {
      spriteHintTimerRef.current = null
      if (spriteDraggingRef.current) return
      const anchor = spriteHintAnchorRef.current
      setSpriteHint({
        x: anchor.x + SPRITE_HINT_OFFSET_PX,
        y: anchor.y + SPRITE_HINT_OFFSET_PX,
      })
    }, SPRITE_HINT_DELAY_MS)
  }

  const runGeometryAnimation = (): void => {
    clearGeometryAnimTimer()
    setGeometryAnimating(true)
    geometryAnimTimerRef.current = setTimeout(() => {
      geometryAnimTimerRef.current = null
      setGeometryAnimating(false)
    }, 340)
  }

  useEffect(() => () => {
    clearRailOpenTimer()
    clearGeometryAnimTimer()
    clearSpriteHintTimer()
  }, [])

  const onStatus = useCallback((sessionId: OverlaySessionId, status: OverlayStatus) => {
    setSessions(current => current.map(row => (
      row.id === sessionId ? { ...row, status } : row
    )))
  }, [])

  const [dshMcpBySession, setDshMcpBySession] = useState<
    Partial<Record<OverlaySessionId, DshMcpChromeStatus>>
  >({})
  const onDshMcp = useCallback((sessionId: OverlaySessionId, status: DshMcpChromeStatus) => {
    setDshMcpBySession(current => (
      current[sessionId] === status ? current : { ...current, [sessionId]: status }
    ))
  }, [])

  const registerShutdown = useCallback((
    sessionId: OverlaySessionId,
    shutdown: () => void,
  ): (() => void) => {
    shutdownsRef.current.set(sessionId, shutdown)
    return () => { shutdownsRef.current.delete(sessionId) }
  }, [])

  useEffect(() => {
    persistLiveRail(sessions, activeId)
  }, [sessions, activeId])

  useEffect(() => {
    const expanded = minimized
      ? (expandedBoxRef.current ?? box)
      : box
    const sprite = minimized ? box : spriteBoxRef.current
    writePersistedGeometry({
      box: expanded,
      ...(sprite === null ? {} : { sprite }),
      minimized,
    })
  }, [box, minimized])

  useEffect(() => {
    const onResize = (): void => {
      const viewport = viewportSize()
      setBox((current) => {
        if (minimized) {
          const next = clampSpriteBox(current, viewport.width, viewport.height)
          spriteBoxRef.current = next
          return next
        }
        return clampOverlayBox(current, viewport.width, viewport.height)
      })
      if (expandedBoxRef.current !== null) {
        expandedBoxRef.current = clampOverlayBox(
          expandedBoxRef.current,
          viewport.width,
          viewport.height,
        )
      }
    }
    globalThis.addEventListener('resize', onResize)
    return () => { globalThis.removeEventListener('resize', onResize) }
  }, [minimized])

  useEffect(() => {
    if (!minimized) {
      applySpriteDrawing(0, 0, 0)
      return
    }
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
    if (reduced) {
      applySpriteDrawing(0, 0, 0)
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = (now: number): void => {
      if (!spriteDraggingRef.current) {
        const pose = spriteIdlePose(now - started, spriteStatusRef.current)
        applySpriteDrawing(
          pose.x,
          pose.y,
          lerpDegrees(spriteHeadingRef.current, pose.heading, 0.22),
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame) }
  }, [minimized])

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    next: OverlayGesture,
  ): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = next
  }

  const onDragPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    beginGesture(event, {
      kind: 'move',
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: box,
    })
  }

  const onSpritePointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    hideSpriteHint()
    spriteDragMovedRef.current = false
    spriteDraggingRef.current = true
    spritePointerRef.current = { x: event.clientX, y: event.clientY }
    applySpriteDrawing(0, 0, spriteHeadingRef.current)
    onDragPointerDown(event)
  }

  const onSpritePointerEnter = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === 'touch') return
    armSpriteHint(event.clientX, event.clientY)
  }

  const onSpriteHoverMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (spriteDraggingRef.current) return
    if (event.pointerType === 'touch') return
    const anchor = spriteHintAnchorRef.current
    const moved = Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y)
    if (spriteHint !== null || moved > SPRITE_HINT_STILL_PX) {
      armSpriteHint(event.clientX, event.clientY)
    }
  }

  const onEdgePointerDown = (
    edge: OverlayResizeEdge,
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (minimized) return
    beginGesture(event, {
      kind: 'resize',
      edge,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: box,
    })
  }

  const onGesturePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const gesture = gestureRef.current
    if (gesture === null || gesture.pointerId !== event.pointerId) return
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const viewport = viewportSize()
    const dx = event.clientX - gesture.originX
    const dy = event.clientY - gesture.originY
    if (gesture.kind === 'move') {
      if (
        minimized
        && (Math.abs(dx) > SPRITE_CLICK_SLOP_PX || Math.abs(dy) > SPRITE_CLICK_SLOP_PX)
      ) {
        spriteDragMovedRef.current = true
      }
      if (minimized) {
        const vx = event.clientX - spritePointerRef.current.x
        const vy = event.clientY - spritePointerRef.current.y
        spritePointerRef.current = { x: event.clientX, y: event.clientY }
        const heading = headingToOpeningDegrees(vx, vy)
        if (heading !== undefined) applySpriteDrawing(0, 0, heading)
        const next = clampSpriteBox(
          {
            left: gesture.start.left + dx,
            top: gesture.start.top + dy,
            width: gesture.start.width,
            height: gesture.start.height,
          },
          viewport.width,
          viewport.height,
        )
        spriteBoxRef.current = next
        setBox(next)
        return
      }
      const position = clampOverlayPosition(
        gesture.start.left + dx,
        gesture.start.top + dy,
        gesture.start.width,
        gesture.start.height,
        viewport.width,
        viewport.height,
      )
      setBox({ ...gesture.start, ...position })
      return
    }
    setBox(resizeOverlayBox(
      gesture.edge,
      gesture.start,
      dx,
      dy,
      viewport.width,
      viewport.height,
    ))
  }

  const endGesture = (event: ReactPointerEvent<HTMLElement>): void => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    gestureRef.current = null
  }

  const minimizePanel = (): void => {
    if (minimized) return
    const viewport = viewportSize()
    expandedBoxRef.current = box
    const sprite = spriteBoxRef.current !== null
      ? clampSpriteBox(spriteBoxRef.current, viewport.width, viewport.height)
      : defaultSpriteBox(viewport.width, viewport.height)
    spriteBoxRef.current = sprite
    runGeometryAnimation()
    setMinimized(true)
    setRailOpen(false)
    setBox(sprite)
  }

  const expandPanel = (): void => {
    if (!minimized) return
    hideSpriteHint()
    const viewport = viewportSize()
    spriteBoxRef.current = clampSpriteBox(box, viewport.width, viewport.height)
    const restored = clampOverlayBox(
      expandedBoxRef.current ?? defaultOverlayBox(viewport.width, viewport.height),
      viewport.width,
      viewport.height,
    )
    runGeometryAnimation()
    setMinimized(false)
    setBox(restored)
  }

  const onSpritePointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    spriteDraggingRef.current = false
    const wasDrag = spriteDragMovedRef.current
    endGesture(event)
    if (!wasDrag) expandPanel()
  }

  const found = sessions.find(row => row.id === activeId)
  /* v8 ignore next -- closeSession retargets activeId in the same update as the list. */
  const active = found ?? sessions[0] ?? createSession(1)
  const status = active.status
  const dshMcpStatus = dshMcpBySession[active.id] ?? 'checking'
  spriteStatusRef.current = status
  const railExpanded = railOpen
    || nameDraft !== undefined
    || renameId !== undefined
    || pluginsOpen

  const addSession = (label?: string): void => {
    sessionOrdinal.current += 1
    const next = createSession(sessionOrdinal.current, label)
    setSessions(current => [...current, next])
    setActiveId(next.id)
    setNameDraft(undefined)
  }

  const beginCreate = (): void => {
    setRailOpen(true)
    setNameDraft(`Chat ${sessionOrdinal.current + 1}`)
    setRenameId(undefined)
  }

  const cancelCreate = (): void => {
    setNameDraft(undefined)
  }

  const confirmCreate = (): void => {
    const draft = nameDraft
    /* v8 ignore next -- the confirm control mounts only while a create draft exists. */
    if (draft === undefined) return
    const trimmed = draft.trim()
    addSession(trimmed.length > 0 ? trimmed : undefined)
  }

  const closeSession = (id: OverlaySessionId): void => {
    shutdownsRef.current.get(id)?.()
    setSessions((current) => {
      /* v8 ignore next -- the close control is hidden while only one session exists. */
      if (current.length <= 1) return current
      const next = current.filter(row => row.id !== id)
      const first = next[0]
      if (activeId === id && first !== undefined) {
        setActiveId(first.id)
      }
      return next
    })
    if (renameId === id) {
      setRenameId(undefined)
    }
  }

  const startRename = (row: SessionRow): void => {
    setRenameId(row.id)
    setRenameDraft(row.label)
    setNameDraft(undefined)
    setRailOpen(true)
  }

  const cancelRename = (): void => {
    ignoreRenameBlurRef.current = true
    setRenameId(undefined)
  }

  const commitRename = (): void => {
    const id = renameId
    /* v8 ignore next -- the rename field mounts only while renameId is set. */
    if (id === undefined) return
    const trimmed = renameDraft.trim()
    setSessions(current => current.map((row) => {
      if (row.id !== id) return row
      return { ...row, label: trimmed.length > 0 ? trimmed : row.label }
    }))
    setRenameId(undefined)
  }

  const onRenameBlur = (): void => {
    if (ignoreRenameBlurRef.current) {
      ignoreRenameBlurRef.current = false
      return
    }
    commitRename()
  }

  const onCreateKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirmCreate()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelCreate()
    }
  }

  const onRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename()
    }
  }

  const onRailMouseEnter = (): void => {
    if (railOpenTimerRef.current !== null) return
    railOpenTimerRef.current = setTimeout(() => {
      railOpenTimerRef.current = null
      setRailOpen(true)
    }, RAIL_HOVER_OPEN_MS)
  }

  const onRailMouseLeave = (): void => {
    clearRailOpenTimer()
    setRailOpen(false)
    setPluginsOpen(false)
    const active = document.activeElement
    if (
      active instanceof HTMLElement
      && railRef.current?.contains(active)
      && active.tagName !== 'INPUT'
      && active.tagName !== 'TEXTAREA'
    ) {
      active.blur()
    }
  }

  const chatLabels = {
    placeholder: t('composer.placeholder'),
    starting: t('composer.starting'),
    heroTitle: t('chat.heroTitle'),
    heroTip1: t('chat.heroTip1'),
    heroTip2: t('chat.heroTip2'),
    running: t('chat.running'),
    jumpBottom: t('chat.jumpBottom'),
    toolRunning: t('tool.running'),
    toolDone: t('tool.done'),
    toolError: t('tool.error'),
    taskRunning: t('task.running'),
    taskDone: t('task.done'),
    taskBackground: t('task.background'),
    taskError: t('task.error'),
    tasksRunningAgents: t('tasks.runningAgents'),
    tasksCount: t('tasks.count'),
    thinkingRunning: t('thinking.running'),
    thinkingDone: t('thinking.done'),
    systemReady: t('system.ready'),
    usageLabel: t('usage.label'),
    usageInput: t('usage.input'),
    usageOutput: t('usage.output'),
    usageCacheRead: t('usage.cacheRead'),
    usageCacheWrite: t('usage.cacheWrite'),
    copy: t('chat.copy'),
    copied: t('chat.copied'),
    followupQueued: t('followup.queued'),
    followupQueueHint: t('followup.queueHint'),
    followupSteerNow: t('followup.steerNow'),
    followupCancelLast: t('followup.cancelLast'),
  }

  const spriteExpandLabel = t('window.expandCursor')
  const stackZ = useOverlayStack(state => overlayStackZIndex(state.front, OVERLAY_STACK_CURSOR_ID))
  const windowZ = minimized ? OVERLAY_STACK_SPRITE_Z : stackZ

  return (
    <div
      className={css.window}
      data-cursor-agent-window=""
      data-minimized={minimized || undefined}
      data-geometry-animating={geometryAnimating || undefined}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return
        raiseWindow()
      }}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        zIndex: windowZ,
      }}
    >
      {!minimized && OVERLAY_RESIZE_EDGES.map(edge => (
        <div
          key={edge}
          className={`${css.edge} ${EDGE_CLASS[edge]}`}
          data-resize-edge={edge}
          aria-hidden="true"
          onPointerDown={(event) => { onEdgePointerDown(edge, event) }}
          onPointerMove={onGesturePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        />
      ))}
      <span className={css.srStatus} role="status">
        {status === 'live'
          ? t('status.live')
          : status === 'connecting'
            ? t('status.connecting')
            : t('status.disconnected')}
      </span>
      {minimized && (
        <button
          type="button"
          className={css.spriteFace}
          data-cursor-agent-sprite=""
          data-sprite-status={status}
          aria-label={spriteExpandLabel}
          onPointerDown={onSpritePointerDown}
          onPointerEnter={onSpritePointerEnter}
          onPointerLeave={hideSpriteHint}
          onPointerMove={(event) => {
            onSpriteHoverMove(event)
            onGesturePointerMove(event)
          }}
          onPointerUp={onSpritePointerUp}
          onPointerCancel={(event) => {
            spriteDraggingRef.current = false
            hideSpriteHint()
            endGesture(event)
          }}
        >
          <span className={css.spriteBob} aria-hidden="true">
            <span className={css.spriteLens}>
              <SpriteMark drawRef={spriteDrawRef} letterRef={spriteLetterRef} />
            </span>
          </span>
        </button>
      )}
      {minimized && spriteHint !== null && (
        <span
          className={css.spriteHint}
          data-cursor-agent-sprite-hint=""
          data-sprite-status={status}
          aria-hidden="true"
          style={{
            left: spriteHint.x - box.left,
            top: spriteHint.y - box.top,
          }}
        >
          {spriteExpandLabel}
        </span>
      )}
      <div
        className={css.body}
        data-cursor-agent-body=""
        aria-hidden={minimized || undefined}
      >
        <aside
          ref={railRef}
          className={`${css.rail} ${railExpanded ? css.railOpen : ''}`}
          data-cursor-agent-rail=""
          data-rail-open={railExpanded || undefined}
          aria-label={t('rail.hint')}
          title={t('rail.hint')}
          onMouseEnter={onRailMouseEnter}
          onMouseLeave={onRailMouseLeave}
        >
          <div className={css.railInner}>
            <button
              type="button"
              className={css.mark}
              data-cursor-agent-drag=""
              aria-label={t('window.title')}
              onPointerDown={onDragPointerDown}
              onPointerMove={onGesturePointerMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
            >
              C
            </button>
            <div
              className={css.railSessions}
              data-cursor-agent-session-scroll=""
            >
              <ul
                className={css.sessionList}
                data-cursor-agent-icon-list=""
                data-cursor-agent-session-list=""
                aria-label={t('rail.title')}
              >
                {sessions.map(row => (
                  <li
                    key={row.id}
                    className={`${css.sessionItem} ${row.id === activeId ? css.sessionItemActive : ''}`}
                  >
                    {renameId === row.id ? (
                      <>
                        <span className={css.sessionGlyph} aria-hidden="true">
                          <SessionTerminalIcon />
                        </span>
                        <input
                          className={css.nameInput}
                          data-cursor-agent-rename-input={row.id}
                          value={renameDraft}
                          autoFocus
                          onChange={(event) => { setRenameDraft(event.target.value) }}
                          onKeyDown={onRenameKeyDown}
                          onBlur={onRenameBlur}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        className={css.sessionHit}
                        data-cursor-agent-session={row.id}
                        data-active={row.id === activeId || undefined}
                        title={row.label}
                        onClick={() => { setActiveId(row.id) }}
                      >
                        <span className={css.sessionGlyph} aria-hidden="true">
                          <SessionTerminalIcon />
                        </span>
                        <span className={`${css.sessionLabel} ${css.railReveal}`}>{row.label}</span>
                      </button>
                    )}
                    <div className={css.sessionActions}>
                      {renameId !== row.id && (
                        <button
                          type="button"
                          className={css.iconButton}
                          data-cursor-agent-rename={row.id}
                          aria-label={t('rail.rename')}
                          title={t('rail.rename')}
                          onClick={() => { startRename(row) }}
                        >
                          <IconEditOutline16 size={14} />
                        </button>
                      )}
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          className={css.iconButton}
                          data-cursor-agent-close-session={row.id}
                          aria-label={t('rail.close')}
                          title={t('rail.close')}
                          onClick={() => { closeSession(row.id) }}
                        >
                          <IconCloseOutline16 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {nameDraft !== undefined ? (
                <div className={css.nameRow} data-cursor-agent-create="">
                  <input
                    className={css.nameInput}
                    data-cursor-agent-create-name=""
                    value={nameDraft}
                    placeholder={t('rail.namePlaceholder')}
                    autoFocus
                    onChange={(event) => { setNameDraft(event.target.value) }}
                    onKeyDown={onCreateKeyDown}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={css.newSession}
                  data-cursor-agent-new-session=""
                  aria-label={t('rail.new')}
                  title={t('rail.new')}
                  onClick={beginCreate}
                >
                  <span className={css.sessionGlyph} aria-hidden="true">
                    <IconPlusOutline16 size={14} />
                  </span>
                  <span className={css.railReveal}>{t('rail.new')}</span>
                </button>
              )}
            </div>
            <PluginDock
              t={t}
              open={pluginsOpen}
              onToggle={() => {
                setPluginsOpen(current => !current)
                setRailOpen(true)
              }}
              onDismiss={() => { setPluginsOpen(false) }}
              listOverlayCards={listOverlayCards}
              setOverlayCardHidden={setOverlayCardHidden}
              setOverlayCardInserted={setOverlayCardInserted}
              switchOverlayDesktop={switchOverlayDesktop}
            />
          </div>
        </aside>
        <div className={css.chatColumn} data-cursor-agent-chat-column="">
          <div
            className={css.dragStrip}
            data-cursor-agent-drag-strip=""
            onPointerDown={onDragPointerDown}
            onPointerMove={onGesturePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            <span
              className={css.mcpStatus}
              data-cursor-agent-dsh-mcp=""
              data-connected={dshMcpStatus}
            >
              {mcpChromeLabel(dshMcpStatus, t)}
            </span>
            <button
              type="button"
              className={css.minimizeButton}
              data-cursor-agent-minimize=""
              aria-label={t('window.minimize')}
              title={t('window.minimize')}
              onPointerDown={(event) => { event.stopPropagation() }}
              onClick={(event) => {
                event.stopPropagation()
                minimizePanel()
              }}
            >
              <MinimizeIcon size={11} />
            </button>
          </div>
          <div className={css.chatStack} data-cursor-agent-chat-stack="">
            {sessions.map(row => (
              <ChatSession
                key={row.id}
                sessionId={row.id}
                active={row.id === activeId}
                onStatus={onStatus}
                onDshMcp={onDshMcp}
                registerShutdown={registerShutdown}
                labels={chatLabels}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
