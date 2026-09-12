// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { axisSize, noticeOf, Page, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'
import { createTank } from '../src/client/tank.ts'

const t = makeTranslate(zh)

let rafQueue: FrameRequestCallback[] = []
let mediaMatches = false
const mediaListeners = new Set<(event: { matches: boolean }) => void>()

class FakeResizeObserver {
  static last: FakeResizeObserver | undefined
  disconnected = false

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this
  }

  observe(): void {}

  disconnect(): void {
    this.disconnected = true
  }

  fire(): void {
    this.callback([], this)
  }
}

function makeCtx(withTransform = true) {
  const gradient = { addColorStop: vi.fn() }
  const ctx: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
  }
  if (withTransform) {
    ctx.setTransform = vi.fn()
  }
  return ctx
}

function renderPage() {
  return render(<Page t={t as PageProps['t']} />)
}

beforeEach(() => {
  rafQueue = []
  mediaMatches = false
  mediaListeners.clear()
  FakeResizeObserver.last = undefined
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return mediaMatches
    },
    media: query,
    onchange: null,
    addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners.add(listener)
    },
    removeEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners.delete(listener)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }))
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
  HTMLCanvasElement.prototype.getContext = function getContext(id: string) {
    if (id !== '2d') {
      return null
    }
    return makeCtx() as unknown as CanvasRenderingContext2D
  }
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn()
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 450,
    right: 800,
    width: 800,
    height: 450,
    toJSON: () => ({}),
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 450,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientHeight')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'setPointerCapture')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'releasePointerCapture')
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'hasPointerCapture')
  vi.useRealTimers()
})

