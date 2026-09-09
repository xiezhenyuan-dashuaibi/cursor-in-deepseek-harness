import { describe, expect, it } from 'vitest'
import {
  applyResize,
  clampDockAlong,
  clampFrame,
  clampGrabOrigin,
  DEFAULT_CANVAS,
  dockFromFrame,
  dockTagBox,
  flipInvert,
  flipToward,
  grabMinX,
  isOverlayDock,
  isOverlayDockEdge,
  magnetDock,
  MIN_GRAB_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  nearestDockEdge,
  sameDock,
  tagFlipBox,
  tagRibbonAlong,
  TAG_ALONG_MAX,
  TAG_NOTCH,
  TAG_THICKNESS,
  TAG_TUCK,
  TITLE_BAR_HEIGHT,
  type OverlayCardFrame,
} from '../src/client/geometry.ts'

const start: OverlayCardFrame = { x: 40, y: 50, width: 400, height: 300 }
const canvas = DEFAULT_CANVAS

describe('clampGrabOrigin', () => {
  it('keeps a grab strip on the playable board, including a left hang', () => {
    expect(clampGrabOrigin(-8, 12, canvas, 400)).toEqual({ x: -8, y: 12 })
    expect(clampGrabOrigin(4, -3, canvas, 400)).toEqual({ x: 4, y: 0 })
    expect(clampGrabOrigin(-5000, 12, canvas, 400)).toEqual({
      x: grabMinX(400),
      y: 12,
    })
    expect(clampGrabOrigin(5000, 4000, canvas, 400)).toEqual({
      x: canvas.width - MIN_GRAB_WIDTH,
      y: canvas.height - TITLE_BAR_HEIGHT,
    })
  })
})

describe('clampFrame', () => {
  it('clamps origin and enforces minimum size', () => {
    expect(clampFrame({ x: 5000, y: 4000, width: 10, height: 10 }, canvas)).toEqual({
      x: canvas.width - MIN_GRAB_WIDTH,
      y: canvas.height - TITLE_BAR_HEIGHT,
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    })
    expect(clampFrame({ x: -5000, y: 12, width: 400, height: 300 }, canvas)).toEqual({
      x: grabMinX(400),
      y: 12,
      width: 400,
      height: 300,
    })
  })
})

describe('applyResize', () => {
  it('grows and shrinks from each edge and corner', () => {
    expect(applyResize(start, 'e', 80, 0, 40, 0).width).toBe(440)
    expect(applyResize(start, 's', 0, 90, 0, 50).height).toBe(340)
    const west = applyResize(start, 'w', 20, 0, 40, 0)
    expect(west).toEqual({ x: 20, y: 50, width: 420, height: 300 })
    const north = applyResize(start, 'n', 0, 20, 0, 50)
    expect(north).toEqual({ x: 40, y: 20, width: 400, height: 330 })
    expect(applyResize(start, 'se', 80, 90, 40, 50)).toEqual({
      x: 40, y: 50, width: 440, height: 340,
    })
    expect(applyResize(start, 'nw', 20, 20, 40, 50)).toEqual({
      x: 20, y: 20, width: 420, height: 330,
    })
    expect(applyResize(start, 'ne', 80, 20, 40, 50)).toEqual({
      x: 40, y: 20, width: 440, height: 330,
    })
    expect(applyResize(start, 'sw', 20, 90, 40, 50)).toEqual({
      x: 20, y: 50, width: 420, height: 340,
    })
  })

  it('pins min size on the moving edge', () => {
    const thin = applyResize(start, 'e', -200, 0, 40, 0)
    expect(thin.width).toBe(MIN_WIDTH)
    expect(thin.x).toBe(40)
    const west = applyResize(start, 'w', 300, 0, 40, 0)
    expect(west.width).toBe(MIN_WIDTH)
    expect(west.x).toBe(start.x + start.width - MIN_WIDTH)
    const short = applyResize(start, 's', 0, -200, 0, 50)
    expect(short.height).toBe(MIN_HEIGHT)
    const north = applyResize(start, 'n', 0, 400, 0, 50)
    expect(north.height).toBe(MIN_HEIGHT)
    expect(north.y).toBe(start.y + start.height - MIN_HEIGHT)
    const nw = applyResize(start, 'nw', 300, 400, 40, 50)
    expect(nw.width).toBe(MIN_WIDTH)
    expect(nw.height).toBe(MIN_HEIGHT)
    const ne = applyResize(start, 'ne', -200, 400, 40, 50)
    expect(ne.width).toBe(MIN_WIDTH)
    expect(ne.height).toBe(MIN_HEIGHT)
    const sw = applyResize(start, 'sw', 300, -200, 40, 50)
    expect(sw.width).toBe(MIN_WIDTH)
    expect(sw.height).toBe(MIN_HEIGHT)
  })

  it('pins origin on the top; west resize may hang past the left', () => {
    const west = applyResize({ x: 10, y: 10, width: 400, height: 300 }, 'w', -40, 0, 10, 0)
    expect(west.x).toBe(-40)
    expect(west.width).toBe(450)
    const clippedNorth = applyResize({ x: 10, y: 10, width: 400, height: 300 }, 'n', 0, -40, 0, 10)
    expect(clippedNorth.y).toBe(0)
    expect(clippedNorth.height).toBe(310)
    const east = applyResize(start, 'e', 5000, 0, 40, 0)
    expect(east.width).toBeGreaterThan(canvas.width)
    const south = applyResize(start, 's', 0, 5000, 0, 50)
    expect(south.height).toBeGreaterThan(canvas.height)
  })
})

