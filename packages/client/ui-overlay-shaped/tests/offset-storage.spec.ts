// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseOffsetMap, readShapedOffset, resetShapedOffsets, SHAPED_OFFSETS_STORAGE_KEY,
  writeShapedOffset,
} from '../src/client/offset-storage.ts'

afterEach(() => {
  resetShapedOffsets()
  window.localStorage.removeItem(SHAPED_OFFSETS_STORAGE_KEY)
})

describe('shaped offset storage', () => {
  it('returns the origin when nothing is stored', () => {
    expect(readShapedOffset('seat-a')).toEqual({ x: 0, y: 0 })
  })

  it('round-trips a finite offset through localStorage', () => {
    writeShapedOffset('seat-a', { x: 12, y: -8 })
    resetShapedOffsets()
    expect(readShapedOffset('seat-a')).toEqual({ x: 12, y: -8 })
    expect(JSON.parse(window.localStorage.getItem(SHAPED_OFFSETS_STORAGE_KEY) ?? '')).toEqual({
      'seat-a': { x: 12, y: -8 },
    })
  })

  it('keeps the in-memory map when setItem throws', () => {
    writeShapedOffset('a', { x: 1, y: 2 })
    const original = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = () => {
      throw new Error('quota')
    }
    try {
      writeShapedOffset('a', { x: 9, y: 9 })
      expect(readShapedOffset('a')).toEqual({ x: 9, y: 9 })
    } finally {
      window.localStorage.setItem = original
    }
  })

  it('keeps the in-memory map when getItem throws on hydrate', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      expect(readShapedOffset('ghost')).toEqual({ x: 0, y: 0 })
    } finally {
      spy.mockRestore()
    }
  })

  it('keeps the in-memory map when localStorage is undefined', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined })
    try {
      resetShapedOffsets()
      writeShapedOffset('ghost', { x: 3, y: 4 })
      expect(readShapedOffset('ghost')).toEqual({ x: 3, y: 4 })
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, 'localStorage')
      } else {
        Object.defineProperty(window, 'localStorage', descriptor)
      }
    }
  })

  it('keeps the in-memory map when localStorage access throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('no store')
      },
    })
    try {
      resetShapedOffsets()
      expect(readShapedOffset('ghost')).toEqual({ x: 0, y: 0 })
      writeShapedOffset('ghost', { x: 3, y: 4 })
      expect(readShapedOffset('ghost')).toEqual({ x: 3, y: 4 })
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, 'localStorage')
      } else {
        Object.defineProperty(window, 'localStorage', descriptor)
      }
    }
  })

  it('parses only finite numeric offsets from a storage payload', () => {
    expect(parseOffsetMap(undefined)).toEqual({})
    expect(parseOffsetMap('')).toEqual({})
    expect(parseOffsetMap('{')).toEqual({})
    expect(parseOffsetMap('[]')).toEqual({})
    expect(parseOffsetMap('null')).toEqual({})
    expect(parseOffsetMap('{"a":{"x":1}}')).toEqual({})
    expect(parseOffsetMap('{"a":{"x":1,"y":"2"}}')).toEqual({})
    expect(parseOffsetMap('{"a":{"x":1,"y":null}}')).toEqual({})
    expect(parseOffsetMap('{"a":[1,2]}')).toEqual({})
    expect(parseOffsetMap('{"a":null}')).toEqual({})
    expect(parseOffsetMap('{"a":{"x":1,"y":1e400}}')).toEqual({})
    expect(parseOffsetMap('{"ok":{"x":1.5,"y":-2},"bad":{"x":1}}')).toEqual({
      ok: { x: 1.5, y: -2 },
    })
  })
})
