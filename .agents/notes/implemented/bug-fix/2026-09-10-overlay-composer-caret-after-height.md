# Agent Note: Overlay composer caret survives height sync

Status: implemented

English | [中文](2026-09-10-overlay-composer-caret-after-height.zh.md)

## Problem

The overlay composer is a controlled textarea. Backspace, insert, paste, and cut already edit at `selectionStart` / `selectionEnd` and queue a collapsed caret through `pendingCaretRef`. A `useLayoutEffect` then grows `style.height` to the draft. Chromium moves the caret to the end on each height write. Restoring the queued caret *before* that write left the next Backspace or printable key at the end, so a click in the middle of the pill could delete or type only from the tail. Glass-card `{op:"mirror"}` frames also sit in that effect's dependency list, so a below-prompt relayout yanked a clicked caret even when the draft string did not change.

## Decision

`syncComposerHeight` captures `selectionStart` / `selectionEnd`, writes `style.height`, then restores that selection. The layout effect applies `pendingCaretRef` *after* the height write so an edit's queued offset wins over Chromium's end caret. Local chat Backspace, insert, paste, and cut keep using `insertAtRange` plus `restoreCaret`; this change does not retarget slash or option `{op:"keys"}` echo, which still follows the PTY cursor.

Related: [Overlay composer clipboard vs PTY keys](../feature/2026-09-04-cursor-overlay-composer-clipboard.md).

## Alternatives considered

**Stop auto-growing the textarea and use a native un-controlled input.** Rejected — the 3.5-line cap and overflow scrollbar are the overlay compose contract; Chromium's height-write caret move is the defect.

**Restore only `pendingCaretRef` and ignore click carets.** Rejected — a below-prompt `below` update runs the same effect with no queued offset, and that is enough to yank a clicked caret to the end.

**Send Left-arrow then DEL into the PTY so a mid-pill Backspace matches overlay selection during slash.** Rejected for this fix — Ink's cursor is not the overlay caret; mixing the two desynchronizes `/` filter text. Slash and option bars stay PTY-owned.

## Consequences

A local chat draft keeps the caret where the operator clicked or where the last overlay edit left it, including after wrap-driven height changes and glass-card relayout. A slash or option bar still inserts and deletes at the CLI cursor, which is typically the end of the mirrored `input`.

## Testing

`packages/client/ui-cursor-agent/tests/cursor-panel.client.spec.tsx` stubs a height write that yanks the caret to the end (jsdom does not) and pins Backspace plus a below-prompt relayout to the mid-string caret.