describe('edge tag dock geometry', () => {
  it('accepts the four board edges and a persistable dock', () => {
    expect(isOverlayDockEdge('top')).toBe(true)
    expect(isOverlayDockEdge('right')).toBe(true)
    expect(isOverlayDockEdge('bottom')).toBe(true)
    expect(isOverlayDockEdge('left')).toBe(true)
    expect(isOverlayDockEdge('north')).toBe(false)
    expect(isOverlayDockEdge(1)).toBe(false)
    expect(isOverlayDock({ edge: 'left', along: 12 })).toBe(true)
    expect(isOverlayDock({ edge: 'north', along: 0 })).toBe(false)
    expect(isOverlayDock({ edge: 'top', along: Number.NaN })).toBe(false)
    expect(isOverlayDock(null)).toBe(false)
  })

  it('snaps to the nearest edge and prefers top on a diagonal tie', () => {
    expect(nearestDockEdge(640, 0, canvas)).toBe('top')
    expect(nearestDockEdge(640, 800, canvas)).toBe('bottom')
    expect(nearestDockEdge(0, 400, canvas)).toBe('left')
    expect(nearestDockEdge(1280, 400, canvas)).toBe('right')
    expect(nearestDockEdge(0, 0, canvas)).toBe('top')
  })

  it('magnets near an edge and leaves the inner board undocked', () => {
    expect(magnetDock(640, 400, canvas, 0, 0)).toBeUndefined()
    expect(magnetDock(10, 400, canvas, 0, 0)).toEqual({ edge: 'left', along: 400 })
    expect(magnetDock(40, 790, canvas, 8, 4)).toEqual({ edge: 'bottom', along: 32 })
    expect(magnetDock(40, 40, { width: 80, height: 80 }, 0, 0)).toBeUndefined()
    expect(magnetDock(4, 40, { width: 80, height: 80 }, 0, 0)).toEqual({ edge: 'left', along: 40 })
  })

  it('clamps along and builds a tag box on each edge', () => {
    expect(clampDockAlong('top', -8, canvas)).toBe(0)
    expect(clampDockAlong('top', 5000, canvas)).toBe(canvas.width - TAG_THICKNESS)
    expect(clampDockAlong('left', Number.NaN, canvas)).toBe(0)
    expect(dockTagBox({ edge: 'top', along: 40 }, canvas)).toEqual({
      x: 40, y: -TAG_TUCK, width: TAG_THICKNESS, height: TAG_ALONG_MAX,
    })
    expect(dockTagBox({ edge: 'top', along: 40 }, canvas, false)).toEqual({
      x: 40, y: 0, width: TAG_THICKNESS, height: TAG_ALONG_MAX,
    })
    expect(dockTagBox({ edge: 'bottom', along: 40 }, canvas)).toEqual({
      x: 40, y: canvas.height - TAG_ALONG_MAX + TAG_TUCK, width: TAG_THICKNESS, height: TAG_ALONG_MAX,
    })
    expect(dockTagBox({ edge: 'left', along: 40 }, canvas)).toEqual({
      x: -TAG_TUCK, y: 40, width: TAG_ALONG_MAX, height: TAG_THICKNESS,
    })
    expect(dockTagBox({ edge: 'right', along: 40 }, canvas)).toEqual({
      x: canvas.width - TAG_ALONG_MAX + TAG_TUCK, y: 40, width: TAG_ALONG_MAX, height: TAG_THICKNESS,
    })
    expect(sameDock({ edge: 'top', along: 1 }, { edge: 'top', along: 1 })).toBe(true)
    expect(sameDock({ edge: 'top', along: 1 }, { edge: 'left', along: 1 })).toBe(false)
  })

  it('inverts a last box over a first box for a shrink/expand morph', () => {
    expect(flipInvert(
      { left: 10, top: 20, width: 200, height: 100 },
      { left: 50, top: 40, width: 100, height: 50 },
    )).toEqual({ dx: -40, dy: -20, sx: 2, sy: 2 })
    expect(flipInvert(
      { left: 0, top: 0, width: 80, height: 32 },
      { left: 0, top: 0, width: 0, height: 0 },
    )).toEqual({ dx: 0, dy: 0, sx: 80, sy: 32 })
    expect(flipToward(
      { left: 10, top: 20, width: 200, height: 100 },
      { left: 50, top: 40, width: 100, height: 50 },
    )).toEqual({ dx: 40, dy: 20, sx: 0.5, sy: 0.5 })
    expect(tagFlipBox({ edge: 'top', along: 80 }, canvas, 4, 8)).toEqual({
      left: 84, top: 8 - TAG_TUCK, width: TAG_THICKNESS, height: TAG_ALONG_MAX,
    })
    expect(tagRibbonAlong(0)).toBe(TAG_ALONG_MAX)
    expect(tagRibbonAlong(Number.NaN)).toBe(TAG_ALONG_MAX)
    expect(tagRibbonAlong(20)).toBe(20 + TAG_TUCK + TAG_NOTCH)
    expect(tagRibbonAlong(400)).toBe(TAG_ALONG_MAX)
    expect(dockTagBox({ edge: 'top', along: 40 }, canvas, true, 48)).toEqual({
      x: 40, y: -TAG_TUCK, width: TAG_THICKNESS, height: 48,
    })
    expect(tagFlipBox({ edge: 'top', along: 80 }, canvas, 4, 8, 48)).toEqual({
      left: 84, top: 8 - TAG_TUCK, width: TAG_THICKNESS, height: 48,
    })
  })

  it('parks a collapsed card on the nearest edge to its title bar', () => {
    expect(dockFromFrame({ x: 36, y: 56, width: 360, height: 280 }, canvas).edge).toBe('top')
    expect(dockFromFrame({ x: 1100, y: 400, width: 360, height: 280 }, canvas).edge).toBe('right')
  })
})
