/**
 * Web Cursor chat overlay: hide the DSH composer, history, and sidebar, skip
 * first-run API-key onboarding, and float a conversation panel driven by
 * headless Cursor CLI `stream-json` over `/cursor-agent`.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { OVERLAY_STACK_CURSOR_ID } from './overlay-stack-ids.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CursorPanel } from './CursorPanel.tsx'
import type { CursorAgentInjected } from './CursorPanel.tsx'
import { CURSOR_OVERLAY_SKIP_ONBOARDING_ID, SkipOnboarding } from './SkipOnboarding.tsx'
import {
  callOverlayPluginList, callOverlayPluginSetHidden, callOverlayPluginSetInserted,
  callOverlayPluginSwitchDesktop,
} from './overlay-card-rpc.ts'
import { en, zh, type CursorAgentKey } from './locales.ts'

export type { CursorAgentKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the floating Cursor chat window. */
    'cursor-agent': CursorAgentKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'cursor-agent'

/** Required services: overlay slot, copy, overlay stack, Connection RPC. */
export const inject = ['slots', 'locale', 'overlayStack', 'connection']

/**
 * Client plugin body: register dictionaries, the floating Cursor chat panel
 * into `shell.overlay`, and the onboarding-skip marker. Hiding DSH chrome is
 * CSS in the panel stylesheet.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-cursor-agent: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'cursor-agent',
      order: 50,
      locale: NS,
      inject: (): CursorAgentInjected => ({
        raiseWindow: () => { ctx.overlayStack.raise(OVERLAY_STACK_CURSOR_ID) },
        listOverlayCards: async () => await callOverlayPluginList(connection.rpc),
        setOverlayCardHidden: async (id, hidden, kind) => {
          await callOverlayPluginSetHidden(connection.rpc, id, hidden, kind)
        },
        setOverlayCardInserted: async (id, inserted, kind) => {
          await callOverlayPluginSetInserted(connection.rpc, id, inserted, kind)
        },
        switchOverlayDesktop: async (id) => {
          await callOverlayPluginSwitchDesktop(connection.rpc, id)
        },
        hooks: {
          overlayStack: ctx.overlayStack.source,
        },
      }),
    },
    CursorPanel,
  ))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register(
    { name: 'settings.onboarding', id: CURSOR_OVERLAY_SKIP_ONBOARDING_ID, order: -1000 },
    SkipOnboarding,
  ))
}
