/** Neighborhood barbershop landing page for `overlay-card.body`. */

import { useEffect, useId, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayBarberKey } from './locales.ts'
import css from './Page.module.css'

/** Full props composed from the overlay-card.body slot. */
export type PageProps =
  PropsRuntime<'overlay-card.body'>
  & PropsLocale<'overlay-barber'>

/** Opening frame requested on mount. Origin is omitted so a later drag is kept. */
export const PREFERRED_FRAME = { width: 1080, height: 820 } as const

/** Menu ids on this page. */
export const SERVICE_IDS = ['cut', 'style', 'shave', 'scalp'] as const

/** Barber ids on this page. */
export const BARBER_IDS = ['zhou', 'kai', 'lin'] as const

/** Same-day seating times offered on the form. */
export const SLOT_IDS = ['10:00', '11:30', '14:00', '16:00', '19:00'] as const

/** FAQ row ids. */
export const FAQ_IDS = ['book', 'price', 'park'] as const

/** Shop-light moods. */
export const MOOD_IDS = ['day', 'night'] as const

/** One menu item. */
export type ServiceId = (typeof SERVICE_IDS)[number]

/** One barber. */
export type BarberId = (typeof BARBER_IDS)[number]

/** One seating time. */
export type SlotId = (typeof SLOT_IDS)[number]

/** One FAQ row. */
export type FaqId = (typeof FAQ_IDS)[number]

/** Day or night shop lights. */
export type MoodId = (typeof MOOD_IDS)[number]

/** In-page sections the nav can scroll to. */
const SECTION_IDS = ['services', 'barbers', 'book', 'visit'] as const

type SectionId = (typeof SECTION_IDS)[number]

type ServiceField = 'name' | 'blurb' | 'price' | 'mins'
type BarberField = 'name' | 'role' | 'blurb'
type FaqField = 'q' | 'a'
type FormError = 'required' | 'phone' | null

const PHONE_RE = /^1[3-9]\d{9}$/

/**
 * Dictionary key for one menu field.
 * @param id - menu item.
 * @param field - copy field on that item.
 * @returns a key in the overlay-barber namespace.
 */
function serviceKey(id: ServiceId, field: ServiceField): OverlayBarberKey {
  return `service.${id}.${field}`
}

/**
 * Dictionary key for one barber field.
 * @param id - barber.
 * @param field - copy field on that barber.
 * @returns a key in the overlay-barber namespace.
 */
function barberKey(id: BarberId, field: BarberField): OverlayBarberKey {
  return `barber.${id}.${field}`
}

/**
 * Dictionary key for one FAQ field.
 * @param id - FAQ row.
 * @param field - question or answer.
 * @returns a key in the overlay-barber namespace.
 */
function faqKey(id: FaqId, field: FaqField): OverlayBarberKey {
  return `faq.${id}.${field}`
}

/**
 * Dictionary key for one in-page nav target.
 * @param id - section the control scrolls to.
 * @returns a key in the overlay-barber namespace.
 */
function navKey(id: SectionId): OverlayBarberKey {
  return `nav.${id}`
}

/**
 * Dictionary key for one shop-light mood.
 * @param id - day or night.
 * @returns a key in the overlay-barber namespace.
 */
function moodKey(id: MoodId): OverlayBarberKey {
  return `mood.${id}`
}

/**
 * Scroll an in-page section into view inside the overflowing card body.
 * @param id - section element id.
 */
function scrollToSection(id: SectionId): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Neighborhood barbershop homepage. Menu, barber, seating, form fields, FAQ,
 * confirmation, and shop lights are component-local React state and reset when
 * the occupant remounts.
 * @param props - preferFrame owner callback and locale share.
 * @returns the landing page filling the card body.
 */
