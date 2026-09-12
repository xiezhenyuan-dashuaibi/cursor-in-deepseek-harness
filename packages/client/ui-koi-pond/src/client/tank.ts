/** Koi-tank simulation for the overlay-desktop.body occupant. */

/** Goldfish, painted koi, or schooling tetra. */
export type Species = 'gold' | 'koi' | 'tetra'

/** Cabinet lighting for water color. */
export type MoodId = 'day' | 'night'

/** Stable fish identity used by locale copy. */
export type FishId =
  | 'zhoubao'
  | 'moyu'
  | 'kafei'
  | 'huiyi'
  | 'youjian'
  | 'rili'
  | 'xuqiu'

/** Two-dimensional tank coordinate in CSS pixels. */
export interface Vec2 {
  /** Horizontal position, origin left. */
  x: number
  /** Vertical position, origin top. */
  y: number
}

/** One swimming occupant. */
export interface Fish {
  /** Stable identity. */
  readonly id: FishId
  /** Body plan. */
  readonly species: Species
  /** Position. */
  x: number
  /** Position. */
  y: number
  /** Horizontal velocity in px/s. */
  vx: number
  /** Vertical velocity in px/s. */
  vy: number
  /** Heading in radians. */
  angle: number
  /** Tail-wag phase in radians. */
  phase: number
  /** Drawn size multiplier. */
  readonly scale: number
  /** Seconds of scatter remaining. */
  fear: number
  /** Seconds of cursor-follow remaining. */
  follow: number
}

/** Sinking flake. */
export interface Pellet {
  /** Position. */
  x: number
  /** Position. */
  y: number
  /** Downward speed in px/s. */
  vy: number
  /** Seconds until the flake dissolves. */
  life: number
}

/** Rising air bubble. */
export interface Bubble {
  /** Position. */
  x: number
  /** Position. */
  y: number
  /** Radius in px. */
  r: number
  /** Upward speed in px/s (stored positive). */
  vy: number
  /** Seconds until the bubble pops. */
  life: number
}

/** Expanding glass tap ring. */
export interface Ripple {
  /** Center. */
  x: number
  /** Center. */
  y: number
  /** Current radius. */
  r: number
  /** Seconds remaining. */
  life: number
}

/** Heart particle after a pet. */
export interface Heart {
  /** Position. */
  x: number
  /** Position. */
  y: number
  /** Seconds remaining. */
  life: number
}

/** Surface duck. */
export interface Duck {
  /** Position. */
  x: number
  /** Position. */
  y: number
  /** Bob phase in radians. */
  phase: number
  /** Seconds of startled bob remaining. */
  spook: number
}

/** Office-cat paw dipping from the rim. */
export interface Paw {
  /** Whether the paw is in the water. */
  active: boolean
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
  /** Seconds until a swipe startles the tank. */
  life: number
}

/** Gravel chest. */
export interface Chest {
  /** Lid raised. */
  open: boolean
  /** Position. */
  x: number
  /** Position. */
  y: number
}

/** Live tank. Mutated in place by the step and gesture helpers. */
export interface TankState {
  /** Inner glass width. */
  width: number
  /** Inner glass height. */
  height: number
  /** Water lighting. */
  mood: MoodId
  /** Seconds the occupant has been mounted. */
  elapsed: number
  /** Feed gestures. */
  fed: number
  /** Glass-tap gestures. */
  taps: number
  /** Pet gestures. */
  pets: number
  /** Duck-bob gestures. */
  duckBobs: number
  /** Swimmers. */
  fish: Fish[]
  /** Food. */
  pellets: Pellet[]
  /** Air. */
  bubbles: Bubble[]
  /** Tap rings. */
  ripples: Ripple[]
  /** Pet hearts. */
  hearts: Heart[]
  /** Rubber duck. */
  duck: Duck
  /** Treasure chest. */
  chest: Chest
  /** Cat paw. */
  paw: Paw
  /** Seconds since the last paw dip. */
  pawTimer: number
  /** Last tap point, if any. */
  lastTap: Vec2 | null
  /** Bubble stone on the gravel. */
  airstone: Vec2
  /** Deterministic unit interval. */
  rng: () => number
}

