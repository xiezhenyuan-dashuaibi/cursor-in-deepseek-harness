/** Canvas painter for the koi tank. */

import type { Fish, Species, TankState } from './tank.ts'
import { gravelY, surfaceY } from './tank.ts'

/** Drawing subset used by the tank painter. */
export interface TankBrush {
  /** Fill or gradient currently selected. */
  fillStyle: string | CanvasGradient
  /** Stroke or gradient currently selected. */
  strokeStyle: string | CanvasGradient
  /** Current alpha. */
  globalAlpha: number
  /** Stroke width. */
  lineWidth: number
  /**
   * Axis-aligned fill.
   * @param x - left.
   * @param y - top.
   * @param w - width.
   * @param h - height.
   */
  fillRect(x: number, y: number, w: number, h: number): void
  /** Start a subpath. */
  beginPath(): void
  /** Close the current subpath. */
  closePath(): void
  /**
   * Ellipse subpath.
   * @param x - center x.
   * @param y - center y.
   * @param rx - x radius.
   * @param ry - y radius.
   * @param rotation - axis rotation.
   * @param start - start angle.
   * @param end - end angle.
   */
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void
  /**
   * Arc subpath.
   * @param x - center x.
   * @param y - center y.
   * @param r - radius.
   * @param start - start angle.
   * @param end - end angle.
   */
  arc(x: number, y: number, r: number, start: number, end: number): void
  /**
   * Move the current point.
   * @param x - x.
   * @param y - y.
   */
  moveTo(x: number, y: number): void
  /**
   * Line to a point.
   * @param x - x.
   * @param y - y.
   */
  lineTo(x: number, y: number): void
  /**
   * Quadratic curve.
   * @param cpx - control x.
   * @param cpy - control y.
   * @param x - end x.
   * @param y - end y.
   */
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
  /** Fill the current path. */
  fill(): void
  /** Stroke the current path. */
  stroke(): void
  /** Push the transform and style stack. */
  save(): void
  /** Pop the transform and style stack. */
  restore(): void
  /**
   * Translate the origin.
   * @param x - x.
   * @param y - y.
   */
  translate(x: number, y: number): void
  /**
   * Rotate about the origin.
   * @param angle - radians.
   */
  rotate(angle: number): void
  /**
   * Linear gradient.
   * @param x0 - start x.
   * @param y0 - start y.
   * @param x1 - end x.
   * @param y1 - end y.
   * @returns a gradient to assign as a fill.
   */
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
  /**
   * Radial gradient.
   * @param x0 - inner x.
   * @param y0 - inner y.
   * @param r0 - inner radius.
   * @param x1 - outer x.
   * @param y1 - outer y.
   * @param r1 - outer radius.
   * @returns a gradient to assign as a fill.
   */
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient
}

/** Painter options. */
export interface PaintOptions {
  /** Freeze sway and caustic drift. */
  reducedMotion: boolean
}

interface Palette {
  top: string
  mid: string
  bed: string
  caustic: string
  gravel: string
  gravelDark: string
  plant: string
  plantDark: string
  glass: string
}

const DAY: Palette = {
  top: '#7ec8d4',
  mid: '#2a7d8c',
  bed: '#163d48',
  caustic: 'rgba(255, 255, 230, 0.14)',
  gravel: '#6a5340',
  gravelDark: '#3f3228',
  plant: '#1f6a4a',
  plantDark: '#0d3d2c',
  glass: 'rgba(255, 255, 255, 0.18)',
}

const NIGHT: Palette = {
  top: '#16324a',
  mid: '#0c2438',
  bed: '#07141f',
  caustic: 'rgba(180, 220, 255, 0.08)',
  gravel: '#3a2c24',
  gravelDark: '#1c1511',
  plant: '#1a4a38',
  plantDark: '#0a261c',
  glass: 'rgba(160, 200, 255, 0.1)',
}

const BODY: Record<Species, { fill: string; belly: string; accent: string }> = {
  koi: { fill: '#f4efe6', belly: '#fffaf2', accent: '#c4452b' },
  gold: { fill: '#e07a2f', belly: '#f3c07a', accent: '#b84a1a' },
  tetra: { fill: '#3aa0c8', belly: '#b8ecff', accent: '#d45c8c' },
}

const PLANT_AT = [0.07, 0.13, 0.2, 0.74, 0.86]

/**
 * Paint one frame of the tank into `ctx`.
 * @param ctx - 2D brush.
 * @param tank - live tank.
 * @param options - motion freeze.
 */
