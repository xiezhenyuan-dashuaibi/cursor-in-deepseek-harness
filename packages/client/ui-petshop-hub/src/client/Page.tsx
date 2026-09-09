/** Signal-detection panel for overlay-card-3.body. */

import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetshopHubInjected } from './face.ts'
import type { OverlayPetshopHubKey } from './locales.ts'
import type { PetshopHubStage } from '../wire.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-card-3.body slot. */
export type PageProps =
  PropsRuntime<'overlay-card-3.body'>
  & PropsLocale<'overlay-petshop-hub'>
  & InjectFace<PetshopHubInjected>

/** Opening frame requested on mount. Origin is omitted so a later drag is kept. */
export const PREFERRED_FRAME = { width: 600, height: 620 } as const

const PIPELINE = ['home-in', 'store-out', 'store-ok', 'home-ack'] as const

type PipelineStage = (typeof PIPELINE)[number]

const NODE_KEY: Record<PipelineStage, OverlayPetshopHubKey> = {
  'home-in': 'node.home-in',
  'store-out': 'node.store-out',
  'store-ok': 'node.store-ok',
  'home-ack': 'node.home-ack',
}

const STAGE_KEY: Record<PetshopHubStage, OverlayPetshopHubKey> = {
  'home-in': 'stage.home-in',
  'store-out': 'stage.store-out',
  'store-ok': 'stage.store-ok',
  'home-ack': 'stage.home-ack',
  'failed': 'stage.failed',
}

/**
 * Whether this pipeline node should light given the latest stage.
 * @param stage - node.
 * @param lastStage - latest recorded stage.
 * @returns true when this hop has already been seen on the happy path.
 */
export function pipelineLit(stage: PipelineStage, lastStage: PetshopHubStage | null): boolean {
  if (lastStage === null || lastStage === 'failed') return false
  return PIPELINE.indexOf(stage) <= PIPELINE.indexOf(lastStage)
}

/**
 * Designed signal console. Snapshot comes from the injected `useSignals` poll.
 * @param props - preferFrame, locale share, and signals selector.
 * @returns the page filling the card body.
 */
export function Page({ t, preferFrame, useSignals }: PageProps) {
  const lastStage = useSignals(state => state.lastStage)
  const lastError = useSignals(state => state.lastError)
  const signals = useSignals(state => state.signals)

  useEffect(() => {
    preferFrame(PREFERRED_FRAME)
  }, [preferFrame])

  const failed = lastStage === 'failed'
  const status = failed ? t('failed') : lastStage === null ? t('idle') : t('listening')

  return (
    <main
      className={css.page}
      aria-label={t('brand')}
      data-overlay-page=""
      data-stage={lastStage ?? 'idle'}
      data-failed={failed ? 'true' : 'false'}
    >
      <header className={css.hero}>
        <p className={css.kicker}>{t('kicker')}</p>
        <h1 className={css.title}>{t('headline')}</h1>
        <p className={css.blurb}>{t('blurb')}</p>
        <p className={css.status} role="status">{status}</p>
        {failed && lastError !== null ? <p className={css.error}>{lastError}</p> : null}
      </header>
      <ol className={css.pipeline}>
        {PIPELINE.map(stage => (
          <li
            key={stage}
            className={css.node}
            data-stage={stage}
            data-lit={pipelineLit(stage, lastStage) ? 'true' : 'false'}
          >
            {t(NODE_KEY[stage])}
          </li>
        ))}
      </ol>
      <section className={css.log} aria-label={t('log')}>
        <h2 className={css.logTitle}>{t('log')}</h2>
        <ol className={css.entries}>
          {signals.map(signal => (
            <li key={signal.id} className={css.entry} data-signal-stage={signal.stage}>
              <span className={css.entryStage}>{t(STAGE_KEY[signal.stage])}</span>
              <span className={css.entryDetail}>{signal.detail}</span>
              <time className={css.entryAt} dateTime={signal.at}>
                {signal.at.replace('T', ' ').slice(11, 19)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
