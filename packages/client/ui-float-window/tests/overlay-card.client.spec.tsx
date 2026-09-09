// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  OVERLAY_STACK_CURSOR_ID, OVERLAY_STACK_DESK_ID, type OverlayStackSnapshot,
} from '@deepseek-ai/dsh-client-ui-layout/client'
import { OverlayCard, type OverlayCardProps } from '../src/client/OverlayCard.tsx'
import { OverlayDesk, type OverlayDeskProps } from '../src/client/OverlayDesk.tsx'
import {
  createOverlayDeskStore, DEFAULT_HEIGHT, DEFAULT_WIDTH, DEFAULT_X, DEFAULT_Y, NEW_CARD_GAP,
} from '../src/client/stores.ts'
import { MIN_HEIGHT, MIN_WIDTH, DEFAULT_CANVAS, MIN_GRAB_WIDTH, DISSOLVE_DELAY_MS, SETTLE_MS, TAG_NOTCH, TAG_PEEK, TAG_THICKNESS, TAG_TUCK, TITLE_BAR_HEIGHT, clampGrabOrigin, dockFromFrame, tagFlipBox } from '../src/client/geometry.ts'
import { defaultOverlayCardSpec, type OverlayCardSpec } from '../src/instances.ts'
import { zh } from '../src/client/locales.ts'
import {
  readPersistedCardFrames,
} from '../src/client/frame-storage.ts'
import {
  OVERLAY_STACK_DESK_ID as LOCAL_OVERLAY_STACK_DESK_ID, overlayStackZIndex,
} from '../src/client/overlay-stack-ids.ts'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = makeTranslate(zh)
const identity1 = '卡片 1'
const STACK: OverlayStackSnapshot = {
  front: [OVERLAY_STACK_DESK_ID, OVERLAY_STACK_CURSOR_ID],
}

function rosterOf(
  cards: readonly OverlayCardSpec[],
): OverlayDeskProps['useRoster'] {
  return ((selector: (state: { cards: readonly OverlayCardSpec[] }) => unknown) => (
    selector({ cards })
  )) as OverlayDeskProps['useRoster']
}

function deskFace(raiseDesk = vi.fn()) {
  return {
    raiseDesk,
    useOverlayStack: ((selector: (snapshot: OverlayStackSnapshot) => unknown) => selector(STACK)
    ) as OverlayDeskProps['useOverlayStack'],
  }
}
const overlayCardCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/client/OverlayCard.module.css'),
  'utf8',
)

function renderCard() {
  const handle = createOverlayDeskStore()
  const instance = handle.create()
  instance.actions.syncCards([defaultOverlayCardSpec()])
  const renderSlot = vi.fn((name: string) => (
    name === 'overlay-card.body' ? <span data-testid="body" /> : <button type="button" data-testid="chrome-action">min</button>
  ))
  const view = render(
    <OverlayCard
      t={t as OverlayCardProps['t']}
      cardNumber={1}
      useStore={bindSnapshotSelector(instance) as OverlayCardProps['useStore']}
      actions={instance.actions as OverlayCardProps['actions']}
      renderSlot={renderSlot as OverlayCardProps['renderSlot']}
    />,
  )
  const header = view.container.querySelector('[data-overlay-card-drag]') as HTMLElement
  header.setPointerCapture = vi.fn()
  header.releasePointerCapture = vi.fn()
  header.hasPointerCapture = vi.fn(() => true)
  return { ...view, header, instance, renderSlot }
}

type BodyOwner = {
  preferFrame: (frame: { width: number; height: number; x?: number; y?: number }) => void
}

function bodyOwner(renderSlot: ReturnType<typeof vi.fn>): BodyOwner {
  const call = renderSlot.mock.calls.find(entry => entry[0] === 'overlay-card.body')
  return call![1] as BodyOwner
}