/** Pointer or keyboard cursor used while stepping. */
export interface StepInput {
  /** Cursor in tank space, or null when the pointer is outside. */
  cursor: Vec2 | null
}

/** Hit-test result for a tank-space point. */
export type TankHit =
  | { kind: 'fish'; fish: Fish }
  | { kind: 'duck' }
  | { kind: 'chest' }
  | { kind: 'paw' }
  | { kind: 'water' }

/** Counts shown on the plaque. */
export interface TankHud {
  /** Mounted seconds. */
  elapsed: number
  /** Feed gestures. */
  fed: number
  /** Glass-tap gestures. */
  taps: number
  /** Pet gestures. */
  pets: number
}

interface SpeciesSpec {
  scale: number
  speed: number
}

const SPECIES: Record<Species, SpeciesSpec> = {
  koi: { scale: 1.28, speed: 72 },
  gold: { scale: 1, speed: 96 },
  tetra: { scale: 0.52, speed: 148 },
}

const FISH_SEED: ReadonlyArray<{ id: FishId; species: Species }> = [
  { id: 'zhoubao', species: 'koi' },
  { id: 'moyu', species: 'koi' },
  { id: 'kafei', species: 'gold' },
  { id: 'huiyi', species: 'gold' },
  { id: 'youjian', species: 'tetra' },
  { id: 'rili', species: 'tetra' },
  { id: 'xuqiu', species: 'tetra' },
]

const MAX_PELLETS = 40
const MAX_BUBBLES = 64
const MAX_RIPPLES = 12
const MAX_HEARTS = 16

/**
 * Seeded unit-interval generator (Mulberry32).
 * @param seed - 32-bit integer seed.
 * @returns a function that yields values in `[0, 1)`.
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = state + 0x6D2B79F5 | 0
    let t = Math.imul(state ^ state >>> 15, 1 | state)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Waterline in tank space.
 * @param tank - live tank.
 * @returns y of the surface.
 */
export function surfaceY(tank: TankState): number {
  return tank.height * 0.12
}

/**
 * Gravel bed in tank space.
 * @param tank - live tank.
 * @returns y of the gravel top.
 */
export function gravelY(tank: TankState): number {
  return tank.height * 0.88
}

/**
 * Format loaf seconds as `m:ss`.
 * @param seconds - elapsed seconds; negative values clamp to zero.
 * @returns minutes and zero-padded seconds.
 */
export function formatLoaf(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Plaque counts from a tank.
 * @param tank - live tank.
 * @returns a plain snapshot for React state.
 */
export function snapshotHud(tank: TankState): TankHud {
  return {
    elapsed: tank.elapsed,
    fed: tank.fed,
    taps: tank.taps,
    pets: tank.pets,
  }
}

/**
 * Build a populated tank.
 * @param width - inner glass width in px.
 * @param height - inner glass height in px.
 * @param rng - unit interval; defaults to a fixed seed.
 * @returns a tank ready to step and paint.
 */
export function createTank(width: number, height: number, rng: () => number = mulberry32(20260911)): TankState {
  const tank: TankState = {
    width,
    height,
    mood: 'day',
    elapsed: 0,
    fed: 0,
    taps: 0,
    pets: 0,
    duckBobs: 0,
    fish: [],
    pellets: [],
    bubbles: [],
    ripples: [],
    hearts: [],
    duck: { x: width * 0.34, y: height * 0.12 + 18, phase: 0, spook: 0 },
    chest: { open: false, x: width * 0.78, y: height * 0.88 - 18 },
    paw: { active: false, x: width * 0.5, y: -24, life: 0 },
    pawTimer: 0,
    lastTap: null,
    airstone: { x: width * 0.18, y: height * 0.88 - 10 },
    rng,
  }
  tank.fish = FISH_SEED.map((seed, index) => spawnFish(tank, seed, index))
  return tank
}

/**
 * Scale occupants when the glass size changes.
 * @param tank - live tank.
 * @param width - new width.
 * @param height - new height.
 */
export function resizeTank(tank: TankState, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    return
  }
  if (tank.width > 0 && tank.height > 0) {
    const sx = width / tank.width
    const sy = height / tank.height
    for (const fish of tank.fish) {
      fish.x *= sx
      fish.y *= sy
    }
    for (const pellet of tank.pellets) {
      pellet.x *= sx
      pellet.y *= sy
    }
    for (const bubble of tank.bubbles) {
      bubble.x *= sx
      bubble.y *= sy
    }
    for (const ripple of tank.ripples) {
      ripple.x *= sx
      ripple.y *= sy
    }
    for (const heart of tank.hearts) {
      heart.x *= sx
      heart.y *= sy
    }
    tank.duck.x *= sx
    tank.duck.y *= sy
    tank.paw.x *= sx
    tank.paw.y *= sy
    if (tank.lastTap) {
      tank.lastTap = { x: tank.lastTap.x * sx, y: tank.lastTap.y * sy }
    }
  }
  tank.width = width
  tank.height = height
  tank.chest.x = width * 0.78
  tank.chest.y = gravelY(tank) - 18
  tank.airstone.x = width * 0.18
  tank.airstone.y = gravelY(tank) - 10
}

