# Agent Note: 一次性 subagent 失败会呈现 turn/end 错误消息

Status: implemented

[English](2026-09-03-subagent-turn-end-error-diagnostic.md) | 中文

## 问题

以 `stopReason: 'error'` 结束的一次性 child，已经把结构化失败记在最后一次 `turn/end` 的 `error.message` 上。结算却只把标签 `error` 映射到 `JobOutcome.detail`，并且省略 `output`，因此 `dsh_job_output` 渲染为 `(no new output)` 再跟 `[status: failed, error]`。前台 `stopReasonError` 使用笼统的 `subagent run failed`。Cursor MCP 额外工具冒烟在 `dsh_subagent_fork` 上碰到这一点：子轮次以 `MISSING_CREDENTIAL` 结束。可继续 child 没有 Job，也没有逐条消息结果，因此不走这条路径。

## 决策

`SubagentResult.diagnostic` 是 `stopReason` 为 `error` 且该消息非空时，最后一次 `turn/end` 的 `error.message`。进程内驱动和 SDK 后端通过 `diagnosticFromTurnEnd` 复制它。`settleRun` 在 `error` 停止时把该文本同时写入 `JobOutcome.detail` 和 `JobOutcome.output`，仍然省略 assistant `output`，因此部分回答不会成为任务结果。前台 `stopReasonError` 优先使用 `diagnostic`，而不是 `subagent run failed`。ACP 和 Codex 省略该字段，除非它们之后读取 DSH `turn/end`。

## 曾考虑的替代方案

**把 assistant `output` 放到失败任务上。** 否决——非 `completed` 结果不是成功；前台已经通过 `withPartialText` 在标题后追加部分文本。

**在本进程没有 API key 时，于 spawn 前让 MCP 额外工具失败。** 作为另一项产品决策否决。本变更只停止丢掉已记录的轮次失败。[MCP 服务器 README](../../../../packages/cursor/mcp-server/README.md) 说明子 agent 使用 DSH 凭据，而不是 Cursor 会员身份。

**只把消息放进 `detail`，让 `output` 保持为空。** 否决——`dsh_job_output` 仍会显示 `(no new output)`，把正文藏在状态后缀里。

## 结果

- 一次性凭据或提供方失败会把 turn/end 消息显示在 `dsh_job_output` 上，并作为前台错误标题。
- `cursor-mcp` 进程缺少 `DEEPSEEK_API_KEY` 仍是部署事实。[身份投影键](2026-09-03-subagent-identity-projection-key.md) 仍是独立的列表缺陷。Workflow 与 Ralph 面向父级的文本见[后续的 workflow 诊断](2026-09-04-workflow-child-failure-diagnostic.md)。

## 测试

包测试覆盖 `diagnosticFromTurnEnd`、带和不带 `diagnostic` 的 `settleRun`、进程内从 `finish` 错误分片得到的 `readResult`、SDK 的 `FAKE_REASON_KIND=error` 与 `FAKE_ERROR_MESSAGE`，以及通过真实任务工具的前台 `dsh_subagent` 和后台 `dsh_job_output`。在此源码变更之后，D3 的 Cursor MCP 现场复测仍需重启 stdio 服务器。
