# Agent Note: Overlay 输入框剪贴板与 PTY 按键

Status: implemented

[English](2026-09-04-cursor-overlay-composer-clipboard.md) | 中文

## Problem

overlay 输入框对普通 keydown 调用 preventDefault，以便 slash 与选项面把 `{op:"keys"}` 写入交互 PTY；回合进行中 Ctrl+C 也是 SIGINT（`\x03`）。操作者仍需要复制选中的输入框文本，并把剪贴板粘贴进草稿（以及 slash/选项条）。若把粘贴当成又一次 keydown，要么插不进去——textarea 受控且 `onChange` 只在 IME 期间写入——要么把 Ctrl+V/C 转进 PTY 并取消 CLI。

## Decision

剪贴板编辑是输入框 textarea 上的浏览器 `copy` / `cut` / `paste` 事件，不编码成 PTY 按键。`ChatSession` 不得对 Ctrl/Cmd+C/V/X preventDefault，否则这些事件不会触发。

**本地聊天草稿**（slash/选项面未占用）在光标处插入粘贴内容（CRLF 规范为 `\n`），剪切把选区写入 `text/plain`。复制走原生选区。Enter 仍发送 `{op:"prompt"}`。

**PTY 占用的输入条**（草稿以 `/` 开头、输入行下方选项面，或 mirror 闩锁）把展平后的粘贴作为 `{op:"keys"}` 发送——换行变成空格，避免粘贴提交——剪切先复制，再按选中的 UTF-16 单元各发一次 Backspace（`\x7f`）。有选区时的复制不发送 Ctrl+C。

**Ctrl+C / Cmd+C：** 输入框有选区时由浏览器复制，不转发。光标折叠时，Ctrl+C 中断正在运行的 headless 回合（`{op:"interrupt"}`）；在 PTY 占用的输入条上则发送 `\x03`。Cmd+C 从不中断。

overlay 映射见 [浮动 Cursor CLI overlay](2026-08-31-floating-cursor-cli-overlay.md)。

## Alternatives considered

**把 Ctrl+V 逐字作为 `{op:"keys"}` 转发。** 否决 — 本地聊天回合是 `{op:"prompt"}`，不是 PTY 键入；粘贴里的换行在 slash 面上会变成 Enter。

**对每个键都停止 preventDefault，改用原生 textarea。** 此次否决 — slash/选项导航仍需把方向键和 Enter 编码进 PTY。剪贴板是例外，因为它不是按键。

**始终把 Ctrl+C 当中断。** 否决 — 回合进行中将无法复制选中的输入框文本。

**向 PTY 发送 bracketed paste。** 未采用；不保证 Cursor TUI 会处理，而把换行展平已能阻止误提交。

## Consequences

操作者可以从 transcript 复制（原生选区，或代码块复制控件）并粘贴进输入框。未选中文本时，Ctrl+C 仍停止正在运行的回合。往 `/model` 粘贴不会因为内嵌换行而确认菜单。

## Testing

`packages/client/ui-cursor-agent/tests/composer-clipboard.spec.ts` 与 `pty-keys.spec.ts` 固定 insert/flatten/shortcut 辅助函数与 PTY 编码。`chat-session.client.spec.tsx` 固定本地粘贴不发 `{op:"keys"}`、PTY 粘贴为展平 keys、剪切、Ctrl+C 复制对中断，以及光标折叠时 slash 条 SIGINT。
