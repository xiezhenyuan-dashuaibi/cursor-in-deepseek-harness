/** WebSocket URL helper for the host Cursor chat gateway. */

import { CURSOR_AGENT_PTY_PATH } from './pty-path.ts'

/**
 * WebSocket URL for the host Cursor chat gateway, derived from this page's origin.
 * @param sessionId - overlay rail id; omitted leaves the query empty (anonymous host session).
 * @returns `ws:` or `wss:` URL on {@link CURSOR_AGENT_PTY_PATH}.
 */
export function cursorAgentChatUrl(sessionId?: string): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  const origin = location?.origin !== undefined && location.origin !== 'null'
    ? location.origin
    : 'http://127.0.0.1'
  const url = new URL(CURSOR_AGENT_PTY_PATH, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (sessionId !== undefined && sessionId.length > 0) {
    url.searchParams.set('session', sessionId)
  }
  return url.href
}
