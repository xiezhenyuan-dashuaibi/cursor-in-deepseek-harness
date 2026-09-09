/** One overlay card window: chrome, resize handles, and body slot. */

import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  overlayCardBodySlot, overlayCardTrailingSlot, type OverlayCardChildSlot, type OverlayCardNumber,
} from '../instances.ts'
import { clientOnBoard, pointerOnBoard } from './board-pointer.ts'
import {
  applyResize, clampGrabOrigin, dockTagBox, flipInvert, flipToward, magnetDock, MORPH_MS,
  SETTLE_MS, TAG_ALONG_MAX, DISSOLVE_DELAY_MS, tagFlipBox, tagRibbonAlong,
  type OverlayCanvasSize, type OverlayDock, type OverlayDockEdge, type OverlayFlipBox, type ResizeEdge,
} from './geometry.ts'
import { consumeCardHashClick } from './hash.ts'
import type { OverlayCardPreferredFrame } from './contract/slots.ts'
import type { createOverlayDeskStore } from './stores.ts'
import css from './OverlayCard.module.css'

/** Props for one window on the desk. */
export type OverlayCardProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<OverlayCardChildSlot>
  & PropsStore<ReturnType<typeof createOverlayDeskStore>>
  & PropsLocale<'overlay-card'>
  & {
    /** Slot seat for this window (`overlay-card.body` is 1). */
    cardNumber: OverlayCardNumber
  }

const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const BASE_Z = 40
const TAG_Z = 200
/** Movement below this on a tag is a click, not a dock drag. */
const CLICK_SLOP = 6

type MorphInvert = {
  dx: number
  dy: number
  sx: number
  sy: number
}

type MorphFlight = MorphInvert & {
  tagW: number
  tagH: number
}