export function paintTank(ctx: TankBrush, tank: TankState, options: PaintOptions): void {
  const palette = tank.mood === 'night' ? NIGHT : DAY
  const time = options.reducedMotion ? 0 : tank.elapsed
  const w = tank.width
  const h = tank.height
  const water = ctx.createLinearGradient(0, 0, 0, h)
  water.addColorStop(0, palette.top)
  water.addColorStop(0.45, palette.mid)
  water.addColorStop(1, palette.bed)
  ctx.globalAlpha = 1
  ctx.fillStyle = water
  ctx.fillRect(0, 0, w, h)
  paintCaustics(ctx, tank, palette, time)
  paintGravel(ctx, tank, palette)
  paintPlants(ctx, tank, palette, time)
  paintChest(ctx, tank)
  paintAirstone(ctx, tank, palette)
  for (const pellet of tank.pellets) {
    paintPellet(ctx, pellet.x, pellet.y)
  }
  for (const fish of tank.fish) {
    paintFish(ctx, fish, time)
  }
  for (const bubble of tank.bubbles) {
    paintBubble(ctx, bubble.x, bubble.y, bubble.r)
  }
  paintDuck(ctx, tank)
  for (const heart of tank.hearts) {
    paintHeart(ctx, heart.x, heart.y, heart.life)
  }
  for (const ripple of tank.ripples) {
    paintRipple(ctx, ripple.x, ripple.y, ripple.r, ripple.life)
  }
  if (tank.paw.active) {
    paintPaw(ctx, tank)
  }
  paintSurface(ctx, tank, palette)
}

