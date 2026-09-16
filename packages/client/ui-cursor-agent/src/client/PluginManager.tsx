/** Cursor rail plugin manager: pinned desktop row plus cards, desktops, and fibers. */

import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { OverlayCardManagerItem } from './overlay-card-rpc.ts'
import css from './CursorPanel.module.css'

/** Props shared by the rail toggle and the list anchored above it. */
export type PluginManagerProps = {
  /** Cursor overlay copy. */
  t: PropsLocale<'cursor-agent'>['t']
  /** Whether the floating list is open. */
  open: boolean
  /** Toggle the floating list. */
  onToggle: () => void
  /** Close the list when the pointer leaves the dock or the list. */
  onDismiss: () => void
  /** Merged card, desktop, and standalone-fiber roster. */
  listOverlayCards: () => Promise<readonly OverlayCardManagerItem[]>
  /**
   * Write `hidden` on one card or shaped occupant. Fiber and desktop rows have no hide.
   * @param id - unique card id or Loader id.
   * @param hidden - `true` skips the window or hides the silhouette.
   * @param kind - `card` writes `instances.json`; `shaped` writes host `hidden.json`.
   */
  setOverlayCardHidden: (
    id: string,
    hidden: boolean,
    kind?: OverlayCardManagerItem['kind'],
  ) => Promise<void>
  /**
   * Set Loader `disabled` on that card's occupants, a fiber, or the current desktop.
   * @param id - unique card id or Loader id.
   * @param inserted - `false` unplugs occupant fibers.
   * @param kind - `fiber` / `desktop` writes that Loader row.
   */
  setOverlayCardInserted: (
    id: string,
    inserted: boolean,
    kind?: OverlayCardManagerItem['kind'],
  ) => Promise<void>
  /**
   * Exclusive-enable one overlay-desktop.body occupant.
   * @param id - Loader id of the desktop occupant.
   */
  switchOverlayDesktop: (id: string) => Promise<void>
}

/**
 * Compact plug glyph for the rail entry (not a settings gear).
 * @param props.size - CSS pixel edge length (default 14).
 * @returns an inline SVG matching DSH stroke weight.
 */
function PluginGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.25 2.75 V6.25 H4.75 V9.5 C4.75 11.15 6.1 12.5 7.75 12.5 H8.25 C9.9 12.5 11.25 11.15 11.25 9.5 V6.25 H9.75 V2.75"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.5 V14.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Rail control at the bottom of the session slab.
 * @param props - copy, open state, and toggle.
 * @returns the rail button.
 */
export function PluginRailButton({ t, open, onToggle }: Pick<PluginManagerProps, 't' | 'open' | 'onToggle'>) {
  return (
    <button
      type="button"
      className={css.pluginToggle}
      data-cursor-agent-plugins-toggle=""
      aria-label={t('plugins.open')}
      title={t('plugins.open')}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className={css.sessionGlyph} aria-hidden="true">
        <PluginGlyph />
      </span>
      <span className={css.railReveal}>{t('plugins.open')}</span>
    </button>
  )
}

/**
 * Overlay plugin list anchored above the rail plugin control. The pinned
 * desktop row is always present. The list viewport is 3.5 rows; further
 * rows scroll inside the list.
 * @param props - copy, open flag, dismiss, and roster RPC callbacks.
 * @returns the panel, or `null` when closed.
 */
