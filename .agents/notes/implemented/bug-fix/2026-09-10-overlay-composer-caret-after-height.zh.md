# Agent Note: Overlay 输入框光标在增高后仍保持原位

Status: implemented

[English](2026-09-10-overlay-composer-caret-after-height.md) | 中文

## Problem

overlay 输入框是受控 textarea。退格、插入、粘贴、剪切已经按 `selectionStart` / `selectionEnd` 编辑，并通过 `pendingCaretRef` 排队折叠光标。随后 `useLayoutEffect` 按草稿写入 `style.height`。Chromium 每次写 height 都会把光标挪到末尾。若在写 height *之前* 恢复排队光标，下一次退格或可打印键就会落在末尾，于是点进 pill 中间也只能从尾部删或打。毛玻璃 `{op:"mirror"}` 帧也在该 effect 的依赖里，因此输入行下方重排会在草稿字符串未变时把点选光标拽到末尾。

## Decision

`syncComposerHeight` 先记下 `selectionStart` / `selectionEnd`，再写 `style.height`，然后恢复该选区。layout effect 在写 height *之后* 应用 `pendingCaretRef`，让这次编辑排队的偏移盖过 Chromium 的末尾光标。本地聊天退格、插入、粘贴、剪切仍走 `insertAtRange` 加 `restoreCaret`；此修复不改写 slash 或选项面 `{op:"keys"}` 回显，它们仍跟随 PTY 光标。

相关：[Overlay 输入框剪贴板与 PTY 按键](../feature/2026-09-04-cursor-overlay-composer-clipboard.md)。

## Alternatives considered

**停止自动增高 textarea，改用非受控原生输入。** 否决 — 3.5 行上限与溢出滚动条是 overlay 输入约定；缺陷是 Chromium 写 height 时挪光标。

**只恢复 `pendingCaretRef`，忽略点击光标。** 否决 — 输入行下方 `below` 更新会跑同一 effect 且没有排队偏移，这就足以把点选光标拽到末尾。

**向 PTY 先发 Left 再发 DEL，让 slash 中间退格对齐 overlay 选区。** 作为本次修复否决 — Ink 光标不是 overlay 光标；混用会让 `/` 过滤文本失步。slash 与选项条仍由 PTY 占用。

## Consequences

本地聊天草稿把光标留在操作者点击处或上次 overlay 编辑处，包括换行引起的增高和毛玻璃卡片重排之后。slash 或选项条仍在 CLI 光标处插入和删除，通常是镜像 `input` 的末尾。

## Testing

`packages/client/ui-cursor-agent/tests/cursor-panel.client.spec.tsx` 把写 height 打桩成把光标拽到末尾（jsdom 不会），并固定退格以及输入行下方重排后光标仍在字符串中间。
