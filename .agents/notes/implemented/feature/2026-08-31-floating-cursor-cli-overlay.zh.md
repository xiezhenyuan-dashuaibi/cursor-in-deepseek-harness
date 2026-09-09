# Agent Note: 在 dsh web 中浮起 Cursor CLI 对话 overlay

Status: implemented

[English](2026-08-31-floating-cursor-cli-overlay.md) | 中文

## Problem

dsh web GUI 仍呈现完整的 DSH 输入框与对话历史，而产品意图是以 Cursor 为大脑。曾先尝试展示交互式 Cursor TUI 的原始 xterm，但操作者需要能区分自己发送与模型回复的正常对话面板、不钉死 transcript 的输入条，以及 Markdown 助手文本——而不是终端套壳。

## Decision

Web 应用隐藏 DSH 界面，并浮起**映射** Cursor CLI 的对话面板：长驻 PTY 拥有 slash 菜单与其它输入行下方选项面；聊天回合使用 headless `--print --output-format stream-json`，使 overlay fold 收到真实的 assistant / thinking / tool_call / result 事件（不是 PTY 屏幕摘取）。slash 确认仍为方向键 + Enter 写入 PTY。

[`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) 在 `ctx.webServer` 上注册 `/cursor-agent`。一个 overlay 会话键拥有交互 CLI PTY（去掉 print/force 标志），并为每条 `{op:"prompt"}` 另起 headless stream-json 子进程（首次拿到 `session_id` 后带 `--resume`）；WebSocket 是可替换的查看者（[CLI 寿命长于套接字](../architecture/2026-09-03-cursor-overlay-cli-outlives-socket.md)）。网关仅为选项面发布 `{op:"mirror"}`（CLI **灰色输入条**文本及其**严格下方**各行）。彩色选中洗不是输入条。输入行下方选项面打开时，home tip 或 slash/空草稿定位输入条；选项标签永远不会成为输入条。输入条下方的空闲模型名/工作目录会丢弃，以免看起来像选项面。对话 transcript 帧是 headless NDJSON `{op:"event"}`；PTY 从不摘取成助手文本。忙碌 follow-up 使用 `{op:"prompt",mode:"queue"}`（退出时 FIFO 排空）与 `{op:"followup_cancel"}`（LIFO 弹出）；`mode:"steer"` 杀掉当前子进程并开 resume 回合。宿主屏幕缓冲使用 xterm 延迟换行，避免 Ink 菜单整行写满后再跟 CRLF 时跳行。下方列表以毛玻璃卡片浮在输入条上方：点击不选中行，聚焦卡片与输入框走同一套 `{op:"keys"}`，并把焦点放在内部输入框上以便 CJK IME 组字。进行中的 AskQuestion Ink 框使用同一份 `{op:"mirror"}.below`，并优先于同时出现的 slash 菜单。Headless `--print` 会伪造 `Questions skipped by the user`；网关拦截该 `tool_call`，把表单投射到毛玻璃卡片（去掉末尾兜底项后始终追加可输入的 Other），停掉被跳过的子进程，并把 overlay 按键变成真正的答案 prompt（Enter 确认当前高亮项；Other 接受键入或 IME 文本）。Host/Origin 栅栏是[连接插件](../../../../packages/client/connection/README.md)的 `isTrustedApiRequest`。

[`@deepseek-ai/dsh-client-ui-cursor-agent`](../../../../packages/client/ui-cursor-agent/README.md) 把 `CursorPanel` 注册进 `shell.overlay`。面板样式表隐藏对话/侧栏/details 并填充 `[data-shell-overlay]`。仍禁止占用 `conversation` slot，以便兄弟 `inject()` 等待者能够结算。

overlay 是一张圆角灰底卡片，**没有标题栏**。Cursor 标记拖动卡片；缩放柄留在边缘。四边命中是外侧 4px 条，transcript 和侧栏滚动条仍可点；四角仍是 12px。右上角控件把卡片收成 52px 灰黑线条浮标，停在上次精灵位置（默认右下内边距）。浮标是灰色圆片上的完整黑外圈与字母 C：外圈靠位移游走（不原地旋转），C 的开口转向前进方向的背面，指针几乎未移动的点击再展开卡片。收起期间聊天会话保持挂载。左侧会话轨是一条通高整板，比 transcript 略浅（`--dsw-specific-sidebar-fill`），带 1px 分隔线。收起约 40px（顶部钉住的标记、可滚动的会话图标条且 + 在列表下、底部钉住的插件入口）；悬停或聚焦名称输入时，同一元素拉宽到约 228px，露出截断的会话名和紧凑的编辑/关闭图标。展开轨可按名称或默认 `Chat N` 新建会话、就地重命名、结束选中会话。插件入口按名称和唯一 id 列出 overlay 卡片，并可插入或拔出；点击后在展开的左栏、入口正上方打开该列表，指针离开列表即收起。列表视口为 3.5 行，其余上下滚动。不删除 checkout 包（[overlay 叠放](../architecture/2026-09-07-overlay-stack-and-card-plug.md)）。展开后的外框、上次精灵原点和收起标志写入 `localStorage`（`dsh.cursor-overlay.geometry`），页面刷新后仍在，与会话轨（`dsh.cursor-overlay.rail`）相同。在 Cursor 窗上按下鼠标左键会把它抬到 overlay-card 桌面之上。transcript 占满卡片其余部分：**我方灰底**、**AI 白/底色**；收到事件时思考与工具为淡色单行摘要；system/init 为短活动行。进行中的一轮在 transcript 末尾画 **生成中…**，不放在输入条上方。输入条在进行中仍可编辑；Shift+Enter 换行；退格按光标位置删除；聊天 Enter 发送 `{op:"prompt"}`，忙碌时 Enter 以 `mode:"queue"` 追加进与输入条同一底部 dock 的多条排队条。Esc / 取消上一条弹出最新一条（`followup_cancel`）；立刻发送走杀掉再 resume。slash / 选项按键是 `{op:"keys"}`；选项面打开时 `{op:"mirror"}` 绘制输入条及其下方毛玻璃卡片。确认仍由 CLI 负责（方向键 + Enter 写入 PTY），绝不会把 `/model` 当成聊天发送。输入框复制/剪切/粘贴走剪贴板事件（[输入框剪贴板](2026-09-04-cursor-overlay-composer-clipboard.md)），不是 PTY 的 Ctrl+C/V。失败回合横幅是状态 chrome，不是草稿或选项面；`{op:"status",status:"error"}` / `{op:"error"}` 把输入条交回本地聊天（[失败横幅](../bug-fix/2026-09-04-cursor-overlay-error-locks-composer.md)）。输入条只在滚动区处于短贴底阈值内时叠在 `transcriptHost` 底边（输入条与排队浮层一起）。上滑时 transcript 底边距保持上次测到的 dock 高度，避免收起排队条缩短 `scrollHeight` 把视口拽回底部。贴底滚动跟随 `stickRef`；闩锁打开时出现回到底部控件。

`settings.onboarding` 上 id 为 `cursor-overlay-skip` 的标记会跳过 DeepSeek API Key 对话框。overlay 会话是 Cursor `--resume` id，不是 DSH Session。宿主 CLI 的寿命长于查看套接字；见 [CLI 寿命长于套接字](../architecture/2026-09-03-cursor-overlay-cli-outlives-socket.md)。结构化操作者 JSONL 由 agent-gateway 拥有；见 [overlay 会话 JSONL](2026-08-31-cursor-overlay-conversation-jsonl.md)。

## Alternatives considered

**把交互 TUI 整屏 xterm 当产品 UI。** 否决 — 操作者需要灰/白对话段与 Markdown，而不是终端套壳。PTY 留在宿主侧做控制；overlay 仍是映射包装。

**Headless `--print` 加静态 slash 目录，并把 `/command` 当 prompt 发送。** 否决 — 选择 `/model` 会变成聊天消息，而不是 CLI 的级联选项面。

**替换 `conversation` 占用者。** 会撤销兄弟 inject 席位并卡住启动。

**iframe Cursor IDE。** 产品已否决缝进 `dsh web`。

## Consequences

`dsh --profile web` 在空外壳上显示无标题栏的 Cursor 对话卡片。操作者从 Cursor 标记拖动，并从拉宽会话轨管理会话。操作者需具备 `packages/cursor/cli`（或 `agentCommand`），且已登录交互 CLI。输入行下方选项面经 PTY 确认；聊天回合走 headless stream-json。

## Testing

包测试覆盖交互 argv 构造、PTY keys/mirror WebSocket 转发、headless prompt / resume / queue / steer stream-json 转发（无 PTY 摘取）、screen-buffer 与 prompt-mirror 提取（含 AskQuestion 框）、headless AskQuestion 拦截与 overlay 答案 `{op:"prompt"}`、结构化 JSONL、overlay slot 注册、prompt/assistant 的灰/白段、AI GFM 渲染、忙碌时 Enter 多条排队 dock 与 LIFO 取消 / FIFO 发送、带 Shift+Enter 换行 / 退格按光标删除 / Enter `{op:"prompt"}` / Ctrl+C 中断 / 剪贴板粘贴 / 不锁死输入条的失败横幅以及聚焦时与输入框共用 `{op:"keys"}` 的 below-prompt 镜像的浮动 pill 输入、上滑后隐藏的输入条与排队浮层、拉宽会话轨上的命名新建/就地重命名/结束会话、标记拖动、贴边缩放、视口夹紧、刷新后恢复已存储外框、收起到右下精灵、无拖动点击展开、拖动精灵而不展开，以及查看者重连与宿主 snapshot，见 [CLI 寿命长于套接字](../architecture/2026-09-03-cursor-overlay-cli-outlives-socket.md)。
