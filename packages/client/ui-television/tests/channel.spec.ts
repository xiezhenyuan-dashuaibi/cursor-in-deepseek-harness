import { describe, expect, it } from 'vitest'
import { parseChannelUrl } from '../src/client/channel.ts'

describe('parseChannelUrl', () => {
  it('rejects empty text', () => {
    expect(parseChannelUrl('  ')).toBeUndefined()
  })

  it('prefixes a bare host with https', () => {
    expect(parseChannelUrl('example.com/path')).toBe('https://example.com/path')
  })

  it('keeps an explicit http(s) href', () => {
    expect(parseChannelUrl('http://127.0.0.1:1/')).toBe('http://127.0.0.1:1/')
  })

  it('rejects a non-web scheme', () => {
    expect(parseChannelUrl('javascript:alert(1)')).toBeUndefined()
    expect(parseChannelUrl('data:text/html,x')).toBeUndefined()
  })

  it('rejects text that is not a URL', () => {
    expect(parseChannelUrl('https://')).toBeUndefined()
  })
})