describe('OverlayCard', () => {
  it('keeps a 36px title bar and the 13px identity font', () => {
    expect(overlayCardCss).toMatch(/\.header \{[\s\S]*?\n  height: 36px;/)
    expect(overlayCardCss).toMatch(/font: var\(--dsw-font-xs-strong-13\)/)
    expect(overlayCardCss).toMatch(/\.tag \.body,\s*\n\.tag \.handle,\s*\n\.tag \.trailing \{\s*\n  display: none;/)
    expect(overlayCardCss).toMatch(new RegExp(`--overlay-tag-notch: ${String(TAG_NOTCH)}px`))
    expect(overlayCardCss).toMatch(new RegExp(`--overlay-tag-tuck: ${String(TAG_TUCK)}px`))
    expect(overlayCardCss).toMatch(new RegExp(`--overlay-tag-peek: ${String(TAG_PEEK)}px`))
    expect(overlayCardCss).toMatch(new RegExp(`\\.tag \\{[\\s\\S]*?height: ${String(TAG_THICKNESS)}px;`))
    expect(overlayCardCss).toMatch(/\.window:not\(\.tag\) \{[\s\S]*?backdrop-filter: blur\(16px\);/)
    expect(overlayCardCss).toMatch(/\.tag \{[\s\S]*?backdrop-filter: blur\(0\);/)
    expect(overlayCardCss).toMatch(/background: var\(--dsw-alias-bg-overlay\)/)
    expect(overlayCardCss).toMatch(/clip-path: polygon\(/)
    expect(overlayCardCss).toMatch(/50% var\(--overlay-tag-notch\)/)
    expect(overlayCardCss).toMatch(
      /\.tag\.left,\s*\n\.window\.morphing\.toTag\.left \{[\s\S]*?calc\(100% - var\(--overlay-tag-notch\)\) 50%/,
    )
    expect(overlayCardCss).toMatch(/\.tag\.left,\s*\n\.tag\.right \{\s*\n  justify-content: center;/)
    expect(overlayCardCss).toMatch(/\.tag\.left \.header,\s*\n\.tag\.right \.header \{[\s\S]*?height: 100%/)
    expect(overlayCardCss).toMatch(/\.tag \.identity \{\s*\n  align-items: center;/)
    expect(overlayCardCss).toMatch(/\.tag\.left \.name,\s*\n\.tag\.right \.name \{\s*\n  line-height: 1;/)
    expect(overlayCardCss).toMatch(/\.tag\.top,\s*\n\.tag\.bottom \{[\s\S]*?width: 32px/)
    expect(overlayCardCss).toMatch(/\.tag\.top \.header,\s*\n\.tag\.bottom \.header \{[\s\S]*?writing-mode: vertical-rl/)
    expect(overlayCardCss).toMatch(/translateY\(var\(--overlay-tag-peek\)\)/)
    expect(overlayCardCss).toMatch(/\.tag \.number \{\s*\n  display: none;/)
    expect(overlayCardCss).toMatch(/\.tag \.name \{\s*\n  font: var\(--dsw-font-xxxs-11\);/)
    expect(overlayCardCss).not.toMatch(/calc\(50% \+ var\(--overlay-tag-notch\)\)/)
    expect(overlayCardCss).toMatch(/\.window\.morphing \{[\s\S]*?overflow: hidden;/)
    expect(overlayCardCss).toMatch(/transform 320ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
    expect(overlayCardCss).toMatch(/clip-path 320ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
    expect(overlayCardCss).toMatch(/\.window\.morphing\.toCard\.left \{[\s\S]*?100% 50%/)
    expect(overlayCardCss).toMatch(/\.window\.morphing\.toTag \.body,[\s\S]*?opacity: 0/)
    expect(overlayCardCss).toMatch(/\.window\.morphing\.dissolve \.tagFace/)
    expect(overlayCardCss).toMatch(/\.tag\.landing \{/)
    expect(overlayCardCss).toMatch(/:not\(\.landing\)/)
    expect(overlayCardCss).toMatch(/\.tagFace \{/)
    expect(overlayCardCss).toMatch(/:not\(\.morphing\)/)
    expect(overlayCardCss).toMatch(/--overlay-resize-hit: 4px/)
    expect(overlayCardCss).toMatch(
      /\.n,\s*\n\.s,\s*\n\.e,\s*\n\.w \{\s*\n  pointer-events: none;/,
    )
    expect(overlayCardCss).toMatch(/\.e::before \{[\s\S]*?width: var\(--overlay-resize-hit\)/)
  })

  it('starts at the empty-body fallback and hosts the body slot', () => {
    const { getByLabelText, getByTestId, renderSlot } = renderCard()
    const root = getByLabelText(identity1)
    expect(root.getAttribute('data-overlay-card-n')).toBe('1')
    expect(root.getAttribute('data-overlay-card-id')).toBe('1')
    expect(root.querySelector('[data-overlay-card-number]')?.textContent).toBe('1')
    expect(root.getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    expect(root.getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
    expect(root.getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH))
    expect(root.getAttribute('data-float-h')).toBe(String(DEFAULT_HEIGHT))
    expect(getByTestId('body')).toBeTruthy()
    expect(root.getAttribute('aria-label')).toBe(identity1)
    expect(renderSlot).toHaveBeenCalledWith(
      'overlay-card.body',
      expect.objectContaining({ preferFrame: expect.any(Function) }),
      expect.objectContaining({ fallback: expect.anything() }),
    )
    expect(renderSlot).toHaveBeenCalledWith('overlay-card.chrome.trailing', {})
  })

  it('adopts a preferred size and keeps origin when it is omitted', () => {
    const { getByLabelText, renderSlot } = renderCard()
    const owner = bodyOwner(renderSlot)
    act(() => {
      owner.preferFrame({ width: 760, height: 640 })
    })
    const root = getByLabelText(identity1)
    expect(root.getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    expect(root.getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
    expect(root.getAttribute('data-float-w')).toBe('760')
    expect(root.getAttribute('data-float-h')).toBe('640')
  })

  it('places the card when preferFrame includes origin', () => {
    const { getByLabelText, renderSlot } = renderCard()
    const owner = bodyOwner(renderSlot)
    act(() => {
      owner.preferFrame({ width: 704, height: 480, x: 24, y: 72 })
    })
    const root = getByLabelText(identity1)
    expect(root.getAttribute('data-float-x')).toBe('24')
    expect(root.getAttribute('data-float-y')).toBe('72')
    expect(root.getAttribute('data-float-w')).toBe('704')
    expect(root.getAttribute('data-float-h')).toBe('480')
  })

  it('ignores a later preferFrame after the first adopt', () => {
    const { getByLabelText, renderSlot } = renderCard()
    const owner = bodyOwner(renderSlot)
    act(() => {
      owner.preferFrame({ width: 760, height: 640 })
      owner.preferFrame({ width: 400, height: 300, x: 8, y: 8 })
    })
    const root = getByLabelText(identity1)
    expect(root.getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    expect(root.getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
    expect(root.getAttribute('data-float-w')).toBe('760')
    expect(root.getAttribute('data-float-h')).toBe('640')
  })

  it('ignores preferFrame when the seat no longer has a frame', () => {
    const { instance, renderSlot } = renderCard()
    const owner = bodyOwner(renderSlot)
    act(() => {
      instance.actions.syncCards([])
    })
    act(() => {
      owner.preferFrame({ width: 400, height: 300 })
    })
    expect(instance.getSnapshot().frames[1]).toBeUndefined()
  })

  it('keeps preferFrame identity across frame updates', () => {
    const { header, renderSlot } = renderCard()
    const first = bodyOwner(renderSlot).preferFrame
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 40, clientY: 90 })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 80, clientY: 150 })
    const lastCall = [...renderSlot.mock.calls].reverse().find(entry => entry[0] === 'overlay-card.body')
    expect((lastCall![1] as BodyOwner).preferFrame).toBe(first)
  })

  it('moves on primary-button drag and ignores other buttons', () => {
    const { header, getByLabelText } = renderCard()
    fireEvent.pointerDown(header, { button: 1, pointerId: 2, clientX: 100, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 40, clientY: 90 })
    fireEvent.pointerMove(header, { pointerId: 99, clientX: 400, clientY: 400 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 80, clientY: 150 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe('76')
    expect(getByLabelText(identity1).getAttribute('data-float-y')).toBe('116')
    fireEvent.pointerUp(header, { pointerId: 2, clientX: 80, clientY: 150 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe('76')
    fireEvent.pointerUp(header, { pointerId: 1, clientX: 80, clientY: 150 })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe('76')
  })

  it('clamps a top hang to zero and lets a left hang keep a grab strip', () => {
    const { header, getByLabelText } = renderCard()
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: DEFAULT_X, clientY: DEFAULT_Y })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: -5000, clientY: -40 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe(
      String(MIN_GRAB_WIDTH - DEFAULT_WIDTH),
    )
    expect(getByLabelText(identity1).getAttribute('data-float-y')).toBe('0')
    fireEvent.pointerCancel(header, { pointerId: 1, clientX: 0, clientY: 0 })
  })

  it('cancels a move without pointer capture', () => {
    const { header, getByLabelText } = renderCard()
    header.hasPointerCapture = vi.fn(() => false)
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 40, clientY: 90 })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 80, clientY: 150 })
    fireEvent.pointerCancel(header, { pointerId: 1, clientX: 80, clientY: 150 })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe('76')
  })

  it('keeps a grab strip on the playable board when dragged past the edge', () => {
    const { header, getByLabelText } = renderCard()
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: DEFAULT_X, clientY: DEFAULT_Y })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 5000, clientY: 4000 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe(
      String(DEFAULT_CANVAS.width - MIN_GRAB_WIDTH),
    )
    expect(getByLabelText(identity1).getAttribute('data-float-y')).toBe(
      String(DEFAULT_CANVAS.height - TITLE_BAR_HEIGHT),
    )
    header.hasPointerCapture = vi.fn(() => false)
    fireEvent.pointerUp(header, { pointerId: 1, clientX: 5000, clientY: 4000 })
  })

  it('resizes from an edge and ignores other buttons', () => {
    const { container, getByLabelText } = renderCard()
    const east = container.querySelector('[data-float-resize="e"]') as HTMLElement
    east.setPointerCapture = vi.fn()
    east.releasePointerCapture = vi.fn()
    east.hasPointerCapture = vi.fn(() => true)
    fireEvent.pointerDown(east, { button: 1, pointerId: 2, clientX: 100, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH))
    fireEvent.pointerDown(east, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(east, { pointerId: 99, clientX: 180, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH))
    fireEvent.pointerMove(east, { pointerId: 1, clientX: 140, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH + 40))
    fireEvent.pointerUp(east, { pointerId: 2, clientX: 140, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH + 40))
    fireEvent.pointerUp(east, { pointerId: 1, clientX: 140, clientY: 100 })
    fireEvent.pointerMove(east, { pointerId: 1, clientX: 200, clientY: 100 })
    expect(getByLabelText(identity1).getAttribute('data-float-w')).toBe(String(DEFAULT_WIDTH + 40))
    east.hasPointerCapture = vi.fn(() => false)
    fireEvent.pointerCancel(east, { pointerId: 1, clientX: 140, clientY: 100 })
  })

  it('refuses a frame smaller than the minimum', () => {
    const { instance } = renderCard()
    instance.actions.setFrame(1, { x: 8, y: 8, width: 10, height: 10 })
    expect(instance.getSnapshot().frames[1]?.width).toBe(MIN_WIDTH)
    expect(instance.getSnapshot().frames[1]?.height).toBe(MIN_HEIGHT)
  })

  it('does not start a move from trailing chrome', () => {
    const { getByLabelText, getByTestId } = renderCard()
    fireEvent.pointerDown(getByTestId('chrome-action'), { button: 0, pointerId: 1, clientX: 40, clientY: 90 })
    fireEvent.pointerMove(getByTestId('chrome-action'), { pointerId: 1, clientX: 80, clientY: 150 })
    expect(getByLabelText(identity1).getAttribute('data-float-x')).toBe(String(DEFAULT_X))
    expect(getByLabelText(identity1).getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
  })

  it('renders the empty-body label when the body slot has no occupant', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    const renderSlot = vi.fn((_name: string, _owner: unknown, opts?: { fallback?: ReactNode }) => (
      opts?.fallback ?? null
    ))
    const view = render(
      <OverlayCard
        t={t as OverlayCardProps['t']}
        cardNumber={1}
        useStore={bindSnapshotSelector(instance) as OverlayCardProps['useStore']}
        actions={instance.actions as OverlayCardProps['actions']}
        renderSlot={renderSlot as OverlayCardProps['renderSlot']}
      />,
    )
    expect(view.getByText('空卡片')).toBeTruthy()
    expect(view.container.querySelector('[data-overlay-card-empty]')).toBeTruthy()
  })

  it('keeps in-body hash clicks from targeting another root', () => {
    const decoy = document.createElement('section')
    decoy.id = 'book'
    decoy.textContent = 'other'
    decoy.scrollIntoView = vi.fn()
    document.body.append(decoy)
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    const renderSlot = vi.fn((name: string) => (
      name === 'overlay-card.body'
        ? (
          <>
            <a href="#book">go</a>
            <section id="book">here</section>
          </>
        )
        : null
    ))
    const view = render(
      <OverlayCard
        t={t as OverlayCardProps['t']}
        cardNumber={1}
        useStore={bindSnapshotSelector(instance) as OverlayCardProps['useStore']}
        actions={instance.actions as OverlayCardProps['actions']}
        renderSlot={renderSlot as OverlayCardProps['renderSlot']}
      />,
    )
    const here = [...view.container.querySelectorAll('[id]')].find(el => el.id === 'book') as HTMLElement
    here.scrollIntoView = vi.fn()
    const bodyRoot = view.container.querySelector('[data-overlay-card-body]') as HTMLElement
    fireEvent.click(view.getByText('go'))
    expect(here.scrollIntoView).not.toHaveBeenCalled()
    expect(decoy.scrollIntoView).not.toHaveBeenCalled()
    expect(decoy.scrollTop).toBe(0)
    expect(bodyRoot).toBeTruthy()
    decoy.remove()
  })
})

describe('OverlayDesk', () => {
  it('isolates card z-index from sibling overlay occupants', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/client/OverlayDesk.module.css'),
      'utf8',
    )
    expect(css).toContain('isolation: isolate')
  })

  it('mounts numbered cards and keeps an existing frame when a later card is added', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    const renderSlot = vi.fn((name: string) => (
      name.endsWith('.body') ? <span data-testid={name} /> : null
    ))
    const first = defaultOverlayCardSpec()
    const second: OverlayCardSpec = {
      seat: 2, id: 'draft', title: '草稿', width: 520, height: 400,
    }
    const roster = rosterOf
    const shared = {
      t: t as OverlayDeskProps['t'],
      useStore: bindSnapshotSelector(instance) as OverlayDeskProps['useStore'],
      actions: instance.actions as OverlayDeskProps['actions'],
      renderSlot: renderSlot as OverlayDeskProps['renderSlot'],
      ...deskFace(),
    }
    const view = render(<OverlayDesk {...shared} useRoster={roster([first])} />)
    expect(view.container.querySelector('[data-overlay-board]')).toBeTruthy()
    expect((view.container.querySelector('[data-overlay-board]') as HTMLElement).style.zIndex).toBe('40')
    expect(view.getByLabelText(identity1)).toBeTruthy()
    act(() => {
      instance.actions.setFrame(1, { x: 80, y: 90, width: 400, height: 300 })
    })
    view.rerender(<OverlayDesk {...shared} useRoster={roster([first, second])} />)
    expect(view.getByLabelText(identity1).getAttribute('data-float-x')).toBe('80')
    const added = view.getByLabelText('草稿 draft')
    expect(added.getAttribute('data-overlay-card-id')).toBe('draft')
    expect(added.querySelector('[data-overlay-card-number]')?.textContent).toBe('draft')
    expect(added.querySelector('[data-overlay-card-number]')?.textContent).not.toBe('2')
    expect(added.getAttribute('data-float-x')).toBe(String(80 + 400 + NEW_CARD_GAP))
    expect(added.getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
    expect(added.getAttribute('data-float-w')).toBe('520')
    expect(added.getAttribute('data-float-h')).toBe('400')
    act(() => {
      instance.actions.setFrame(1, { x: 80, y: 90, width: 960, height: 700 })
    })
    expect(view.getByLabelText('草稿 draft').getAttribute('data-float-x')).toBe(String(80 + 400 + NEW_CARD_GAP))
    expect(view.getByLabelText('草稿 draft').getAttribute('data-float-y')).toBe(String(DEFAULT_Y))
    expect(renderSlot).toHaveBeenCalledWith(
      'overlay-card-2.body',
      expect.objectContaining({ preferFrame: expect.any(Function) }),
      expect.objectContaining({ fallback: expect.anything() }),
    )
  })

  it('duplicates overlay-stack occupant ids without importing layout values', () => {
    expect(LOCAL_OVERLAY_STACK_DESK_ID).toBe('overlay-card')
    expect(overlayStackZIndex([], LOCAL_OVERLAY_STACK_DESK_ID)).toBe(40)
    expect(overlayStackZIndex(['overlay-card'], LOCAL_OVERLAY_STACK_DESK_ID)).toBe(40)
    expect(overlayStackZIndex(['overlay-card', 'cursor-agent'], LOCAL_OVERLAY_STACK_DESK_ID)).toBe(40)
    expect(overlayStackZIndex(['cursor-agent', 'overlay-card'], LOCAL_OVERLAY_STACK_DESK_ID)).toBe(41)
  })

  it('raises a card on primary-button pointer down in the body or trailing chrome, not other buttons', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    const raiseDesk = vi.fn()
    const renderSlot = vi.fn((name: string) => (
      name.endsWith('.body')
        ? <span data-testid={name} />
        : <button type="button" data-testid={name}>min</button>
    ))
    const first = defaultOverlayCardSpec()
    const second: OverlayCardSpec = {
      seat: 2, id: 'draft', title: '草稿', width: 520, height: 400,
    }
    const roster = rosterOf
    render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={bindSnapshotSelector(instance) as OverlayDeskProps['useStore']}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster([first, second])}
        {...deskFace(raiseDesk)}
      />,
    )
    expect(instance.getSnapshot().front.at(-1)).toBe(2)
    fireEvent.pointerDown(document.querySelector('[data-testid="overlay-card.body"]') as HTMLElement, {
      button: 1, pointerId: 2, clientX: 80, clientY: 120,
    })
    expect(instance.getSnapshot().front.at(-1)).toBe(2)
    expect(raiseDesk).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.querySelector('[data-testid="overlay-card.body"]') as HTMLElement, {
      button: 0, pointerId: 1, clientX: 80, clientY: 120,
    })
    expect(instance.getSnapshot().front.at(-1)).toBe(1)
    expect(raiseDesk).toHaveBeenCalled()
    expect(instance.getSnapshot().frames[1]?.x).toBe(DEFAULT_X)
    fireEvent.pointerDown(document.querySelector('[data-testid="overlay-card-2.body"]') as HTMLElement, {
      button: 0, pointerId: 3, clientX: 80, clientY: 120,
    })
    expect(instance.getSnapshot().front.at(-1)).toBe(2)
    fireEvent.pointerDown(document.querySelector('[data-testid="overlay-card.chrome.trailing"]') as HTMLElement, {
      button: 0, pointerId: 4, clientX: 40, clientY: 90,
    })
    expect(instance.getSnapshot().front.at(-1)).toBe(1)
    expect(instance.getSnapshot().frames[1]?.x).toBe(DEFAULT_X)
  })

  it('leaves a sibling frame unchanged when this card resizes', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    const before = instance.getSnapshot().frames[2]
    instance.actions.setFrame(1, { x: 80, y: 90, width: 960, height: 700 })
    expect(instance.getSnapshot().frames[2]).toEqual(before)
  })

  it('overlaps the default origin when a new card would leave the board to the right', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.setCanvas(800, 600)
    instance.actions.syncCards([
      { seat: 1, id: '1', title: '卡片', width: 700, height: 400 },
    ])
    instance.actions.syncCards([
      { seat: 1, id: '1', title: '卡片', width: 700, height: 400 },
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().frames[2]).toEqual({
      x: DEFAULT_X, y: DEFAULT_Y, width: 520, height: 400,
    })
  })

  it('reclamps every origin when the playable board shrinks', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    instance.actions.setFrame(1, { x: 36, y: 700, width: MIN_WIDTH, height: MIN_HEIGHT })
    instance.actions.setCanvas(800, 400)
    expect(instance.getSnapshot().frames[1]?.y).toBe(400 - TITLE_BAR_HEIGHT)
    expect(instance.getSnapshot().frames[1]?.y).toBeLessThan(400)
  })

  it('does not mount a hidden spec and restores the kept frame on show', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    const frame = instance.getSnapshot().frames[2]
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400, hidden: true },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1])
    expect(instance.getSnapshot().frames[2]).toEqual(frame)
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1, 2])
    expect(instance.getSnapshot().frames[2]).toEqual(frame)
  })

  it('does not mount an unplugged spec and keeps hidden across insert', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    const draft = { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 } as const
    instance.actions.syncCards([defaultOverlayCardSpec(), draft])
    const frame = instance.getSnapshot().frames[2]
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { ...draft, hidden: true },
    ])
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { ...draft, hidden: true, inserted: false },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1])
    expect(instance.getSnapshot().frames[2]).toEqual(frame)
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { ...draft, hidden: true, inserted: true },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1])
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { ...draft, inserted: false },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1])
    instance.actions.syncCards([defaultOverlayCardSpec(), draft])
    expect(instance.getSnapshot().numbers).toEqual([1, 2])
    expect(instance.getSnapshot().frames[2]).toEqual(frame)
  })

  it('drops a removed spec from frames and preferLocked', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    instance.actions.setFrame(2, { x: 80, y: 90, width: 520, height: 400 })
    expect(instance.getSnapshot().preferLocked[2]).toBe(true)
    instance.actions.syncCards([defaultOverlayCardSpec()])
    expect(instance.getSnapshot().numbers).toEqual([1])
    expect(instance.getSnapshot().frames[2]).toBeUndefined()
    expect(instance.getSnapshot().identities[2]).toBeUndefined()
    expect(instance.getSnapshot().preferLocked[2]).toBeUndefined()
  })

  it('does not render a hidden or unplugged card', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    const renderSlot = vi.fn(() => null)
    const roster = rosterOf
    const view = render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={bindSnapshotSelector(instance) as OverlayDeskProps['useStore']}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster([{ ...defaultOverlayCardSpec(), hidden: true }])}
        {...deskFace()}
      />,
    )
    expect(view.queryByLabelText(identity1)).toBeNull()
    const unplugged = render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={bindSnapshotSelector(instance) as OverlayDeskProps['useStore']}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster([{ ...defaultOverlayCardSpec(), inserted: false }])}
        {...deskFace()}
      />,
    )
    expect(unplugged.queryByLabelText(identity1)).toBeNull()
  })

  it('restores a stored frame and stacking on a fresh store', () => {
    const remembered = { x: 80, y: 90, width: 500, height: 400 }
    const handle = createOverlayDeskStore({
      frames: { '1': remembered, draft: { x: 200, y: 60, width: 520, height: 400 } },
      front: ['draft', '1'],
    })
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().frames[1]).toEqual(remembered)
    expect(instance.getSnapshot().frames[2]).toEqual({ x: 200, y: 60, width: 520, height: 400 })
    expect(instance.getSnapshot().front).toEqual([2, 1])
    expect(instance.getSnapshot().preferLocked[1]).toBe(true)
    const rememberedFrame = instance.getSnapshot().frames[1]
    instance.actions.setFrame(1, rememberedFrame!)
    expect(instance.getSnapshot().frames[1]).toEqual(remembered)
  })

  it('appends a mounted seat missing from persist front and skips a hidden id', () => {
    const handle = createOverlayDeskStore({
      frames: {
        '1': { x: 80, y: 90, width: 500, height: 400 },
        draft: { x: 200, y: 60, width: 520, height: 400 },
      },
      front: ['draft', 'draft', '1'],
    })
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400, hidden: true },
    ])
    expect(instance.getSnapshot().front).toEqual([1])
  })

  it('keeps persist front order and appends a seat the blob omitted', () => {
    const handle = createOverlayDeskStore({
      frames: {
        '1': { x: 80, y: 90, width: 500, height: 400 },
        draft: { x: 200, y: 60, width: 520, height: 400 },
      },
      front: ['draft', 'draft'],
    })
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().front).toEqual([2, 1])
  })

  it('applies stored stacking after an empty first roster poll', () => {
    const handle = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['missing', '1'],
    })
    const instance = handle.create()
    instance.actions.syncCards([])
    expect(instance.getSnapshot().numbers).toEqual([])
    instance.actions.syncCards([defaultOverlayCardSpec()])
    expect(instance.getSnapshot().front).toEqual([1])
    expect(instance.getSnapshot().frames[1]).toEqual({ x: 80, y: 90, width: 500, height: 400 })
  })

  it('restores a stored frame for a hidden spec', () => {
    const remembered = { x: 200, y: 60, width: 520, height: 400 }
    const handle = createOverlayDeskStore({
      frames: { draft: remembered },
      front: [],
    })
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400, hidden: true },
    ])
    expect(instance.getSnapshot().numbers).toEqual([1])
    expect(instance.getSnapshot().frames[2]).toEqual(remembered)
    expect(instance.getSnapshot().preferLocked[2]).toBe(true)
  })

  it('does not let preferFrame override a restored frame', () => {
    const remembered = { x: 80, y: 90, width: 500, height: 400 }
    const handle = createOverlayDeskStore({
      frames: { '1': remembered },
      front: ['1'],
    })
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    const renderSlot = vi.fn((name: string) => (
      name === 'overlay-card.body' ? <span data-testid="body" /> : null
    ))
    render(
      <OverlayCard
        t={t as OverlayCardProps['t']}
        cardNumber={1}
        useStore={bindSnapshotSelector(instance) as OverlayCardProps['useStore']}
        actions={instance.actions as OverlayCardProps['actions']}
        renderSlot={renderSlot as OverlayCardProps['renderSlot']}
      />,
    )
    act(() => {
      bodyOwner(renderSlot).preferFrame({ width: 760, height: 640, x: 24, y: 72 })
    })
    expect(instance.getSnapshot().frames[1]).toEqual(remembered)
  })

  it('writes desk frames so a later store can restore them', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    instance.actions.setFrame(1, { x: 80, y: 90, width: 500, height: 400 })
    const roster = rosterOf
    render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={bindSnapshotSelector(instance) as OverlayDeskProps['useStore']}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={vi.fn(() => null) as OverlayDeskProps['renderSlot']}
        useRoster={roster([defaultOverlayCardSpec()])}
        {...deskFace()}
      />,
    )
    expect(readPersistedCardFrames()?.frames['1']).toEqual({
      x: 80, y: 90, width: 500, height: 400,
    })
    expect(readPersistedCardFrames()?.docks).toBeUndefined()
    act(() => {
      instance.actions.minimize(1)
    })
    expect(readPersistedCardFrames()?.docks?.['1']?.edge).toBe('top')
    expect(readPersistedCardFrames()?.parks?.['1']?.edge).toBe('top')
    act(() => {
      instance.actions.setDock(1, { edge: 'left', along: 40 })
      instance.actions.restore(1)
    })
    expect(readPersistedCardFrames()?.docks).toBeUndefined()
    expect(readPersistedCardFrames()?.parks?.['1']).toEqual({ edge: 'left', along: 40 })
    const restored = createOverlayDeskStore(readPersistedCardFrames()).create()
    restored.actions.syncCards([defaultOverlayCardSpec()])
    expect(restored.getSnapshot().frames[1]).toEqual({
      x: 80, y: 90, width: 500, height: 400,
    })
    expect(restored.getSnapshot().docks[1]).toBeUndefined()
    expect(restored.getSnapshot().parks[1]).toEqual({ edge: 'left', along: 40 })
    restored.actions.minimize(1)
    expect(restored.getSnapshot().docks[1]).toEqual({ edge: 'left', along: 40 })
  })
})

