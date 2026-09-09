import { describe, expect, it, vi } from 'vitest'
import {
  OVERLAY_STACK_BASE_Z,
  OVERLAY_STACK_CURSOR_ID,
  OVERLAY_STACK_DESK_ID,
  OverlayStackController,
  overlayStackZIndex,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/overlay-stack.ts'

describe('overlay stack', () => {
  it('boots with the Cursor window in front of the card desk', () => {
    const stack = new OverlayStackController()
    const front = stack.source.getSnapshot().front
    expect(front).toEqual([OVERLAY_STACK_DESK_ID, OVERLAY_STACK_CURSOR_ID])
    expect(overlayStackZIndex(front, OVERLAY_STACK_DESK_ID)).toBe(OVERLAY_STACK_BASE_Z)
    expect(overlayStackZIndex(front, OVERLAY_STACK_CURSOR_ID)).toBe(OVERLAY_STACK_BASE_Z + 1)
    expect(overlayStackZIndex(front, 'unknown')).toBe(OVERLAY_STACK_BASE_Z)
  })

  it('raises an occupant to the front and keeps the snapshot until the order moves', () => {
    const stack = new OverlayStackController()
    const first = stack.source.getSnapshot()
    const listener = vi.fn()
    const off = stack.source.subscribe(listener)
    stack.raise(OVERLAY_STACK_CURSOR_ID)
    expect(stack.source.getSnapshot()).toBe(first)
    expect(listener).not.toHaveBeenCalled()
    stack.raise(OVERLAY_STACK_DESK_ID)
    const second = stack.source.getSnapshot()
    expect(second).not.toBe(first)
    expect(second.front.at(-1)).toBe(OVERLAY_STACK_DESK_ID)
    expect(overlayStackZIndex(second.front, OVERLAY_STACK_DESK_ID))
      .toBeGreaterThan(overlayStackZIndex(second.front, OVERLAY_STACK_CURSOR_ID))
    expect(listener).toHaveBeenCalledTimes(1)
    stack.raise('')
    expect(stack.source.getSnapshot()).toBe(second)
    off()
    stack.raise(OVERLAY_STACK_CURSOR_ID)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
