import { describe, expect, it } from 'vitest'
import {
  applyCurrent,
  bobDuck,
  createTank,
  feedTank,
  formatLoaf,
  gravelY,
  hitTest,
  lerpAngle,
  mulberry32,
  petFish,
  playHit,
  resizeTank,
  shooPaw,
  snapshotHud,
  stepTank,
  tapTank,
  toggleChest,
} from '../src/client/tank.ts'

function stillTank() {
  return createTank(800, 450, () => 0.5)
}

describe('koi tank simulation', () => {
  it('formats loaf time and snapshots the plaque', () => {
    expect(formatLoaf(-4)).toBe('0:00')
    expect(formatLoaf(65.9)).toBe('1:05')
    expect(lerpAngle(-Math.PI, Math.PI, 1)).toBeCloseTo(-Math.PI)
    expect(lerpAngle(Math.PI, -Math.PI, 1)).toBeCloseTo(Math.PI)
    const tank = stillTank()
    tank.fed = 2
    tank.taps = 3
    tank.pets = 4
    tank.elapsed = 9
    expect(snapshotHud(tank)).toEqual({ elapsed: 9, fed: 2, taps: 3, pets: 4 })
  })

  it('seeds a deterministic rng', () => {
    expect(mulberry32(7)()).toBe(mulberry32(7)())
    const tank = createTank(640, 360)
    expect(tank.fish).toHaveLength(7)
  })

  it('ignores a non-positive step and a non-positive resize', () => {
    const tank = stillTank()
    const elapsed = tank.elapsed
    stepTank(tank, 0, { cursor: null })
    stepTank(tank, -0.2, { cursor: null })
    expect(tank.elapsed).toBe(elapsed)
    resizeTank(tank, 0, 400)
    resizeTank(tank, 400, 0)
    expect(tank.width).toBe(800)
  })

  it('resizes occupants and skips scaling from a zero tank', () => {
    const tank = stillTank()
    tank.pellets.push({ x: 400, y: 200, vy: 1, life: 2 })
    tank.bubbles.push({ x: 400, y: 200, r: 2, vy: 1, life: 2 })
    tank.ripples.push({ x: 400, y: 200, r: 2, life: 2 })
    tank.hearts.push({ x: 400, y: 200, life: 2 })
    tank.lastTap = { x: 400, y: 200 }
    tank.paw.x = 400
    const fishX = tank.fish[0]!.x
    resizeTank(tank, 400, 225)
    expect(tank.fish[0]!.x).toBeCloseTo(fishX * 0.5)
    expect(tank.pellets[0]!.x).toBeCloseTo(200)
    tank.width = 0
    tank.height = 0
    resizeTank(tank, 200, 100)
    expect(tank.width).toBe(200)
    expect(tank.chest.x).toBeCloseTo(156)
  })

  it('feeds, eats, dissolves, and caps flakes', () => {
    const tank = stillTank()
    const fish = tank.fish[0]!
    feedTank(tank, 120, 80)
    expect(tank.fed).toBe(1)
    expect(tank.pellets.length).toBe(3)
    tank.pellets.push({ x: fish.x, y: fish.y, vy: 0, life: 2 })
    stepTank(tank, 0.016, { cursor: null })
    expect(tank.pellets.some(pellet => pellet.x === fish.x && pellet.y === fish.y)).toBe(false)
    tank.pellets = [{ x: 40, y: gravelY(tank) - 1, vy: 400, life: 8 }]
    stepTank(tank, 1, { cursor: null })
    expect(tank.pellets).toHaveLength(0)
    tank.pellets = [{ x: 40, y: 80, vy: 0, life: 0.01 }]
    stepTank(tank, 1, { cursor: null })
    expect(tank.pellets).toHaveLength(0)
    for (let i = 0; i < 20; i += 1) {
      feedTank(tank, 100, 90)
    }
    expect(tank.pellets.length).toBeLessThanOrEqual(40)
  })

  it('taps, pets, bobs, and plays every hit kind', () => {
    const tank = stillTank()
    tapTank(tank, 10, 10)
    expect(tank.taps).toBe(1)
    expect(tank.fish[0]!.fear).toBeGreaterThan(0)
    for (const [index, fish] of tank.fish.entries()) {
      fish.x = 70 + index * 80
      fish.y = 180
    }
    const fish = tank.fish[0]!
    expect(playHit(tank, fish.x, fish.y)).toEqual({ kind: 'fish', fishId: fish.id })
    expect(tank.pets).toBe(1)
    expect(playHit(tank, tank.duck.x, tank.duck.y)).toEqual({ kind: 'duck' })
    expect(tank.duckBobs).toBe(1)
    expect(playHit(tank, tank.chest.x, tank.chest.y)).toEqual({ kind: 'chest', chestOpen: true })
    expect(playHit(tank, tank.chest.x, tank.chest.y)).toEqual({ kind: 'chest', chestOpen: false })
    tank.paw.active = true
    tank.paw.x = 120
    tank.paw.y = 20
    expect(playHit(tank, 120, 24)).toEqual({ kind: 'paw' })
    expect(tank.paw.active).toBe(false)
    tank.fish.forEach((item) => {
      item.x = 10
      item.y = 10
    })
    tank.duck.x = 10
    tank.duck.y = 10
    tank.chest.x = 10
    tank.chest.y = 10
    expect(playHit(tank, 400, 220).kind).toBe('water')
  })

  it('steers from food, fear, follow, walls, and a current', () => {
    const tank = stillTank()
    const fish = tank.fish.find(item => item.species === 'koi')!
    const startX = fish.x
    tank.pellets = [{ x: fish.x + 120, y: fish.y, vy: 0, life: 4 }]
    stepTank(tank, 0.3, { cursor: null })
    expect(fish.x).not.toBe(startX)
    tapTank(tank, 0, fish.y)
    const afterTap = fish.x
    stepTank(tank, 0.3, { cursor: null })
    expect(fish.x).not.toBe(afterTap)
    petFish(tank, fish)
    const beforeFollow = fish.x
    stepTank(tank, 0.3, { cursor: { x: fish.x + 200, y: fish.y } })
    expect(fish.x).not.toBe(beforeFollow)
    fish.x = 0
    fish.vx = -80
    stepTank(tank, 0.2, { cursor: null })
    expect(fish.vx).toBeGreaterThan(-80)
    fish.x = tank.width
    fish.vx = 80
    stepTank(tank, 0.2, { cursor: null })
    expect(fish.vx).toBeLessThan(80)
    fish.y = 0
    fish.vy = -80
    stepTank(tank, 0.2, { cursor: null })
    expect(fish.vy).toBeGreaterThan(-80)
    fish.y = tank.height
    fish.vy = 80
    stepTank(tank, 0.2, { cursor: null })
    expect(fish.vy).toBeLessThan(80)
    fish.vx = 400
    fish.vy = 400
    stepTank(tank, 0.016, { cursor: null })
    expect(Math.hypot(fish.vx, fish.vy)).toBeLessThan(200)
    const vx = fish.vx
    applyCurrent(tank, { x: 10, y: 10 }, { x: 12, y: 12 })
    fish.x = 400
    fish.y = 200
    applyCurrent(tank, { x: 390, y: 200 }, { x: 430, y: 200 })
    expect(fish.vx).not.toBe(vx)
  })

  it('schools tetras and wraps heading across the pi boundary', () => {
    const tank = stillTank()
    const tetras = tank.fish.filter(item => item.species === 'tetra')
    expect(tetras.length).toBe(3)
    const loner = tetras[0]!
    tank.fish = tank.fish.filter(item => item.species !== 'tetra' || item.id === loner.id)
    stepTank(tank, 0.2, { cursor: null })
    loner.angle = Math.PI
    loner.vx = -40
    loner.vy = -8
    stepTank(tank, 0.05, { cursor: null })
    loner.angle = -Math.PI
    loner.vx = -40
    loner.vy = 8
    stepTank(tank, 0.05, { cursor: null })
    expect(Number.isFinite(loner.angle)).toBe(true)
  })

  it('expires bubbles, ripples, hearts, and a startled duck', () => {
    const tank = stillTank()
    tank.bubbles = [{ x: 40, y: 20, r: 2, vy: 80, life: 4 }]
    tank.ripples = [{ x: 40, y: 40, r: 4, life: 0.01 }]
    tank.hearts = [{ x: 40, y: 40, life: 0.01 }]
    tank.rng = () => 0.9
    stepTank(tank, 0.05, { cursor: null })
    expect(tank.ripples).toHaveLength(0)
    expect(tank.hearts).toHaveLength(0)
    expect(tank.bubbles).toHaveLength(0)
    tank.bubbles = [{ x: 40, y: 200, r: 2, vy: 1, life: 0.01 }]
    stepTank(tank, 0.05, { cursor: null })
    expect(tank.bubbles).toHaveLength(0)
    bobDuck(tank)
    tank.duck.x = -20
    stepTank(tank, 0.2, { cursor: null })
    expect(tank.duck.x).toBeGreaterThan(0)
    toggleChest(tank)
    expect(tank.chest.open).toBe(true)
    stepTank(tank, 0.3, { cursor: null })
    expect(tank.bubbles.length).toBeGreaterThan(0)
  })

  it('dips the cat paw, shoos it, and swipes when ignored', () => {
    const tank = stillTank()
    stepTank(tank, 17, { cursor: null })
    expect(tank.paw.active).toBe(true)
    const dipped = tank.paw.y
    stepTank(tank, 0.2, { cursor: null })
    expect(tank.paw.active).toBe(true)
    expect(tank.paw.y).toBeGreaterThan(dipped)
    expect(hitTest(tank, tank.paw.x, tank.paw.y + 10).kind).toBe('paw')
    const taps = tank.taps
    shooPaw(tank)
    expect(tank.paw.active).toBe(false)
    tank.paw.active = true
    tank.paw.life = 0.01
    tank.paw.x = 200
    stepTank(tank, 1, { cursor: null })
    expect(tank.paw.active).toBe(false)
    expect(tank.taps).toBeGreaterThan(taps)
  })
})
