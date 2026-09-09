/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-cursor-agent-gateway`.
 * @module @deepseek-ai/dsh-cursor-agent-gateway/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-cursor-agent-gateway'

/** Cordis companion plugin name. */
export const name = 'cursor-agent-gateway-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the upgrade route and overlay CLI runtimes are
 * effects owned by `webServer` and node-pty; conversation JSONL is an operator
 * file that must survive fiber teardown.
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
