import { describe, expect, it } from 'vitest'
import {
  clampOverlayBox,
  clampOverlayPosition,
  clampOverlaySize,
  clampSpriteBox,
  defaultOverlayBox,
  defaultOverlayPosition,
  defaultSpriteBox,
  overlayPanelSize,
  OVERLAY_PANEL_MAX_HEIGHT,
  OVERLAY_PANEL_MAX_WIDTH,
  OVERLAY_PANEL_MIN_HEIGHT,
  OVERLAY_PANEL_MIN_WIDTH,
  OVERLAY_SPRITE_MARGIN,
  OVERLAY_SPRITE_SIZE,
  resizeOverlayBox,
} from '../src/client/overlay-position.ts'

describe('overlayPanelSize', () => {
  it('uses the default maxima on a large viewport', () => {
    expect(overlayPanelSize(1920, 1080)).toEqual({
      width: OVERLAY_PANEL_MAX_WIDTH,
      height: OVERLAY_PANEL_MAX_HEIGHT,
    })
  })

  it('caps at the default maxima when the inset viewport is still larger', () => {
    expect(overlayPanelSize(800, 600)).toEqual({
      width: OVERLAY_PANEL_MAX_WIDTH,
      height: OVERLAY_PANEL_MAX_HEIGHT,
    })
  })

  it('fills a viewport smaller than the min size', () => {
    expect(overlayPanelSize(400, 300)).toEqual({ width: 400, height: 300 })
    expect(overlayPanelSize(10, 10)).toEqual({ width: 10, height: 10 })
  })
})

