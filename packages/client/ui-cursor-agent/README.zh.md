# @deepseek-ai/dsh-client-ui-cursor-agent

[English](README.md) | 中文

把官方 Cursor CLI 映射成对话面板的漂浮 Web overlay。浏览器半侧把 `CursorPanel` 注册进 `shell.overlay`，并通过 JSON WebSocket 连接 `/cursor-agent?session=`。意外关闭会重连；`{op:"snapshot"}` 重建 fold。轨上关闭发送 `{op:"shutdown"}`。Shift+Enter 换行。退格按光标位置删除。聊天 Enter 发送 `{op:"prompt"}`，由宿主跑 headless stream-json；客户端 fold 用 `MarkdownText` 渲染助手 Markdown（直到 `result` / idle 才结束 streaming），并在收到事件时收起 `thinking` / `tool_call` 行。思考、工具、`system/task_notification` 或 CLI `--resume` 的 `system/init` 回放之后的助手事件接到同一条 band 上；重放的前缀或更长快照不会再开一份。slash 菜单、AskQuestion 框与其它选项面仍走 `{op:"keys"}`，以及输入条上方的毛玻璃 `{op:"mirror"}` 卡片（输入框或聚焦卡片走同一套按键；点击不选中行）。失败回合横幅（`Error: [aborted] …`）是 transcript 警告，不是输入草稿，也不闩 PTY。输入框复制/剪切/粘贴走剪贴板事件，不是 PTY 的 Ctrl+C/V；仅在回合进行中且输入框没有选区时，Ctrl+C 才会中断。忙碌时 Enter 以 `mode:"queue"` 追加进多条目浮层（Esc / 取消 LIFO 弹出；立刻发送走 steer）。`taskToolCall` 驱动 **正在运行 N 个 agent…** 条；`shellToolCall` 优先显示 `$ command`。进行中的一轮在 transcript 末尾追加 **生成中…**。`result.usage` 的 token 文案轻量放在单一圆角输入 pill 上方（无发送按钮）。卡片**没有标题栏**：顶部约 1cm 的空白带与 Cursor 标记拖动窗口；该带显示宿主 `{op:"dsh_mcp"}` 探测到的 **dsh_mcp 启动中** 或 **dsh_mcp 已连接**（对本 overlay CLI 跑 `mcp list-tools dsh`）；四边缩放只命中外侧 4px 条，transcript 和侧栏滚动条仍可点，四角仍是 12px；右上角控件把它收成 52px 灰黑线条浮标（默认右下），完整外圈靠位移游走，字母 C 的开口转向前进方向的背面；正文字号为 DSH 的 90%。左侧会话轨（顶部钉住的 Cursor 标记、可滚动的会话图标条且 + 在列表下方、底部钉住的插件入口）是一条略浅的整板，悬停、聚焦名称输入或插件列表打开时从约 40px 拉宽到约 228px。同一条轨在加宽后露出截断的会话名和紧凑的编辑/关闭图标；可按名称或默认名新建、就地重命名、结束会话。插件入口顶部钉住桌面行，并按名称和 id 列出 overlay 卡片、未加载的桌面产品以及独立 overlay fiber（有 `dsh.client`、无卡片 `overlayBody`）；卡片可隐藏/显示以及插入/拔出，桌面列表行切换桌面，fiber 只有拔出。；点击后在展开的左栏、入口正上方打开该列表，指针离开列表即收起。列表视口为 3.5 行，其余上下滚动。不删除 checkout 包。展开后的外框、上次精灵原点和收起标志写入 `localStorage`（`dsh.cursor-overlay.geometry`），页面刷新后仍在。会话轨只在 `dsh.cursor-overlay.rail` 带着本次 `dsh web` 进程写进 index 的 boot id 时，刷新后仍会绑回；新进程从 Chat 1 起算。在展开的 Cursor 窗上按下鼠标左键会通过 `ctx.overlayStack` 把它抬到 overlay-card 桌面之上。最小化精灵使用高于该 stack 的固定 `z-index`，点卡片也不会盖住它。transcript 占满卡片（**我方灰底**、**AI 白/底色**）。输入条只在滚动区处于短贴底阈值内时叠在 `transcriptHost` 底边；上滑即隐藏输入条和排队浮层，并保持上次测到的 dock 底边距，避免 `scrollHeight` 缩短把视口拽回底部，同时出现回到底部控件。插件加载期间 CSS 隐藏 DSH 对话栏、侧栏和 details。`settings.onboarding` 上 id 为 `cursor-overlay-skip` 的标记会跳过 DeepSeek API Key 对话框。

