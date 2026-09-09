/** Live sqlite ledger for overlay-card-4.body. */

import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetshopStoreInjected } from './face.ts'
import type { OverlayPetshopStoreKey } from './locales.ts'
import type { PetshopPackageId } from '../wire.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-card-4.body slot. */
export type PageProps =
  PropsRuntime<'overlay-card-4.body'>
  & PropsLocale<'overlay-petshop-store'>
  & InjectFace<PetshopStoreInjected>

/** Opening frame requested on mount. Origin is omitted so a later drag is kept. */
export const PREFERRED_FRAME = { width: 900, height: 620 } as const

const PKG_KEY: Record<PetshopPackageId, OverlayPetshopStoreKey> = {
  bath: 'pkg.bath',
  cut: 'pkg.cut',
  full: 'pkg.full',
}

/**
 * Designed ledger page. Rows come from the injected `useLedger` poll.
 * @param props - preferFrame, locale share, and ledger selector.
 * @returns the page filling the card body.
 */
export function Page({ t, preferFrame, useLedger }: PageProps) {
  const rows = useLedger(state => state.rows)

  useEffect(() => {
    preferFrame(PREFERRED_FRAME)
  }, [preferFrame])

  return (
    <main
      className={css.page}
      aria-label={t('brand')}
      data-overlay-page=""
      data-count={String(rows.length)}
    >
      <header className={css.hero}>
        <p className={css.kicker}>{t('kicker')}</p>
        <h1 className={css.title}>{t('headline')}</h1>
        <p className={css.blurb}>{t('blurb')}</p>
        <p className={css.count}>{t('count', { n: String(rows.length) })}</p>
      </header>
      {rows.length === 0
        ? <p className={css.empty} role="status">{t('empty')}</p>
        : (
          <div className={css.scroller}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>{t('col.id')}</th>
                  <th>{t('col.dog')}</th>
                  <th>{t('col.breed')}</th>
                  <th>{t('col.pkg')}</th>
                  <th>{t('col.slot')}</th>
                  <th>{t('col.owner')}</th>
                  <th>{t('col.phone')}</th>
                  <th>{t('col.at')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} data-row={row.id}>
                    <td className={css.mono}>{row.id.slice(0, 8)}</td>
                    <td>{row.dogName}</td>
                    <td>{row.breed}</td>
                    <td>{t(PKG_KEY[row.packageId])}</td>
                    <td>{row.slot}</td>
                    <td>{row.owner}</td>
                    <td className={css.mono}>{row.phone}</td>
                    <td className={css.mono}>{row.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </main>
  )
}
