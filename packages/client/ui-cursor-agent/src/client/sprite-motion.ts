/** Idle swim and C-opening heading for the minimized overlay sprite. */

/** Connection chrome that changes idle speed; disconnected is still. */
export type SpriteIdleStatus = 'connecting' | 'live' | 'disconnected'

/** Horizontal/vertical drawing offset in SVG user units, plus C heading. */
export interface SpriteIdlePose {
  readonly x: number
  readonly y: number
  /** Degrees to rotate a right-opening C so its gap faces the back of travel. */
  readonly heading: number
}

/**
 * CSS/SVG degrees that turn a right-opening "C" so its gap faces opposite the
 * velocity (the back of travel). Screen y grows downward.
 *
 * @param vx - horizontal velocity; right is positive.
 * @param vy - vertical velocity; down is positive.
 * @returns heading in degrees, or `undefined` when the velocity is zero.
 */
export function headingToOpeningDegrees(vx: number, vy: number): number | undefined {
  if (vx === 0 && vy === 0) return undefined
  const degrees = Math.atan2(-vy, -vx) * (180 / Math.PI)
  if (degrees === -180) return 180
  return Object.is(degrees, -0) ? 0 : degrees
}

/**
 * Shortest-arc interpolation between two degree headings.
 *
 * @param from - current heading in degrees.
 * @param to - target heading in degrees.
 * @param t - mix in `[0, 1]`.
 * @returns interpolated heading in degrees.
 */
export function lerpDegrees(from: number, to: number, t: number): number {
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return from + delta * t
}

/**
 * Idle ellipse for the sprite drawing. Connecting is faster; disconnected is origin.
 *
 * @param elapsedMs - milliseconds since the idle loop started.
 * @param status - connection chrome.
 * @returns drawing offset and C heading.
 */
export function spriteIdlePose(elapsedMs: number, status: SpriteIdleStatus): SpriteIdlePose {
  if (status === 'disconnected') return { x: 0, y: 0, heading: 0 }
  const t = elapsedMs / 1000
  const omega = status === 'connecting' ? 1.85 : 1.05
  const ax = 2.4
  const ay = 1.8
  const x = ax * Math.sin(omega * t)
  const y = ay * Math.cos(omega * t * 0.9)
  const vx = ax * omega * Math.cos(omega * t)
  const vy = -(ay * omega * 0.9) * Math.sin(omega * t * 0.9)
  const heading = headingToOpeningDegrees(vx, vy)
  /* v8 ignore next -- the 0.9 frequency ratio keeps idle velocity off zero */
  if (heading === undefined) return { x, y, heading: 0 }
  return { x, y, heading }
}
