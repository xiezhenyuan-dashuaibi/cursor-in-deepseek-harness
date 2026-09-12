/** Click-through overlay desktop board with a single body occupant. */

import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopBoard.module.css'

/** Full props composed from the shell.overlay registration. */
export type DesktopBoardProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'overlay-desktop.body'>
  & PropsLocale<'overlay-desktop'>

/**
 * Full-viewport board under cards and Cursor. A missing body occupant shows
 * the filled `空桌面` label. The root stays click-through.
 * @param props - overlay runtime, body slot, locale.
 * @returns the click-through board.
 */
export function DesktopBoard({ t, renderSlot }: DesktopBoardProps) {
  return (
    <div className={css.board} data-overlay-board="" data-overlay-desktop="">
      {renderSlot('overlay-desktop.body', {}, {
        fallback: (
          <div className={css.empty} data-overlay-desktop-empty="">
            {t('empty')}
          </div>
        ),
      })}
    </div>
  )
}
