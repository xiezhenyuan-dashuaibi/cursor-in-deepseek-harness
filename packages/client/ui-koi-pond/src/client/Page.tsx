/** Koi tank occupying overlay-desktop.body. */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayPageKey } from './locales.ts'
import { paintTank, type TankBrush } from './paint.ts'
import {
  applyCurrent,
  createTank,
  feedTank,
  formatLoaf,
  hitTest,
  playHit,
  resizeTank,
  snapshotHud,
  stepTank,
  tapTank,
  type FishId,
  type MoodId,
  type PlayResult,
  type TankHud,
  type TankState,
  type Vec2,
} from './tank.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-desktop.body slot. */
export type PageProps =
  PropsRuntime<'overlay-desktop.body'>
  & PropsLocale<'overlay-koi-pond'>

const FISH_COPY: Record<FishId, OverlayPageKey> = {
  zhoubao: 'fish.zhoubao',
  moyu: 'fish.moyu',
  kafei: 'fish.kafei',
  huiyi: 'fish.huiyi',
  youjian: 'fish.youjian',
  rili: 'fish.rili',
  xuqiu: 'fish.xuqiu',
}

const DEFAULT_SIZE = { width: 960, height: 540 }

/** Plaque copy after a tank gesture. */
export type Notice =
  | { key: 'notice.feed' }
  | { key: 'notice.tap' }
  | { key: 'notice.pet'; name: OverlayPageKey }
  | { key: 'notice.duck' }
  | { key: 'notice.chestOpen' }
  | { key: 'notice.chestClose' }
  | { key: 'notice.paw' }

/**
 * Interactive office koi tank under cards and Cursor. Local tank state
 * resets when the occupant remounts.
 * @param props - locale share.
 * @returns the page filling the desktop body.
 */
