# Agent Note: Cursor CLI enter/exit DSH-mode skills

Status: implemented
Archived: 2026-08-31

[English](2026-08-31-cursor-cli-dsh-mode-skills.md) | 中文

## Problem

漂浮的 Cursor CLI 是聊天大脑，但没有耐久办法拿到 DeepSeek Harness 的额外能力：要么把整份 DSH 工具集（包括 Cursor 已有的文件/终端克隆）再说一遍，要么把那段提示词塞进聊天历史，压缩时会被丢掉。

## Decision

两条项目级 Cursor 技能 [enter-dsh-mode](../../../../.cursor/skills/enter-dsh-mode/SKILL.md) 和 [exit-dsh-mode](../../../../.cursor/skills/exit-dsh-mode/SKILL.md) 会跑 [`@deepseek-ai/dsh-cursor-dsh-mode`](../../../../packages/cursor/dsh-mode/README.md)。

同一 CLI 会话面板里第一次进入时，写入 `alwaysApply: true` 的 `.cursor/rules/dsh-mode.mdc`，并打印这份额外能力的 DSH 系统提示词投影（harness 身份加上 standard 预设的额外工具指导）。之后 Cursor 每轮重注该规则，压缩吃不掉。同会话再次进入（包括退出后再进）只打印一行中文提醒：使用 `dsh_*` 前缀，遵守项目提示词，只调用其中列出的工具。

退出会删除该 `.mdc`，并打印必须停止使用 `dsh_*` 前缀；可用工具以 Cursor 系统提示词里的为准。会话的首次进入记忆是 `.cursor/dsh-mode/state.json`，键为 `pnpm exec` 之上的 Cursor CLI agent pid（或 `DSH_CURSOR_SESSION` / `--session-key`），不是永远生效的全局标志。新的会话面板会再次走首次进入。

投影省略 DSH 里与 Cursor 文件、终端、搜索、待办、网页、计划重复的克隆工具。那些仍留在 Cursor 自己的系统提示词里。

## Alternatives considered

**MCP `enter`/`exec`/`exit` 桥。** 那会从 Cursor 执行 DSH 工具。这次改动只切换指令；执行仍是后续工作。

**改写根目录 `AGENTS.md`。** 那是本仓库 agents 的常驻指令，不是按会话开关的 DSH 模式，还会把额外工具说明漏进仓库里每一次 Cursor 会话。

**只注入聊天。** 首次进入写在 transcript 里的文字会被 `/summarize` 吃掉。always-apply 项目规则才是 Cursor 每轮重读的通道。

**现场调用 `ctx.systemPrompt.assemble()`。** 那需要已启动的 DSH 宿主，不过滤仍会带上重叠工具。维护过的额外工具投影本身就是过滤，外加已发布的指导原文。

## Consequences

在官方 `agent` TUI（cwd = 本仓库）里调用进入 dsh 模式 / 退出 dsh 模式会跑这些技能。操作者仍需 `packages/cursor/cli` 和 `agent login`。生成的 `.mdc` 和状态文件不入库。同一工作区里两条 CLI 会话共用磁盘上的规则；首次进入还是提醒跟会话键走。额外工具的 JSON 调用是 [`mcp-server`](../../../../packages/cursor/mcp-server/README.md)；MCP 在场就是在用 DSH 工具，这些技能不是那条路径。面向 MCP 的额外工具投影是 [`mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md)；见 [MCP 系统提示词投影 Agent Note](2026-08-31-mcp-system-prompt-projection.md) 和 [Cursor MCP 服务器 Agent Note](2026-08-31-cursor-mcp-server.md)。

## Testing

包测试覆盖首次进入写入并打出完整提示词、同会话提醒、退出删除规则、同会话退出后再进不重打提示词、新会话键再次首次进入、投影中不含重叠工具名、用 Node `--import tsx/esm` 拉起技能 CLI，以及 identity/jobs/skill/ralph 指导与所属源文件的字节对齐。
