/** Windowsill celadon pot occupying overlay-shaped.body. */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './FlowerPot.module.css'
import {
  fertilize, loadPlant, savePlant, stageOf, tick, water, WILT_MOISTURE, THIRSTY_MOISTURE,
  type PlantSnapshot, type PlantStage,
} from './plant.ts'
import type { FlowerPotKey } from './locales.ts'

/** Full props composed from the overlay-shaped.body slot. */
export type FlowerPotProps =
  PropsRuntime<'overlay-shaped.body'>
  & PropsLocale<'overlay-flower-pot'>

const STAGE_COPY: Record<PlantStage, FlowerPotKey> = {
  soil: 'soil',
  sprout: 'sprout',
  seedling: 'seedling',
  bud: 'bud',
  bloom: 'bloom',
}

/**
 * Celadon pot, bamboo stake, and a morning-glory vine that grows while the
 * soil stays wet. Geometry is CSS placement; drag is unauthored.
 * @param props - locale share.
 * @returns the pot silhouette.
 */
export function FlowerPot({ t }: FlowerPotProps) {
  const [plant, setPlant] = useState<PlantSnapshot>(() => loadPlant(window.localStorage, Date.now()))
  const [gesture, setGesture] = useState<'idle' | 'watering' | 'feeding'>('idle')

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlant((prev) => {
        const next = tick(prev, Date.now())
        savePlant(window.localStorage, next)
        return next
      })
    }, 250)
    return () => { window.clearInterval(id) }
  }, [])

  useEffect(() => {
    if (gesture === 'idle') return undefined
    const id = window.setTimeout(() => { setGesture('idle') }, 700)
    return () => { window.clearTimeout(id) }
  }, [gesture])

  const stage = stageOf(plant.growth)
  const wilted = plant.moisture < WILT_MOISTURE
  const care: FlowerPotKey = wilted
    ? 'wilted'
    : plant.moisture < THIRSTY_MOISTURE
      ? 'thirsty'
      : 'growing'
  const artClass = [
    css.art,
    wilted ? css.wilt : undefined,
    gesture === 'watering' ? css.watering : undefined,
    gesture === 'feeding' ? css.feeding : undefined,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')

  return (
    <div className={css.anchor} data-overlay-flower-pot="">
      <div className={css.silhouette}>
        <svg
          className={artClass}
          viewBox="0 0 220 320"
          role="img"
          aria-label={`${t('label')}，${t(STAGE_COPY[stage])}，${t(care)}`}
        >
          <line className={css.stake} x1="110" y1="28" x2="118" y2="198" />
          {stage !== 'soil' ? (
            <path
              className={css.vine}
              d="M112 198 C 108 160, 128 140, 116 112 C 104 84, 132 70, 120 42"
              fill="none"
              strokeWidth="3"
            />
          ) : null}
          {stage === 'sprout' || stage === 'seedling' || stage === 'bud' || stage === 'bloom' ? (
            <ellipse className={css.leaf} cx="96" cy="168" rx="14" ry="7" transform="rotate(-28 96 168)" />
          ) : null}
          {stage === 'seedling' || stage === 'bud' || stage === 'bloom' ? (
            <>
              <ellipse className={css.leaf} cx="138" cy="132" rx="16" ry="8" transform="rotate(24 138 132)" />
              <ellipse className={css.leaf} cx="92" cy="108" rx="13" ry="6" transform="rotate(-18 92 108)" />
            </>
          ) : null}
          {stage === 'bud' || stage === 'bloom' ? (
            <ellipse className={css.bloom} cx="122" cy="44" rx="7" ry="10" />
          ) : null}
          {stage === 'bloom' ? (
            <g>
              <ellipse className={css.bloom} cx="118" cy="36" rx="16" ry="10" transform="rotate(-20 118 36)" />
              <ellipse className={css.bloom} cx="132" cy="38" rx="14" ry="9" transform="rotate(28 132 38)" />
              <ellipse className={css.bloom} cx="124" cy="48" rx="12" ry="8" />
              <circle className={css.bloomThroat} cx="124" cy="40" r="4" />
            </g>
          ) : null}
          <ellipse className={css.saucer} cx="110" cy="292" rx="58" ry="10" />
          <path className={css.pot} d="M62 198 L158 198 L148 278 L72 278 Z" />
          <ellipse className={css.potLip} cx="110" cy="198" rx="52" ry="14" />
          <ellipse
            className={css.soil}
            data-wet={plant.moisture >= THIRSTY_MOISTURE ? 'true' : 'false'}
            cx="110"
            cy="200"
            rx="44"
            ry="10"
          />
          <ellipse className={css.potShadow} cx="110" cy="248" rx="28" ry="8" />
          <circle className={css.drip} cx="96" cy="176" r="4" />
          <circle className={css.drip} cx="118" cy="170" r="3" />
          <circle className={css.crumb} cx="100" cy="196" r="3" />
          <circle className={css.crumb} cx="122" cy="198" r="2.5" />
        </svg>
        <div className={css.actions}>
          <button
            className={css.action}
            type="button"
            onClick={() => {
              setGesture('watering')
              setPlant((prev) => {
                const next = water(prev, Date.now())
                savePlant(window.localStorage, next)
                return next
              })
            }}
          >
            {t('water')}
          </button>
          <button
            className={css.action}
            type="button"
            onClick={() => {
              setGesture('feeding')
              setPlant((prev) => {
                const next = fertilize(prev, Date.now())
                savePlant(window.localStorage, next)
                return next
              })
            }}
          >
            {t('fertilize')}
          </button>
        </div>
        <p className={css.status}>{`${t(STAGE_COPY[stage])} · ${t(care)}`}</p>
      </div>
    </div>
  )
}
