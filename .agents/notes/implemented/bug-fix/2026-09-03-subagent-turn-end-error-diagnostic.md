# Agent Note: One-shot subagent failures surface the turn/end error message

Status: implemented

English | [中文](2026-09-03-subagent-turn-end-error-diagnostic.zh.md)

## Problem

A one-shot child that ends `stopReason: 'error'` already records the structured failure on its last `turn/end` `error.message`. Settlement mapped only the tag `error` onto `JobOutcome.detail` and omitted `output`, so `dsh_job_output` rendered `(no new output)` then `[status: failed, error]`. Foreground `stopReasonError` used the generic `subagent run failed`. Cursor MCP extra-tool smoke hit this on `dsh_subagent_fork` when the child turn ended `MISSING_CREDENTIAL`. Continuable children have no Job and no per-message result, so they were not this path.

## Decision

`SubagentResult.diagnostic` is the last `turn/end` `error.message` when `stopReason` is `error` and that message is non-empty. The in-process driver and SDK backend copy it through `diagnosticFromTurnEnd`. `settleRun` puts that text on both `JobOutcome.detail` and `JobOutcome.output` for `error` stops, and still omits assistant `output` so a partial answer is not the task result. Foreground `stopReasonError` prefers `diagnostic` over `subagent run failed`. ACP and Codex omit the field unless they later read a DSH `turn/end`.

## Alternatives considered

**Put assistant `output` on failed jobs.** Rejected — a non-`completed` result is not success; foreground already appends partial text after the headline via `withPartialText`.

**Fail MCP extra tools before spawn when this process has no API key.** Rejected as a different product decision. This change only stops stripping a recorded turn failure. The [MCP server README](../../../../packages/cursor/mcp-server/README.md) documents that children use DSH credentials, not Cursor membership.

**Put the message only in `detail` and leave `output` empty.** Rejected — `dsh_job_output` would keep `(no new output)` and hide the text in the status suffix.

## Consequences

- A one-shot credential or provider failure shows the turn/end message on `dsh_job_output` and as the foreground error headline.
- Missing `DEEPSEEK_API_KEY` in the `cursor-mcp` process remains a deployment fact. [Identity projection key](2026-09-03-subagent-identity-projection-key.md) remains a separate listing defect. Workflow and Ralph parent-facing text is [the workflow diagnostic follow-on](2026-09-04-workflow-child-failure-diagnostic.md).

## Testing

Package tests cover `diagnosticFromTurnEnd`, `settleRun` with and without `diagnostic`, in-process `readResult` from a `finish` error chunk, SDK `FAKE_REASON_KIND=error` with `FAKE_ERROR_MESSAGE`, and both foreground `dsh_subagent` and background `dsh_job_output` through the real job tools. Live Cursor MCP retest of D3 still requires restarting the stdio server after this source change.
