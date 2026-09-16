/** One overlay-shaped.body contribution, translated and raised by the host. */

import {
  useCallback, useLayoutEffect, useRef, useState,
  type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import {
  clampShapedOffset, isShapedClick, offsetAfterMove, restBoxFromRects, sameShapedOffset,
  unionViewportBoxes,
  type ShapedBox, type ShapedCanvasSize, type ShapedOffset,
} from './geometry.ts'
import { readShapedOffset, writeShapedOffset } from './offset-storage.ts'
import css from './ShapedSeat.module.css'

/** Props for one host seat around a list occupant. */
export type ShapedSeatProps = {
  /** `overlay-shaped.body` list id. */
  readonly id: string
  /** Intra-board stacking. Higher is in front. */
  readonly zIndex: number
  /** Playable board size. Non-positive skips clamping. */
  readonly canvas: ShapedCanvasSize
  /** Pointer-down raise among shaped seats. */
  readonly onRaise: (id: string) => void
  /** `true` hides the silhouette while children stay mounted. */
  readonly hidden?: boolean
  /** Occupant render (`renderSlot` with `only` this id). */
  readonly children: ReactNode
}

/**
 * Full-board wrapper: click-through except where the occupant paints a hit
 * target. Primary-button travel past the click slop translates this seat;
 * the occupant's CSS rest pose stays. Offset writes to `localStorage`.
 * Pointer capture starts after the slop so occupant `click` handlers still
 * fire. A hidden seat stays mounted and skips drag. The occupant painted box
 * stays on the playable board (`display: contents` slot anchors are not
 * that box).
 * @param props - list id, canvas, z-index, raise, hide, occupant.
 * @returns the translated seat.
 */
export function ShapedSeat({
  id, canvas, zIndex, onRaise, hidden = false, children,
}: ShapedSeatProps) {
  const seatRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef<ShapedOffset>({ x: 0, y: 0 })
  const [offset, setOffset] = useState<ShapedOffset>(() => readShapedOffset(id))
  offsetRef.current = offset
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: ShapedOffset
    rest: ShapedBox | undefined
    moved: boolean
    captured: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  const commitOffset = useCallback((next: ShapedOffset, persist: boolean) => {
    const changed = !sameShapedOffset(next, offsetRef.current)
    if (changed) setOffset(next)
    if (persist && changed) writeShapedOffset(id, next)
  }, [id])

  useLayoutEffect(() => {
    const seat = seatRef.current
    /* v8 ignore next -- the seat node is mounted before this effect */
    if (seat === null) return
    const reclamp = (): void => {
      if (drag.current !== null) return
      const rest = measureRestBox(seat, offsetRef.current)
      commitOffset(clampLiveOffset(offsetRef.current, rest, canvas), true)
    }
    reclamp()
    const roots = paintedOccupantRoots(seat)
    /* v8 ignore next -- jsdom may omit ResizeObserver */
    if (roots.length === 0 || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(reclamp)
    for (const root of roots) observer.observe(root)
    return () => observer.disconnect()
  }, [canvas, commitOffset])

  const onPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (hidden || event.button !== 0) return
    onRaise(id)
    const origin = offsetRef.current
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      rest: measureRestBox(event.currentTarget, origin),
      moved: false,
      captured: false,
    }
  }, [hidden, id, onRaise])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active === null || event.pointerId !== active.pointerId) return
    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY
    if (!active.moved && isShapedClick(dx, dy)) return
    if (!active.captured) {
      try {
        event.currentTarget.setPointerCapture(active.pointerId)
      } catch {
        // jsdom and some test doubles omit pointer capture.
      }
      active.captured = true
    }
    active.moved = true
    commitOffset(clampLiveOffset(offsetAfterMove(active.origin, dx, dy), active.rest, canvas), false)
  }, [canvas, commitOffset])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active === null || event.pointerId !== active.pointerId) return
    drag.current = null
    if (active.captured) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer was never captured (jsdom) or already released.
      }
    }
    if (!active.moved) return
    suppressClick.current = true
    const next = clampLiveOffset(
      offsetAfterMove(active.origin, event.clientX - active.startX, event.clientY - active.startY),
      active.rest,
      canvas,
    )
    if (!sameShapedOffset(next, offsetRef.current)) setOffset(next)
    // Move already applied the visual offset without persist.
    writeShapedOffset(id, next)
  }, [canvas, id])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const hiddenClass = hidden ? css.seatHidden : undefined
  return (
    <div
      ref={seatRef}
      className={hiddenClass === undefined ? css.seat : `${css.seat} ${hiddenClass}`}
      data-overlay-shaped-seat={id}
      data-overlay-shaped-hidden={hidden ? '' : undefined}
      style={{ transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)`, zIndex }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  )
}

function clampLiveOffset(
  offset: ShapedOffset,
  rest: ShapedBox | undefined,
  canvas: ShapedCanvasSize,
): ShapedOffset {
  if (rest === undefined) return offset
  return clampShapedOffset(offset, rest, canvas)
}

function measureRestBox(seat: HTMLElement, offset: ShapedOffset): ShapedBox | undefined {
  const board = seat.closest('[data-overlay-shaped]')
  const content = unionViewportBoxes(paintedOccupantRoots(seat).map(el => el.getBoundingClientRect()))
  if (!(board instanceof HTMLElement) || content === undefined) return undefined
  return restBoxFromRects(board.getBoundingClientRect(), content, offset)
}

/**
 * Occupant elements that paint a box. Slot outlets use `display: contents`;
 * their border box is 0×0 at the viewport origin and is not the silhouette.
 */
function paintedOccupantRoots(seat: HTMLElement): Element[] {
  const roots: Element[] = []
  const visit = (el: Element): void => {
    if (skipsPaintBox(el)) {
      for (const child of el.children) visit(child)
      return
    }
    roots.push(el)
  }
  for (const child of seat.children) visit(child)
  return roots
}

function skipsPaintBox(el: Element): boolean {
  if (getComputedStyle(el).display === 'contents') return true
  const box = el.getBoundingClientRect()
  return box.width === 0 && box.height === 0 && el.childElementCount > 0
}