/**
 * Advance the tank by `dt` seconds.
 * @param tank - live tank.
 * @param dt - timestep; non-positive values are ignored.
 * @param input - pointer used for follow steering.
 */
export function stepTank(tank: TankState, dt: number, input: StepInput): void {
  if (dt <= 0) {
    return
  }
  tank.elapsed += dt
  stepPaw(tank, dt)
  stepPellets(tank, dt)
  stepBubbles(tank, dt)
  stepRipples(tank, dt)
  stepHearts(tank, dt)
  stepDuck(tank, dt)
  for (const fish of tank.fish) {
    stepFish(tank, fish, dt, input.cursor)
  }
  spawnAmbientBubbles(tank, dt)
}

/**
 * Drop flakes at a point.
 * @param tank - live tank.
 * @param x - tank-space x.
 * @param y - tank-space y.
 */
export function feedTank(tank: TankState, x: number, y: number): void {
  tank.fed += 1
  const n = 3
  for (let i = 0; i < n; i += 1) {
    tank.pellets.push({
      x: x + (tank.rng() - 0.5) * 28,
      y: Math.max(surfaceY(tank) + 8, y + (tank.rng() - 0.5) * 10),
      vy: 36 + tank.rng() * 28,
      life: 6 + tank.rng() * 3,
    })
  }
  cap(tank.pellets, MAX_PELLETS)
}

/**
 * Tap the glass: scatter fish and paint ripples.
 * @param tank - live tank.
 * @param x - tank-space x.
 * @param y - tank-space y.
 */
export function tapTank(tank: TankState, x: number, y: number): void {
  tank.taps += 1
  tank.lastTap = { x, y }
  for (const fish of tank.fish) {
    fish.fear = Math.max(fish.fear, 1.6)
  }
  tank.ripples.push({ x, y, r: 12, life: 0.9 })
  tank.ripples.push({ x, y, r: 4, life: 1.2 })
  cap(tank.ripples, MAX_RIPPLES)
}

/**
 * Mark a fish as petted: it follows the cursor and sheds a heart.
 * @param tank - live tank.
 * @param fish - occupant to pet.
 */
export function petFish(tank: TankState, fish: Fish): void {
  tank.pets += 1
  fish.follow = 3.2
  fish.fear = 0
  tank.hearts.push({ x: fish.x, y: fish.y - 10, life: 1.1 })
  cap(tank.hearts, MAX_HEARTS)
}

/**
 * Startle the duck.
 * @param tank - live tank.
 */
export function bobDuck(tank: TankState): void {
  tank.duckBobs += 1
  tank.duck.spook = 1.1
}

/**
 * Toggle the gravel chest lid.
 * @param tank - live tank.
 */
export function toggleChest(tank: TankState): void {
  tank.chest.open = !tank.chest.open
}

/**
 * Dismiss the cat paw without a swipe.
 * @param tank - live tank.
 */
