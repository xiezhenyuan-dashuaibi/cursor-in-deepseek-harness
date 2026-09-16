// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAPED_CLICK_SLOP, type ShapedCanvasSize } from '../src/client/geometry.ts'
import {
  readShapedOffset, resetShapedOffsets, SHAPED_OFFSETS_STORAGE_KEY, writeShapedOffset,
} from '../src/client/offset-storage.ts'
import { ShapedSeat } from '../src/client/ShapedSeat.tsx'

const resizeFires: Array<() => void> = []
const disconnect = vi.fn()

beforeEach(() => {
  resizeFires.length = 0
  disconnect.mockReset()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly cb: ResizeObserverCallback) {
      resizeFires.push(() => {
        this.cb([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
      })
    }
    observe(): void {}
    unobserve(): void {}
    disconnect = disconnect
  })
})

afterEach(() => {
  cleanup()
  resetShapedOffsets()
  window.localStorage.removeItem(SHAPED_OFFSETS_STORAGE_KEY)
  vi.unstubAllGlobals()
})

const CANVAS: ShapedCanvasSize = { width: 800, height: 600 }
const REST = { x: 40, y: 50, width: 120, height: 80 }

function seat(id = 'flower-pot', onRaise = vi.fn(), canvas = CANVAS) {
  const view = render(
    <div data-overlay-shaped="">
      <ShapedSeat id={id} canvas={canvas} zIndex={3} onRaise={onRaise}>
        <button type="button">hit</button>
      </ShapedSeat>
    </div>,
  )
  const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
  const el = view.container.querySelector(`[data-overlay-shaped-seat="${id}"]`) as HTMLElement
  const hit = el.querySelector('button') as HTMLElement
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  stubBox(board, { left: 0, top: 0, width: canvas.width, height: canvas.height })
  stubMovingBox(hit, el, REST)
  return { ...view, el, onRaise }
}

