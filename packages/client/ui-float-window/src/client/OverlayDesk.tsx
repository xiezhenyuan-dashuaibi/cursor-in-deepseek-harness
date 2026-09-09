/** Desk that mounts one overlay card window per spec that is not hidden and is inserted. */

import { useEffect, useRef } from 'react'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { OVERLAY_STACK_DESK_ID, overlayStackZIndex } from './overlay-stack-ids.ts'
import type { OverlayCardChildSlot } from '../instances.ts'
import type { OverlayCardInjected } from './contract/slots.ts'
import { OverlayCard } from './OverlayCard.tsx'
import {
  snapshotCardLayout, writePersistedCardFrames,
} from './frame-storage.ts'
import type { createOverlayDeskStore } from './stores.ts'
import css from './OverlayDesk.module.css'

/** Full props composed from the overlay occupant registration. */
export type OverlayDeskProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<OverlayCardChildSlot>
  & PropsStore<ReturnType<typeof createOverlayDeskStore>>
  & InjectFace<OverlayCardInjected>
  & PropsLocale<'overlay-card'>

/**
 * Renders one {@link OverlayCard} per mounted host roster spec on a clip board
 * whose box is the desk canvas. Adding a spec does not remount the other windows.
 * Primary-button pointer down on a card raises this board in `overlayStack`.
 * @param props - overlay runtime, child slots, desk store, roster hook, locale.
 * @returns the playable board and mounted card windows.
 */
export function OverlayDesk(props: OverlayDeskProps) {
  const {
    t, renderSlot, useStore, actions, useRoster, useOverlayStack, raiseDesk, ...runtime
  } = props
  const rosterCards = useRoster(state => state.cards)
  const numbers = useStore(state => state.numbers)
  const identities = useStore(state => state.identities)
  const frames = useStore(state => state.frames)
  const front = useStore(state => state.front)
  const docks = useStore(state => state.docks)
  const parks = useStore(state => state.parks)
  const deskZ = useOverlayStack(state => overlayStackZIndex(state.front, OVERLAY_STACK_DESK_ID))
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    actions.syncCards(rosterCards)
  }, [actions, rosterCards])
  useEffect(() => {
    if (Object.keys(identities).length === 0) return
    writePersistedCardFrames(snapshotCardLayout(identities, frames, front, docks, parks))
  }, [identities, frames, front, docks, parks])
  useEffect(() => {
    const el = boardRef.current
    /* v8 ignore next -- the board node is mounted before this effect */
    if (el === null) return
    const apply = (): void => {
      actions.setCanvas(el.clientWidth, el.clientHeight)
    }
    apply()
    const Observer = globalThis.ResizeObserver
    if (typeof Observer !== 'function') return
    const observer = new Observer(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [actions])
  return (
    <div
      ref={boardRef}
      className={css.board}
      data-overlay-board=""
      style={{ zIndex: deskZ }}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return
        raiseDesk()
      }}
    >
      {numbers.map(n => (
        <OverlayCard
          key={identities[n]?.id ?? String(n)}
          cardNumber={n}
          t={t}
          renderSlot={renderSlot}
          useStore={useStore}
          actions={actions}
          {...runtime}
        />
      ))}
    </div>
  )
}