export function PluginPanel({
  t, open, onDismiss, listOverlayCards, setOverlayCardHidden, setOverlayCardInserted, switchOverlayDesktop,
}: Omit<PluginManagerProps, 'onToggle'>) {
  const [cards, setCards] = useState<readonly OverlayCardManagerItem[]>([])
  const [pendingId, setPendingId] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const pull = async (): Promise<void> => {
      try {
        const next = await listOverlayCards()
        if (!cancelled) setCards(next)
      } catch {
        // Transport miss: keep the last successful list (empty on first open).
      }
    }
    void pull()
    const timer = setInterval(() => { void pull() }, 400)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, listOverlayCards])
  if (!open) return null

  const currentDesktop = cards.find(item => item.kind === 'desktop' && item.inserted)
  const list = cards.filter(item => !(item.kind === 'desktop' && item.inserted))

  const onHide = async (id: string, hidden: boolean): Promise<void> => {
    setPendingId(id)
    try {
      const kind = cards.find(card => card.id === id)?.kind
      await setOverlayCardHidden(id, hidden, kind)
      setError(undefined)
      setCards(current => current.map(card => (card.id === id ? { ...card, hidden } : card)))
      setCards(await listOverlayCards())
    } catch {
      setError(t('plugins.failed'))
    } finally {
      setPendingId(undefined)
    }
  }

  const onInsert = async (id: string, inserted: boolean): Promise<void> => {
    setPendingId(id)
    try {
      const kind = cards.find(card => card.id === id)?.kind
      await setOverlayCardInserted(id, inserted, kind)
      setError(undefined)
      setCards(current => current.map(card => (card.id === id ? { ...card, inserted } : card)))
      setCards(await listOverlayCards())
    } catch {
      setError(t('plugins.failed'))
    } finally {
      setPendingId(undefined)
    }
  }

  const onSwitchDesktop = async (id: string): Promise<void> => {
    setPendingId(id)
    try {
      await switchOverlayDesktop(id)
      setError(undefined)
      setCards(await listOverlayCards())
    } catch {
      setError(t('plugins.failed'))
    } finally {
      setPendingId(undefined)
    }
  }

  return (
    <div
      className={css.pluginPanel}
      data-cursor-agent-plugins-panel=""
      role="dialog"
      aria-label={t('plugins.title')}
      onMouseLeave={onDismiss}
    >
      <div className={css.pluginHeading}>{t('plugins.title')}</div>
      {error !== undefined ? (
        <div className={css.pluginEmpty} data-cursor-agent-plugins-error="">{error}</div>
      ) : null}
      <div className={css.pluginDesktop} data-cursor-agent-plugin-desktop="">
        <div className={css.pluginDesktopLabel}>{t('plugins.desktop')}</div>
        <div className={css.pluginRow} data-cursor-agent-plugin-id={currentDesktop?.id ?? 'overlay-desktop'}>
          <div className={css.pluginIdentity}>
            <span className={css.pluginName}>
              {currentDesktop?.title ?? t('plugins.desktopEmpty')}
            </span>
            <span className={css.pluginId}>{currentDesktop?.id ?? t('plugins.desktopEmpty')}</span>
          </div>
          <div className={css.pluginActions}>
            <button
              type="button"
              className={css.pluginAction}
              disabled={pendingId !== undefined || currentDesktop === undefined}
              data-cursor-agent-plugin-unload=""
              onClick={() => {
                if (currentDesktop === undefined) return
                void onInsert(currentDesktop.id, false)
              }}
            >
              {t('plugins.unload')}
            </button>
          </div>
        </div>
      </div>
      {list.length === 0 ? (
        <div className={css.pluginEmpty}>{t('plugins.empty')}</div>
      ) : (
        <ul className={css.pluginList}>
          {list.map(card => (
            <li
              key={card.id}
              className={css.pluginRow}
              data-cursor-agent-plugin-id={card.id}
              data-cursor-agent-plugin-kind={card.kind ?? 'card'}
            >
              <div className={css.pluginIdentity}>
                <span className={css.pluginName}>{card.title}</span>
                <span className={css.pluginId}>{card.id}</span>
              </div>
              <div className={css.pluginActions}>
                {card.kind === 'desktop' ? (
                  <button
                    type="button"
                    className={css.pluginAction}
                    disabled={pendingId === card.id}
                    data-cursor-agent-plugin-switch=""
                    onClick={() => { void onSwitchDesktop(card.id) }}
                  >
                    {t('plugins.switchDesktop')}
                  </button>
                ) : (
                  <>
                    {card.kind !== 'fiber' ? (
                      <button
                        type="button"
                        className={css.pluginAction}
                        disabled={pendingId === card.id}
                        data-cursor-agent-plugin-hide={card.hidden ? undefined : ''}
                        data-cursor-agent-plugin-show={card.hidden ? '' : undefined}
                        onClick={() => { void onHide(card.id, !card.hidden) }}
                      >
                        {card.hidden ? t('plugins.show') : t('plugins.hide')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={css.pluginAction}
                      disabled={pendingId === card.id || card.occupants.length === 0}
                      data-cursor-agent-plugin-plug={card.inserted ? undefined : ''}
                      data-cursor-agent-plugin-unplug={card.inserted ? '' : undefined}
                      onClick={() => { void onInsert(card.id, !card.inserted) }}
                    >
                      {card.inserted ? t('plugins.unplug') : t('plugins.plug')}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Plugin control plus the overlay plugin list. The list sits in the expanded
 * rail, directly above the control. Leaving the list or the dock closes it.
 * @param props - copy, open state, and roster RPC callbacks.
 * @returns the rail dock.
 */
export function PluginDock({
  t, open, onToggle, onDismiss, listOverlayCards, setOverlayCardHidden, setOverlayCardInserted,
  switchOverlayDesktop,
}: PluginManagerProps) {
  return (
    <div
      className={css.pluginDock}
      data-cursor-agent-plugins=""
      onMouseLeave={onDismiss}
    >
      <PluginPanel
        t={t}
        open={open}
        onDismiss={onDismiss}
        listOverlayCards={listOverlayCards}
        setOverlayCardHidden={setOverlayCardHidden}
        setOverlayCardInserted={setOverlayCardInserted}
        switchOverlayDesktop={switchOverlayDesktop}
      />
      <PluginRailButton t={t} open={open} onToggle={onToggle} />
    </div>
  )
}
