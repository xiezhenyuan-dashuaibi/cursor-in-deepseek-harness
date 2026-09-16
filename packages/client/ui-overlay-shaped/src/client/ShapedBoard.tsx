/** Click-through overlay shaped board with concurrent body occupants. */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayShapedInjected } from './contract/slots.ts'
import { sameShapedCanvas, type ShapedCanvasSize } from './geometry.ts'
import { ShapedSeat } from './ShapedSeat.tsx'
import css from './ShapedBoard.module.css'

/** Full props composed from the shell.overlay registration. */
export type ShapedBoardProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'overlay-shaped.body'>
  & InjectFace<OverlayShapedInjected>

const EMPTY_CANVAS: ShapedCanvasSize = { width: 0, height: 0 }

/**
 * Full-viewport transparent board. Empty space stays click-through. Occupants
 * paint their own silhouette. Each list id sits in a host seat that owns
 * drag, persisted offset, intra-board raise, hide-while-mounted, and keeping
 * the occupant box on the playable board.
 * @param props - overlay runtime, body slot, body-id and hide hooks.
 * @returns the click-through board.
 */
export function ShapedBoard({ renderSlot, useBodyIds, useHiddenRegistrants }: ShapedBoardProps) {
  const occupants = useBodyIds(snapshot => snapshot)
  const hiddenRegistrants = useHiddenRegistrants(snapshot => snapshot)
  const ids = occupants.map(item => item.id)
  const hiddenSet = new Set(hiddenRegistrants)
  const [front, setFront] = useState<readonly string[]>([])
  const [canvas, setCanvas] = useState<ShapedCanvasSize>(EMPTY_CANVAS)
  const boardRef = useRef<HTMLDivElement>(null)
  const onRaise = useCallback((id: string) => {
    setFront((current) => {
      const live = current.filter(item => ids.includes(item))
      return [...live.filter(item => item !== id), id]
    })
  }, [ids])
  const order = stacked(ids, front)

  useLayoutEffect(() => {
    const el = boardRef.current
    /* v8 ignore next -- the board node is mounted before this effect */
    if (el === null) return
    const apply = (): void => {
      const next = { width: el.clientWidth, height: el.clientHeight }
      setCanvas(current => (sameShapedCanvas(current, next) ? current : next))
    }
    apply()
    /* v8 ignore next -- jsdom may omit ResizeObserver */
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={boardRef} className={css.board} data-overlay-board="" data-overlay-shaped="">
      {occupants.map(occupant => (
        <ShapedSeat
          key={occupant.id}
          id={occupant.id}
          canvas={canvas}
          zIndex={order.indexOf(occupant.id) + 1}
          hidden={occupant.registrant.length > 0 && hiddenSet.has(occupant.registrant)}
          onRaise={onRaise}
        >
          {renderSlot('overlay-shaped.body', {}, { only: occupant.id })}
        </ShapedSeat>
      ))}
    </div>
  )
}

function stacked(ids: readonly string[], front: readonly string[]): readonly string[] {
  const liveFront = front.filter(id => ids.includes(id))
  const unseen = ids.filter(id => !liveFront.includes(id))
  return [...unseen, ...liveFront]
}
