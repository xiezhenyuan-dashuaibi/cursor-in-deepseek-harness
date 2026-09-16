// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShapedOffsets, SHAPED_OFFSETS_STORAGE_KEY } from '../src/client/offset-storage.ts'
import { ShapedBoard, type ShapedBoardProps } from '../src/client/ShapedBoard.tsx'

const widthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const heightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const disconnect = vi.fn()
let fireResize: () => void = () => {}

beforeEach(() => {
  disconnect.mockReset()
  fireResize = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: ResizeObserverCallback) {
      fireResize = () => {
        cb([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
      }
    }
    observe(): void {}
    unobserve(): void {}
    disconnect = disconnect
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return (this as HTMLElement).hasAttribute('data-overlay-shaped') ? 800 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).hasAttribute('data-overlay-shaped') ? 600 : 0
    },
  })
})

afterEach(() => {
  cleanup()
  resetShapedOffsets()
  window.localStorage.removeItem(SHAPED_OFFSETS_STORAGE_KEY)
  vi.unstubAllGlobals()
  if (widthDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDesc)
  if (heightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDesc)
})

function hook(ids: readonly string[]): ShapedBoardProps['useBodyIds'] {
  return selector => selector(ids.map(id => ({ id, registrant: `@deepseek-ai/dsh-client-ui-${id}` })))
}

function hiddenHook(names: readonly string[] = []): ShapedBoardProps['useHiddenRegistrants'] {
  return selector => selector(names)
}

describe('ShapedBoard', () => {
  it('hosts no occupants and stays click-through when the body is empty', () => {
    const renderSlot = vi.fn(() => null)
    const view = render(
      <ShapedBoard
        renderSlot={renderSlot as ShapedBoardProps['renderSlot']}
        useBodyIds={hook([])}
        useHiddenRegistrants={hiddenHook()}
      />,
    )
    const board = view.container.querySelector('[data-overlay-shaped]')
    expect(board).toBeTruthy()
    expect(view.container.querySelector('[data-overlay-board]')).toBeTruthy()
    expect(board?.textContent).toBe('')
    expect(renderSlot).not.toHaveBeenCalled()
  })

  it('wraps each list id in a seat and renders only that occupant', () => {
    const renderSlot = vi.fn((name: string, _owner: unknown, opts?: { only?: string }) => (
      <button type="button">{name}:{opts?.only ?? ''}</button>
    ))
    const view = render(
      <ShapedBoard
        renderSlot={renderSlot as ShapedBoardProps['renderSlot']}
        useBodyIds={hook(['flower-pot', 'notes'])}
        useHiddenRegistrants={hiddenHook()}
      />,
    )
    expect(renderSlot).toHaveBeenCalledWith('overlay-shaped.body', {}, { only: 'flower-pot' })
    expect(renderSlot).toHaveBeenCalledWith('overlay-shaped.body', {}, { only: 'notes' })
    const pot = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const notes = view.container.querySelector('[data-overlay-shaped-seat="notes"]') as HTMLElement
    expect(pot.style.zIndex).toBe('1')
    expect(notes.style.zIndex).toBe('2')
    fireEvent.pointerDown(pot, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    expect(pot.style.zIndex).toBe('2')
    expect(notes.style.zIndex).toBe('1')
    fireEvent.pointerDown(notes, { button: 0, pointerId: 2, clientX: 0, clientY: 0 })
    expect(pot.style.zIndex).toBe('1')
    expect(notes.style.zIndex).toBe('2')
  })

  it('drops a raised id that is no longer registered', () => {
    const renderSlot = vi.fn(() => <button type="button">hit</button>)
    const view = render(
      <ShapedBoard
        renderSlot={renderSlot as ShapedBoardProps['renderSlot']}
        useBodyIds={hook(['flower-pot', 'notes'])}
        useHiddenRegistrants={hiddenHook()}
      />,
    )
    const pot = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    fireEvent.pointerDown(pot, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    view.rerender(
      <ShapedBoard
        renderSlot={renderSlot as ShapedBoardProps['renderSlot']}
        useBodyIds={hook(['notes'])}
        useHiddenRegistrants={hiddenHook()}
      />,
    )
    const notes = view.container.querySelector('[data-overlay-shaped-seat="notes"]') as HTMLElement
    expect(view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]')).toBeNull()
    expect(notes.style.zIndex).toBe('1')
    fireEvent.pointerDown(notes, { button: 0, pointerId: 2, clientX: 0, clientY: 0 })
    expect(notes.style.zIndex).toBe('1')
  })

  it('hides a matching registrant while keeping the occupant mounted', () => {
    const renderSlot = vi.fn(() => <button type="button">hit</button>)
    const view = render(
      <ShapedBoard
        renderSlot={renderSlot as ShapedBoardProps['renderSlot']}
        useBodyIds={hook(['flower-pot', 'notes'])}
        useHiddenRegistrants={hiddenHook(['@deepseek-ai/dsh-client-ui-flower-pot'])}
      />,
    )
    const pot = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const notes = view.container.querySelector('[data-overlay-shaped-seat="notes"]') as HTMLElement
    expect(pot.hasAttribute('data-overlay-shaped-hidden')).toBe(true)
    expect(notes.hasAttribute('data-overlay-shaped-hidden')).toBe(false)
    expect(pot.querySelector('button')?.textContent).toBe('hit')
    fireEvent.pointerDown(pot, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    expect(pot.style.zIndex).toBe('1')
    expect(notes.style.zIndex).toBe('2')
  })

  it('disconnects the board ResizeObserver on unmount', () => {
    const view = render(
      <ShapedBoard
        renderSlot={vi.fn(() => null) as ShapedBoardProps['renderSlot']}
        useBodyIds={hook([])}
        useHiddenRegistrants={hiddenHook()}
      />,
    )
    const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
    Object.defineProperty(board, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(board, 'clientHeight', { configurable: true, value: 600 })
    // Same client size after the layout measure keeps the canvas object.
    act(() => {
      fireResize()
      fireResize()
    })
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