describe('Page', () => {
  it('shows the tank title and plaque clock', () => {
    const { getByRole, getByLabelText } = renderPage()
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
    expect(getByLabelText(zh.clockLabel).textContent).toBe('0:00')
  })

  it('feeds from the plaque and taps the glass', () => {
    const { getByRole, getByText } = renderPage()
    fireEvent.click(getByRole('button', { name: zh.feed }))
    expect(getByText(zh['notice.feed'])).toBeTruthy()
    fireEvent.click(getByRole('button', { name: zh.tap }))
    expect(getByText(zh['notice.tap'])).toBeTruthy()
  })

  it('toggles night lamp and restores daylight', () => {
    const { getByRole } = renderPage()
    const main = getByRole('main', { name: zh.title })
    expect(main.getAttribute('data-mood')).toBe('day')
    fireEvent.click(getByRole('button', { name: zh['mood.night'] }))
    expect(main.getAttribute('data-mood')).toBe('night')
    expect(getByRole('button', { name: zh['mood.day'] }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(getByRole('button', { name: zh['mood.day'] }))
    expect(main.getAttribute('data-mood')).toBe('day')
  })

  it('feeds and taps from the keyboard, and ignores keys on a button', () => {
    const { getByRole, getByText } = renderPage()
    const main = getByRole('main', { name: zh.title })
    fireEvent.keyDown(main, { key: 'f' })
    expect(getByText(zh['notice.feed'])).toBeTruthy()
    fireEvent.keyDown(main, { key: ' ' })
    fireEvent.keyDown(main, { key: 'g' })
    expect(getByText(zh['notice.tap'])).toBeTruthy()
    fireEvent.keyDown(main, { key: 'G' })
    fireEvent.keyDown(main, { key: 'F' })
    fireEvent.keyDown(getByRole('button', { name: zh.feed }), { key: 'f' })
    fireEvent.keyDown(main, { key: 'Escape' })
  })

  it('plays a click, a drag current, a double-tap, and a hover tag', () => {
    const { getByRole, container, queryByText, getByText } = renderPage()
    const canvas = container.querySelector('canvas')!
    const probe = createTank(800, 450)
    const fish = probe.fish[0]!
    fireEvent.pointerMove(canvas, { clientX: fish.x, clientY: fish.y, pointerId: 1 })
    expect(getByText(zh[`fish.${fish.id}` as keyof typeof zh])).toBeTruthy()
    fireEvent.pointerDown(canvas, { clientX: fish.x, clientY: fish.y, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: fish.x + 3, clientY: fish.y, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: fish.x, clientY: fish.y, pointerId: 1, detail: 1 })
    expect(getByRole('main', { name: zh.title }).textContent).toContain(zh['notice.pet'].split('{')[0])
    fireEvent.pointerDown(canvas, { clientX: probe.duck.x, clientY: probe.duck.y, pointerId: 4 })
    fireEvent.pointerUp(canvas, { clientX: probe.duck.x, clientY: probe.duck.y, pointerId: 4, detail: 1 })
    expect(getByText(zh['notice.duck'])).toBeTruthy()
    fireEvent.pointerDown(canvas, { clientX: probe.chest.x, clientY: probe.chest.y, pointerId: 5 })
    fireEvent.pointerUp(canvas, { clientX: probe.chest.x, clientY: probe.chest.y, pointerId: 5, detail: 1 })
    expect(getByText(zh['notice.chestOpen'])).toBeTruthy()
    fireEvent.pointerDown(canvas, { clientX: probe.chest.x, clientY: probe.chest.y, pointerId: 6 })
    fireEvent.pointerUp(canvas, { clientX: probe.chest.x, clientY: probe.chest.y, pointerId: 6, detail: 1 })
    expect(getByText(zh['notice.chestClose'])).toBeTruthy()
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 90, pointerId: 2 })
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 90, pointerId: 2, detail: 1 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 200, pointerId: 3, detail: 2 })
    fireEvent.doubleClick(canvas, { clientX: 200, clientY: 200 })
    expect(getByRole('main', { name: zh.title }).textContent).toContain(zh['notice.tap'])
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10 })
    fireEvent.pointerLeave(canvas)
    expect(queryByText(zh[`fish.${fish.id}` as keyof typeof zh])).toBeNull()
  })

  it('maps play results onto plaque copy', () => {
    expect(noticeOf({ kind: 'duck' })).toEqual({ key: 'notice.duck' })
    expect(noticeOf({ kind: 'paw' })).toEqual({ key: 'notice.paw' })
    expect(noticeOf({ kind: 'water' })).toEqual({ key: 'notice.feed' })
    expect(noticeOf({ kind: 'chest', chestOpen: true })).toEqual({ key: 'notice.chestOpen' })
    expect(noticeOf({ kind: 'chest', chestOpen: false })).toEqual({ key: 'notice.chestClose' })
    expect(noticeOf({ kind: 'fish' })).toEqual({ key: 'notice.pet', name: 'fish.moyu' })
    expect(noticeOf({ kind: 'fish', fishId: 'kafei' })).toEqual({ key: 'notice.pet', name: 'fish.kafei' })
  })

  it('resolves pointer axes when the rect or tank reports no size', () => {
    expect(axisSize(800, 960)).toBe(800)
    expect(axisSize(0, 960)).toBe(960)
    expect(axisSize(0, 0)).toBe(1)
  })

  it('steps the swimming loop and resizes the glass', () => {
    const now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { unmount } = renderPage()
    act(() => {
      rafQueue.at(-1)?.(16)
    })
    act(() => {
      rafQueue.at(-1)?.(400)
    })
    FakeResizeObserver.last?.fire()
    unmount()
    FakeResizeObserver.last?.fire()
    act(() => {
      rafQueue.at(-1)?.(800)
    })
  })

  it('ticks loaf time when motion is reduced', () => {
    mediaMatches = true
    vi.useFakeTimers()
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    const { getByRole, unmount } = renderPage()
    expect(getByRole('main', { name: zh.title }).getAttribute('data-reduced')).toBe('on')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByRole('main', { name: zh.title }).textContent).toContain('0:01')
    act(() => {
      for (const listener of mediaListeners) {
        listener({ matches: false })
      }
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  })

  it('falls back when canvas, matchMedia, and ResizeObserver are missing', () => {
    HTMLCanvasElement.prototype.getContext = () => null
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 })
    vi.stubGlobal('ResizeObserver', undefined)
    vi.stubGlobal('matchMedia', undefined)
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'setPointerCapture')
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'hasPointerCapture')
    const { unmount, container } = render(<Page t={t as PageProps['t']} />)
    const canvas = container.querySelector('canvas')
    if (canvas) {
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 40, pointerId: 8 })
      fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40, pointerId: 8, detail: 1 })
    }
    fireEvent(window, new Event('resize'))
    unmount()
  })

  it('uses fallback canvas metrics when the element reports no size', () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 100,
    })
    const small = renderPage()
    small.unmount()
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 0,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 0,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 0,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 0,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    })
    const { container } = renderPage()
    const canvas = container.querySelector('canvas')!
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 11 })
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 11, detail: 1 })
  })

  it('paints without setTransform and skips pointer capture release', () => {
    HTMLCanvasElement.prototype.getContext = function getContext(id: string) {
      if (id !== '2d') {
        return null
      }
      return makeCtx(false) as unknown as CanvasRenderingContext2D
    }
    HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false)
    const { container } = renderPage()
    const canvas = container.querySelector('canvas')!
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 40, pointerId: 9 })
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40, pointerId: 9, detail: 1 })
  })
})
