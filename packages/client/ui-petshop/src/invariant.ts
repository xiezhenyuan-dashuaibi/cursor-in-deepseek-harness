/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-petshop`.
 * @module @deepseek-ai/dsh-client-ui-petshop/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-petshop'

/** Cordis companion plugin name. */
export const name = 'client-ui-petshop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: overlay-card-2.body registration is an effect owned by
 * the slot registry; booking fields are component-local React state.
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
