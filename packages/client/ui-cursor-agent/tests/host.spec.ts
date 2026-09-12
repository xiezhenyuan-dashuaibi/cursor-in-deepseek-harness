import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { apply } from '../src/index.ts'
import { CURSOR_HOST_BOOT_META } from '../src/boot-html.ts'

describe('ui-cursor-agent node apply', () => {
  it('stamps one boot id into index html and removes the tap with the fiber', async () => {
    const ctx = new Context()
    let transform: ((html: string) => string) | undefined
    let disposed = false
    ctx.provide('webServer', {
      tapIndex: (next: (html: string) => string) => {
        transform = next
        return () => { disposed = true }
      },
    } as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const first = transform?.('<head></head>') ?? ''
    const match = new RegExp(
      `<head><meta name="${CURSOR_HOST_BOOT_META}" content="([^"]+)"></head>`,
    ).exec(first)
    expect(match?.[1]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(transform?.('<head></head>')).toBe(first)
    await fiber.dispose()
    expect(disposed).toBe(true)
  })
})