function paintCaustics(ctx: TankBrush, tank: TankState, palette: Palette, time: number): void {
  ctx.globalAlpha = 1
  ctx.strokeStyle = palette.caustic
  ctx.lineWidth = 10
  const rows = 6
  for (let i = 0; i < rows; i += 1) {
    ctx.beginPath()
    const y0 = surfaceY(tank) + 18 + i * (tank.height * 0.11)
    ctx.moveTo(0, y0)
    for (let x = 0; x <= tank.width; x += 28) {
      const y = y0 + Math.sin(x * 0.02 + time * 0.8 + i) * 10
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function paintGravel(ctx: TankBrush, tank: TankState, palette: Palette): void {
  const top = gravelY(tank)
  const bed = ctx.createLinearGradient(0, top, 0, tank.height)
  bed.addColorStop(0, palette.gravel)
  bed.addColorStop(1, palette.gravelDark)
  ctx.globalAlpha = 1
  ctx.fillStyle = bed
  ctx.fillRect(0, top, tank.width, tank.height - top)
  ctx.fillStyle = palette.gravelDark
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 97 + 13) % tank.width
    const y = top + 8 + (i * 13) % Math.max(8, tank.height - top - 10)
    ctx.beginPath()
    ctx.ellipse(x, y, 7 + (i % 4), 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintPlants(ctx: TankBrush, tank: TankState, palette: Palette, time: number): void {
  const bed = gravelY(tank)
  for (const [index, at] of PLANT_AT.entries()) {
    const x = tank.width * at
    ctx.save()
    ctx.strokeStyle = index % 2 === 0 ? palette.plant : palette.plantDark
    ctx.lineWidth = 6 - index % 3
    ctx.beginPath()
    ctx.moveTo(x, bed)
    const tip = bed - 90 - (index % 3) * 28
    const sway = Math.sin(time * 1.1 + index) * 18
    ctx.quadraticCurveTo(x + sway, (bed + tip) / 2, x + sway * 0.4, tip)
    ctx.stroke()
    ctx.restore()
  }
}

function paintChest(ctx: TankBrush, tank: TankState): void {
  const { x, y, open } = tank.chest
  ctx.globalAlpha = 1
  ctx.fillStyle = '#6b3f1f'
  ctx.fillRect(x - 26, y - 10, 52, 26)
  ctx.fillStyle = '#8a542b'
  ctx.fillRect(x - 26, y - 18, 52, 10)
  ctx.fillStyle = '#d4b45a'
  ctx.fillRect(x - 4, y - 4, 8, 10)
  if (open) {
    ctx.save()
    ctx.translate(x, y - 18)
    ctx.rotate(-0.7)
    ctx.fillStyle = '#8a542b'
    ctx.fillRect(-26, -8, 52, 10)
    ctx.restore()
    const gleam = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 24)
    gleam.addColorStop(0, 'rgba(255, 220, 120, 0.7)')
    gleam.addColorStop(1, 'rgba(255, 220, 120, 0)')
    ctx.fillStyle = gleam
    ctx.beginPath()
    ctx.arc(x, y - 6, 24, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintAirstone(ctx: TankBrush, tank: TankState, palette: Palette): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = palette.gravelDark
  ctx.beginPath()
  ctx.ellipse(tank.airstone.x, tank.airstone.y, 16, 7, 0, 0, Math.PI * 2)
  ctx.fill()
}

function paintPellet(ctx: TankBrush, x: number, y: number): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#d8a15a'
  ctx.beginPath()
  ctx.ellipse(x, y, 3.2, 2.2, 0, 0, Math.PI * 2)
  ctx.fill()
}

function paintFish(ctx: TankBrush, fish: Fish, time: number): void {
  const colors = BODY[fish.species]
  const size = 22 * fish.scale
  const wag = Math.sin(fish.phase + time) * 0.32
  ctx.save()
  ctx.translate(fish.x, fish.y)
  ctx.rotate(fish.angle)
  ctx.globalAlpha = 1
  ctx.fillStyle = colors.fill
  ctx.beginPath()
  ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors.belly
  ctx.beginPath()
  ctx.ellipse(size * 0.08, size * 0.12, size * 0.55, size * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors.fill
  ctx.beginPath()
  ctx.moveTo(-size * 0.72, 0)
  ctx.lineTo(-size * 1.32, -size * 0.42 + wag * size)
  ctx.lineTo(-size * 1.32, size * 0.42 + wag * size)
  ctx.closePath()
  ctx.fill()
  if (fish.species === 'koi') {
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.ellipse(size * 0.1, -size * 0.08, size * 0.28, size * 0.16, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  if (fish.species === 'tetra') {
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.18, size * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (fish.species === 'gold') {
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.moveTo(size * 0.05, -size * 0.4)
    ctx.lineTo(size * 0.28, -size * 0.72)
    ctx.lineTo(-size * 0.08, -size * 0.48)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#f7fbff'
  ctx.beginPath()
  ctx.arc(size * 0.52, -size * 0.08, size * 0.09, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1b2430'
  ctx.beginPath()
  ctx.arc(size * 0.55, -size * 0.08, size * 0.045, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintBubble(ctx: TankBrush, x: number, y: number, r: number): void {
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function paintDuck(ctx: TankBrush, tank: TankState): void {
  const { x, y } = tank.duck
  ctx.globalAlpha = 1
  ctx.fillStyle = '#f0c43a'
  ctx.beginPath()
  ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + 10, y - 10, 9, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e07a2f'
  ctx.beginPath()
  ctx.moveTo(x + 16, y - 10)
  ctx.lineTo(x + 28, y - 8)
  ctx.lineTo(x + 16, y - 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1b2430'
  ctx.beginPath()
  ctx.arc(x + 12, y - 12, 1.6, 0, Math.PI * 2)
  ctx.fill()
}

function paintHeart(ctx: TankBrush, x: number, y: number, life: number): void {
  ctx.globalAlpha = Math.max(0, Math.min(1, life))
  ctx.fillStyle = '#e85d7a'
  ctx.beginPath()
  ctx.arc(x - 4, y, 5, 0, Math.PI * 2)
  ctx.arc(x + 4, y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 9, y + 2)
  ctx.lineTo(x, y + 12)
  ctx.lineTo(x + 9, y + 2)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
}

function paintRipple(ctx: TankBrush, x: number, y: number, r: number, life: number): void {
  ctx.globalAlpha = Math.max(0, Math.min(0.45, life))
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function paintPaw(ctx: TankBrush, tank: TankState): void {
  const { x, y } = tank.paw
  ctx.globalAlpha = 1
  ctx.fillStyle = '#d8b48a'
  ctx.beginPath()
  ctx.ellipse(x, y + 18, 16, 22, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const dx of [-14, -5, 5, 14]) {
    ctx.beginPath()
    ctx.ellipse(x + dx, y + 2, 5, 8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#c48a6a'
  ctx.beginPath()
  ctx.ellipse(x, y + 22, 8, 6, 0, 0, Math.PI * 2)
  ctx.fill()
}

function paintSurface(ctx: TankBrush, tank: TankState, palette: Palette): void {
  const y = surfaceY(tank)
  ctx.globalAlpha = 1
  ctx.fillStyle = palette.glass
  ctx.fillRect(0, 0, tank.width, y)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(tank.width, y)
  ctx.stroke()
}
