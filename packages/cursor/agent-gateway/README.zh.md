# @deepseek-ai/dsh-cursor-agent-gateway

[English](README.md) | 中文

面向 web 聊天浮层的 WebSocket 网关。插件在 `ctx.webServer` 上注册精确升级路径 `/cursor-agent`。一个 overlay 会话键（该路径上的 `?session=`，或新铸的 UUID）拥有长驻交互式 Cursor CLI PTY（去掉 headless 的 `--print` / `--force`），用于 slash 菜单与其它输入行下方选项面；每条聊天 `{op:"prompt"}` 另起 headless `--print --output-format stream-json` 子进程（首次拿到 `session_id` 后带 `--resume`）。WebSocket 是可替换的查看者：关闭只卸下查看者；`{op:"shutdown"}` 或插件销毁才停下 CLI。

`{op:"keys",data}` 写入交互 PTY。每次屏幕更新时网关发布 `{op:"mirror",input,below}`，用于灰色输入栏及其下方行。失败回合横幅（`Error: [aborted] …`、`ECONNRESET`）是状态 chrome：既不是 `input`，也不是选项行。对话 transcript 只来自 headless NDJSON 的 `{op:"event"}`——从不把 PTY 屏幕摘取成助手文本。忙碌 follow-up 使用 `{op:"prompt",mode:"queue"}`（退出时 FIFO 排空）与 `{op:"followup_cancel"}`（LIFO 弹出）；`mode:"steer"` 杀掉当前子进程并开 resume 回合。`{op:"interrupt"}` 杀掉 headless 子进程并向 PTY 发 Ctrl+C；`{op:"reset"}` 清空 resume id 与队列。新查看者在实时帧之前收到 `{op:"snapshot"}`（`status`、`events`、`followUps`、`cursorSessionId`、`mirror`）。当 spawn cwd 是本 DeepSeek Harness checkout 时，headless 回合通过 Node `--import` 与 `NODE_OPTIONS` 注入 `fence/preload.mjs`。

当启用 `logConversations`（默认）时，每个 overlay 会话键在 `{cwd}/.cursor/dsh-logs/conversations/{yyyy-mm-dd}/{session-id}.jsonl` 下追加结构化 JSONL。Host/Origin 栅栏是连接插件的 `isTrustedApiRequest`。

## Model Experience

无；模型对话由 Cursor CLI 拥有，本网关只做中继。

#### KV Cache effect

无；本包既不组装也不发送 DeepSeek Harness provider 请求。

## Known Limitations and Deferred Work

- **JSONL 面向操作者，不是 DSH Session 日志** — 聊天回合走 headless stream-json；交互 PTY 只服务选项面。
- **忙碌 follow-up 的 `steer` 是杀掉再 resume** — headless 回合没有 stdin steer 通道。
- **spine preload 补丁 Node `fs` / `child_process`** — 不经这些 API 的原生二进制仍可能改写 spine 路径。桌面 IDE 仍以项目 hook 为第二道防线。`worker-server` 与 `packages/cursor/mcp-server/bin/stdio.mjs` 的 spawn 会剥掉该 preload，以便项目 `dsh` MCP 仍可挂载。spine 前缀下解析后的 `node_modules` 路径是安装产物，因此 overlay 的 `pnpm install` 可以链接 workspace 成员。替换 `node_modules` 下的 workspace 符号链接是允许的；经目录链接写入 spine 源码仍然拒绝。
- **输入行检测以灰色输入条油漆为准** — 彩色选中洗并不算输入条。缺少该油漆且输入行下方有选项面时（筛选页脚、按键 `[y]` 行、slash 双列选项），提取器把 slash、空草稿或 home tip 当作输入条；选项标签永远不会成为输入条。没有输入条的整屏 Ink 分页器仍镜像其内容，并跳过 CLI 页头。进行中的 AskQuestion Ink 框（`AskQuestion` 加上进度、`[ ]` 行或 `Space select` 页脚）会先提取到同一份 `{op:"mirror"}.below`，并优先于同时出现的 slash 菜单。
- **Headless `--print` 会伪造 AskQuestion 跳过** — stream-json 回合没有 IDE 表单，CLI 会立刻返回 `Questions skipped by the user`。网关拦截该 `tool_call`，把题目投射到毛玻璃卡片（去掉末尾兜底项后始终追加 Cursor 的可输入 Other），停掉被跳过的子进程，并把 overlay 按键当成真正的答案 `{op:"prompt"}`（方向键移动；空格在普通项上勾选、在 Other 上输入空格；高亮 Other 时可打印键和 IME 提交写入该行；Enter 确认当前高亮项，Other 空提交时答案为 `Other`）。没有待答 AskQuestion 时，slash 的 `{op:"keys"}` 仍写入交互 PTY。
- **屏幕缓冲使用 xterm 延迟换行** — 整行写满后再跟 CRLF 不得跳行，否则滚动 slash 菜单会留下重复项。
- **Cursor IDE `agent-transcripts` 是另一产品** — 本日志只服务 `dsh web` overlay 会话。
- **Cursor CLI 的寿命长于查看套接字** — 标签页掉线会重连；`{op:"shutdown"}` 或插件销毁才停下 CLI。宿主重启会丢掉所有 runtime。
