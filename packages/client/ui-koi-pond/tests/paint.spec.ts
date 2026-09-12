import { describe, expect, it, vi } from 'vitest'
import { paintTank } from '../src/client/paint.ts'
import { createTank } from '../src/client/tank.ts'

function makeBrush() {
  const gradient = { addColorStop: vi.fn() }
  return {
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
    createLinearGradient: vi.fn(() => gradient as unknown as CanvasGradient),
    createRadialGradient: vi.fn(() => gradient as unknown as CanvasGradient),
  }
}

describe('koi tank painter', () => {
  it('paints day, night, motion, and every occupant', () => {
    const tank = createTank(640, 360, () => 0.4)
    tank.pellets.push({ x: 80, y: 80, vy: 1, life: 2 })
    tank.bubbles.push({ x: 90, y: 90, r: 3, vy: 1, life: 2 })
    tank.ripples.push({ x: 100, y: 100, r: 12, life: 0.4 })
    tank.ripples.push({ x: 110, y: 110, r: 8, life: 2 })
    tank.hearts.push({ x: 120, y: 120, life: 0.2 })
    tank.hearts.push({ x: 130, y: 130, life: 2 })
    tank.chest.open = true
    tank.paw.active = true
    tank.paw.x = 200
    tank.paw.y = 24
    tank.duck.spook = 0.4
    const day = makeBrush()
    paintTank(day, tank, { reducedMotion: false })
    expect(day.fillRect.mock.calls.length).toBeGreaterThan(0)
    expect(day.createRadialGradient.mock.calls.length).toBeGreaterThan(0)
    tank.mood = 'night'
    tank.chest.open = false
    tank.paw.active = false
    const night = makeBrush()
    paintTank(night, tank, { reducedMotion: true })
    expect(night.fillRect.mock.calls.length).toBeGreaterThan(0)
  })
})
