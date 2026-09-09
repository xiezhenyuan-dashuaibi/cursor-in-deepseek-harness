# Agent Note: Cursor Agent spine write deny

Status: implemented

[English](2026-09-01-cursor-spine-write-deny.md) | 中文

## Problem

以 Cursor 为宿主的产品把文件、shell 与搜索留在 Cursor 自己的工具上，并从 MCP 目录中省略 DSH 克隆。因此 DSH 文件沙箱根本看不到这些写入。其默认 `workspace-write` 模式在仓库内也没有路径拒绝名单：当会话 workspace 就是本 checkout 时，仓库下每条路径都可以通过 DSH 工具写入。

因此，把本仓库改成 Cursor 宿主界面的贡献者，在 agent（智能体）补丁 `packages/core`、`vendor`、`packages/boot` 或 `native` 时没有任何机械阻拦。这些树分别拥有循环、vendored Cordis 运行时、profile 启动，以及 Landlock 启动器。编辑它们会让正在 source-launch 的 `cursor-mcp` 或下一次进程启动失败；这与「沙箱已经保护了让项目能跑起来的那些文件」不是一回事。

`dsh web` 上的产品大脑是 [`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) 以 `--print --force` 启动的捆绑 Cursor CLI。项目 `hooks.json` 是 IDE 与 CLI 都可以读的 Cursor 配置文件，但 CLI 的钩子事件覆盖不完整，且 `--force` 会跳过确认。把该子进程套进 DSH `workspace-write` 隔离还会挡住 CLI 需要的 `~/.cursor` 会话与登录写入。

## Decision

两条执行路径共用 [`.cursor/hooks/protect-spine.mjs`](../../../../.cursor/hooks/protect-spine.mjs) 里的拒绝名单：

- **桌面 IDE。**[`.cursor/hooks.json`](../../../../.cursor/hooks.json) 在 `preToolUse` 与 `beforeShellExecution` 上以 `failClosed: true` 运行该脚本。脚本会去掉开头的 UTF-8 BOM（Windows stdin），然后拒绝 Write、StrReplace、Delete，以及目标规范化后落在下列前缀下的变异 shell 命令。
- **Overlay CLI。**当网关 spawn 的 cwd 是本 DeepSeek Harness checkout（本包 `package.json` 名，加上 `packages/core`、`packages/boot`、`vendor` 与 `native`）时，它通过 Node `--import` 与 `NODE_OPTIONS` 注入 [`fence/preload.mjs`](../../../../packages/cursor/agent-gateway/fence/preload.mjs)，并把 `CURSOR_SPINE_FENCE_ROOT` 设为该 cwd。预加载在 CLI 进程内补丁 `fs` / `fs/promises` / `child_process` / `worker_threads`，拒绝同一组前缀。`child_process` 用 `Proxy` 的 `apply`/`construct` 陷阱包装；若把 `spawn` 换成普通 JS 函数，headless `--print` 会挂不上项目 MCP。argv 点名 `worker-server` 或 `packages/cursor/mcp-server/bin/stdio.mjs` 的子进程仍走 spine 的 `decide()` 检查，但不注入 `--import`、也不带预加载的 `NODE_OPTIONS`，以便 print worker 仍能启动项目 `dsh`。预加载缺失则失败即拒绝。不是本 checkout 的消费方项目不会被围栏。

被拒绝的前缀：

- `vendor/` — vendored Cordis；本地分叉必须遵循 [vendor/README.md](../../../../vendor/README.md)
- `packages/core/` — session、agent、agent-loop、tools、system-prompt、scope，以及 [architecture.md](../../../../docs/architecture.md) 中的其他 spine 包
- `packages/boot/` — 每个 `dsh --profile`（含 `cursor-mcp`）都加载的 profile 组合与启动器胶水
- `native/` — Landlock 启动器源码；隔离必须失败即拒绝
- `.cursor/hooks.json` 与 `.cursor/hooks/` — IDE 钩子不得删除自身

读取、ripgrep，以及只是提到这些路径的包管理器／编译器／测试命令仍然允许。`packages/cursor/`、`packages/client/`、组合包补丁和其他产品树下的写入仍然允许。overlay 预加载仍拦截这些拒绝前缀下的 Node `fs`，但解析后的路径 posix 段含 `node_modules` 的除外（pnpm workspace 链接）。最后一个路径分量是被创建或替换的 inode，因此即使该 workspace 符号链接的 realpath 是 spine 源码，替换 `node_modules` 下的链接也允许。父目录已存在的前缀会做 realpath，因此经目录链接写入 spine 源码仍然拒绝。点名 spine **源码** 的 Cursor Write/StrReplace 和变异 shell 仍然拒绝。仓库根目录 `pnpm install`（或 `pnpm install --filter ./packages/client/<name>...`）才是 overlay 让新客户端包解析到 `react` 的路径；不要把另一个包的 `node_modules` 做 junction。`$DSH_HOME` 下的 profile `pnpm install` 仍是现场 `file:` 副本路径。

根目录 [`AGENTS.md`](../../../../AGENTS.md) 已经要求用插件而不是改 loop。仅针对 Cursor 的常驻说明放在 [`.cursor/rules/dsh-cursor-in-dsh.mdc`](../../../../.cursor/rules/dsh-cursor-in-dsh.mdc)（由 DSH 宿主承载的身份、MCP 连接检查、遵循本 checkout 的 AGENTS.md）和 [`.cursor/rules/dsh-spine-protection.mdc`](../../../../.cursor/rules/dsh-spine-protection.mdc)（`alwaysApply: true`），以免根目录字数预算重复这些规则。spine 规则点名钩子和预加载关不上的通道：argv 不带路径的变异 shell、`git apply`／patch／python、编辑 `fence/preload.mjs`，以及仍保有文件工具的 DSH 子进程。MCP 执行策略在 [`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) 里对每个 overlay 工作区陈述子进程工具与重试规则，不写入本 checkout 的前缀。规则和该提示词都不是 overlay 的执行路径。