`/client` 导出的是插件体（`apply` / `inject`）以及 `cursor-agent` 文案键联合类型。面板组件留在包内部。

## Model Experience

无。该 overlay 展示的是 Cursor CLI 轮次；那段对话由该 CLI 自己的模型承担。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **隐藏 DSH 界面用的是 CSS，不是 slot 替换** — 占用 `conversation` 会拿掉兄弟插件注入的席位并卡住启动。
- **overlay 会话不是 DSH Session** — 轨上每一项对应一个 Cursor CLI `--resume` id；切换 DSH 侧栏 Session 不会改它们。
- **token 页脚跟随 `result.usage`** — 官方 stream-json 把 `inputTokens` / `outputTokens` / 缓存字段放在回合 `result` 上；CLI 不会在回合中增量推送 usage。
- **选项面从交互 PTY 提取** — overlay 包装输入行下方的 Ink 列表，进行中的 AskQuestion 框也投射到同一张毛玻璃卡片（若同时开着 `/` 则以问题框为准）。Headless `--print` 会跳过 AskQuestion；网关拦截该 `tool_call` 并把表单投射到这张卡片（始终追加可输入的 Other），方向键移动、空格在普通项上勾选或在 Other 上输入、高亮 Other 时可打印键和 IME 写入该行、Enter 确认当前高亮项，并发送真正的答案 prompt。输入框与聚焦的毛玻璃卡片共用这一套 `{op:"keys"}`；卡片把焦点放在内部输入框上，这样 CJK IME 可以像在对话输入框里一样组字。罕见菜单仍可能需要更新提取器。聊天文本来自 headless `stream-json`，不是屏幕摘取。
- **没有完整的 Cursor `/jobs` 任务板** — 当收到事件时，并发 `taskToolCall` 行与 running-agents 条近似 TUI「N tasks」；没有单独的 ACP/`cursor/task` 面。
- **忙碌时 follow-up 的 `steer` 是杀掉再 resume** — 见 agent-gateway 的限制说明。
- **面板几何只存在于本浏览器** — 展开外框、精灵原点和收起标志写入 `localStorage`（`dsh.cursor-overlay.geometry`），只对当前源有效。清除站点数据后回到默认居中外框。
- **轨上的 Chat N 只跟本次 `dsh web` 进程走** — `dsh.cursor-overlay.rail` 把 id 和名称连同 index meta 的 boot id 一起存。同一进程里刷新会接着计数；新进程从 Chat 1 起算。
- **宿主重启会丢掉 overlay CLI** — 只有 `dsh web` 仍持有该 runtime 时，重连才能恢复会话。
- **dsh_mcp 文案跟随 `mcp list-tools dsh`** — 宿主用同一套 CLI argv 探测；已经在没有 `dsh` 的情况下开跑的 `--print` 回合目录仍是空的，直到下一次 spawn。标签不能解开那次冻结。
- **卡片的隐藏和插入先打 `/overlay-card` 再打 `/overlay-card-plug`，桌面占用者和独立 fiber 先打 `/overlay-plugins-rail` 再打 `/overlay-plugins`** — 第一次 `/overlay-card` 的 `apply` 不会热换；只读 list 的处理会拒绝 `instances.setHidden` 和 `occupants.setInserted`。Cursor 面板随后通过 `/overlay-card-plug` 写入。卡片隐藏改 `instances.json`；卡片拔出在现场 profile patch 上给占用者设 `disabled`。桌面卸下/切换桌面会互斥启用或禁用 `overlay-desktop.body` 占用者。栏顶桌面行是该占用者，不是基模。基模不是列表行。独立 fiber 的拔出写该 Loader 行的 `disabled`；不提供隐藏。`overlay:live` 会写 `./overlay-plugin-rail-rpc.mjs`，以便本包已缓存的 `apply` 仍在提供过时的 `/overlay-plugins` 时能挂上 `/overlay-plugins-rail`。浮层不调用 `overlay:live remove`。