describe('clampOverlaySize', () => {
  it('rejects a size below the min on a large viewport', () => {
    expect(clampOverlaySize(100, 80, 1920, 1080)).toEqual({
      width: OVERLAY_PANEL_MIN_WIDTH,
      height: OVERLAY_PANEL_MIN_HEIGHT,
    })
  })

  it('rejects a size past the viewport', () => {
    expect(clampOverlaySize(2000, 1600, 800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('clampOverlayPosition', () => {
  it('keeps an in-bounds point and pins overflow to the viewport', () => {
    expect(clampOverlayPosition(80, 40, 200, 100, 800, 600)).toEqual({ left: 80, top: 40 })
    expect(clampOverlayPosition(-20, -10, 200, 100, 800, 600)).toEqual({ left: 0, top: 0 })
    expect(clampOverlayPosition(700, 550, 200, 100, 800, 600)).toEqual({ left: 600, top: 500 })
  })

  it('pins a panel larger than the viewport at the origin', () => {
    expect(clampOverlayPosition(40, 40, 900, 700, 400, 300)).toEqual({ left: 0, top: 0 })
  })
})

describe('clampOverlayBox', () => {
  it('clamps size then position', () => {
    expect(clampOverlayBox(
      { left: -20, top: -10, width: 100, height: 80 },
      1920,
      1080,
    )).toEqual({
      left: 0,
      top: 0,
      width: OVERLAY_PANEL_MIN_WIDTH,
      height: OVERLAY_PANEL_MIN_HEIGHT,
    })
  })
})

describe('defaultOverlayBox', () => {
  it('centers the default-size panel on a large viewport', () => {
    expect(defaultOverlayBox(1920, 1080)).toEqual({
      left: (1920 - OVERLAY_PANEL_MAX_WIDTH) / 2,
      top: (1080 - OVERLAY_PANEL_MAX_HEIGHT) / 2,
      width: OVERLAY_PANEL_MAX_WIDTH,
      height: OVERLAY_PANEL_MAX_HEIGHT,
    })
  })

  it('fills a viewport smaller than the panel maxima', () => {
    expect(defaultOverlayBox(100, 80)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 80,
    })
  })
})

describe('defaultOverlayPosition', () => {
  it('matches the default box origin', () => {
    const box = defaultOverlayBox(1920, 1080)
    expect(defaultOverlayPosition(1920, 1080)).toEqual({ left: box.left, top: box.top })
  })
})

describe('resizeOverlayBox', () => {
  const start = { left: 500, top: 180, width: 920, height: 720 }

  it('grows from the east and south edges', () => {
    expect(resizeOverlayBox('e', start, 80, 0, 1920, 1080)).toEqual({
      ...start,
      width: 1000,
    })
    expect(resizeOverlayBox('s', start, 0, 40, 1920, 1080)).toEqual({
      ...start,
      height: 760,
    })
  })

  it('keeps the opposite edge when resizing west or north', () => {
    expect(resizeOverlayBox('w', start, 40, 0, 1920, 1080)).toEqual({
      left: 540,
      top: 180,
      width: 880,
      height: 720,
    })
    expect(resizeOverlayBox('n', start, 0, 30, 1920, 1080)).toEqual({
      left: 500,
      top: 210,
      width: 920,
      height: 690,
    })
  })

  it('stops at the min width and min height', () => {
    expect(resizeOverlayBox('e', start, -2000, 0, 1920, 1080)).toEqual({
      left: 500,
      top: 180,
      width: OVERLAY_PANEL_MIN_WIDTH,
      height: 720,
    })
    expect(resizeOverlayBox('s', start, 0, -2000, 1920, 1080)).toEqual({
      left: 500,
      top: 180,
      width: 920,
      height: OVERLAY_PANEL_MIN_HEIGHT,
    })
    expect(resizeOverlayBox('w', start, 2000, 0, 1920, 1080)).toEqual({
      left: 500 + 920 - OVERLAY_PANEL_MIN_WIDTH,
      top: 180,
      width: OVERLAY_PANEL_MIN_WIDTH,
      height: 720,
    })
    expect(resizeOverlayBox('n', start, 0, 2000, 1920, 1080)).toEqual({
      left: 500,
      top: 180 + 720 - OVERLAY_PANEL_MIN_HEIGHT,
      width: 920,
      height: OVERLAY_PANEL_MIN_HEIGHT,
    })
  })

  it('stops at the viewport when growing', () => {
    expect(resizeOverlayBox('e', start, 5000, 0, 1920, 1080)).toEqual({
      left: 500,
      top: 180,
      width: 1920 - 500,
      height: 720,
    })
    expect(resizeOverlayBox('se', start, 5000, 5000, 1920, 1080)).toEqual({
      left: 500,
      top: 180,
      width: 1920 - 500,
      height: 1080 - 180,
    })
  })

  it('resizes a northeast and southwest corner', () => {
    expect(resizeOverlayBox('ne', start, 40, -30, 1920, 1080)).toEqual({
      left: 500,
      top: 150,
      width: 960,
      height: 750,
    })
    expect(resizeOverlayBox('sw', start, -40, 30, 1920, 1080)).toEqual({
      left: 460,
      top: 180,
      width: 960,
      height: 750,
    })
  })

  it('resizes a northwest corner without leaving the viewport', () => {
    expect(resizeOverlayBox('nw', start, -40, -30, 1920, 1080)).toEqual({
      left: 460,
      top: 150,
      width: 960,
      height: 750,
    })
    expect(resizeOverlayBox('nw', start, -1000, -1000, 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1420,
      height: 900,
    })
  })
})

describe('defaultSpriteBox / clampSpriteBox', () => {
  it('places the sprite at the bottom-right inset', () => {
    expect(defaultSpriteBox(1920, 1080)).toEqual({
      left: 1920 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN,
      top: 1080 - OVERLAY_SPRITE_SIZE - OVERLAY_SPRITE_MARGIN,
      width: OVERLAY_SPRITE_SIZE,
      height: OVERLAY_SPRITE_SIZE,
    })
  })

  it('keeps a dragged sprite on-screen at the fixed edge length', () => {
    expect(clampSpriteBox({
      left: -40,
      top: 2000,
      width: 200,
      height: 200,
    }, 1920, 1080)).toEqual({
      left: 0,
      top: 1080 - OVERLAY_SPRITE_SIZE,
      width: OVERLAY_SPRITE_SIZE,
      height: OVERLAY_SPRITE_SIZE,
    })
  })
})
