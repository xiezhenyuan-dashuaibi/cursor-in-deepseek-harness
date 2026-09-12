/** Black-hole scene occupying overlay-desktop.body. */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Page.module.css'

/** Full props composed from the overlay-desktop.body slot. */
export type PageProps =
  PropsRuntime<'overlay-desktop.body'>
  & PropsLocale<'overlay-black-hole'>

const STAR_IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const

/**
 * Coordinate clock as `HH:mm:ss`.
 * @param now - instant to format.
 * @returns two-digit hours, minutes, and seconds.
 */
function formatHorizonTime(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Event-horizon scene under cards and Cursor. Photon count resets when
 * the occupant remounts. The painted scene stays click-through.
 * @param props - locale share.
 * @returns the page filling the desktop body.
 */
export function Page({ t }: PageProps) {
  const [now, setNow] = useState(() => new Date())
  const [count, setCount] = useState(0)
  const [ingest, setIngest] = useState(0)

  useEffect(() => {
    const tick = () => {
      setNow(new Date())
    }
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  return (
    <main
      className={css.page}
      data-overlay-desktop-page=""
      aria-label={t('title')}
    >
      <div className={css.scene} aria-hidden="true">
        <div className={css.stars} />
        {STAR_IDS.map(id => (
          <span key={id} className={`${css.star} ${css[id]}`} />
        ))}
        <div className={css.haze} />
        <div className={css.lens} />
        <div className={css.well}>
          <div className={css.disk} />
          <div className={css.horizon} />
          {ingest > 0 ? <span key={ingest} className={css.streak} /> : null}
        </div>
      </div>

      <section className={css.pad}>
        <p className={css.kicker}>{t('kicker')}</p>
        <h1 className={css.title}>{t('title')}</h1>
        <time
          className={css.clock}
          dateTime={now.toISOString()}
          aria-label={t('clockLabel')}
        >
          {formatHorizonTime(now)}
        </time>
        <p className={css.stats}>{t('stats', { count })}</p>
        <p className={css.hint}>{t('hint')}</p>
        {count > 0 ? (
          <p className={css.notice} aria-live="polite">{t('notice')}</p>
        ) : null}
        <button
          type="button"
          className={css.primary}
          onClick={() => {
            setCount(n => n + 1)
            setIngest(n => n + 1)
          }}
        >
          {t('ingest')}
        </button>
      </section>
    </main>
  )
}
