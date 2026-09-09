# Agent Note: MCP 额外工具投影未发布 live skill 目录

Status: implemented

[English](2026-09-04-mcp-skill-catalog-projection.md) | 中文

## Problem

原生 DSH 在 `agent/pre-step` 把模型可调用的 skill（技能）作为持久 `user/message` 目录披露：kebab-case 的 `name` 和截断后的 description，放在 `<available_skills>` 里。Cursor MCP 从不在客户端对话上跑那条瀑布。[`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) 仍让模型用「session skill catalog」里的精确名字调用 `dsh_skill`，但 initialize instructions 和 `dsh_system_prompt` 并不带任何条目。模型看不到有哪些 skill、各自做什么。

## Decision

[`@deepseek-ai/dsh-tool-skill`](../../../../packages/skill/tool-skill/README.md) 导出目录条目格式化函数（`toSkillCatalogEntries`、`renderSkillCatalogLines`）以及共用的开场、加载指引和空目录句子。`renderMcpSystemPrompt({ skillCatalog })` 用与原生相同的 `<available_skills>` 行把这些条目嵌进 Skills 段落，不含原生 `<system-reminder>` 包装，也不含用户 `/name` 手势那一句（该注入不会在 MCP 上运行）。空目录会说明当前没有可通过 `dsh_skill` 使用的 skill。

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) 在 initialize 和每次 `dsh_system_prompt` 调用时为 owner Agent 对 `ctx.skills` 做 snapshot，过滤 `isModelInvocable`，要求 `dsh_skill` 工具可见，并在发现不完整时保留上一份完整条目。原生 `assemble()` 和 pre-step 目录不变。额外工具投影见 [MCP 系统提示词投影](../feature/2026-08-31-mcp-system-prompt-projection.md)；本笔记拥有该总线上的目录通道。

## Alternatives considered

**在 MCP owner Agent 上跑原生 pre-step，指望 Cursor 看到 session log。** 否决 — Cursor 的对话不是那个 Agent 的 transcript。

**把列表放进 `dsh_skill` 的工具描述。** 否决 — schema 描述不是 live 目录，渐进披露应走模型被要求重新获取的额外工具说明。

**把缺口写成 Known Limitation。** 否决 — 投影已经点名一份它并未发布的目录。

## Consequences

initialize / `dsh_system_prompt` 的 token 成本随 skill 数量变化，与原生目录成本一致。MCP 没有 instructions-changed 通知；目录变更会在下一次 `dsh_system_prompt` 或新的 initialize 上可见。Cursor 工作区的 skill 列表仍是另一套客户端表面，不是这份 registry snapshot。

## Testing

`packages/cursor/mcp-prompt/tests/prompt.spec.ts` 把空 Skills 段落对照 README 围栏做快照，grep 共用的 tool-skill 字符串，并把非空 `<available_skills>` 块钉在 `renderSkillCatalogLines` 上。`packages/cursor/mcp-server/tests/skill-catalog.spec.ts` 和 `server.spec.ts` 挂载一条 runtime skill，断言 initialize 与 `dsh_system_prompt` 包含该 name 和 description，省略 `modelInvocable: false` 的 skill，在未注册 `dsh_skill` 时隐藏列表，并在不完整 snapshot 上保留上一份完整目录。
