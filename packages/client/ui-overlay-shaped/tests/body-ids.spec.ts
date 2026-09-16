import { describe, expect, it } from 'vitest'
import {
  createBodyIdsSource, type ShapedBodyOccupant, type ShapedBodySlotSource,
} from '../src/client/body-ids.ts'

function ledger(rows: readonly (Partial<ShapedBodyOccupant> | undefined)[]): {
  source: ShapedBodySlotSource
  notify: () => void
  setRows: (next: readonly (Partial<ShapedBodyOccupant> | undefined)[]) => void
} {
  let current = rows
  const listeners = new Set<() => void>()
  return {
    source: {
      entries: (key) => {
        expect(key).toBe('overlay-shaped.body')
        return current.map(row => ({
          registrant: row?.registrant,
          options: row === undefined ? {} : { id: row.id },
        }))
      },
      subscribe: (key, fn) => {
        expect(key).toBe('overlay-shaped.body')
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
    notify: () => {
      for (const listener of [...listeners]) listener()
    },
    setRows: (next) => {
      current = next
    },
  }
}

describe('createBodyIdsSource', () => {
  it('skips missing and empty ids and reuses the snapshot array', () => {
    const { source } = ledger([
      undefined,
      { id: '' },
      { id: 'flower-pot', registrant: '@deepseek-ai/dsh-client-ui-flower-pot' },
      { id: 'notes' },
    ])
    const ids = createBodyIdsSource(source)
    const first = ids.getSnapshot()
    expect(first).toEqual([
      { id: 'flower-pot', registrant: '@deepseek-ai/dsh-client-ui-flower-pot' },
      { id: 'notes', registrant: '' },
    ])
    expect(ids.getSnapshot()).toBe(first)
  })

  it('publishes a new array when membership, order, or registrant changes', () => {
    const bench = ledger([{ id: 'a', registrant: 'pkg-a' }])
    const ids = createBodyIdsSource(bench.source)
    const first = ids.getSnapshot()
    bench.setRows([{ id: 'a', registrant: 'pkg-a' }, { id: 'b', registrant: 'pkg-b' }])
    const second = ids.getSnapshot()
    expect(second).toEqual([
      { id: 'a', registrant: 'pkg-a' },
      { id: 'b', registrant: 'pkg-b' },
    ])
    expect(second).not.toBe(first)
    bench.setRows([{ id: 'b', registrant: 'pkg-b' }, { id: 'a', registrant: 'pkg-a' }])
    expect(ids.getSnapshot()).toEqual([
      { id: 'b', registrant: 'pkg-b' },
      { id: 'a', registrant: 'pkg-a' },
    ])
    bench.setRows([{ id: 'a', registrant: 'pkg-a2' }])
    expect(ids.getSnapshot()).toEqual([{ id: 'a', registrant: 'pkg-a2' }])
  })

  it('subscribes on overlay-shaped.body', () => {
    const bench = ledger([{ id: 'a' }])
    const ids = createBodyIdsSource(bench.source)
    let ticks = 0
    const stop = ids.subscribe(() => { ticks += 1 })
    bench.notify()
    expect(ticks).toBe(1)
    stop()
    bench.notify()
    expect(ticks).toBe(1)
  })
})