## Alternatives considered

**把 DSH 沙箱模式抄进 Cursor。**拒绝：那些模式是「禁止写入」、「写入会话 workspace 之下」或「无围栏」。它们从未命名仓库内的核心文件名单，因此没有可抄的清单。把 overlay CLI 限制在 `workspace-write` 下还会拒绝 CLI 用于登录与 resume 的 `~/.cursor`。

**在 `stream-json` 的 `writeToolCall.started` 上杀死 CLI。**拒绝：写入可能已经在进行中；该事件不是 permission 协议。

**在 MCP 服务器上重新暴露 `dsh_write` / `dsh_edit`，让 `fs-sandbox` 围栏它们。**拒绝：MCP 投影的存在就是为了让重叠工具离开 Cursor 的目录；把文件克隆加回去会与 Cursor 的工具重复，且仍然围栏不了 Cursor 自己的 Write 路径。

**保护 `cursor-mcp` 从 `dsh-base` 加载的每一个包。**拒绝：那一组包含 LLM 适配器、沙箱额外能力、skill 与持久化——几乎是整个仓库——会挡住 `packages/cursor` 与 overlay UI 上的普通 Cursor 化工作。那些树上的损坏仍由测试／CI 负责。

**保护 `packages/cursor/mcp-server`，因为本 checkout 用源码启动它。**拒绝：把产品改成 Cursor 宿主就必须编辑那棵树。需要把正在运行的 MCP 进程与编辑隔离的操作者应使用第二份 checkout 或已构建的 `lib/`，本 note 不为此发明机制。

**只有提示词级的 `.cursor/rules`、没有钩子或预加载。**拒绝：规则不是写入围栏；agent 可以忽略它们。

**overlay CLI 只靠项目钩子。**拒绝：无头 `--print --force` 轮次没有文档化的 permission 事件，CLI 钩子覆盖不完整，本仓库不能断言捆绑的 `2026.08.25` CLI 会在 Write 之前启动 `hooks.json`。

**连 `native/` 下的 `node_modules` 也禁止 overlay `fs` 写入。**拒绝——overlay 的 `pnpm install` 会继承本围栏的 `NODE_OPTIONS --import`，workspace 安装必须在 `vendor/`、`packages/core/`、`packages/boot/` 和 `native/` 下链接成员。那些 `node_modules` 树是安装产物。spine 源码仍然拒绝。把另一个包的 `node_modules` 做 junction 不是安装路径。

**不解析、只要路径字符串含 `node_modules` 段就放行。**拒绝——`node_modules` 下的 workspace 目录链接可以指向 spine 源码。该例外作用于解析父目录之后、最后一个分量所命名的 inode。

## Consequences

点名所列前缀的 Cursor Agent 文件工具与变异 shell 会被拒绝，并得到面向 agent 的指示：在 spine 旁边添加插件。当前 Cursor 钩子集合里，Tab 补全没有写入前钩子（`afterTabFileEdit` 是事后的）。一条变异 spine 文件却不带可识别路径的 shell 仍可能漏过钩子；overlay 预加载仍会拦住 Node `fs` 写入以及 `decide()` 判定为变异的 `child_process` 命令。CLI 不经过这些 API 直接 exec 的原生二进制仍可能改动 spine 路径。overlay agent 可以编辑 `packages/cursor/agent-gateway/fence/preload.mjs`，因为那棵树仍为 Cursor 化工作保持可写。Cursor MCP 省略 `dsh_workflow` 和 `dsh_ralph`；若这些父工具再次出现，它们的 DSH 子进程在本 checkout 上仍使用 `workspace-write` 下的 DSH 文件工具，位于本围栏之外。项目规则要求模型不要使用这些通道。

## Testing

`.cursor/hooks/protect-spine.test.mjs` 是 `node --test` 套件：前缀分类、Write 拒绝／允许、Read 允许、变异 shell 拒绝、重定向拒绝、`rg` / `pnpm test` 允许、带 BOM 的 JSON，以及对钩子入口的真实 stdin spawn。

`packages/cursor/agent-gateway/tests/spine-fence.spec.ts` 固定 harness-cwd 检测、`--import` / `NODE_OPTIONS` 注入、预加载缺失时失败即拒绝，在 `--import` 下的真实 Node 子进程：不能对 spine 文件 `writeFileSync` / `copyFileSync` / `open(..., 'w')` / 变异 `spawnSync`，而 `packages/cursor` 下的写入仍然落地，`native/` 下的 `node_modules` 路径可以写入且同级 spine 源码仍被拒绝，经 `node_modules` junction 写入 spine 源码仍被拒绝，realpath 指向 spine 源码的 `node_modules` workspace 符号链接仍可被替换，以及 `packages/cursor/mcp-server/bin/stdio.mjs` 与 `worker-server` 子进程保持无围栏、同级普通 Node 子进程仍加载预加载。`tests/gateway.spec.ts` 断言当程序是 Node 且 cwd 是本 checkout 时，overlay 对话 spawn 会前置 `--import`。
