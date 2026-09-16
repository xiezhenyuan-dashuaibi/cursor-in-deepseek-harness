/**
 * Web Cursor-CLI overlay, node half. The PTY WebSocket lives in
 * `@deepseek-ai/dsh-cursor-agent-gateway`. This half stamps one boot id into
 * `index.html` so the browser rail can persist Chat N only for this process,
 * and lists standalone overlay fibers on `/overlay-plugins` and
 * `/overlay-plugins-rail`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { injectCursorHostBoot } from './boot-html.ts'
import { applyOverlayPluginRoster, type OverlayPluginRosterOptions } from './plugin-roster.ts'

export {
  applyOverlayPluginRoster, isOverlayRailPlugin, isStandaloneOverlayPlugin, listOverlayRailPlugins,
  listStandaloneOverlayPlugins, OVERLAY_DESKTOP_BODY_SLOT, OVERLAY_DESKTOP_PACKAGE_NAME,
  OVERLAY_PLUGIN_LIST_ENDPOINT, OVERLAY_PLUGIN_RAIL_RPC_CHANNEL, OVERLAY_PLUGIN_RAIL_RPC_ID,
  OVERLAY_PLUGIN_RPC_CHANNEL, OVERLAY_PLUGIN_ROSTER_RPC_ID,
  OVERLAY_PLUGIN_SET_HIDDEN_ENDPOINT, OVERLAY_PLUGIN_SET_INSERTED_ENDPOINT,
  OVERLAY_PLUGIN_SWITCH_DESKTOP_ENDPOINT, OVERLAY_SHAPED_BODY_SLOT, OVERLAY_SHAPED_HIDDEN_FILE,
  OVERLAY_SHAPED_PACKAGE_NAME, resolveRosterPaths, setDesktopOccupantExclusive,
  setOverlayRailPluginHidden, setOverlayRailPluginInserted, setStandaloneOverlayPluginInserted,
} from './plugin-roster.ts'
export type {
  OverlayPluginRosterOptions, OverlayRailKind, OverlayRailRoster, OverlayStandalonePlugin,
} from './plugin-roster.ts'

/**
 * Stamp a process-lifetime boot id into every index response when `webServer`
 * is composed. The browser rail restores stored sessions only for that id.
 * @param ctx - host plugin context.
 * @param options - optional standalone-roster path overrides for tests.
 */
export function apply(ctx: Context, options?: OverlayPluginRosterOptions): void {
  const bootId = crypto.randomUUID()
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectCursorHostBoot(html, bootId)),
      'ui-cursor-agent: host boot id',
    )
  })
  ctx.inject(['connection'], (rpcCtx) => {
    applyOverlayPluginRoster(rpcCtx, options)
  })
}