describe('overlay card edge tag', () => {
  function renderDesk(cards: readonly OverlayCardSpec[] = [defaultOverlayCardSpec()]) {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    const renderSlot = vi.fn((name: string) => (
      name.endsWith('.body') ? <span data-testid={name} /> : null
    ))
    const roster = (
      (selector: (state: { cards: readonly OverlayCardSpec[] }) => unknown) => selector({ cards })
    ) as OverlayDeskProps['useRoster']
    const view = render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={bindSnapshotSelector(instance) as OverlayDeskProps['useStore']}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster}
        {...deskFace()}
      />,
    )
    return { ...view, instance }
  }

  function armCapture(el: HTMLElement) {
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    el.hasPointerCapture = vi.fn(() => true)
  }

  function tagHandle(container: HTMLElement): HTMLElement {
    return container.querySelector('[data-overlay-dock] [data-overlay-card-drag]') as HTMLElement
  }

  it('collapses the window from the built-in 缩小 control and keeps the body mounted', () => {
    const { getByLabelText, instance, container } = renderDesk()
    const minimize = container.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
    fireEvent.pointerDown(minimize, { button: 1, pointerId: 2, clientX: 40, clientY: 40 })
    expect(getByLabelText(identity1)).toBeTruthy()
    fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    expect(container.querySelector('[data-overlay-card][data-overlay-dock]')).toBeTruthy()
    expect(container.querySelector('[data-overlay-card][hidden]')).toBeNull()
    expect(container.querySelector('[data-testid="overlay-card.body"]')).toBeTruthy()
    expect(getByLabelText('展开 卡片 1')).toBeTruthy()
    expect(instance.getSnapshot().frames[1]).toEqual({
      x: DEFAULT_X, y: DEFAULT_Y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
    })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('top')
    const parked = container.querySelector('[data-overlay-card][data-overlay-dock]') as HTMLElement
    expect(parked.style.top).toBe(`-${TAG_TUCK}px`)
    instance.actions.minimize(1)
    instance.actions.minimize(9)
    expect(instance.getSnapshot().docks[1]?.edge).toBe('top')
  })

  it('expands the card on a tag click and on a drop away from every edge', () => {
    const { getByLabelText, queryByLabelText, container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    const tab = tagHandle(container)
    armCapture(tab)
    fireEvent.pointerDown(tab, { button: 1, pointerId: 2, clientX: 40, clientY: 10 })
    expect(instance.getSnapshot().docks[1]).toBeTruthy()
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(tab, { pointerId: 99, clientX: 640, clientY: 400 })
    expect(instance.getSnapshot().docks[1]).toBeTruthy()
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 42, clientY: 11 })
    expect(queryByLabelText(identity1)).toBeTruthy()
    expect(instance.getSnapshot().frames[1]).toEqual({
      x: DEFAULT_X, y: DEFAULT_Y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
    })
    act(() => {
      instance.actions.minimize(1)
    })
    const again = tagHandle(container)
    armCapture(again)
    fireEvent.pointerDown(again, { button: 0, pointerId: 3, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(again, { pointerId: 3, clientX: 640, clientY: 400 })
    expect(container.querySelector('[data-overlay-dock]')?.hasAttribute('data-overlay-dock-edge')).toBe(false)
    fireEvent.pointerUp(again, { pointerId: 3, clientX: 640, clientY: 400 })
    expect(instance.getSnapshot().docks[1]).toBeUndefined()
    expect(instance.getSnapshot().front.at(-1)).toBe(1)
    expect(getByLabelText(identity1)).toBeTruthy()
    const origin = clampGrabOrigin(600, 390, instance.getSnapshot().canvas, DEFAULT_WIDTH)
    expect(instance.getSnapshot().frames[1]).toEqual({
      x: origin.x, y: origin.y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
    })
  })

  it('magnet-snaps a dragged tag onto another edge at that along position', () => {
    const { getByLabelText, container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    const idle = tagHandle(container)
    fireEvent.pointerMove(idle, { pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerUp(idle, { pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerCancel(idle, { pointerId: 1, clientX: 40, clientY: 10 })
    const tab = tagHandle(container)
    tab.setPointerCapture = vi.fn(() => {
      throw new Error('no capture')
    })
    tab.releasePointerCapture = vi.fn()
    tab.hasPointerCapture = vi.fn(() => false)
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 99, clientX: 40, clientY: 790 })
    fireEvent.pointerUp(window, { pointerId: 99, clientX: 40, clientY: 790 })
    fireEvent.pointerCancel(window, { pointerId: 99, clientX: 40, clientY: 790 })
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 40, clientY: 790 })
    expect(container.querySelector('[data-overlay-dock]')?.getAttribute('data-overlay-dock-edge')).toBe('bottom')
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 40, clientY: 790 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('bottom')
    expect((container.querySelector('[data-overlay-dock]') as HTMLElement).style.bottom).toBe(`-${TAG_TUCK}px`)
    const again = tagHandle(container)
    armCapture(again)
    fireEvent.pointerDown(again, { button: 0, pointerId: 2, clientX: 40, clientY: 790 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 10, clientY: 400 })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 10, clientY: 400 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('left')
    expect((container.querySelector('[data-overlay-dock]') as HTMLElement).style.left).toBe(`-${TAG_TUCK}px`)
    expect(getByLabelText('展开 卡片 1')).toBeTruthy()
  })

  it('cancels a tag drag from a window pointercancel', () => {
    const { container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    const start = instance.getSnapshot().docks[1]
    const tab = tagHandle(container)
    armCapture(tab)
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 40, clientY: 790 })
    fireEvent.pointerCancel(window, { pointerId: 1, clientX: 40, clientY: 790 })
    expect(instance.getSnapshot().docks[1]).toEqual(start)
  })

  it('keeps a tag when it is dropped near an edge', () => {
    const { container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    const tab = tagHandle(container)
    armCapture(tab)
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 40, clientY: 40 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('top')
    fireEvent.pointerDown(tab, { button: 0, pointerId: 2, clientX: 40, clientY: 10 })
    fireEvent.pointerCancel(tab, { pointerId: 99, clientX: 40, clientY: 10 })
    fireEvent.pointerCancel(tab, { pointerId: 2, clientX: 40, clientY: 10 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('top')
  })

  it('snaps a tag drop using the desk canvas and ignores a bogus dock', () => {
    const { container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
      instance.actions.setCanvas(800, 600)
    })
    const tab = tagHandle(container)
    tab.setPointerCapture = vi.fn()
    tab.releasePointerCapture = vi.fn()
    tab.hasPointerCapture = vi.fn(() => false)
    fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 790, clientY: 300 })
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 790, clientY: 300 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('right')
    const parked = tagHandle(container)
    armCapture(parked)
    fireEvent.pointerDown(parked, { button: 0, pointerId: 2, clientX: 790, clientY: 300 })
    fireEvent.pointerMove(parked, { pointerId: 2, clientX: 790, clientY: 300 })
    fireEvent.pointerCancel(parked, { pointerId: 2, clientX: 790, clientY: 300 })
    expect(instance.getSnapshot().docks[1]?.edge).toBe('right')
    instance.actions.setDock(1, { edge: 'north', along: 0 } as never)
    expect(instance.getSnapshot().docks[1]?.edge).toBe('right')
    instance.actions.setDock(1, instance.getSnapshot().docks[1]!)
    instance.actions.setDock(9, { edge: 'left', along: 0 })
  })

  it('disconnects the board ResizeObserver on unmount', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      observe = observe
      disconnect = disconnect
    })
    const { unmount } = renderDesk()
    expect(observe).toHaveBeenCalled()
    unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('restores per-card docks from persist and migrates a legacy rail blob', () => {
    const current = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['1'],
      docks: { '1': { edge: 'bottom', along: 48 } },
    }).create()
    current.actions.syncCards([defaultOverlayCardSpec()])
    expect(current.getSnapshot().docks[1]).toEqual({ edge: 'bottom', along: 48 })
    expect(current.getSnapshot().parks[1]).toEqual({ edge: 'bottom', along: 48 })
    const migrated = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['1'],
      dockEdge: 'right',
      minimized: ['1', 'ghost'],
    }).create()
    migrated.actions.syncCards([])
    migrated.actions.syncCards([defaultOverlayCardSpec()])
    expect(migrated.getSnapshot().docks[1]?.edge).toBe('right')
    migrated.actions.restore(1)
    migrated.actions.restore(1)
    expect(migrated.getSnapshot().docks[1]).toBeUndefined()
    const legacyTop = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['1'],
      minimized: ['1'],
    }).create()
    legacyTop.actions.syncCards([defaultOverlayCardSpec()])
    expect(legacyTop.getSnapshot().docks[1]?.edge).toBe('top')
    legacyTop.actions.setDock(1, { edge: 'top', along: 5000 })
    legacyTop.actions.setCanvas(400, 400)
    expect(legacyTop.getSnapshot().docks[1]?.along).toBe(400 - TAG_THICKNESS)
    const noFrame = createOverlayDeskStore({
      frames: { hub: { x: 8, y: 9, width: 360, height: 280 } },
      front: ['hub'],
      minimized: ['1'],
    }).create()
    noFrame.actions.syncCards([defaultOverlayCardSpec()])
    expect(noFrame.getSnapshot().docks[1]).toEqual({ edge: 'top', along: 0 })
  })

  it('keeps expanded cards when persist omits docks', () => {
    const handle = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['1'],
    })
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      defaultOverlayCardSpec(),
    ])
    expect(instance.getSnapshot().docks[1]).toBeUndefined()
    instance.actions.setCanvas(0, 800)
    instance.actions.setCanvas(1280, 800)
    instance.actions.setPosition(9, 0, 0)
    instance.actions.setPosition(3, 0, 0)
    instance.actions.setFrame(9, { x: 0, y: 0, width: 360, height: 280 })
    instance.actions.bringToFront(9)
    instance.actions.restore(9)
  })

  it('keeps a dock across hide and skips a docked frame when placing a neighbor', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    instance.actions.minimize(1)
    instance.actions.syncCards([
      { ...defaultOverlayCardSpec(), hidden: true },
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().docks[1]?.edge).toBe('top')
    expect(instance.getSnapshot().numbers).toEqual([2])
    instance.actions.restore(1)
    expect(instance.getSnapshot().docks[1]).toBeUndefined()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    expect(instance.getSnapshot().docks[1]).toBeUndefined()
  })

  it('returns 缩小 to the last parked tag and click expand to the last frame', () => {
    const { instance } = renderDesk()
    act(() => {
      instance.actions.setFrame(1, { x: 80, y: 90, width: 500, height: 400 })
      instance.actions.minimize(1)
      instance.actions.setDock(1, { edge: 'left', along: 40 })
      instance.actions.restore(1)
    })
    expect(instance.getSnapshot().docks[1]).toBeUndefined()
    expect(instance.getSnapshot().parks[1]).toEqual({ edge: 'left', along: 40 })
    expect(instance.getSnapshot().frames[1]).toEqual({
      x: 80, y: 90, width: 500, height: 400,
    })
    act(() => {
      instance.actions.minimize(1)
    })
    expect(instance.getSnapshot().docks[1]).toEqual({ edge: 'left', along: 40 })
    act(() => {
      instance.actions.restore(1)
    })
    expect(instance.getSnapshot().frames[1]).toEqual({
      x: 80, y: 90, width: 500, height: 400,
    })
  })

  it('seeds parks from persist when the card is expanded', () => {
    const parked = createOverlayDeskStore({
      frames: { '1': { x: 80, y: 90, width: 500, height: 400 } },
      front: ['1'],
      parks: { '1': { edge: 'left', along: 40 } },
    }).create()
    parked.actions.syncCards([defaultOverlayCardSpec()])
    expect(parked.getSnapshot().docks[1]).toBeUndefined()
    expect(parked.getSnapshot().parks[1]).toEqual({ edge: 'left', along: 40 })
    parked.actions.minimize(1)
    expect(parked.getSnapshot().docks[1]).toEqual({ edge: 'left', along: 40 })
  })

  it('plays a shrink morph that flies as a card then dissolves into the tag', async () => {
    const { container } = renderDesk()
    const card = container.querySelector('[data-overlay-card]') as HTMLElement
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) return new DOMRect(36, 56, 360, 280)
      return original.call(this)
    }
    try {
      const minimize = container.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
      fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
      expect(card.className).toMatch(/morphing/)
      expect(card.className).toMatch(/toCard/)
      expect(card.className).not.toMatch(/toTag/)
      expect(card.className).not.toMatch(/dissolve/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(false)
      expect(card.querySelector('[data-overlay-tag-face]')).not.toBeNull()
      await act(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
      })
      expect(card.style.transform).toMatch(/translate\(/)
      expect(card.className).toMatch(/toCard/)
      expect(card.className).not.toMatch(/toTag/)
      expect(card.className).not.toMatch(/dissolve/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(false)
      expect((card.querySelector('[data-overlay-tag-face]') as HTMLElement).style.opacity).toBe('0')
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, DISSOLVE_DELAY_MS + 20)
        })
      })
      expect(card.className).toMatch(/dissolve/)
      expect(card.className).toMatch(/toCard/)
      expect(card.className).not.toMatch(/toTag/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(false)
      expect((card.querySelector('[data-overlay-tag-face]') as HTMLElement).style.opacity).toBe('1')
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, SETTLE_MS + 20)
        })
      })
      await act(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
      })
      await act(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
      })
      expect(card.className).not.toMatch(/morphing/)
      expect(card.className).not.toMatch(/landing/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(true)
      expect(card.querySelector('[data-overlay-tag-face]')).toBeNull()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('skips a morph when the card box is empty or the tag box is unchanged', () => {
    const { container } = renderDesk()
    const card = container.querySelector('[data-overlay-card]') as HTMLElement
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) return new DOMRect(0, 0, 0, 0)
      return original.call(this)
    }
    try {
      const minimize = container.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
      fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
      expect(card.className).not.toMatch(/morphing/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(true)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
    const parked = dockFromFrame(
      { x: DEFAULT_X, y: DEFAULT_Y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
      DEFAULT_CANVAS,
    )
    const same = tagFlipBox(parked, DEFAULT_CANVAS, 0, 0)
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) {
        return new DOMRect(same.left, same.top, same.width, same.height)
      }
      return original.call(this)
    }
    try {
      const { container: again } = renderDesk()
      const next = again.querySelector('[data-overlay-card]') as HTMLElement
      const minimize = again.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
      fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
      expect(next.className).not.toMatch(/morphing/)
      expect(next.hasAttribute('data-overlay-dock')).toBe(true)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('plays an expand morph from a tag click', async () => {
    const { container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    const card = container.querySelector('[data-overlay-card]') as HTMLElement
    const original = HTMLElement.prototype.getBoundingClientRect
    let n = 0
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) {
        n += 1
        return n === 1 ? new DOMRect(0, -16, 80, 32) : new DOMRect(36, 56, 360, 280)
      }
      return original.call(this)
    }
    try {
      const tab = tagHandle(container)
      armCapture(tab)
      fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
      fireEvent.pointerUp(tab, { pointerId: 1, clientX: 42, clientY: 11 })
      expect(card.className).toMatch(/morphing/)
      expect(card.className).toMatch(/toTag/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(false)
      await act(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
      })
      expect(card.className).toMatch(/toCard/)
      expect(card.className).toMatch(/play/)
      expect(card.querySelector('[data-overlay-tag-face]')).not.toBeNull()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('flies shrink morph without an overlay-board ancestor', () => {
    const { container } = renderCard()
    const card = container.querySelector('[data-overlay-card]') as HTMLElement
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) return new DOMRect(36, 56, 360, 280)
      return original.call(this)
    }
    try {
      const minimize = container.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
      fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
      expect(card.className).toMatch(/morphing/)
      expect(card.hasAttribute('data-overlay-dock')).toBe(false)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('skips an expand morph when the next box is empty or unchanged', () => {
    const original = HTMLElement.prototype.getBoundingClientRect
    const { container, instance } = renderDesk()
    act(() => {
      instance.actions.minimize(1)
    })
    let n = 0
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) {
        n += 1
        return n === 1 ? new DOMRect(0, -16, 80, 32) : new DOMRect(0, 0, 0, 0)
      }
      return original.call(this)
    }
    try {
      const tab = tagHandle(container)
      armCapture(tab)
      fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 40, clientY: 10 })
      fireEvent.pointerUp(tab, { pointerId: 1, clientX: 42, clientY: 11 })
      expect(container.querySelector('[data-overlay-card]')?.className).not.toMatch(/morphing/)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
    act(() => {
      instance.actions.minimize(1)
    })
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) return new DOMRect(36, 56, 360, 280)
      return original.call(this)
    }
    try {
      const tab = tagHandle(container)
      armCapture(tab)
      fireEvent.pointerDown(tab, { button: 0, pointerId: 2, clientX: 40, clientY: 10 })
      fireEvent.pointerUp(tab, { pointerId: 2, clientX: 42, clientY: 11 })
      expect(container.querySelector('[data-overlay-card]')?.className).not.toMatch(/morphing/)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('skips the morph when motion is reduced', () => {
    const { container, instance } = renderDesk()
    const card = container.querySelector('[data-overlay-card]') as HTMLElement
    const originalMatch = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false },
    })) as typeof window.matchMedia
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-card')) return new DOMRect(36, 56, 360, 280)
      return original.call(this)
    }
    try {
      const minimize = container.querySelector('[data-overlay-card-minimize]') as HTMLButtonElement
      fireEvent.pointerDown(minimize, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
      expect(card.className).not.toMatch(/morphing/)
      const tab = tagHandle(container)
      armCapture(tab)
      fireEvent.pointerDown(tab, { button: 0, pointerId: 2, clientX: 40, clientY: 10 })
      fireEvent.pointerUp(tab, { pointerId: 2, clientX: 42, clientY: 11 })
      expect(instance.getSnapshot().docks[1]).toBeUndefined()
      expect(card.className).not.toMatch(/morphing/)
    } finally {
      window.matchMedia = originalMatch
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('places a new card without stacking from a docked neighbor frame', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    instance.actions.setFrame(1, { x: 80, y: 90, width: 500, height: 400 })
    instance.actions.minimize(1)
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    expect(instance.getSnapshot().frames[2]).toEqual({
      x: DEFAULT_X, y: DEFAULT_Y, width: 520, height: 400,
    })
  })

  it('does not render a tag when a docked seat has no identity', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([defaultOverlayCardSpec()])
    instance.actions.minimize(1)
    const renderSlot = vi.fn(() => null)
    const roster = (
      (selector: (state: { cards: readonly OverlayCardSpec[] }) => unknown) => selector({
        cards: [defaultOverlayCardSpec()],
      })
    ) as OverlayDeskProps['useRoster']
    const useStore = ((selector: (state: ReturnType<typeof instance.getSnapshot>) => unknown) => {
      const snap = instance.getSnapshot()
      return selector({ ...snap, identities: {} })
    }) as OverlayDeskProps['useStore']
    const view = render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={useStore}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster}
        {...deskFace()}
      />,
    )
    expect(view.container.querySelector('[data-overlay-dock]')).toBeNull()
  })

  it('omits a docked seat that has no identity', () => {
    const handle = createOverlayDeskStore()
    const instance = handle.create()
    instance.actions.syncCards([
      defaultOverlayCardSpec(),
      { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
    ])
    instance.actions.minimize(1)
    instance.actions.minimize(2)
    const renderSlot = vi.fn(() => null)
    const roster = (
      (selector: (state: { cards: readonly OverlayCardSpec[] }) => unknown) => selector({
        cards: [
          defaultOverlayCardSpec(),
          { seat: 2, id: 'draft', title: '草稿', width: 520, height: 400 },
        ],
      })
    ) as OverlayDeskProps['useRoster']
    const useStore = ((selector: (state: ReturnType<typeof instance.getSnapshot>) => unknown) => {
      const snap = instance.getSnapshot()
      return selector({
        ...snap,
        identities: { 1: snap.identities[1] },
      })
    }) as OverlayDeskProps['useStore']
    const view = render(
      <OverlayDesk
        t={t as OverlayDeskProps['t']}
        useStore={useStore}
        actions={instance.actions as OverlayDeskProps['actions']}
        renderSlot={renderSlot as OverlayDeskProps['renderSlot']}
        useRoster={roster}
        {...deskFace()}
      />,
    )
    expect(view.container.querySelectorAll('[data-overlay-dock]')).toHaveLength(1)
    expect(view.getByLabelText('展开 卡片 1')).toBeTruthy()
  })
})