export function shooPaw(tank: TankState): void {
  tank.paw.active = false
  tank.paw.life = 0
  tank.paw.y = -24
  tank.ripples.push({ x: tank.paw.x, y: surfaceY(tank) + 8, r: 8, life: 0.6 })
  cap(tank.ripples, MAX_RIPPLES)
}

/**
 * Push nearby fish along a drag vector.
 * @param tank - live tank.
 * @param from - previous pointer.
 * @param to - current pointer.
 */
export function applyCurrent(tank: TankState, from: Vec2, to: Vec2): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  for (const fish of tank.fish) {
    const range = 150
    const d = Math.hypot(fish.x - to.x, fish.y - to.y)
    if (d >= range) {
      continue
    }
    const weight = 1 - d / range
    fish.vx += dx * 8 * weight
    fish.vy += dy * 8 * weight
  }
}

/** Outcome of a click or keyboard play. */
export interface PlayResult {
  /** Hit kind. */
  kind: TankHit['kind']
  /** Fish id when a fish was petted. */
  fishId?: FishId
  /** Chest lid after a chest hit. */
  chestOpen?: boolean
}

/**
 * Apply a click at a tank-space point.
 * @param tank - live tank.
 * @param x - tank-space x.
 * @param y - tank-space y.
 * @returns which occupant responded.
 */
export function playHit(tank: TankState, x: number, y: number): PlayResult {
  const hit = hitTest(tank, x, y)
  switch (hit.kind) {
    case 'fish':
      petFish(tank, hit.fish)
      return { kind: 'fish', fishId: hit.fish.id }
    case 'duck':
      bobDuck(tank)
      return { kind: 'duck' }
    case 'chest':
      toggleChest(tank)
      return { kind: 'chest', chestOpen: tank.chest.open }
    case 'paw':
      shooPaw(tank)
      return { kind: 'paw' }
    case 'water':
      feedTank(tank, x, y)
      return { kind: 'water' }
    /* v8 ignore start -- TankHit is a closed union */
    default:
      throw new Error(`unexpected tank hit: ${JSON.stringify(hit)}`)
    /* v8 ignore stop */
  }
}

/**
 * Classify a tank-space point.
 * @param tank - live tank.
 * @param x - tank-space x.
 * @param y - tank-space y.
 * @returns the front-most occupant, or water.
 */
export function hitTest(tank: TankState, x: number, y: number): TankHit {
  if (tank.paw.active && Math.abs(x - tank.paw.x) < 36 && y < tank.paw.y + 52 && y > tank.paw.y - 10) {
    return { kind: 'paw' }
  }
  for (let i = tank.fish.length - 1; i >= 0; i -= 1) {
    const fish = tank.fish[i]
    /* v8 ignore next 3 -- reverse index is in range */
    if (fish === undefined) {
      continue
    }
    const radius = 22 * fish.scale
    if (Math.hypot(fish.x - x, fish.y - y) <= radius) {
      return { kind: 'fish', fish }
    }
  }
  if (Math.hypot(tank.duck.x - x, tank.duck.y - y) <= 28) {
    return { kind: 'duck' }
  }
  if (Math.abs(x - tank.chest.x) < 32 && Math.abs(y - tank.chest.y) < 26) {
    return { kind: 'chest' }
  }
  return { kind: 'water' }
}

function spawnFish(
  tank: TankState,
  seed: { id: FishId; species: Species },
  index: number,
): Fish {
  const spec = SPECIES[seed.species]
  const tetraPack = seed.species === 'tetra'
  const x = tetraPack
    ? tank.width * 0.46 + tank.rng() * 70
    : 70 + tank.rng() * Math.max(40, tank.width - 140)
  const y = tetraPack
    ? tank.height * 0.42 + index * 10
    : tank.height * 0.28 + tank.rng() * Math.max(40, tank.height * 0.42)
  return {
    id: seed.id,
    species: seed.species,
    x,
    y,
    vx: (tank.rng() - 0.5) * 40,
    vy: (tank.rng() - 0.5) * 16,
    angle: 0,
    phase: tank.rng() * Math.PI * 2,
    scale: spec.scale,
    fear: 0,
    follow: 0,
  }
}

