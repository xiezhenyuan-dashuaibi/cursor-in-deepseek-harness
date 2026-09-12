/** Dew-journal product page for overlay-card.body. */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Page.module.css'

/** Full props composed from the overlay-card.body slot. */
export type PageProps =
  PropsRuntime<'overlay-card.body'>
    & PropsLocale<'overlay-dew-journal'>

/** Opening frame requested on mount. Origin is omitted so a later drag is kept. */
export const PREFERRED_FRAME = { width: 420, height: 560 } as const

const MOODS = ['sunny', 'breeze', 'rain'] as const

/**
 * Soft journal page in the reusable overlay card. Local stamp
 * resets when the occupant remounts.
 * @param props - preferFrame owner callback and locale share.
 * @returns the page filling the card body.
 */
export function Page({ t, preferFrame }: PageProps) {
  const [mood, setMood] = useState<(typeof MOODS)[number]>('breeze')
  const [note, setNote] = useState('')
  const [stamped, setStamped] = useState(false)

  useEffect(() => {
    preferFrame(PREFERRED_FRAME)
  }, [preferFrame])

  return (
    <main className={css.page} data-overlay-page="" aria-label={t('title')}>
      <p className={css.leaf} aria-hidden="true">❀</p>
      <h1 className={css.title}>{t('title')}</h1>
      <p className={css.body}>{t('body')}</p>
      <fieldset className={css.moods}>
        <legend className={css.legend}>{t('mood')}</legend>
        {MOODS.map(key => (
          <button
            key={key}
            type="button"
            className={mood === key ? `${css.chip} ${css.chipOn}` : css.chip}
            aria-pressed={mood === key}
            onClick={() => { setMood(key) }}
          >
            {t(key)}
          </button>
        ))}
      </fieldset>
      <label className={css.field}>
        <span className={css.legend}>{t('noteLabel')}</span>
        <textarea
          className={css.note}
          rows={4}
          value={note}
          placeholder={t('notePlaceholder')}
          onChange={(event) => { setNote(event.target.value) }}
        />
      </label>
      <button
        type="button"
        className={css.primary}
        aria-pressed={stamped}
        onClick={() => { setStamped(true) }}
      >
        {stamped ? t('actionDone') : t('action')}
      </button>
    </main>
  )
}
