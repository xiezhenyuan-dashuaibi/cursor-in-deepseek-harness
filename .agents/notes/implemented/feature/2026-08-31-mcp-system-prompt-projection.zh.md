# Agent Note: MCP 系统提示词投影

Status: implemented

[English](2026-08-31-mcp-system-prompt-projection.md) | 中文

## Problem

Cursor 是 coding agent（编程智能体）。它自己的系统提示词已经覆盖文件、shell、搜索、todo、web、plan、goals、AGENTS.md 以及通用编程卫生规则。原生 `ctx.systemPrompt.assemble()` 仍会前置 DeepSeek Harness 身份、人设、cwd，以及那些重叠的工具段落。若把完整组装结果经 MCP 下发，就会在 Cursor 工具旁边再教一套 `dsh_read` / `dsh_bash` 目录，并把 Cursor 已经注入的规则再花一遍 token。

## Decision

[`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) 为 MCP 客户端渲染一份精简投影。原生 `assemble()` 不变。

投影只保留 Cursor 没有的额外工具规则：`dsh_skill` 以及当前模型可调用的 skill（技能）目录（name 和截断后的 description）。目录条目和加载指引句子由 [`dsh-tool-skill`](../../../../packages/skill/tool-skill/README.md) 拥有；[MCP skill 目录笔记](../bug-fix/2026-09-04-mcp-skill-catalog-projection.md) 拥有在这条总线上发布它们。同会话 goal 工具留在 omit 列表里，因为 Cursor 已经暴露 goal 工具。DSH 子 agent 控制面（spawn、查询、发消息、中断、任务板）一并省略，因为 Cursor Task 拥有父侧委派；[控制面省略笔记](../architecture/2026-09-04-mcp-omit-dsh-subagent-control-plane.md) 拥有该过滤。Workflow 和 Ralph 被省略，因为它们的子 agent 会调用 DSH LLM；[LLM 子 agent 省略笔记](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md) 拥有该过滤。仅用于 MCP 的正文说明：本服务器是 DSH 额外工具（initialize 名为 `dsh`），重叠工具（含 goals 和子 agent）留在 Cursor，线上名称是 `dsh_*` 且客户端可能加前缀，压缩之后用 `dsh_system_prompt` 取回说明，以及 DSH 沙箱和审批仍作用于这些 MCP 调用。

本 checkout 上 Cursor 在 DSH 里的身份、开工时的 MCP 连接检查，以及常驻开发规则提醒，写在 [`.cursor/rules/dsh-cursor-in-dsh.mdc`](../../../../.cursor/rules/dsh-cursor-in-dsh.mdc)。MCP 投影不重复它们。

仅用于 MCP 的正文还说明：被拒绝的额外工具写入不得经 Cursor 的文件或 shell 工具、git apply、patch、python 或编辑 preload／钩子重试。该规则对工作区通用：投影不点名本 checkout 的 spine 前缀。

投影省略：原生 harness 身份（`You are an AI agent powered by DeepSeek Harness.`）、人设、cwd、`harness:source`、`app:web-surface`、文件/shell/搜索/todo/ask-user/web/plan/goal 段落、deliverable-file-reference UI，以及贡献者 `AGENTS.md`（Cursor 已经加载工作区说明）。

没有进入/退出 DSH 模式。MCP 在场就是在用 DSH 工具。服务器不猜测模型忘了说明；客户端在压缩（compaction）之后重新获取 `dsh_system_prompt`（或 initialize instructions）。

## Alternatives considered

**把原生 `assemble()` 改写成这个子集。** 否决 — headless、ACP 和 Code Mode 仍需要完整的 DSH 提示词，包括文件和 shell 指引。

**把 `assemble()` 输出原样经 MCP 下发。** 否决 — 会重复 Cursor 的规则，并重新暴露产品已经禁止的 `dsh_read` / `dsh_bash` 克隆。

**改写额外工具指引，换一份更短的 MCP 提示词。** 否决 — 那些段落就是行为。第二套措辞会与所属插件漂移；测试会 grep 所属源文件，因此原生改动会让本包失败，直到常量同步。

**Cursor 项目规则加上进入/退出技能。** 否决 — JSON 工具调用不该走 skill，而且只要请求上已有 MCP 工具，模式开关就是多余。进入/退出技能和 `@deepseek-ai/dsh-cursor-dsh-mode` 已删除；MCP 是唯一的额外工具路径；不要复活它们。被否决的实验见归档 [`cursor-cli-dsh-mode-skills`](../../archived/feature/2026-08-31-cursor-cli-dsh-mode-skills.md)；本投影才是 MCP 服务器返回的内容。

**猜测「忘了」并主动推送提示词。** 否决 — 由模型重新获取。服务器不得从沉默推断压缩。

## Consequences

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) 会 import `renderMcpSystemPrompt()`，并按省略列表过滤 `ctx.tools.schemas()`。本包仍是提示词库，不在 web-app 名录里。Cursor 可能给工具名加前缀（`mcp__dsh__dsh_skill`）；提醒文案谈的是客户端前缀，而不是某一家厂商的模式。面向模型的名称仍是 `dsh_*`，见[前缀 Agent Note](../architecture/2026-08-31-model-facing-tool-names-dsh-prefix.md)。

## Testing

包测试把空渲染结果对照 README 围栏做快照，要求每个列出的额外工具名都出现，禁止省略名、本 checkout 的 spine 前缀和项目规则里的身份句，grep skill 所属插件以对齐工具描述和目录字符串，并把非空 `<available_skills>` 块钉在共用格式化函数上。
