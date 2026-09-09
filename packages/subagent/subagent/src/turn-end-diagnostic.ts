/**
 * Copy a child's last `turn/end` error message onto {@link SubagentResult}.
 *
 * @module @deepseek-ai/dsh-subagent/turn-end-diagnostic
 */

import type { TurnEndReason } from '@deepseek-ai/dsh-session'

/**
 * Read the structured failure text from a child's last turn, if any.
 * @param reason - the last `turn/end` reason, or `undefined` when the child
 *   settled with no turn.
 * @returns `error.message` when the reason is `error` and the message is
 *   non-empty; otherwise `undefined`.
 */
export function diagnosticFromTurnEnd(reason: TurnEndReason | undefined): string | undefined {
  if (reason?.kind !== 'error') return undefined
  return reason.error.message.length > 0 ? reason.error.message : undefined
}
