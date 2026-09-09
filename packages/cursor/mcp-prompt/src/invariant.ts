/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-cursor-mcp-prompt`.
 * @module @deepseek-ai/dsh-cursor-mcp-prompt/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-cursor-mcp-prompt'

/** Cordis companion plugin name. */
export const name = 'cursor-mcp-prompt-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a pure prompt renderer with no
 * live registry, event stream, or durable store.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
