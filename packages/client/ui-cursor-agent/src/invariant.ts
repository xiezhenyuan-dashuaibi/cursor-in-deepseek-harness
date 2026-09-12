/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-cursor-agent`.
 * @module @deepseek-ai/dsh-client-ui-cursor-agent/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-cursor-agent'

/** Cordis companion plugin name. */
export const name = 'client-ui-cursor-agent-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the overlay slot registration is an effect owned by
 * the slot registry; the index boot meta is an HTML tap; the host PTY is
 * owned by dsh-cursor-agent-gateway.
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
