# Agent Note: Overlay assistant fold resumes one band after interrupt notices

Status: implemented

English | [中文](2026-09-12-overlay-assistant-replay-after-interrupt.zh.md)

## Problem

The overlay transcript fold only appended assistant `stream-json` deltas when the last turn was still a streaming assistant band. `system/task_notification`, thinking, tool rows, error `result`, and a CLI `--resume` after disconnect sit between chunks of the same reply. The next assistant event then opened a new band. Cursor often re-sends the prefix already shown, or a longer snapshot of the same message. A resume spawn also emits `system/init` plus the same `user` text; that second user row reset the assistant search, so the panel painted the same paragraphs twice instead of continuing the first band. Writing that later snapshot back into an earlier assistant row leaves thinking and tools under the answer, and concatenating a jammed markdown draft with the pretty snapshot makes one unreadable blob. After the final answer is already on screen, thinking or tools can stay "running".

## Decision

`foldCursorEvent` updates only the trailing assistant row. Thinking, tools, and system notices stay in event order. A later assistant event after those rows opens a new band at the end; when that band is the same reply, the earlier assistant draft is dropped so the steps stay above the answer. Incoming text on the trailing row joins through `coalesceAssistantText`: a longer snapshot replaces, a replayed prefix or in-band chunk is ignored, a jammed copy and a pretty copy that share an opening keep the later text, a jammed copy that opened with a different sentence yields to later text that repeats two or more of its sentences, and a true delta appends. `collapseReplayedAssistantText` still unwraps a glued restart inside one assistant field on a complete payload or `settleStreaming`. A settled trailing band re-opens `streaming` when deltas resume. A complete payload that shares no prefix with that trailing band is a second assistant message.

A complete payload also clears thinking "running". `result` / idle additionally marks leftover running tools done.

`hasMatchingRecentUser` still treats a same-text `user` event after a model turn as a new operator prompt. A `system/init` more recent than the last assistant/thinking/tool row marks a CLI `--resume` echo of the open turn and is not a second user row, so the following assistant events are not a second prompt. An earlier turn's init does not count. WebSocket reconnect rebuilds the fold from `{op:"snapshot"}` events through this same fold.

Related: [Floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md).

## Alternatives considered

**Hide `system/task_notification` so the last turn stays the assistant.** Rejected — notices can stay visible; the defect is duplicating the final answer, not painting the notice.

**Look back past thinking/tools and write the later snapshot into the earlier assistant row.** Rejected — that paints thinking and tools under the finished answer.

**Always concatenate when prefix checks fail.** Rejected — a jammed pipe table and a padded GFM table share an opening but are not prefixes of each other; concat glues an unreadable draft in front of the pretty copy.

**Always concatenate onto the last assistant, including unrelated complete payloads.** Rejected — a later complete message that is not an extension of the same reply must remain a separate band.

**Strip the prefix and paint only the suffix as a new band under the notices.** Rejected — operators asked for one complete output, not two assistant bubbles that split the same reply.

**Treat every same-text `user` event after an assistant as a resume echo, or count any historical `system/init`.** Rejected — the operator may send the same prompt again after a completed turn that already had an init; only an init newer than the last model row marks CLI `--resume` replay.

**Scan every character for the longest duplicated prefix.** Rejected — operators asked to drop a replayed *segment* after the turn finishes, not to rewrite the live token stream.

## Consequences

Thinking and tool rows keep the order they arrived. A later snapshot of the same reply drops the earlier assistant draft instead of merging into that earlier slot. Jammed and pretty copies of one opening keep the later text. A jammed draft that opened with a different sentence also drops when two or more of its sentences appear in the later copy. Unrelated complete assistant messages in the same user turn still add a second band. After the turn settles, leftover running tools settle on `result` / idle. The operator sending the same text as a new prompt still adds a second user row. A retry that re-emits the same `user` text with no init after the last model row still looks like a new prompt. A later paragraph that quotes an earlier one of at least 32 characters can drop the earlier copy.

## Testing

`packages/client/ui-cursor-agent/tests/chat-model.spec.ts` folds a settled assistant, two `system/task_notification` rows, thinking, and a replayed snapshot, and pins thinking above one assistant band. The same file folds jammed text, thinking, a tool, and a pretty snapshot, and pins `thinking, tool, assistant` with only the pretty copy. It folds a jammed draft that opened with a different sentence into the pretty restart, both glued in one field and as two bands with thinking between them. It folds `system/init` plus a same-text `user` echo after a settled assistant and pins one user row and one assistant band; it still adds a second user row when that echo has no init newer than the last model row, including after the first turn's init. It rebuilds the same resume event list from `emptyChatFold()` the way `{op:"snapshot"}` does. It pins `collapseReplayedAssistantText` on doubled sentences, a jammed markdown table in front of the pretty table, a complete payload that concatenates overlapping paragraphs into one final copy, `settleStreaming` collapsing live concatenated replay, thinking cleared on a complete assistant, and a running tool marked done on `result`. It also pins `coalesceAssistantText` replacing a jammed table with the pretty copy, a live streaming prefix that does not append onto `Hello`, `hasMatchingRecentUser` through init after assistant/thinking/tool, and a distinct complete message as a second band.
