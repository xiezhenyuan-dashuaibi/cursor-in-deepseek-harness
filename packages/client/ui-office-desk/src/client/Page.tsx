/** Office workstation occupying overlay-desktop.body. */

import { useEffect, useId, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayPageKey } from './locales.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-desktop.body slot. */
export type PageProps =
  PropsRuntime<'overlay-desktop.body'>
  & PropsLocale<'overlay-office-desk'>

const TASK_IDS = ['review', 'report', 'inbox'] as const

type TaskId = (typeof TASK_IDS)[number]

const MOOD_IDS = ['day', 'night'] as const

type MoodId = (typeof MOOD_IDS)[number]

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

const TASK_COPY: Record<TaskId, OverlayPageKey> = {
  review: 'task.review',
  report: 'task.report',
  inbox: 'task.inbox',
}

const MOOD_COPY: Record<MoodId, OverlayPageKey> = {
  day: 'mood.day',
  night: 'mood.night',
}

const BUILDING_IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const

/**
 * Desk clock as `HH:mm`.
 * @param now - instant to format.
 * @returns two-digit hours and minutes.
 */
function formatDeskTime(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Weekday dictionary key for a local calendar day.
 * @param now - instant whose weekday is shown.
 * @returns a `weekday.*` key in this namespace.
 */
function weekdayKey(now: Date): OverlayPageKey {
  return `weekday.${WEEKDAYS[now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6]}`
}

/**
 * Office workstation scene under cards and Cursor. Organizer state resets
 * when the occupant remounts. The painted scene stays click-through.
 * @param props - locale share.
 * @returns the page filling the desktop body.
 */
export function Page({ t }: PageProps) {
  const moodName = useId()
  const [now, setNow] = useState(() => new Date())
  const [mood, setMood] = useState<MoodId>('day')
  const [focus, setFocus] = useState(false)
  const [done, setDone] = useState<Record<TaskId, boolean>>({
    review: false,
    report: false,
    inbox: false,
  })

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])

  const allDone = TASK_IDS.every(id => done[id])

  return (
    <main
      className={css.page}
      data-overlay-desktop-page=""
      data-mood={mood}
      data-focus={focus ? 'on' : 'off'}
      aria-label={t('title')}
    >
      <div className={css.scene} aria-hidden="true">
        <div className={css.sky} />
        <div className={css.sun} />
        <div className={css.city}>
          {BUILDING_IDS.map(id => (
            <span key={id} className={`${css.building} ${css[id]}`} />
          ))}
        </div>
        <div className={css.blinds} />
        <div className={css.sash} />
        <div className={css.desk}>
          <span className={css.lamp} />
          <span className={css.plant} />
          <span className={css.mug} />
          <span className={css.stack} />
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
          {formatDeskTime(now)}
        </time>
        <p className={css.date}>
          {t(weekdayKey(now))}
          {' · '}
          {t('date', { month: now.getMonth() + 1, day: now.getDate() })}
        </p>

        <fieldset className={css.group}>
          <legend className={css.legend}>{t('tasks.legend')}</legend>
          {TASK_IDS.map(id => (
            <label key={id} className={css.task}>
              <input
                type="checkbox"
                checked={done[id]}
                onChange={() => {
                  setDone(current => ({ ...current, [id]: !current[id] }))
                }}
              />
              <span>{t(TASK_COPY[id])}</span>
            </label>
          ))}
          {allDone ? <p className={css.clear}>{t('tasks.clear')}</p> : null}
        </fieldset>

        <button
          type="button"
          className={css.primary}
          aria-pressed={focus}
          onClick={() => {
            setFocus(on => !on)
          }}
        >
          {focus ? t('focus.stop') : t('focus.start')}
        </button>
        {focus ? <p className={css.hint}>{t('focus.hint')}</p> : null}

        <fieldset className={css.group}>
          <legend className={css.legend}>{t('mood.legend')}</legend>
          <div className={css.moods} role="presentation">
            {MOOD_IDS.map(id => (
              <label key={id} className={css.mood}>
                <input
                  type="radio"
                  name={moodName}
                  checked={mood === id}
                  onChange={() => {
                    setMood(id)
                  }}
                />
                {t(MOOD_COPY[id])}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
    </main>
  )
}
