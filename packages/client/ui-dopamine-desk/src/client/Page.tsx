/** Pulse-floor product page for overlay-desktop.body. */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Page.module.css'

/** Full props composed from the overlay-desktop.body slot. */
export type PageProps =
  PropsRuntime<'overlay-desktop.body'>
    & PropsLocale<'overlay-dopamine-desk'>

const PADS = [
  { key: 'hitA' as const, points: 1, className: 'padA' },
  { key: 'hitB' as const, points: 3, className: 'padB' },
  { key: 'hitC' as const, points: 8, className: 'padC' },
] as const

/**
 * Full-viewport pulse floor on the reusable overlay desktop. Local score
 * resets when the occupant remounts.
 * @param props - locale share.
 * @returns the page filling the desktop body.
 */
export function Page({ t }: PageProps) {
  const [score, setScore] = useState(0)
  const [flash, setFlash] = useState<(typeof PADS)[number]['key'] | null>(null)

  return (
    <main className={css.scene} data-overlay-desktop-page="" aria-label={t('title')}>
      <div className={css.orbA} aria-hidden="true" />
      <div className={css.orbB} aria-hidden="true" />
      <div className={css.orbC} aria-hidden="true" />
      <header className={css.mast}>
        <p className={css.kicker}>{t('score')}</p>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.body}>{t('body')}</p>
      </header>
      <p className={css.meter} aria-live="polite">{score}</p>
      {PADS.map(pad => (
        <button
          key={pad.key}
          type="button"
          className={[
            css.pad,
            css[pad.className],
            flash === pad.key ? css.padFlash : '',
          ].join(' ')}
          onClick={() => {
            setScore(n => n + pad.points)
            setFlash(pad.key)
          }}
          onAnimationEnd={() => { setFlash(null) }}
        >
          {t(pad.key)}
        </button>
      ))}
    </main>
  )
}
