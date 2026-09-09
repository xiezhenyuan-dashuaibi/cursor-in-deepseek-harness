# Agent Note: Overlay composer clipboard vs PTY keys

Status: implemented

English | [中文](2026-09-04-cursor-overlay-composer-clipboard.zh.md)

## Problem

The overlay composer preventDefaults ordinary keydown so slash and option surfaces can write `{op:"keys"}` into the interactive PTY, and Ctrl+C is also SIGINT (`\x03`) while a turn runs. Operators still need to copy selected composer text and paste clipboard text into the draft (and into a slash/option bar). Treating paste as another keydown either never inserts — the textarea is controlled and `onChange` only writes during IME — or forwards Ctrl+V/C into the PTY and cancels the CLI.

## Decision

Clipboard edits are browser `copy` / `cut` / `paste` events on the composer textarea. They are not encoded as PTY keys. `ChatSession` must not preventDefault Ctrl/Cmd+C/V/X, or those events never fire.

A **local chat draft** (no slash/option ownership) inserts paste at the caret with CRLF normalized to `\n`, and cut removes the selection onto `text/plain`. Copied text is the native selection. Enter still sends `{op:"prompt"}`.

A **PTY-owned bar** (draft starts with `/`, a below-prompt picker, or the mirror latch) sends flattened paste as `{op:"keys"}` — newlines become spaces so a paste cannot submit — and cut copies then sends one Backspace (`\x7f`) per selected UTF-16 unit. Copy with a selection does not send Ctrl+C.

**Ctrl+C / Cmd+C:** a composer selection copies in the browser and is not forwarded. Ctrl+C with a collapsed caret interrupts a running headless turn (`{op:"interrupt"}`) or, on a PTY-owned bar, sends `\x03`. Cmd+C never interrupts.

See the overlay mapping in [Floating Cursor CLI overlay](2026-08-31-floating-cursor-cli-overlay.md).

## Alternatives considered

**Forward Ctrl+V as `{op:"keys"}` character by character.** Rejected — local chat turns are `{op:"prompt"}`, not PTY type-in, and pasted newlines would become Enter on a slash surface.

**Stop preventDefault on every key and use a native textarea.** Rejected for this change — slash/option navigation still needs encoded arrows and Enter in the PTY. Clipboard is the exception because it is not a key.

**Always treat Ctrl+C as interrupt.** Rejected — selected composer text would be un-copyable while a turn runs.

**Bracketed paste into the PTY.** Not used; the Cursor TUI is not guaranteed to honor it, and flattening newlines already stops accidental submit.

## Consequences

Operators can copy from the transcript (native selection, or the code-block copy control) and paste into the composer. A running turn still stops with Ctrl+C when nothing is selected. Pasting into `/model` cannot confirm the menu via embedded newlines.

## Testing

`packages/client/ui-cursor-agent/tests/composer-clipboard.spec.ts` and `pty-keys.spec.ts` pin insert/flatten/shortcut helpers and PTY encodings. `chat-session.client.spec.tsx` pins local paste without `{op:"keys"}`, PTY paste as flattened keys, cut, Ctrl+C copy-versus-interrupt, and slash-bar SIGINT when the caret is collapsed.
