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
  const highlight = display.findIndex(line => line.highlighted)

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active]')
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, display])

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
            data-active={line.highlighted || undefined}
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

/** Collapse wide Ink column gaps so the glass card stays dense. */
function densifyMirrorText(text: string): string {
  return text.replace(/\s{3,}/gu, '  ')
}