export function Page({ t, preferFrame }: PageProps) {
  const [mood, setMood] = useState<MoodId>('day')
  const [service, setService] = useState<ServiceId | null>(null)
  const [barber, setBarber] = useState<BarberId | null>(null)
  const [slot, setSlot] = useState<SlotId | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<FormError>(null)
  const [booked, setBooked] = useState(false)
  const [faq, setFaq] = useState<FaqId | null>('book')
  const nameId = useId()
  const phoneId = useId()
  const errorId = useId()

  useEffect(() => {
    preferFrame(PREFERRED_FRAME)
  }, [preferFrame])

  /**
   * Validate and lock the seating hold.
   */
  function submit(): void {
    if (name.trim() === '' || service === null || barber === null || slot === null) {
      setError('required')
      return
    }
    if (!PHONE_RE.test(phone.trim())) {
      setError('phone')
      return
    }
    setError(null)
    setBooked(true)
  }

  /**
   * Clear the hold and the form so another booking can start.
   */
  function resetBooking(): void {
    setBooked(false)
    setName('')
    setPhone('')
    setService(null)
    setBarber(null)
    setSlot(null)
    setError(null)
  }

  return (
    <main
      className={css.page}
      data-barber-page=""
      data-mood={mood}
      data-service={service ?? ''}
      data-barber={barber ?? ''}
      data-slot={slot ?? ''}
      data-booked={booked ? 'true' : 'false'}
      aria-label={t('brand')}
    >
      <header className={css.nav}>
        <p className={css.brand}>{t('brand')}</p>
        <nav className={css.navLinks} aria-label={t('nav.label')}>
          {SECTION_IDS.map(id => (
            <button
              key={id}
              type="button"
              className={css.navLink}
              onClick={() => { scrollToSection(id) }}
            >
              {t(navKey(id))}
            </button>
          ))}
        </nav>
        <div className={css.navTrail}>
          <div className={css.mood} role="group" aria-label={t('mood.label')}>
            {MOOD_IDS.map(id => (
              <button
                key={id}
                type="button"
                className={id === mood ? `${css.moodBtn} ${css.moodBtnOn}` : css.moodBtn}
                aria-pressed={id === mood}
                onClick={() => { setMood(id) }}
              >
                {t(moodKey(id))}
              </button>
            ))}
          </div>
          <button type="button" className={css.navCta} onClick={() => { scrollToSection('book') }}>
            {t('cta.book')}
          </button>
        </div>
      </header>

      <section className={css.hero} aria-labelledby="barber-headline">
        <div className={css.heroCopy}>
          <p className={css.kicker}>{t('kicker')}</p>
          <h1 id="barber-headline" className={css.headline}>{t('headline')}</h1>
          <p className={css.lead}>{t('lead')}</p>
          <div className={css.heroActions}>
            <button type="button" className={css.primary} onClick={() => { scrollToSection('book') }}>
              {t('cta.book')}
            </button>
            <button type="button" className={css.secondary} onClick={() => { scrollToSection('visit') }}>
              {t('cta.visit')}
            </button>
          </div>
          <p className={css.hoursChip}>{t('hours.chip')}</p>
        </div>
        <div className={css.stage} aria-hidden="true">
          <span className={css.pole} />
          <ShopMark />
        </div>
      </section>

      <section id="services" className={css.section} aria-labelledby="barber-services">
        <div className={css.sectionHead}>
          <h2 id="barber-services" className={css.sectionTitle}>{t('services.title')}</h2>
          <p className={css.sectionLede}>{t('services.lede')}</p>
        </div>
        <div className={css.serviceGrid}>
          {SERVICE_IDS.map(id => (
            <button
              key={id}
              type="button"
              className={id === service ? `${css.service} ${css.serviceOn}` : css.service}
              data-service={id}
              aria-pressed={id === service}
              onClick={() => { setService(id) }}
            >
              <span className={css.serviceTop}>
                <span className={css.serviceName}>{t(serviceKey(id, 'name'))}</span>
                <span className={css.servicePrice}>{t(serviceKey(id, 'price'))}</span>
              </span>
              <span className={css.serviceBlurb}>{t(serviceKey(id, 'blurb'))}</span>
              <span className={css.serviceMins}>{t(serviceKey(id, 'mins'))}</span>
            </button>
          ))}
        </div>
      </section>

      <section id="barbers" className={css.section} aria-labelledby="barber-people">
        <div className={css.sectionHead}>
          <h2 id="barber-people" className={css.sectionTitle}>{t('barbers.title')}</h2>
          <p className={css.sectionLede}>{t('barbers.lede')}</p>
        </div>
        <div className={css.barberGrid}>
          {BARBER_IDS.map(id => (
            <button
              key={id}
              type="button"
              className={id === barber ? `${css.person} ${css.personOn}` : css.person}
              data-barber={id}
              aria-pressed={id === barber}
              onClick={() => { setBarber(id) }}
            >
              <span className={css.avatar} data-barber={id} aria-hidden="true" />
              <span className={css.personName}>{t(barberKey(id, 'name'))}</span>
              <span className={css.personRole}>{t(barberKey(id, 'role'))}</span>
              <span className={css.personBlurb}>{t(barberKey(id, 'blurb'))}</span>
            </button>
          ))}
        </div>
      </section>

      <section id="book" className={css.book} aria-labelledby="barber-book">
        <div className={css.sectionHead}>
          <h2 id="barber-book" className={css.sectionTitle}>{t('book.title')}</h2>
          <p className={css.sectionLede}>{t('book.lede')}</p>
        </div>
        {booked && service !== null && barber !== null && slot !== null ? (
          <div className={css.receipt} role="status">
            <p className={css.receiptKicker}>{t('booked.title')}</p>
            <p className={css.receiptName}>{name.trim()}</p>
            <p className={css.receiptMeta}>{phone.trim()}</p>
            <p className={css.receiptMeta}>
              {t(serviceKey(service, 'name'))}
              {' · '}
              {t(barberKey(barber, 'name'))}
            </p>
            <p className={css.receiptSlot}>{slot}</p>
            <p className={css.receiptLead}>{t('booked.lead')}</p>
            <button type="button" className={css.secondary} onClick={resetBooking}>
              {t('booked.reset')}
            </button>
          </div>
        ) : (
          <form
            className={css.form}
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <label className={css.field} htmlFor={nameId}>
              <span>{t('form.name')}</span>
              <input
                id={nameId}
                className={css.input}
                name="name"
                autoComplete="name"
                value={name}
                aria-invalid={error === 'required' && name.trim() === ''}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => { setName(event.target.value) }}
              />
            </label>
            <label className={css.field} htmlFor={phoneId}>
              <span>{t('form.phone')}</span>
              <input
                id={phoneId}
                className={css.input}
                name="phone"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                aria-invalid={error === 'phone' || (error === 'required' && phone.trim() === '')}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => { setPhone(event.target.value) }}
              />
            </label>
            <fieldset className={css.fieldset}>
              <legend>{t('form.service')}</legend>
              <div className={css.chips}>
                {SERVICE_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={id === service ? `${css.chip} ${css.chipOn}` : css.chip}
                    aria-pressed={id === service}
                    onClick={() => { setService(id) }}
                  >
                    {t(serviceKey(id, 'name'))}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={css.fieldset}>
              <legend>{t('form.barber')}</legend>
              <div className={css.chips}>
                {BARBER_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={id === barber ? `${css.chip} ${css.chipOn}` : css.chip}
                    aria-pressed={id === barber}
                    onClick={() => { setBarber(id) }}
                  >
                    {t(barberKey(id, 'name'))}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={css.fieldset}>
              <legend>{t('form.slot')}</legend>
              <div className={css.chips}>
                {SLOT_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={id === slot ? `${css.chip} ${css.chipOn}` : css.chip}
                    aria-pressed={id === slot}
                    onClick={() => { setSlot(id) }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </fieldset>
            {error ? (
              <p id={errorId} className={css.formError} role="alert">
                {error === 'phone' ? t('form.error.phone') : t('form.error.required')}
              </p>
            ) : null}
            <button type="submit" className={css.primary}>
              {t('form.submit')}
            </button>
          </form>
        )}
      </section>

      <section id="visit" className={css.section} aria-labelledby="barber-visit">
        <div className={css.sectionHead}>
          <h2 id="barber-visit" className={css.sectionTitle}>{t('visit.title')}</h2>
          <p className={css.sectionLede}>{t('visit.lede')}</p>
        </div>
        <div className={css.visitGrid}>
          <dl className={css.facts}>
            <div>
              <dt>{t('hours.title')}</dt>
              <dd>{t('hours.week')}</dd>
              <dd>{t('hours.monday')}</dd>
              <dd>{t('hours.last')}</dd>
            </div>
            <div>
              <dt>{t('address.title')}</dt>
              <dd>{t('address.line')}</dd>
              <dd>{t('address.metro')}</dd>
            </div>
            <div>
              <dt>{t('phone.title')}</dt>
              <dd>{t('phone.number')}</dd>
            </div>
          </dl>
          <div className={css.gallery}>
            <figure className={css.shot} data-shot="chair">
              <figcaption>{t('gallery.chair')}</figcaption>
            </figure>
            <figure className={css.shot} data-shot="mirror">
              <figcaption>{t('gallery.mirror')}</figcaption>
            </figure>
            <figure className={css.shot} data-shot="pole">
              <figcaption>{t('gallery.pole')}</figcaption>
            </figure>
          </div>
        </div>
        <div className={css.quotes}>
          <blockquote className={css.quote}>
            <p>{t('quote.1.body')}</p>
            <footer>{t('quote.1.name')}</footer>
          </blockquote>
          <blockquote className={css.quote}>
            <p>{t('quote.2.body')}</p>
            <footer>{t('quote.2.name')}</footer>
          </blockquote>
        </div>
        <div className={css.faq} aria-labelledby="barber-faq">
          <h3 id="barber-faq" className={css.faqTitle}>{t('faq.title')}</h3>
          {FAQ_IDS.map((id) => {
            const open = faq === id
            return (
              <div key={id} className={css.faqItem}>
                <button
                  type="button"
                  className={css.faqQ}
                  aria-expanded={open}
                  onClick={() => { setFaq(open ? null : id) }}
                >
                  {t(faqKey(id, 'q'))}
                </button>
                {open ? <p className={css.faqA}>{t(faqKey(id, 'a'))}</p> : null}
              </div>
            )
          })}
        </div>
      </section>

      <p className={css.footer}>{t('footer.note')}</p>
    </main>
  )
}

/**
 * Chair and pole drawing for the hero stage.
 * @returns an aria-hidden SVG.
 */
function ShopMark() {
  const rawId = useId().replaceAll(':', '')
  return (
    <svg className={css.mark} viewBox="0 0 220 260" role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id={`${rawId}-wood`} x1="40" y1="20" x2="180" y2="240" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--barber-walnut-soft)" />
          <stop offset="55%" stopColor="var(--barber-walnut)" />
          <stop offset="100%" stopColor="var(--barber-ink)" />
        </linearGradient>
        <linearGradient id={`${rawId}-brass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--barber-brass-silk)" />
          <stop offset="100%" stopColor="var(--barber-brass)" />
        </linearGradient>
        <radialGradient id={`${rawId}-sheen`} cx="34%" cy="28%" r="46%">
          <stop offset="0%" stopColor="var(--barber-paper)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--barber-paper)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="18" y="24" width="18" height="212" rx="9" fill={`url(#${rawId}-wood)`} />
      <rect x="21" y="36" width="12" height="188" rx="6" fill="none" stroke={`url(#${rawId}-brass)`} strokeWidth="2" />
      <path
        fill={`url(#${rawId}-wood)`}
        d="M64 78c28-18 78-18 106 0 8 22 10 48 4 78-8 38-28 62-57 62s-49-24-57-62c-6-30-4-56 4-78z"
      />
      <ellipse fill={`url(#${rawId}-sheen)`} cx="108" cy="118" rx="28" ry="36" />
      <path fill="none" stroke={`url(#${rawId}-brass)`} strokeWidth="3" d="M70 86c24-10 66-10 90 0" />
      <rect x="92" y="214" width="44" height="10" rx="3" fill={`url(#${rawId}-brass)`} />
      <rect x="84" y="224" width="60" height="14" rx="4" fill={`url(#${rawId}-wood)`} />
    </svg>
  )
}