function stepFish(tank: TankState, fish: Fish, dt: number, cursor: Vec2 | null): void {
  fish.phase += dt * 7
  fish.fear = Math.max(0, fish.fear - dt)
  fish.follow = Math.max(0, fish.follow - dt)
  let ax = 0
  let ay = 0
  if (fish.follow > 0 && cursor) {
    ax += (cursor.x - fish.x) * 2.2
    ay += (cursor.y - fish.y) * 2.2
  }
  const food = nearestPellet(tank, fish)
  if (food) {
    ax += (food.x - fish.x) * 1.8
    ay += (food.y - fish.y) * 1.8
  }
  if (fish.fear > 0 && tank.lastTap) {
    const dx = fish.x - tank.lastTap.x
    const dy = fish.y - tank.lastTap.y
    const d = Math.max(24, Math.hypot(dx, dy))
    ax += (dx / d) * 220
    ay += (dy / d) * 220
  }
  ax += Math.sin(fish.phase * 0.37 + hash(fish.id)) * 18
  ay += Math.cos(fish.phase * 0.29 + hash(fish.id) * 1.7) * 12
  if (fish.species === 'tetra') {
    const pack = tetraCentroid(tank, fish.id)
    if (pack) {
      ax += (pack.x - fish.x) * 0.4
      ay += (pack.y - fish.y) * 0.4
    }
  }
  const top = surfaceY(tank) + 36 * fish.scale
  const bottom = gravelY(tank) - 28 * fish.scale
  const left = 36 * fish.scale
  const right = tank.width - 36 * fish.scale
  if (fish.x < left) {
    ax += 90
  }
  if (fish.x > right) {
    ax -= 90
  }
  if (fish.y < top) {
    ay += 70
  }
  if (fish.y > bottom) {
    ay -= 70
  }
  fish.vx = fish.vx * 0.97 + ax * dt
  fish.vy = fish.vy * 0.97 + ay * dt
  const capSpeed = SPECIES[fish.species].speed
  const speed = Math.hypot(fish.vx, fish.vy)
  if (speed > capSpeed) {
    fish.vx *= capSpeed / speed
    fish.vy *= capSpeed / speed
  }
  fish.x += fish.vx * dt
  fish.y += fish.vy * dt
  const target = Math.atan2(fish.vy, fish.vx)
  fish.angle = lerpAngle(fish.angle, target, 0.18)
}

function stepPellets(tank: TankState, dt: number): void {
  const bed = gravelY(tank)
  for (let i = tank.pellets.length - 1; i >= 0; i -= 1) {
    const pellet = tank.pellets[i]
    /* v8 ignore next 3 -- reverse index is in range */
    if (pellet === undefined) {
      continue
    }
    pellet.vy += 48 * dt
    pellet.y += pellet.vy * dt
    pellet.life -= dt
    if (pellet.y > bed || pellet.life <= 0) {
      tank.pellets.splice(i, 1)
      continue
    }
    let eaten = false
    for (const fish of tank.fish) {
      if (Math.hypot(fish.x - pellet.x, fish.y - pellet.y) < 16 * fish.scale + 6) {
        eaten = true
        break
      }
    }
    if (eaten) {
      tank.pellets.splice(i, 1)
    }
  }
}

function stepBubbles(tank: TankState, dt: number): void {
  const top = surfaceY(tank) + 4
  for (let i = tank.bubbles.length - 1; i >= 0; i -= 1) {
    const bubble = tank.bubbles[i]
    /* v8 ignore next 3 -- reverse index is in range */
    if (bubble === undefined) {
      continue
    }
    bubble.y -= bubble.vy * dt
    bubble.x += Math.sin(tank.elapsed * 2 + bubble.r) * 8 * dt
    bubble.life -= dt
    if (bubble.y < top || bubble.life <= 0) {
      tank.bubbles.splice(i, 1)
    }
  }
}

function stepRipples(tank: TankState, dt: number): void {
  for (let i = tank.ripples.length - 1; i >= 0; i -= 1) {
    const ripple = tank.ripples[i]
    /* v8 ignore next 3 -- reverse index is in range */
    if (ripple === undefined) {
      continue
    }
    ripple.r += 90 * dt
    ripple.life -= dt
    if (ripple.life <= 0) {
      tank.ripples.splice(i, 1)
    }
  }
}

