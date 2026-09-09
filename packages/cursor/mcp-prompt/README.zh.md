# @deepseek-ai/dsh-cursor-mcp-prompt

[English](README.md) | 中文

面向 MCP 的 DeepSeek Harness 系统提示词投影。原生 `ctx.systemPrompt.assemble()` 不变。Cursor 已经拥有文件、shell、搜索、todo、web、plan、goals 和子 agent（智能体），因此本渲染器只保留 DSH MCP 服务器必须教给模型的额外工具规则。本 checkout 上 Cursor 在 DSH 里的身份写在 `.cursor/rules/`，不写进本投影。

`renderMcpSystemPrompt({ skillCatalog })` 返回该 markdown。Skills 段落是当前模型可调用的目录：与 [`@deepseek-ai/dsh-tool-skill`](../../skill/tool-skill/README.md) 共用的 name 和截断后的 description 行；若没有可用 skill（技能），则给出明确的空目录句。原生 `dsh-tool-skill` 仍把相同条目作为持久 `agent/pre-step` 消息发布；本投影是 MCP 通道，因为 Cursor 看不到那份 transcript。开场白、额外工具列表和执行策略仅用于 MCP：本服务器是 DSH 额外工具、JSON 参数、可选的客户端名称前缀、压缩之后的 `dsh_system_prompt`，以及沙箱和审批仍作用于这些调用。同会话 goal 工具留在 omit 列表里，因为 Cursor 已经暴露 goal 工具。DSH 子 agent 控制面（spawn、查询、发消息、中断、任务板）一并省略，因为 Cursor Task 拥有父侧委派。Workflow 和 Ralph 被省略，因为它们的子 agent 会调用 DSH LLM；由 Cursor 托管的 MCP 不使用该模型。这些名称在原生 DSH 上仍然存在。

本包是提示词库。[`@deepseek-ai/dsh-cursor-mcp-server`](../mcp-server/README.md) 挂载本渲染器并执行列出的额外工具。它不在 web-app 名录里。

## 模型体验

### MCP 系统提示词

#### 模型看到的内容

当 MCP 客户端从未读过这些说明，或压缩（compaction）丢掉了它们，DSH MCP 服务器会返回下方这份 markdown（`dsh_system_prompt` 或 initialize instructions）。`skillCatalog` 省略或为空时，Skills 段落是空目录文本。headless、ACP 和 Code Mode 的原生 `assemble()` 是另一次请求，不是这段文本。

##### MCP 系统提示词（空 skill 目录）

```markdown
This MCP server exposes DeepSeek Harness extras to Cursor (initialize name `dsh`): skills. Call them with JSON arguments that match each tool schema. Names on the wire are `dsh_*`; the client may add a server prefix — still call the MCP tool, not a Cursor built-in with a similar name. Do not call DeepSeek Harness clones of file, shell, search, todo, web, plan, goals, or subagents — use Cursor's own tools for those.

If compaction drops these extra-tool instructions, call `dsh_system_prompt` with no arguments and continue from that markdown.

These extra tools are on this MCP server:

- `dsh_skill`

## Skills

No skills are currently available through the `dsh_skill` tool. Do not use names from earlier skill catalogs.

## Execution policy

DeepSeek Harness still enforces its file sandbox and approval policy on these MCP calls. A denial or escalation is the tool result; follow that result. Do not reroute a denied extra-tool write through Cursor's file or shell tools to bypass it. If a write or mutating shell is denied, stop; do not get around it with git apply, patch, python, or by editing a preload or hook.
```

##### 存在 skill 时的目录

非空的 `skillCatalog` 会用原生 `dsh-tool-skill` 发布的同一套 `<available_skills>` 行替换 Skills 段落，不含原生 `<system-reminder>` 包装，也不含用户 `/name` 手势那一句（该注入不会在 Cursor 对话上运行）：

```markdown
## Skills

A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `<name>`: <normalized-and-capped-description>
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the `dsh_skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
```

#### Token 影响

每次 MCP 返回这份投影时，静态包装占用固定 token，目录 token 随 skill 数量和 `catalogDescriptionMaxLength` 变化。原生 DSH `assemble()` 不包含这段文本。

#### KV Cache 影响

与原生 DSH 提示词组装相互独立。Cursor 自己的系统提示词仍是客户端前缀。压缩之后重新获取这份投影，会替换或再次追加客户端注入的 MCP 说明；本包不发送 DeepSeek Harness 的提供方请求。

## 已知限制与暂缓事项

- **本包没有 MCP 服务器** — `renderMcpSystemPrompt()` 是投影；[`@deepseek-ai/dsh-cursor-mcp-server`](../mcp-server/README.md) 负责对 `ctx.skills` 做 snapshot 并执行列出的 `dsh_*` 工具。
- **原生 `assemble()` 不变** — headless、ACP 和 Code Mode 仍会收到完整的 DSH 系统提示词，包括文件、shell、搜索、goal、任务板、workflow、Ralph 和子 agent 指引。原生 skill 目录仍是持久 `agent/pre-step` 消息。
- **DSH 子 agent 控制面被省略** — Cursor Task 拥有父侧委派。原生组合仍注册 spawn、查询、发消息、中断和任务板；本 MCP 目录隐藏并拒绝这些名称。
- **需要 DSH LLM 的子 agent 工具被省略** — workflow 和 Ralph 会 spawn 通过本进程凭据调用 DeepSeek 的子 agent。由 Cursor 托管的 MCP 不需要 `DEEPSEEK_API_KEY`。扇出和迭代留在 Cursor Task 和 Cursor goals。原生组合仍注册这些工具。
- **没有 MCP instructions-changed 通知** — 目录变更会在下一次 `dsh_system_prompt` 或新的 initialize 上可见，不会推入客户端已经注入的前缀。