type Morph =
  | { kind: 'hold' }
  | { kind: 'play' }
  | ({ kind: 'snap' } & MorphFlight)
  | ({ kind: 'dissolve' } & MorphFlight)
  | ({ kind: 'fly' } & MorphFlight)
  | ({ kind: 'freeze' } & MorphFlight)

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readFlipBox(el: HTMLElement | null): OverlayFlipBox | undefined {
  /* v8 ignore next -- cardRef is set before 缩小 / restore arm */
  if (el === null) return undefined
  const r = el.getBoundingClientRect()
  if (!(r.width >= 1) || !(r.height >= 1)) return undefined
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function readTagTextPx(probe: HTMLElement | null): number {
  /* v8 ignore next -- probe mounts with the card before the shrink layout effect */
  if (probe === null) return 0
  const r = probe.getBoundingClientRect()
  return Math.max(r.width, r.height)
}

function morphFlightStyle(morph: MorphFlight, extra: CSSProperties): CSSProperties {
  return {
    transform: `translate(${String(morph.dx)}px, ${String(morph.dy)}px) scale(${String(morph.sx)}, ${String(morph.sy)})`,
    transformOrigin: '0 0',
    zIndex: 300,
    ['--morph-sx']: String(morph.sx),
    ['--morph-sy']: String(morph.sy),
    ['--tag-w']: `${String(morph.tagW)}px`,
    ['--tag-h']: `${String(morph.tagH)}px`,
    ...extra,
  } as CSSProperties
}

function boardOrigin(el: HTMLElement | null): { left: number; top: number } {
  /* v8 ignore next -- cardRef is set before the shrink layout effect */
  if (el === null) return { left: 0, top: 0 }
  const board = el.closest('[data-overlay-board]')
  if (!(board instanceof HTMLElement)) return { left: 0, top: 0 }
  const r = board.getBoundingClientRect()
  return { left: r.left, top: r.top }
}

function isIdentityMorph(invert: MorphInvert): boolean {
  return invert.dx === 0 && invert.dy === 0 && invert.sx === 1 && invert.sy === 1
}

function morphChromeClass(
  morph: Morph,
  edge: OverlayDockEdge,
): string {
  const hold = morph.kind === 'hold' || morph.kind === 'snap' || morph.kind === 'freeze'
  const toTag = morph.kind === 'snap'
  const dissolve = morph.kind === 'dissolve' || morph.kind === 'freeze'
  const play = morph.kind === 'play'
  return `${css.morphing}${hold ? ` ${css.hold}` : ''}${dissolve ? ` ${css.dissolve}` : ''}${
    play ? ` ${css.play}` : ''
  }${toTag ? ` ${css.toTag}` : ` ${css.toCard}`} ${css[edge]}`
}

function morphStyle(morph: Morph | undefined): CSSProperties {
  if (morph === undefined) return {}
  if (morph.kind === 'hold') {
    return { transform: 'none', transformOrigin: '0 0', transition: 'none', zIndex: 300 }
  }
  if (morph.kind === 'play') {
    return { transform: 'none', transformOrigin: '0 0', zIndex: 300 }
  }
  if (morph.kind === 'snap' || morph.kind === 'freeze') {
    return morphFlightStyle(morph, { transition: 'none' })
  }
  return morphFlightStyle(morph, {})
}

type MoveGesture = {
  kind: 'move'
  pointerId: number
  offsetX: number
  offsetY: number
}

type ResizeGesture = {
  kind: 'resize'
  pointerId: number
  edge: ResizeEdge
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  originX: number
  originY: number
}

type DockGesture = {
  kind: 'dock'
  pointerId: number
  startX: number
  startY: number
  grabX: number
  grabY: number
}

type Gesture = MoveGesture | ResizeGesture | DockGesture

type DockPreview =
  | { kind: 'magnet'; dock: OverlayDock }
  | { kind: 'float'; x: number; y: number }

/**
 * Draggable, edge-resizable overlay card. Frame lives in the desk store.
 * Chrome left is the title (`--title`) then the unique id (`--card-id`).
 * The slot seat is not that id. The title bar overlays the body and fades to transparent at
 * its lower edge. Trailing controls occupy that card's trailing list. Built-in
 * 缩小 collapses this window into an edge tag at the last parked edge and
 * along (or the nearest board edge on first 缩小) and does not unmount the
 * body. A docked tag is one ribbon rotated onto the edge: the title only, at
 * the compact chrome font; the unique id stays on the expanded title bar. The
 * attached half sits past the board edge, hover slides a short peek toward the
 * board, and a drag uses the full ribbon. Drag the tag: near an edge it
 * magnet-snaps at that along position; a click restores the last expanded
 * frame; a drop away from every edge expands at the release origin. Shrink and
 * expand play a FLIP morph so the window travels between the tag and the
 * frame. Shrink keeps expanded chrome while it flies to the painted ribbon
 * box; the tag-face crossfade starts after the window has flown as a card,
 * then the last FLIP
 * transform is frozen and the node becomes the ribbon without interpolating
 * that scale onto the tag box. Expand inverts the tag into the frame and
 * crossfades the other way (`prefers-reduced-motion` skips it). Insert
 * `--width` / `--height` set the first-mount size; a page may still call
 * `preferFrame` after mount until this seat is locked (stored frame, first
 * prefer, or a user drag/resize). `preferFrame`, drag, and resize change only this
 * card's frame. Primary-button pointer down anywhere in the window raises it
 * (`bringToFront`; same primary-button check as title-bar drag). A grab strip of the title
 * bar stays on the playable board (the body may hang past the left, right, or
 * bottom). Same-document hash links in the body stay in this window
 * (in-body scrollport only; not `scrollIntoView`).
 * A body slot with no occupant renders `chrome.empty` as a filled label.
 * Product title and primary actions belong in that page.
 * @param props - overlay runtime, child slots, desk store, locale, card number.
 * @returns the card chrome, resize handles, and body slot.
 */
export function OverlayCard({
  t, renderSlot, useStore, actions, cardNumber,
}: OverlayCardProps) {
  const frame = useStore(state => state.frames[cardNumber])
  const identityFields = useStore(state => state.identities[cardNumber])
  const preferLocked = useStore(state => state.preferLocked[cardNumber] === true)
  const dock = useStore(state => state.docks[cardNumber])
  const z = useStore((state) => {
    const index = state.front.indexOf(cardNumber)
    const base = state.docks[cardNumber] === undefined ? BASE_Z : TAG_Z
    return base + Math.max(0, index)
  })
  const canvas = useStore(state => state.canvas)
  const gesture = useRef<Gesture | undefined>(undefined)
  const frameRef = useRef(frame)
  frameRef.current = frame
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const canvasRef = useRef<OverlayCanvasSize>(canvas)
  canvasRef.current = canvas
  const preferLockedRef = useRef(preferLocked)
  preferLockedRef.current = preferLocked
  const dockRef = useRef(dock)
  dockRef.current = dock
  const cardRef = useRef<HTMLElement | null>(null)
  const tagProbeRef = useRef<HTMLSpanElement | null>(null)
  const windowBound = useRef<(() => void) | undefined>(undefined)
  const morphFromRef = useRef<OverlayFlipBox | undefined>(undefined)
  const keepCardChromeRef = useRef(false)
  const morphEdgeRef = useRef<OverlayDockEdge>('top')
  const ribbonAlongRef = useRef(TAG_ALONG_MAX)
  const [preview, setPreview] = useState<DockPreview | undefined>(undefined)
  const [morph, setMorph] = useState<Morph | undefined>(undefined)
  const [landing, setLanding] = useState(false)

  /** Stable identity: a page `useEffect(..., [preferFrame])` must not reset a user resize. */
  const preferFrame = useCallback((next: OverlayCardPreferredFrame): void => {
    if (preferLockedRef.current) return
    const current = frameRef.current
    if (current === undefined) return
    preferLockedRef.current = true
    actionsRef.current.setFrame(cardNumber, {
      x: next.x ?? current.x,
      y: next.y ?? current.y,
      width: next.width,
      height: next.height,
    })
  }, [cardNumber])

  const detachWindow = (): void => {
    windowBound.current?.()
    windowBound.current = undefined
  }

  useEffect(() => () => detachWindow(), [])

  useLayoutEffect(() => {
    if (!landing) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setLanding(false))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [landing])

  useLayoutEffect(() => {
    const from = morphFromRef.current
    if (from === undefined) return
    const finish = (): void => {
      morphFromRef.current = undefined
      keepCardChromeRef.current = false
      setMorph(undefined)
    }
    if (dock !== undefined) {
      const origin = boardOrigin(cardRef.current)
      const along = tagRibbonAlong(readTagTextPx(tagProbeRef.current))
      ribbonAlongRef.current = along
      const to = tagFlipBox(dock, canvasRef.current, origin.left, origin.top, along)
      const toward = flipToward(from, to)
      if (isIdentityMorph(toward)) {
        finish()
        return
      }
      const payload = { ...toward, tagW: to.width, tagH: to.height }
      let inner = 0
      let landRaf = 0
      let dissolveTimer = 0
      let doneTimer = 0
      let cancelled = false
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          /* v8 ignore next -- disposer cancelled this queued frame */
          if (cancelled) return
          morphFromRef.current = undefined
          setMorph({ kind: 'fly', ...payload })
          dissolveTimer = window.setTimeout(() => {
            /* v8 ignore next -- disposer cleared this timer */
            if (cancelled) return
            setMorph({ kind: 'dissolve', ...payload })
          }, DISSOLVE_DELAY_MS)
          doneTimer = window.setTimeout(() => {
            /* v8 ignore next -- disposer cleared this timer */
            if (cancelled) return
            setMorph({ kind: 'freeze', ...payload })
            landRaf = requestAnimationFrame(() => {
              landRaf = requestAnimationFrame(() => {
                /* v8 ignore next -- disposer cancelled this queued frame */
                if (cancelled) return
                keepCardChromeRef.current = false
                setLanding(true)
                setMorph(undefined)
              })
            })
          }, DISSOLVE_DELAY_MS + SETTLE_MS)
        })
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
        cancelAnimationFrame(landRaf)
        window.clearTimeout(dissolveTimer)
        window.clearTimeout(doneTimer)
      }
    }
    const to = readFlipBox(cardRef.current)
    if (to === undefined) {
      finish()
      return
    }
    const invert = flipInvert(from, to)
    if (isIdentityMorph(invert)) {
      finish()
      return
    }
    setMorph({ kind: 'snap', ...invert, tagW: from.width, tagH: from.height })
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        morphFromRef.current = undefined
        setMorph({ kind: 'play' })
      })
    })
    const timer = window.setTimeout(finish, MORPH_MS)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      window.clearTimeout(timer)
    }
  }, [dock, frame?.x, frame?.y, frame?.width, frame?.height])

  const identity = identityFields === undefined
    ? ''
    : t('chrome.identity', { title: identityFields.title, id: identityFields.id })
  const bodySlot = overlayCardBodySlot(cardNumber)
  const trailingSlot = overlayCardTrailingSlot(cardNumber)

  if (frame === undefined || identityFields === undefined) return null

  const { x, y, width, height } = frame
  const docked = dock !== undefined

  const localPoint = (clientX: number, clientY: number): { x: number; y: number } => (
    clientOnBoard(clientX, clientY, cardRef.current)
  )

  const applyDockMove = (clientX: number, clientY: number): void => {
    const current = gesture.current
    /* v8 ignore next -- window and element both deliver pointermove; the first call already cleared the gesture */
    if (current === undefined || current.kind !== 'dock') return
    const local = localPoint(clientX, clientY)
    const magnet = magnetDock(
      local.x, local.y, canvasRef.current, current.grabX, current.grabY,
    )
    if (magnet === undefined) {
      setPreview({ kind: 'float', x: local.x - current.grabX, y: local.y - current.grabY })
      return
    }
    setPreview({ kind: 'magnet', dock: magnet })
  }

  const applyDockUp = (clientX: number, clientY: number): void => {
    const current = gesture.current
    /* v8 ignore next -- window and element both deliver pointerup; the first call already cleared the gesture */
    if (current === undefined || current.kind !== 'dock') return
    gesture.current = undefined
    detachWindow()
    const local = localPoint(clientX, clientY)
    const dx = local.x - current.startX
    const dy = local.y - current.startY
    setPreview(undefined)
    const armMorph = (): void => {
      if (prefersReducedMotion()) return
      morphFromRef.current = readFlipBox(cardRef.current)
    }
    if (Math.hypot(dx, dy) < CLICK_SLOP) {
      armMorph()
      actions.restore(cardNumber)
      return
    }
    const magnet = magnetDock(
      local.x, local.y, canvasRef.current, current.grabX, current.grabY,
    )
    if (magnet === undefined) {
      const live = frameRef.current
      /* v8 ignore next -- a docked tag keeps its last expanded frame */
      if (live === undefined) {
        armMorph()
        actions.restore(cardNumber)
        return
      }
      armMorph()
      actions.restore(cardNumber, clampGrabOrigin(
        local.x - current.grabX,
        local.y - current.grabY,
        canvasRef.current,
        live.width,
      ))
      return
    }
    actions.setDock(cardNumber, magnet)
  }

  const applyDockCancel = (): void => {
    /* v8 ignore next -- window and element both deliver pointercancel; the first call already cleared the gesture */
    if (gesture.current === undefined) return
    gesture.current = undefined
    detachWindow()
    setPreview(undefined)
  }

  const attachWindow = (pointerId: number): void => {
    detachWindow()
    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return
      applyDockMove(event.clientX, event.clientY)
    }
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return
      applyDockUp(event.clientX, event.clientY)
    }
    const onCancel = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return
      applyDockCancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    windowBound.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }

  const capturePointer = (target: HTMLElement, pointerId: number): void => {
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // Overlay hosts and jsdom may reject capture; window listeners still track.
    }
  }

  const settlePointer = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onActivate = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    actions.bringToFront(cardNumber)
  }

  const onMoveDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    const local = pointerOnBoard(event)
    gesture.current = {
      kind: 'move',
      pointerId: event.pointerId,
      offsetX: local.x - x,
      offsetY: local.y - y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDockDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    const parked = dockRef.current
    /* v8 ignore next -- dock handlers mount only while a dock exists */
    if (parked === undefined) return
    const local = pointerOnBoard(event)
    const origin = clientOnBoard(
      event.currentTarget.getBoundingClientRect().left,
      event.currentTarget.getBoundingClientRect().top,
      event.currentTarget,
    )
    gesture.current = {
      kind: 'dock',
      pointerId: event.pointerId,
      startX: local.x,
      startY: local.y,
      grabX: local.x - origin.x,
      grabY: local.y - origin.y,
    }
    capturePointer(event.currentTarget, event.pointerId)
    attachWindow(event.pointerId)
  }

  const onResizeDown = (edge: ResizeEdge) => (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    gesture.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      edge,
      startX: x,
      startY: y,
      startWidth: width,
      startHeight: height,
      originX: event.clientX,
      originY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = gesture.current
    if (current === undefined || current.pointerId !== event.pointerId) return
    if (current.kind === 'dock') {
      applyDockMove(event.clientX, event.clientY)
      return
    }
    if (current.kind === 'move') {
      const local = pointerOnBoard(event)
      const liveFrame = frameRef.current
      /* v8 ignore next -- move capture starts only while a frame is mounted */
      if (liveFrame === undefined) return
      const next = clampGrabOrigin(
        local.x - current.offsetX,
        local.y - current.offsetY,
        canvasRef.current,
        liveFrame.width,
      )
      actions.setPosition(cardNumber, next.x, next.y)
      return
    }
    actions.setFrame(cardNumber, applyResize(
      {
        x: current.startX,
        y: current.startY,
        width: current.startWidth,
        height: current.startHeight,
      },
      current.edge,
      event.clientX,
      event.clientY,
      current.originX,
      current.originY,
    ))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = gesture.current
    if (current === undefined || current.pointerId !== event.pointerId) return
    if (current.kind === 'dock') {
      settlePointer(event)
      applyDockUp(event.clientX, event.clientY)
      return
    }
    gesture.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = gesture.current
    if (current === undefined || current.pointerId !== event.pointerId) return
    if (current.kind === 'dock') {
      settlePointer(event)
      applyDockCancel()
      return
    }
    gesture.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onTrailingDown = (event: ReactPointerEvent<HTMLElement>): void => {
    event.stopPropagation()
  }

  const onMinimizeDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    if (event.button !== 0) return
    if (!prefersReducedMotion()) {
      const from = readFlipBox(cardRef.current)
      morphFromRef.current = from
      if (from !== undefined) {
        keepCardChromeRef.current = true
        setMorph({ kind: 'hold' })
      }
    }
    actions.minimize(cardNumber)
  }

  const onBodyClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    consumeCardHashClick(event.nativeEvent, event.currentTarget)
  }

  const floating = preview?.kind === 'float'
  const magnet = preview?.kind === 'magnet' ? preview.dock : undefined
  const paintDock = dock === undefined || floating ? undefined : (magnet ?? dock)
  const edgeName = paintDock?.edge
  if (dock !== undefined) morphEdgeRef.current = dock.edge
  const paintAsTag = docked && morph === undefined && !keepCardChromeRef.current
  const morphClass = morph === undefined
    ? ''
    : ` ${morphChromeClass(morph, dock?.edge ?? morphEdgeRef.current)}`
  const tagClass = paintAsTag
    ? `${css.window} ${css.tag}${landing ? ` ${css.landing}` : ''}${edgeName === undefined ? ` ${css.floating}` : ` ${css[edgeName]}`}${preview !== undefined ? ` ${css.dragging}` : ''}`
    : `${css.window}${morphClass}`
  const tagStyle: CSSProperties | undefined = !paintAsTag
    ? undefined
    : floating
      ? { left: preview.x, top: preview.y, zIndex: z }
      : (() => {
        const live = magnet ?? dock
        /* v8 ignore next -- paintAsTag is only true while a dock exists */
        if (live === undefined) return { left: x, top: y, width, height, zIndex: z }
        const box = dockTagBox(
          live,
          canvas,
          preview === undefined,
          landing ? ribbonAlongRef.current : TAG_ALONG_MAX,
        )
        const size = landing ? { width: box.width, height: box.height } : {}
        if (live.edge === 'right') {
          return { right: canvas.width - box.x - box.width, top: box.y, ...size, zIndex: z }
        }
        if (live.edge === 'bottom') {
          return { bottom: canvas.height - box.y - box.height, left: box.x, ...size, zIndex: z }
        }
        return { left: box.x, top: box.y, ...size, zIndex: z }
      })()

  return (
    <aside
      ref={cardRef}
      className={tagClass}
      data-overlay-card=""
      data-overlay-card-n={String(cardNumber)}
      data-overlay-card-id={identityFields.id}
      {...(paintAsTag ? { 'data-overlay-dock': '' } : {})}
      {...(paintAsTag && paintDock !== undefined ? { 'data-overlay-dock-edge': paintDock.edge } : {})}
      data-float-x={String(x)}
      data-float-y={String(y)}
      data-float-w={String(width)}
      data-float-h={String(height)}
      style={{
        ...(tagStyle ?? { left: x, top: y, width, height, zIndex: z }),
        ...morphStyle(morph),
        ...(landing ? { transform: 'none', transition: 'none' } : {}),
      }}
      aria-label={paintAsTag
        ? t('chrome.restore', { title: identityFields.title, id: identityFields.id })
        : identity}
      onPointerDownCapture={onActivate}
    >
      {RESIZE_EDGES.map(edge => (
        <div
          key={edge}
          className={`${css.handle} ${css[edge]}`}
          data-float-resize={edge}
          aria-hidden="true"
          onPointerDown={onResizeDown(edge)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
      ))}
      <div className={css.body} data-overlay-card-body="" onClick={onBodyClick}>
        {renderSlot(bodySlot, { preferFrame }, {
          fallback: (
            <div className={css.empty} data-overlay-card-empty="">
              {t('chrome.empty')}
            </div>
          ),
        })}
      </div>
      <header
        className={css.header}
        data-overlay-card-drag=""
        onPointerDown={paintAsTag ? onDockDown : onMoveDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={css.identity}>
          <span className={css.name}>{identityFields.title}</span>
          <span className={css.number} data-overlay-card-number="">{identityFields.id}</span>
        </div>
        <div
          className={css.trailing}
          data-overlay-card-chrome-trailing=""
          onPointerDown={onTrailingDown}
        >
          {renderSlot(trailingSlot, {})}
          <button
            type="button"
            className={css.minimize}
            data-overlay-card-minimize=""
            aria-label={t('chrome.minimize')}
            onPointerDown={onMinimizeDown}
          >
            <span className={css.minimizeMark} aria-hidden="true" />
          </button>
        </div>
      </header>
      {morph !== undefined ? (
        <div
          className={css.tagFace}
          data-overlay-tag-face=""
          aria-hidden="true"
          style={{
            opacity: morph.kind === 'dissolve' || morph.kind === 'freeze' || morph.kind === 'snap' ? 1 : 0,
          }}
        >
          <span className={css.name}>{identityFields.title}</span>
        </div>
      ) : null}
      <span
        ref={tagProbeRef}
        className={`${css.tagProbe}${
          dock?.edge === 'top' || dock?.edge === 'bottom' ? ` ${css.tagProbeVertical}` : ''
        }`}
        data-overlay-tag-probe=""
        aria-hidden="true"
      >
        {identityFields.title}
      </span>
    </aside>
  )
}
