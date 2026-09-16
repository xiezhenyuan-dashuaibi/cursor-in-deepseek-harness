/** CRT television floater for `shell.overlay` id `television`. */

import { useState, type FormEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseChannelUrl } from './channel.ts'
import css from './Television.module.css'

/** Full props composed from the shell.overlay slot. */
export type TelevisionProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'overlay-television'>

/** First webpage loaded in the CRT. Sites that send `X-Frame-Options` stay blank. */
export const OPENING_SRC = 'https://example.com/'

/**
 * Walnut CRT set with rabbit-ear antennas and a channel plate.
 * Channel text stays local; a remount restores {@link OPENING_SRC}.
 * @param props - locale share from the overlay registration.
 * @returns the floating television.
 */
export function Television({ t }: TelevisionProps) {
  const [src, setSrc] = useState(OPENING_SRC)
  const [draft, setDraft] = useState(OPENING_SRC)
  const [invalid, setInvalid] = useState(false)

  const onTune = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const next = parseChannelUrl(draft)
    if (next === undefined) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(next)
    setSrc(next)
  }

  return (
    <div className={css.set} data-overlay-television="" role="region" aria-label={t('set.label')}>
      <div className={css.ears} aria-hidden="true">
        <span className={css.earLeft} />
        <span className={css.earRight} />
      </div>
      <div className={css.cabinet}>
        <p className={css.brand}>{t('brand')}</p>
        <div className={css.bezel}>
          <iframe
            className={css.screen}
            title={t('screen')}
            src={src}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className={css.console}>
          <span className={css.knob} aria-hidden="true" />
          <form className={css.channel} onSubmit={onTune}>
            <label className={css.channelLabel} htmlFor="overlay-television-channel">
              {t('channel.label')}
            </label>
            <input
              id="overlay-television-channel"
              className={css.channelInput}
              type="text"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={invalid}
              aria-describedby={invalid ? 'overlay-television-channel-error' : undefined}
              onChange={(event) => {
                setInvalid(false)
                setDraft(event.target.value)
              }}
            />
            <button type="submit" className={css.tune}>{t('channel.go')}</button>
            {invalid
              ? (
                <p id="overlay-television-channel-error" className={css.channelError} role="alert">
                  {t('channel.invalid')}
                </p>
              )
              : null}
          </form>
          <span className={css.knob} aria-hidden="true" />
          <span className={css.speaker} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
