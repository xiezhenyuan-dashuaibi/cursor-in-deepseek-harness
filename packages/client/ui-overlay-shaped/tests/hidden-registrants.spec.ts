import { describe, expect, it, vi } from 'vitest'
import { createHiddenRegistrantsSource } from '../src/client/hidden-registrants.ts'

describe('createHiddenRegistrantsSource', () => {
  it('stays empty until attach, then collects unique shaped hidden module names', async () => {
    const source = createHiddenRegistrantsSource()
    expect(source.getSnapshot()).toEqual([])
    const call = vi.fn(async (channel: string) => {
      if (channel === '/overlay-plugins-rail') {
        return {
          ok: true as const,
          value: {
            plugins: [
              { kind: 'fiber', hidden: true, moduleName: '@deepseek-ai/dsh-client-ui-lab-fiber' },
              { kind: 'shaped', hidden: false, moduleName: '@deepseek-ai/dsh-client-ui-notes' },
              { kind: 'shaped', hidden: true, moduleName: '' },
              { kind: 'shaped', hidden: true, moduleName: '@deepseek-ai/dsh-client-ui-sprite' },
              { kind: 'shaped', hidden: true, moduleName: '@deepseek-ai/dsh-client-ui-sprite' },
              null,
              { kind: 'shaped', hidden: true },
            ],
          },
        }
      }
      throw new Error('fallback must not run when rail succeeds')
    })
    let ticks = 0
    const stopListen = source.subscribe(() => { ticks += 1 })
    const stop = source.attach({ call })
    await vi.waitFor(() => {
      expect(source.getSnapshot()).toEqual(['@deepseek-ai/dsh-client-ui-sprite'])
    })
    expect(ticks).toBe(1)
    expect(source.getSnapshot()).toBe(source.getSnapshot())
    stopListen()
    stop()
    expect(call).toHaveBeenCalledWith('/overlay-plugins-rail', 'plugins.list', {})
  })

  it('falls back to /overlay-plugins and treats a failed list as visible', async () => {
    const source = createHiddenRegistrantsSource()
    const call = vi.fn(async (channel: string) => {
      if (channel === '/overlay-plugins-rail') {
        return { ok: false as const }
      }
      if (channel === '/overlay-plugins') {
        return { ok: true as const, value: { plugins: 'nope' } }
      }
      return { ok: false as const }
    })
    source.attach({ call })
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledWith('/overlay-plugins', 'plugins.list', {})
    })
    expect(source.getSnapshot()).toEqual([])
  })

  it('ignores a late response after dispose and a throwing rail call', async () => {
    const source = createHiddenRegistrantsSource()
    let settle: ((value: { ok: true; value: unknown }) => void) | undefined
    const call = vi.fn(async (channel: string) => {
      if (channel === '/overlay-plugins-rail') {
        return await new Promise<{ ok: true; value: unknown }>((resolve) => {
          settle = resolve
        })
      }
      return { ok: true as const, value: { plugins: [] } }
    })
    const stop = source.attach({ call })
    stop()
    settle?.({
      ok: true,
      value: {
        plugins: [{ kind: 'shaped', hidden: true, moduleName: '@deepseek-ai/dsh-client-ui-sprite' }],
      },
    })
    await Promise.resolve()
    expect(source.getSnapshot()).toEqual([])

    const throwing = createHiddenRegistrantsSource()
    throwing.attach({
      call: async () => {
        throw new Error('offline')
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(throwing.getSnapshot()).toEqual([])
  })

  it('repolls on the interval and skips non-object list payloads', async () => {
    vi.useFakeTimers()
    try {
      const source = createHiddenRegistrantsSource()
      const call = vi.fn(async () => ({ ok: true as const, value: null }))
      source.attach({ call })
      await vi.runOnlyPendingTimersAsync()
      expect(source.getSnapshot()).toEqual([])
      call.mockImplementation(async () => ({
        ok: true as const,
        value: {
          plugins: [
            [],
            { kind: 'shaped', hidden: true, moduleName: '@deepseek-ai/dsh-client-ui-sprite' },
          ],
        },
      }))
      await vi.advanceTimersByTimeAsync(400)
      const first = source.getSnapshot()
      expect(first).toEqual(['@deepseek-ai/dsh-client-ui-sprite'])
      await vi.advanceTimersByTimeAsync(400)
      expect(source.getSnapshot()).toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })
})
