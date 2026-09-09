// @vitest-environment jsdom
/**
 * Browser half: graph frames add and remove loader entries; kernel names
 * stay mounted; rebuilt of an unknown id stays a warning.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { ClientModuleLoader } from '@deepseek-ai/dsh-client-modules/client'
import { apply, inject } from '../src/client/index.ts'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly url: string
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener)
  }

  close(): void {
    FakeEventSource.instances = FakeEventSource.instances.filter(source => source !== this)
  }

  emit(data: string): void {
    this.listeners.get('message')?.({ data } as MessageEvent<string>)
  }
}

interface FakeEntry {
  id: string
  options: { name: string }
  fiber: { runtime: null; inertia: undefined; await: () => Promise<void> }
  ctx: { registry: { delete: () => void } }
  refresh: () => Promise<void>
}

const KERNEL = [
  '@deepseek-ai/dsh-client-modules',
  '@deepseek-ai/dsh-client-hmr',
  '@deepseek-ai/dsh-client-app-shell',
] as const

function graphRow(id: string): { id: string; url: string; rev: string } {
  return { id, url: `/plugins/${id}/client.js?rev=1`, rev: '1' }
}

function graphOf(ids: string[]): { rev: string; entries: ReturnType<typeof graphRow>[] } {
  return { rev: 'g', entries: ids.map(graphRow) }
}

function fakeLoader(initial: readonly string[]): {
  loader: Loader
  created: string[]
  removed: string[]
} {
  const created: string[] = []
  const removed: string[] = []
  const store = new Map<string, FakeEntry>()
  const put = (packageName: string): FakeEntry => {
    const id = `tree-${packageName}`
    const entry: FakeEntry = {
      id,
      options: { name: packageName },
      fiber: { runtime: null, inertia: undefined, await: async () => {} },
      ctx: { registry: { delete() {} } },
      refresh: async () => {},
    }
    store.set(id, entry)
    return entry
  }
  for (const name of initial) put(name)
  const loader: Pick<Loader, 'entries' | 'create' | 'remove' | 'resolve'> = {
    *entries() {
      yield* store.values() as Iterable<Entry>
    },
    async create(options) {
      created.push(options.name)
      return put(options.name).id
    },
    async remove(id) {
      const entry = store.get(id)
      if (entry !== undefined) {
        removed.push(entry.options.name)
        store.delete(id)
      }
    },
    resolve(id) {
      const entry = store.get(id)
      if (entry === undefined) throw new Error(`missing ${id}`)
      return entry as unknown as Entry
    },
  }
  return { loader: loader as Loader, created, removed }
}

function fakeModules(): ClientModuleLoader & { adopted: string[]; dropped: string[] } {
  const adopted: string[] = []
  const dropped: string[] = []
  return {
    version: 'client',
    loadCache: new Map(),
    adopted,
    dropped,
    async import() { return {} },
    registerStatic() {},
    async prefetch() {},
    invalidate() {},
    adoptRow(row) { adopted.push(row.id) },
    dropRow(id) { dropped.push(id) },
  }
}

let ctx: Context | undefined

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  vi.unstubAllGlobals()
})

async function mount(loader: Loader, modules: ClientModuleLoader): Promise<FakeEventSource> {
  ctx = new Context()
  ctx.provide('loader', loader)
  ctx.provide('modules', modules)
  await ctx.plugin({ inject: [...inject], apply })
  const source = FakeEventSource.instances[0]
  if (source === undefined) throw new Error('expected EventSource')
  return source
}

describe('client-hmr browser graph frames', () => {
  it('creates a loader entry for a new host graph row and removes one that left', async () => {
    const { loader, created, removed } = fakeLoader(KERNEL)
    const modules = fakeModules()
    const source = await mount(loader, modules)
    source.emit(JSON.stringify({ type: 'graph', graph: graphOf([...KERNEL, 'late']) }))
    await vi.waitFor(() => { expect(created).toEqual(['late']) })
    expect(modules.adopted).toContain('late')

    source.emit(JSON.stringify({ type: 'graph', graph: graphOf([...KERNEL]) }))
    await vi.waitFor(() => { expect(removed).toEqual(['late']) })
    expect(modules.dropped).toContain('late')
  })

  it('does not remove kernel entries when the host graph omits them', async () => {
    const { loader, created, removed } = fakeLoader(KERNEL)
    const source = await mount(loader, fakeModules())
    source.emit(JSON.stringify({ type: 'graph', graph: graphOf(['late']) }))
    await vi.waitFor(() => { expect(created).toEqual(['late']) })
    expect(removed).toEqual([])
    expect([...loader.entries()].map(entry => entry.options.name)).toEqual([...KERNEL, 'late'])
  })

  it('warns on a rebuilt frame for an unknown entry', async () => {
    const { loader } = fakeLoader(KERNEL)
    const source = await mount(loader, fakeModules())
    const warn = vi.spyOn(ctx!.logger, 'warn')
    source.emit(JSON.stringify({ type: 'rebuilt', id: 'missing', rev: '2' }))
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'client-hmr: rebuilt frame for unknown entry "missing" (not in the loader tree)',
      )
    })
  })

  it('drops an unparseable frame loudly and ignores an unknown type', async () => {
    const { loader } = fakeLoader(KERNEL)
    const source = await mount(loader, fakeModules())
    const warn = vi.spyOn(ctx!.logger, 'warn')
    source.emit('not-json')
    expect(warn).toHaveBeenCalledWith('client-hmr: unparseable event frame: not-json')
    source.emit(JSON.stringify({ type: 'future-frame' }))
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('logs when a graph frame is not a boot graph', async () => {
    const { loader } = fakeLoader(KERNEL)
    const source = await mount(loader, fakeModules())
    const error = vi.spyOn(ctx!.logger, 'error')
    source.emit(JSON.stringify({ type: 'graph', graph: { rev: 'g' } }))
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith('client-hmr: graph apply failed')
    })
  })
})
