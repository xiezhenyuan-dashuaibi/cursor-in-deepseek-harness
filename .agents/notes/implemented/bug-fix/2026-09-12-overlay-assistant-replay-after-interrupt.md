# Agent Note: Overlay assistant fold resumes one band after interrupt notices

Status: implemented

English | [中文](2026-09-12-overlay-assistant-replay-after-interrupt.zh.md)

## Problem

The overlay transcript fold only appended assistant `stream-json` deltas when the last turn was still a streaming assistant band. `system/task_notification`, thinking, tool rows, error `result`, and a CLI `--resume` after disconnect sit between chunks of the same reply. The next assistant event then opened a new band. Cursor often re-sends the prefix already shown, or a longer snapshot of the same message. A resume spawn also emits `system/init` plus the same `user` text; that second user row reset the assistant search, so the panel painted the same paragraphs twice instead of continuing the first band.

## Decision

`foldCursorEvent` keeps one assistant band per open user turn. It looks back past thinking, tools, and system notices to the last assistant after the last user row. Incoming text joins that band through `coalesceAssistantText` on both live deltas and resume snapshots: a longer snapshot replaces, a replayed prefix or in-band chunk is ignored, and a true delta appends. A settled band re-opens `streaming` when deltas resume. A complete payload that shares no prefix with that band is a second assistant message.

`hasMatchingRecentUser` still treats a same-text `user` event after a model turn as a new operator prompt. A `system/init` more recent than the last assistant/thinking/tool row marks a CLI `--resume` echo of the open turn and is not a second user row, so the following assistant events coalesce onto the existing band. An earlier turn's init does not count. WebSocket reconnect rebuilds the fold from `{op:"snapshot"}` events through this same fold.

Related: [Floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md).

## Alternatives considered

**Hide `system/task_notification` so the last turn stays the assistant.** Rejected — notices can stay visible; the defect is starting a second assistant band, not painting the notice.

**Always concatenate onto the last assistant, including unrelated complete payloads.** Rejected — a later complete message that is not an extension of the same reply must remain a separate band.

**Strip the prefix and paint only the suffix as a new band under the notices.** Rejected — operators asked for one complete output, not two assistant bubbles that split the same reply.

**Treat every same-text `user` event after an assistant as a resume echo, or count any historical `system/init`.** Rejected — the operator may send the same prompt again after a completed turn that already had an init; only an init newer than the last model row marks CLI `--resume` replay.

## Consequences

An interrupted overlay reply grows the original assistant band. Replay after `task_notification`, thinking, tools, or a disconnect `--resume` does not duplicate the paragraphs already shown. The operator sending the same text as a new prompt still adds a second user row. Unrelated complete assistant messages in the same user turn still add a second band. A retry that re-emits the same `user` text with no init after the last model row still looks like a new prompt.

## Testing

`packages/client/ui-cursor-agent/tests/chat-model.spec.ts` folds a settled assistant, two `system/task_notification` rows, thinking, a replayed prefix delta, and a longer complete snapshot, and pins a single assistant band. The same file folds `system/init` plus a same-text `user` echo after a settled assistant and pins one user row and one assistant band; it still adds a second user row when that echo has no init newer than the last model row, including after the first turn's init. It rebuilds the same resume event list from `emptyChatFold()` the way `{op:"snapshot"}` does. It also pins `coalesceAssistantText`, a live streaming prefix that does not append onto `Hello`, `hasMatchingRecentUser` through init after assistant/thinking/tool, and a distinct complete message as a second band.
