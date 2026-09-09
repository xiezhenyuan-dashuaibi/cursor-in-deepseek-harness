/** Pet-grooming booking page for overlay-card-2.body. */

import { useEffect, useId, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetshopHomeInjected } from './face.ts'
import type { OverlayPetshopKey } from './locales.ts'
import {
  PETSHOP_HOME_PACKAGE_IDS, PETSHOP_HOME_SLOT_IDS, type PetshopHomeAck,
  type PetshopHomePackageId, type PetshopHomeSlotId,
} from './booking.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-card-2.body slot. */
export type PageProps =
  PropsRuntime<'overlay-card-2.body'>
  & PropsLocale<'overlay-petshop'>
  & InjectFace<PetshopHomeInjected>

/** Opening frame requested on mount. Origin is omitted so a later drag is kept. */
export const PREFERRED_FRAME = { width: 900, height: 560 } as const

type FormError = 'required' | 'phone' | 'rpc' | null

const ERROR_KEY: Record<Exclude<FormError, null>, OverlayPetshopKey> = {
  required: 'form.error.required',
  phone: 'form.error.phone',
  rpc: 'form.error.rpc',
}

const PHONE_RE = /^1[3-9]\d{9}$/

const PKG_NAME: Record<PetshopHomePackageId, OverlayPetshopKey> = {
  bath: 'pkg.bath.name',
  cut: 'pkg.cut.name',
  full: 'pkg.full.name',
}

const PKG_BLURB: Record<PetshopHomePackageId, OverlayPetshopKey> = {
  bath: 'pkg.bath.blurb',
  cut: 'pkg.cut.blurb',
  full: 'pkg.full.blurb',
}

const PKG_PRICE: Record<PetshopHomePackageId, OverlayPetshopKey> = {
  bath: 'pkg.bath.price',
  cut: 'pkg.cut.price',
  full: 'pkg.full.price',
}

/**
 * Designed grooming homepage. Local form state resets on remount.
 * @param props - preferFrame, locale share, and book callback.
 * @returns the page filling the card body.
 */
export function Page({ t, preferFrame, book }: PageProps) {
  const formId = useId()
  const [packageId, setPackageId] = useState<PetshopHomePackageId | null>(null)
  const [slot, setSlot] = useState<PetshopHomeSlotId | null>(null)
  const [dogName, setDogName] = useState('')
  const [breed, setBreed] = useState('')
  const [owner, setOwner] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<FormError>(null)
  const [sending, setSending] = useState(false)
  const [booked, setBooked] = useState<(
    PetshopHomeAck & {
      dogName: string
      packageId: PetshopHomePackageId
      slot: PetshopHomeSlotId
    }
  ) | null>(null)

  useEffect(() => {
    preferFrame(PREFERRED_FRAME)
  }, [preferFrame])

  const submit = async (): Promise<void> => {
    if (
      packageId === null
      || slot === null
      || dogName.trim().length === 0
      || breed.trim().length === 0
      || owner.trim().length === 0
      || phone.trim().length === 0
    ) {
      setError('required')
      return
    }
    if (!PHONE_RE.test(phone.trim())) {
      setError('phone')
      return
    }
    setError(null)
    setSending(true)
    const outcome = await book({
      dogName: dogName.trim(),
      breed: breed.trim(),
      owner: owner.trim(),
      phone: phone.trim(),
      packageId,
      slot,
    })
    setSending(false)
    if (!outcome.ok) {
      setError('rpc')
      return
    }
    setBooked({
      ...outcome.ack,
      dogName: dogName.trim(),
      packageId,
      slot,
    })
  }

  return (
    <main
      className={css.page}
      aria-label={t('brand')}
      data-overlay-page=""
      data-package={packageId ?? ''}
      data-slot={slot ?? ''}
      data-booked={booked === null ? 'false' : 'true'}
    >
      <header className={css.nav}>
        <p className={css.brand}>{t('brand')}</p>
        <nav className={css.navLinks}>
          <a href="#packages">{t('nav.packages')}</a>
          <a href="#book">{t('nav.book')}</a>
        </nav>
      </header>
      <section className={css.hero}>
        <p className={css.kicker}>{t('kicker')}</p>
        <h1 className={css.title}>{t('headline')}</h1>
        <p className={css.blurb}>{t('blurb')}</p>
      </section>
      <section className={css.packages} id="packages">
        <h2 className={css.sectionTitle}>{t('packages.title')}</h2>
        <div className={css.pkgGrid}>
          {PETSHOP_HOME_PACKAGE_IDS.map(id => (
            <button
              key={id}
              type="button"
              className={css.pkg}
              aria-pressed={packageId === id}
              onClick={() => { setPackageId(id) }}
            >
              <span className={css.pkgName}>{t(PKG_NAME[id])}</span>
              <span className={css.pkgBlurb}>{t(PKG_BLURB[id])}</span>
              <span className={css.pkgPrice}>¥{t(PKG_PRICE[id])}</span>
            </button>
          ))}
        </div>
      </section>
      <section className={css.book} id="book">
        {booked === null
          ? (
            <form
              className={css.form}
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <h2 className={css.sectionTitle}>{t('form.title')}</h2>
              <label className={css.field} htmlFor={`${formId}-dog`}>
                {t('form.dog')}
                <input
                  id={`${formId}-dog`}
                  value={dogName}
                  autoComplete="off"
                  onChange={(event) => { setDogName(event.target.value) }}
                />
              </label>
              <label className={css.field} htmlFor={`${formId}-breed`}>
                {t('form.breed')}
                <input
                  id={`${formId}-breed`}
                  value={breed}
                  autoComplete="off"
                  onChange={(event) => { setBreed(event.target.value) }}
                />
              </label>
              <label className={css.field} htmlFor={`${formId}-owner`}>
                {t('form.owner')}
                <input
                  id={`${formId}-owner`}
                  value={owner}
                  autoComplete="off"
                  onChange={(event) => { setOwner(event.target.value) }}
                />
              </label>
              <label className={css.field} htmlFor={`${formId}-phone`}>
                {t('form.phone')}
                <input
                  id={`${formId}-phone`}
                  value={phone}
                  inputMode="numeric"
                  autoComplete="tel"
                  onChange={(event) => { setPhone(event.target.value) }}
                />
              </label>
              <fieldset className={css.slots}>
                <legend>{t('form.slot')}</legend>
                <div className={css.slotRow}>
                  {PETSHOP_HOME_SLOT_IDS.map(id => (
                    <button
                      key={id}
                      type="button"
                      className={css.slot}
                      aria-pressed={slot === id}
                      onClick={() => { setSlot(id) }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </fieldset>
              {error !== null ? <p className={css.error} role="alert">{t(ERROR_KEY[error])}</p> : null}
              <button type="submit" className={css.primary} disabled={sending}>
                {sending ? t('form.sending') : t('form.submit')}
              </button>
            </form>
          )
          : (
            <div className={css.success} role="status">
              <h2 className={css.sectionTitle}>{t('booked.title')}</h2>
              <p className={css.successBody}>
                {t('booked.body', {
                  dog: booked.dogName,
                  pkg: t(PKG_NAME[booked.packageId]),
                  slot: booked.slot,
                  id: booked.id.slice(0, 8),
                })}
              </p>
              <button
                type="button"
                className={css.primary}
                onClick={() => {
                  setBooked(null)
                  setError(null)
                }}
              >
                {t('booked.reset')}
              </button>
            </div>
          )}
      </section>
    </main>
  )
}
