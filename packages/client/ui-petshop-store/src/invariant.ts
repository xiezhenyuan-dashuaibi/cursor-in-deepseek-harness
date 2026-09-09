/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-petshop-store`.
 * @module @deepseek-ai/dsh-client-ui-petshop-store/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-petshop-store'

/** Cordis companion plugin name. */
export const name = 'client-ui-petshop-store-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: overlay-card-4.body registration is an effect owned by
 * the slot registry; sqlite ownership is the host fiber's close disposer.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