function stepHearts(tank: TankState, dt: number): void {
  for (let i = tank.hearts.length - 1; i >= 0; i -= 1) {
    const heart = tank.hearts[i]
    /* v8 ignore next 3 -- reverse index is in range */
    if (heart === undefined) {
      continue
    }
    heart.y -= 34 * dt
    heart.life -= dt
    if (heart.life <= 0) {
      tank.hearts.splice(i, 1)
    }
  }
}

function stepDuck(tank: TankState, dt: number): void {
  tank.duck.phase += dt * 2.1
  tank.duck.y = surfaceY(tank) + 16 + Math.sin(tank.duck.phase) * 3
  if (tank.duck.spook > 0) {
    tank.duck.spook = Math.max(0, tank.duck.spook - dt)
    tank.duck.y += Math.sin(tank.duck.spook * 26) * 9
    tank.duck.x += Math.sin(tank.duck.spook * 18) * 6 * dt * 20
  }
  tank.duck.x = clamp(tank.duck.x, 48, tank.width - 48)
}

function stepPaw(tank: TankState, dt: number): void {
  if (tank.paw.active) {
    tank.paw.y = Math.min(surfaceY(tank) + 28, tank.paw.y + 48 * dt)
    tank.paw.life -= dt
    if (tank.paw.life <= 0) {
      tapTank(tank, tank.paw.x, surfaceY(tank) + 36)
      tank.paw.active = false
      tank.paw.y = -24
    }
    return
  }
  tank.pawTimer += dt
  if (tank.pawTimer > 16) {
    tank.pawTimer = 0
    tank.paw.active = true
    tank.paw.life = 3.4
    tank.paw.x = 70 + tank.rng() * Math.max(40, tank.width - 140)
    tank.paw.y = -20
  }
}

function spawnAmbientBubbles(tank: TankState, dt: number): void {
  if (tank.rng() < dt * 3.2) {
    pushBubble(tank, tank.airstone.x + (tank.rng() - 0.5) * 14, tank.airstone.y)
  }
  if (tank.chest.open && tank.rng() < dt * 5) {
    pushBubble(tank, tank.chest.x + (tank.rng() - 0.5) * 18, tank.chest.y - 8)
  }
}

function pushBubble(tank: TankState, x: number, y: number): void {
  tank.bubbles.push({
    x,
    y,
    r: 2 + tank.rng() * 3.5,
    vy: 28 + tank.rng() * 24,
    life: 4 + tank.rng() * 3,
  })
  cap(tank.bubbles, MAX_BUBBLES)
}

function nearestPellet(tank: TankState, fish: Fish): Pellet | null {
  let best: Pellet | null = null
  let bestD = 280
  for (const pellet of tank.pellets) {
    const d = Math.hypot(fish.x - pellet.x, fish.y - pellet.y)
    if (d < bestD) {
      bestD = d
      best = pellet
    }
  }
  return best
}

function tetraCentroid(tank: TankState, self: FishId): Vec2 | null {
  let x = 0
  let y = 0
  let n = 0
  for (const other of tank.fish) {
    if (other.species !== 'tetra' || other.id === self) {
      continue
    }
    x += other.x
    y += other.y
    n += 1
  }
  if (n === 0) {
    return null
  }
  return { x: x / n, y: y / n }
}

/**
 * Interpolate headings across the ±π wrap.
 * @param current - current heading in radians.
 * @param target - desired heading in radians.
 * @param t - blend in `[0, 1]`.
 * @returns the blended heading.
 */
export function lerpAngle(current: number, target: number, t: number): number {
  let delta = target - current
  while (delta > Math.PI) {
    delta -= Math.PI * 2
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2
  }
  return current + delta * t
}

function hash(id: FishId): number {
  let n = 0
  for (let i = 0; i < id.length; i += 1) {
    n = (n * 33 + id.charCodeAt(i)) | 0
  }
  return n
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cap(items: unknown[], max: number): void {
  if (items.length > max) {
    items.splice(0, items.length - max)
  }
}
