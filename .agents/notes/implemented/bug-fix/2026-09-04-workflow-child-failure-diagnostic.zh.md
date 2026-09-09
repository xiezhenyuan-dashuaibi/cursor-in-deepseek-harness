# Agent Note: Workflow 与 Ralph 展示失败子 agent 的 turn/end 诊断

Status: implemented

[English](2026-09-04-workflow-child-failure-diagnostic.md) | 中文

## Problem

[一次性 subagent 结算](2026-09-03-subagent-turn-end-error-diagnostic.md) 已经把子 agent 最后一次 `turn/end` 的 `error.message` 复制到 `SubagentResult.diagnostic`，以及 job / 前台 subagent 结果中。Workflow 的 `agent()` 仍兑现 `null` 且不带原因；Ralph 的 round-failed 错误只说子 agent 在产出结构化报告前失败。Cursor MCP 额外工具冒烟在 `MISSING_CREDENTIAL` 上命中这两处：`dsh_workflow` 返回 `{ "text": null }`，`dsh_ralph` 隐藏了凭据消息。`agent()` 继续返回 `null` 是脚本契约；面向父级的工具文本当时丢掉了已记录的失败。

## Decision

worker-thread 引擎把非空的 `SubagentResult.diagnostic` 复制到宿主→worker 的 `ChildResult`，并在 `outcome` 为 `failed` 时写入 `workflow/agent-end`。`agent()` 仍返回 `null`。`dsh_workflow` 在脚本成功结果上以 `childDiagnostics` 列出这些字符串，并在 Native 文本中按子 agent 启动顺序写成 `Child failures:` 块。`dsh_ralph` 把最后一个失败子 agent 的诊断追加到 round-failed 错误。completed 与 cancelled 的 end 省略该字段。Cursor MCP 省略这些父工具（[LLM 子 agent 省略](../architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md)）。缺少 `DEEPSEEK_API_KEY` 仍是原生 headless/ACP/web 的部署事实。

## Alternatives considered

**在存在 diagnostic 时让 `agent()` 抛错。** 否决 — 脚本用 `.filter(Boolean)` 处理普通子 agent 失败；抛错会杀死整个 workflow。

**跨 stdio 重启持久化一个 MCP owner 会话 id。** 此处否决 — 同一工作区的并发 MCP 进程不得共享一个 owner。进程作用域的 `mcp-<uuid>` 仍是 MCP 契约；写在 MCP server README 上。

**只把 diagnostic 放到 `log()`。** 否决 — Cursor MCP 没有 workflow UI 观察器；模型看到的是父级工具文本。

## Consequences

- 失败的 workflow 子 agent 在脚本内仍得到 `null`；父级工具文本会写出 turn/end 消息。
- 当引擎记录了该消息时，Ralph 的 round-failed 错误会包含它。
- `tool-workflow/agent-end` 会话记录仍只有 outcome；面向模型的文本在工具结果上。

## Testing

包测试覆盖宿主 `ChildResult` 转发、worker `workflow/agent-end.diagnostic`、`dsh_workflow` 的 `Child failures:` 渲染，以及 Ralph round-failed 错误文本。Cursor MCP 不广告这些工具。