export function Page({ t }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tankRef = useRef<TankState | null>(null)
  const cursorRef = useRef<Vec2 | null>(null)
  const dragRef = useRef<{ point: Vec2; moved: boolean } | null>(null)
  const hudAtRef = useRef(0)
  const reducedRef = useRef(false)
  const [reduced, setReduced] = useState(() => readReducedMotion())
  const [mood, setMood] = useState<MoodId>('day')
  const [hud, setHud] = useState<TankHud>({ elapsed: 0, fed: 0, taps: 0, pets: 0 })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [hover, setHover] = useState<{ id: FishId; x: number; y: number } | null>(null)

  reducedRef.current = reduced

  useEffect(() => {
    const canvas = canvasRef.current
    /* v8 ignore next -- the canvas ref is committed before this effect */
    if (!canvas) return
    const size = canvasSize(canvas)
    const tank = createTank(size.width, size.height)
    tankRef.current = tank
    syncBackingStore(canvas, size)
    paintCanvas(canvas, tank, reducedRef.current)
    setHud(snapshotHud(tank))
    const applySize = () => {
      const live = tankRef.current
      if (!live) {
        return
      }
      const next = canvasSize(canvas)
      resizeTank(live, next.width, next.height)
      syncBackingStore(canvas, next)
      paintCanvas(canvas, live, reducedRef.current)
    }
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', applySize)
      return () => {
        window.removeEventListener('resize', applySize)
        tankRef.current = null
      }
    }
    const observer = new ResizeObserver(applySize)
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      tankRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      setReduced(media.matches)
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])

  useEffect(() => {
    if (reduced) {
      const canvas = canvasRef.current
      const tank = tankRef.current
      /* v8 ignore start -- the tank canvas is mounted before this effect */
      if (canvas && tank) {
        paintCanvas(canvas, tank, true)
      }
      /* v8 ignore stop */
      const timer = window.setInterval(() => {
        const live = tankRef.current
        if (!live) {
          return
        }
        live.elapsed += 1
        setHud(snapshotHud(live))
      }, 1000)
      return () => {
        window.clearInterval(timer)
      }
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const canvas = canvasRef.current
      const tank = tankRef.current
      if (!canvas || !tank) {
        return
      }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      stepTank(tank, dt, { cursor: cursorRef.current })
      paintCanvas(canvas, tank, false)
      if (now - hudAtRef.current > 250) {
        hudAtRef.current = now
        setHud(snapshotHud(tank))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [reduced])

  const refresh = (nextNotice: Notice) => {
    setNotice(nextNotice)
    const tank = tankRef.current
    /* v8 ignore next -- plaque actions run after the tank mounts */
    if (!tank) return
    setHud(snapshotHud(tank))
    setMood(tank.mood)
    const canvas = canvasRef.current
    /* v8 ignore next -- the canvas ref stays set while the page is mounted */
    if (!canvas) return
    paintCanvas(canvas, tank, reducedRef.current)
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const tank = tankRef.current
    /* v8 ignore next -- pointer handlers run after the tank mounts */
    if (!tank) return
    const canvas = event.currentTarget
    const point = tankPoint(canvas, tank, event.clientX, event.clientY)
    cursorRef.current = point
    dragRef.current = { point, moved: false }
    if (typeof canvas.setPointerCapture === 'function') {
      canvas.setPointerCapture(event.pointerId)
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const tank = tankRef.current
    /* v8 ignore next -- pointer handlers run after the tank mounts */
    if (!tank) return
    const canvas = event.currentTarget
    const point = tankPoint(canvas, tank, event.clientX, event.clientY)
    cursorRef.current = point
    const drag = dragRef.current
    if (drag) {
      const travel = Math.hypot(point.x - drag.point.x, point.y - drag.point.y)
      if (travel > 8) {
        drag.moved = true
        applyCurrent(tank, drag.point, point)
        drag.point = point
      }
    }
    const hit = hitTest(tank, point.x, point.y)
    if (hit.kind === 'fish') {
      setHover({ id: hit.fish.id, x: point.x, y: point.y })
    }
    else {
      setHover(null)
    }
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const tank = tankRef.current
    const canvas = event.currentTarget
    const drag = dragRef.current
    dragRef.current = null
    cursorRef.current = null
    /* v8 ignore next -- pointer handlers run after the tank mounts */
    if (!tank) return
    if (typeof canvas.hasPointerCapture === 'function' && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    if (drag?.moved || event.detail >= 2) {
      return
    }
    const point = tankPoint(canvas, tank, event.clientX, event.clientY)
    refresh(noticeOf(playHit(tank, point.x, point.y)))
  }

  const onPointerLeave = () => {
    cursorRef.current = null
    setHover(null)
  }

  const onDoubleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const tank = tankRef.current
    /* v8 ignore next -- double-click runs after the tank mounts */
    if (!tank) return
    const canvas = event.currentTarget
    const point = tankPoint(canvas, tank, event.clientX, event.clientY)
    tapTank(tank, point.x, point.y)
    refresh({ key: 'notice.tap' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLButtonElement) {
      return
    }
    const tank = tankRef.current
    /* v8 ignore next -- keyboard shortcuts run after the tank mounts */
    if (!tank) return
    if (event.key === 'f' || event.key === 'F' || event.key === ' ') {
      event.preventDefault()
      feedTank(tank, tank.width * 0.5, tank.height * 0.35)
      refresh({ key: 'notice.feed' })
      return
    }
    if (event.key === 'g' || event.key === 'G') {
      event.preventDefault()
      tapTank(tank, tank.width * 0.5, tank.height * 0.4)
      refresh({ key: 'notice.tap' })
    }
  }

  const toggleMood = () => {
    const tank = tankRef.current
    const next: MoodId = mood === 'day' ? 'night' : 'day'
    /* v8 ignore next -- the lamp toggle runs after the tank mounts */
    if (!tank) return
    tank.mood = next
    setMood(next)
    const canvas = canvasRef.current
    /* v8 ignore next -- the canvas ref stays set while the page is mounted */
    if (!canvas) return
    paintCanvas(canvas, tank, reducedRef.current)
  }

  const feedFromHud = () => {
    const tank = tankRef.current
    /* v8 ignore next -- plaque actions run after the tank mounts */
    if (!tank) return
    feedTank(tank, tank.width * 0.5, tank.height * 0.28)
    refresh({ key: 'notice.feed' })
  }

  const tapFromHud = () => {
    const tank = tankRef.current
    /* v8 ignore next -- plaque actions run after the tank mounts */
    if (!tank) return
    tapTank(tank, tank.width * 0.5, tank.height * 0.42)
    refresh({ key: 'notice.tap' })
  }

  return (
    <main
      className={css.page}
      data-overlay-desktop-page=""
      data-mood={mood}
      data-reduced={reduced ? 'on' : 'off'}
      aria-label={t('title')}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className={css.cabinet}>
        <div className={css.plate}>{t('title')}</div>
        <div className={css.glass}>
          <canvas
            ref={canvasRef}
            className={css.canvas}
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDoubleClick={onDoubleClick}
          />
          <div className={css.caustic} />
          <div className={css.glare} />
          {hover ? (
            <span
              className={css.tag}
              style={{ left: hover.x, top: hover.y }}
            >
              {t(FISH_COPY[hover.id])}
            </span>
          ) : null}
        </div>
      </div>

      <section className={css.hud} aria-label={t('kicker')}>
        <p className={css.kicker}>{t('kicker')}</p>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.clock} aria-label={t('clockLabel')}>
          {formatLoaf(hud.elapsed)}
        </p>
        <p className={css.stats}>
          {t('stats', { fed: hud.fed, taps: hud.taps, pets: hud.pets })}
        </p>
        <p className={css.hint}>{t('hint')}</p>
        {notice ? (
          <p className={css.notice} aria-live="polite">
            {notice.key === 'notice.pet'
              ? t(notice.key, { name: t(notice.name) })
              : t(notice.key)}
          </p>
        ) : null}
        <div className={css.actions}>
          <button type="button" className={css.primary} onClick={feedFromHud}>
            {t('feed')}
          </button>
          <button type="button" className={css.ghost} onClick={tapFromHud}>
            {t('tap')}
          </button>
          <button
            type="button"
            className={css.ghost}
            aria-pressed={mood === 'night'}
            onClick={toggleMood}
          >
            {mood === 'night' ? t('mood.day') : t('mood.night')}
          </button>
        </div>
      </section>
    </main>
  )
}

/**
 * Map a play result onto plaque copy.
 * @param result - occupant that responded.
 * @returns notice payload.
 */
export function noticeOf(result: PlayResult): Notice {
  switch (result.kind) {
    case 'fish':
      return { key: 'notice.pet', name: FISH_COPY[result.fishId ?? 'moyu'] }
    case 'duck':
      return { key: 'notice.duck' }
    case 'chest':
      return { key: result.chestOpen ? 'notice.chestOpen' : 'notice.chestClose' }
    case 'paw':
      return { key: 'notice.paw' }
    case 'water':
      return { key: 'notice.feed' }
    /* v8 ignore start -- PlayResult.kind is a closed union */
    default:
      return { key: 'notice.feed' }
    /* v8 ignore stop */
  }
}

function readReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const width = Math.max(320, canvas.clientWidth || DEFAULT_SIZE.width)
  const height = Math.max(240, canvas.clientHeight || DEFAULT_SIZE.height)
  return { width, height }
}

/**
 * Resolve a pointer axis against the painted tank.
 * @param measured - getBoundingClientRect span.
 * @param fallback - live tank span.
 * @returns a positive divisor.
 */
export function axisSize(measured: number, fallback: number): number {
  if (measured > 0) {
    return measured
  }
  if (fallback > 0) {
    return fallback
  }
  return 1
}

function tankPoint(
  canvas: HTMLCanvasElement,
  tank: TankState,
  clientX: number,
  clientY: number,
): Vec2 {
  const rect = canvas.getBoundingClientRect()
  const width = axisSize(rect.width, tank.width)
  const height = axisSize(rect.height, tank.height)
  return {
    x: ((clientX - rect.left) / width) * tank.width,
    y: ((clientY - rect.top) / height) * tank.height,
  }
}

function syncBackingStore(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(size.width * dpr)
  canvas.height = Math.floor(size.height * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx && 'setTransform' in ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}

function paintCanvas(canvas: HTMLCanvasElement, tank: TankState, reducedMotion: boolean): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  paintTank(ctx as TankBrush, tank, { reducedMotion })
}
