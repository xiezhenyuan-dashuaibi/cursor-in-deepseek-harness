import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as GatewayInvariant from '../src/invariant.ts'

describe('cursor-agent-gateway invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(GatewayInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(GatewayInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