describe('ShapedSeat', () => {
  it('hydrates a stored offset and raises on primary pointer down', () => {
    writeShapedOffset('flower-pot', { x: 5, y: 7 })
    const { el, onRaise } = seat()
    expect(el.style.transform).toBe('translate(5px, 7px)')
    expect(el.style.zIndex).toBe('3')
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(onRaise).toHaveBeenCalledWith('flower-pot')
    expect(el.setPointerCapture).not.toHaveBeenCalled()
  })

  it('ignores a non-primary button', () => {
    const { el, onRaise } = seat()
    fireEvent.pointerDown(el, { button: 2, pointerId: 1, clientX: 10, clientY: 10 })
    expect(onRaise).not.toHaveBeenCalled()
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 80, clientY: 80 })
    expect(el.style.transform).toBe('translate(0px, 0px)')
  })

  it('keeps travel inside the click slop as a click', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: SHAPED_CLICK_SLOP, clientY: 0 })
    expect(el.style.transform).toBe('translate(0px, 0px)')
    expect(el.setPointerCapture).not.toHaveBeenCalled()
    fireEvent.pointerUp(el, { pointerId: 1, clientX: SHAPED_CLICK_SLOP, clientY: 0 })
    expect(el.releasePointerCapture).not.toHaveBeenCalled()
    expect(readShapedOffset('flower-pot')).toEqual({ x: 0, y: 0 })
  })

  it('captures the pointer only after travel leaves the click slop', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: SHAPED_CLICK_SLOP, clientY: 0 })
    expect(el.setPointerCapture).not.toHaveBeenCalled()
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 0 })
    expect(el.setPointerCapture).toHaveBeenCalledWith(1)
    expect(el.style.transform).toBe('translate(20px, 0px)')
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 24, clientY: 0 })
    expect(el.setPointerCapture).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toBe('translate(24px, 0px)')
  })

  it('lets a child button click through when travel stays in slop', () => {
    const onPick = vi.fn()
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          <button type="button" onClick={onPick}>hit</button>
        </ShapedSeat>
      </div>,
    )
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const hit = el.querySelector('button') as HTMLElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(hit, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.click(hit)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(el.setPointerCapture).not.toHaveBeenCalled()
  })

  it('swallows a trailing click after a drag and then allows the next click', () => {
    const onPick = vi.fn()
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          <button type="button" onClick={onPick}>hit</button>
        </ShapedSeat>
      </div>,
    )
    const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const hit = el.querySelector('button') as HTMLElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    stubBox(board, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
    stubMovingBox(hit, el, REST)
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.click(hit)
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(hit)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('translates past the slop and persists on release', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 10 })
    expect(el.style.transform).toBe('translate(20px, 10px)')
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 20, clientY: 10 })
    expect(readShapedOffset('flower-pot')).toEqual({ x: 20, y: 10 })
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('does not translate without a primary down', () => {
    const { el } = seat()
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 40 })
    expect(el.style.transform).toBe('translate(0px, 0px)')
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 40, clientY: 40 })
    expect(readShapedOffset('flower-pot')).toEqual({ x: 0, y: 0 })
  })

  it('ignores a move from another pointer and still persists on cancel', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 7, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 8, clientX: 40, clientY: 40 })
    expect(el.style.transform).toBe('translate(0px, 0px)')
    fireEvent.pointerUp(el, { pointerId: 8, clientX: 40, clientY: 40 })
    fireEvent.pointerMove(el, { pointerId: 7, clientX: 15, clientY: 0 })
    fireEvent.pointerCancel(el, { pointerId: 7, clientX: 15, clientY: 0 })
    expect(readShapedOffset('flower-pot')).toEqual({ x: 15, y: 0 })
  })

  it('starts a drag when setPointerCapture throws', () => {
    const { el } = seat()
    el.setPointerCapture = vi.fn(() => {
      throw new Error('no capture')
    })
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 12, clientY: 0 })
    expect(el.style.transform).toBe('translate(12px, 0px)')
  })

  it('swallows releasePointerCapture when it throws', () => {
    const { el } = seat()
    el.releasePointerCapture = vi.fn(() => {
      throw new Error('already released')
    })
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 20, clientY: 0 })
    expect(readShapedOffset('flower-pot')).toEqual({ x: 20, y: 0 })
  })

  it('keeps children mounted when hidden and skips drag', () => {
    const onRaise = vi.fn()
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={onRaise} hidden>
          <button type="button">hit</button>
        </ShapedSeat>
      </div>,
    )
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    expect(el.hasAttribute('data-overlay-shaped-hidden')).toBe(true)
    expect(el.querySelector('button')?.textContent).toBe('hit')
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0 })
    expect(onRaise).not.toHaveBeenCalled()
    expect(el.style.transform).toBe('translate(0px, 0px)')
  })

  it('clamps a drag so the occupant box stays on the playable board', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -5000, clientY: -4000 })
    expect(el.style.transform).toBe('translate(-40px, -50px)')
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 5000, clientY: 4000 })
    expect(el.style.transform).toBe('translate(640px, 470px)')
    expect(readShapedOffset('flower-pot')).toEqual({ x: 640, y: 470 })
  })

  it('reclamps a stored offset when the playable board shrinks', () => {
    const REST = { x: 40, y: 50, width: 120, height: 80 }
    writeShapedOffset('flower-pot', { x: 640, y: 470 })
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          <button type="button">hit</button>
        </ShapedSeat>
      </div>,
    )
    const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const hit = el.querySelector('button') as HTMLElement
    stubBox(board, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
    stubMovingBox(hit, el, REST)
    view.rerender(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={{ width: 200, height: 150 }} zIndex={3} onRaise={vi.fn()}>
          <button type="button">hit</button>
        </ShapedSeat>
      </div>,
    )
    expect(el.style.transform).toBe('translate(40px, 20px)')
    expect(readShapedOffset('flower-pot')).toEqual({ x: 40, y: 20 })
  })

  it('skips a content resize reclamp while a pointer is down', () => {
    const { el } = seat()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    for (const fire of resizeFires) fire()
    expect(el.style.transform).toBe('translate(0px, 0px)')
    expect(readShapedOffset('flower-pot')).toEqual({ x: 0, y: 0 })
  })

  it('disconnects the occupant ResizeObserver on unmount', () => {
    const { unmount } = seat()
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('skips clamp when the occupant paints no element', () => {
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          {null}
        </ShapedSeat>
      </div>,
    )
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0 })
    expect(el.style.transform).toBe('translate(40px, 0px)')
  })

  it('clamps using the occupant box inside a display:contents slot anchor', () => {
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          <div data-slot="overlay-shaped.body" style={{ display: 'contents' }}>
            <button type="button">hit</button>
          </div>
        </ShapedSeat>
      </div>,
    )
    const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const wrap = el.querySelector('[data-slot]') as HTMLElement
    const hit = el.querySelector('button') as HTMLElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    stubBox(board, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
    stubBox(wrap, { left: 0, top: 0, width: 0, height: 0 })
    stubMovingBox(hit, el, REST)
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -5000, clientY: -4000 })
    expect(el.style.transform).toBe('translate(-40px, -50px)')
  })

  it('walks into a zero-size wrapper that still has occupant children', () => {
    const view = render(
      <div data-overlay-shaped="">
        <ShapedSeat id="flower-pot" canvas={CANVAS} zIndex={3} onRaise={vi.fn()}>
          <div>
            <button type="button">hit</button>
          </div>
        </ShapedSeat>
      </div>,
    )
    const board = view.container.querySelector('[data-overlay-shaped]') as HTMLElement
    const el = view.container.querySelector('[data-overlay-shaped-seat="flower-pot"]') as HTMLElement
    const wrap = el.firstElementChild as HTMLElement
    const hit = el.querySelector('button') as HTMLElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    stubBox(board, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
    stubBox(wrap, { left: 0, top: 0, width: 0, height: 0 })
    stubMovingBox(hit, el, REST)
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -5000, clientY: -4000 })
    expect(el.style.transform).toBe('translate(-40px, -50px)')
  })
})

function stubBox(
  el: HTMLElement,
  box: { left: number; top: number; width: number; height: number },
): void {
  el.getBoundingClientRect = () => ({
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    toJSON: () => ({}),
  })
}

function stubMovingBox(
  content: HTMLElement,
  seat: HTMLElement,
  rest: { x: number; y: number; width: number; height: number },
): void {
  content.getBoundingClientRect = () => {
    const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(seat.style.transform)
    const x = rest.x + (match === null ? 0 : Number(match[1]))
    const y = rest.y + (match === null ? 0 : Number(match[2]))
    return {
      x,
      y,
      left: x,
      top: y,
      right: x + rest.width,
      bottom: y + rest.height,
      width: rest.width,
      height: rest.height,
      toJSON: () => ({}),
    }
  }
}
