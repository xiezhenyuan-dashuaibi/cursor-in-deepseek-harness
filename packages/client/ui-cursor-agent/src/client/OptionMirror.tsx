/** Frosted-glass mirror of the CLI rows drawn below the input bar. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import css from './CursorPanel.module.css'

/** One row from `{op:"mirror"}.below`. */
export type OptionMirrorLine = {
  readonly text: string
  readonly highlighted: boolean
}

/** Props for the below-prompt glass card. */
export type OptionMirrorProps = {
  readonly lines: readonly OptionMirrorLine[]
  /** Same `{op:"keys"}` path as the composer while this card is focused. */
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => boolean
  /** IME / paste commits from the card's own text field (a `div` cannot compose CJK). */
  readonly onCommitText: (text: string) => void
}

/**
 * Paint the CLI below-prompt region as a frosted glass card above the
 * composer. Leading/trailing blank PTY rows are dropped; remaining empty
 * rows keep half line-height. Clicks do not pick a row; focused keystrokes
 * use the same `{op:"keys"}` channel as the composer. Focus lands on an
 * inner text field so CJK IMEs can compose; commits go through `onCommitText`.
 * @param props - mirrored rows from the gateway.
 * @returns the display list, or null when empty.
 */
export function OptionMirror({ lines, onKeyDown, onCommitText }: OptionMirrorProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const imeRef = useRef<HTMLInputElement>(null)
  const [composing, setComposing] = useState(false)
  const display = useMemo(() => trimBlankEdges(lines), [lines])
  const painted = display.findIndex(line => line.highlighted)
  const activeAt = painted >= 0
    ? painted
    : display.findIndex(line => isGlyphCursorRow(line.text))

  useEffect(() => {
    const scroller = listRef.current
    if (scroller === null) return
    const active = scroller.querySelector('[data-active]')
    if (active instanceof HTMLElement) scrollRowIntoScroller(scroller, active)
  }, [activeAt, display])

  if (display.length === 0) return null

  const focusIme = (): void => {
    imeRef.current?.focus()
  }

  const commitIme = (text: string): void => {
    const ime = imeRef.current
    if (ime !== null) ime.value = ''
    if (text.length > 0) onCommitText(text)
  }

  return (
    <div
      ref={listRef}
      className={css.cliBelow}
      data-cursor-agent-selection="cli_option_mirror"
      onMouseDown={(event) => {
        if (event.target === imeRef.current) return
        event.preventDefault()
        focusIme()
      }}
      onKeyDown={onKeyDown}
    >
      {display.map((line, index) => {
        const empty = isBlankMirrorRow(line.text)
        return (
          <div
            key={String(index)}
            className={css.cliBelowRow}
            data-cursor-agent-mirror-line=""
            data-active={index === activeAt || undefined}
            data-empty={empty || undefined}
          >
            {empty ? '\u00a0' : densifyMirrorText(line.text)}
          </div>
        )
      })}
      <input
        ref={imeRef}
        className={css.cliBelowIme}
        data-cursor-agent-mirror-ime=""
        data-composing={composing || undefined}
        aria-label={'选项面输入'}
        type="text"
        spellCheck={false}
        autoComplete="off"
        onCompositionStart={() => { setComposing(true) }}
        onCompositionEnd={(event) => {
          setComposing(false)
          commitIme(event.data)
        }}
        onPaste={(event) => {
          event.preventDefault()
          commitIme(event.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
}

/**
 * True when this below-prompt row is the CLI's selected option.
 * Host reverse-video sets `highlighted`. Slash menus also paint a leading
 * `→` or `▸` without reverse-video. Pager chrome (`↑` / `↓`) is not a
 * selection.
 * @param line - one `{op:"mirror"}.below` row.
 * @returns true when this row is the current option.
 */
export function isMirrorCursorRow(line: OptionMirrorLine): boolean {
  return line.highlighted || isGlyphCursorRow(line.text)
}

/** Drop leading and trailing blank PTY padding rows. */
export function trimBlankEdges(
  lines: readonly OptionMirrorLine[],
): readonly OptionMirrorLine[] {
  let start = 0
  let end = lines.length
  while (start < end) {
    const head = lines[start]
    if (head === undefined || !isBlankMirrorRow(head.text)) break
    start += 1
  }
  while (end > start) {
    const tail = lines[end - 1]
    if (tail === undefined || !isBlankMirrorRow(tail.text)) break
    end -= 1
  }
  return start === 0 && end === lines.length ? lines : lines.slice(start, end)
}

function isBlankMirrorRow(text: string): boolean {
  return text.trim().length === 0
}

/** Leading `→` / `▸` on a slash option; not pager `↑ more above` / `↓ more below`. */
function isGlyphCursorRow(text: string): boolean {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('↓') || trimmed.startsWith('↑')) return false
  return trimmed.startsWith('→') || trimmed.startsWith('▸')
}

/**
 * Scroll `row` inside `scroller` only. `scrollIntoView` would also move
 * ancestor overlay scrollers and hide the composer dock.
 * @param scroller - the glass card (`.cliBelow`).
 * @param row - the selected option row.
 */
function scrollRowIntoScroller(scroller: HTMLElement, row: HTMLElement): void {
  const scrollerBox = scroller.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  if (rowBox.bottom > scrollerBox.bottom) {
    scroller.scrollTop += rowBox.bottom - scrollerBox.bottom
    return
  }
  if (rowBox.top < scrollerBox.top) {
    scroller.scrollTop -= scrollerBox.top - rowBox.top
  }
}

/** Collapse wide Ink column gaps so the glass card stays dense. */
function densifyMirrorText(text: string): string {
  return text.replace(/\s{3,}/gu, '  ')
}
