# Agent Note: 面向模型的工具名一律为 `dsh_*`

Status: implemented

[English](2026-08-31-model-facing-tool-names-dsh-prefix.md) | 中文

## 问题

DSH 工具与 Cursor 内置工具共用短名，例如 `read` 与 `bash` / `Read` / `Shell`。同时看到两套目录的模型会把“use the read tool”映射到 Cursor 的 `Read`，而不是 DSH 的文件工具。只在 Cursor 注入层加前缀，会让同一能力出现两套名称。

## 决策

每个已交付的面向模型 `ToolSchema.name` 都是 `dsh_*`（`dsh_read`、`dsh_bash`、`dsh_run_code`、`dsh_subagent` 等）。提示词与 Code Mode SDK 成员使用这些名称。执行按 `block.name` 匹配注册表，不做文本扫描。

`scripts/gen-tool-catalog.ts` 采集已交付工具，并拒绝任何不符合 `^dsh_[a-z0-9_]+$` 的名称，包括 `dsh_subagent_fork` 这类 `shippedNames` 别名。`defineTool` 本身不强制该模式，因此测试与演示仍可注册 `echo`。MCP 导入的远端工具保留远端名称，且不在该目录中。

Code Mode 保留的传输工具是 `dsh_run_code`（`dsh-tools` 中的 `RUN_CODE_NAME`）。可配置的 `toolName` 默认值（`dsh_subagent`、`dsh_workflow`）以及 keyed `tool.call.toolview` 注册都跟随线上名称。

Job 的 `kind`、UI 的 `card` / `kind` 渲染意图、Cordis `inject` 服务名、斜杠命令、输入触发源 id，以及 `SessionProjectionMap` 单元键（`subagent`、`subagentTiming`）不是面向模型的工具名，保持原有标识符（[投影键恢复](../bug-fix/2026-09-03-subagent-identity-projection-key.md)）。

## 曾考虑的替代方案

- **只在 Cursor 桥接处加前缀：** 否决——模型仍会在本仓库的提示词、SDK 和日志中看到未加前缀的 DSH 名称，Cursor 映射问题还在。
- **保持未加前缀的名称并禁止 Cursor `Read`/`Shell`：** 否决——产品选择不是 Cursor 黑名单；DSH 名称必须自身可区分。
- **旧名别名：** 否决——项目处于预发布，后端已拒绝旧的磁盘格式；双名称会再次造成碰撞。

## 结果

- 原生 function calling 与 Code Mode 都调用 `dsh_*`（`await tools.dsh_read(...)`）。
- Web keyed 工具行按加前缀的线上名称分发（`key: 'dsh_bash'`）。
- 沙箱提权的 `approval/asked.toolName` 是线上名称（`dsh_write`、`dsh_bash`），不是家族别名。
- DeepSeek `web_search_20250305` 及其他提供方原生工具名保持上游 API 要求；它们不是 DSH 注册表名称。
- MCP 导入的工具保留远端名称或 [MCP 客户端 Agent Note](../feature/2026-07-07-mcp-client-plugin.md) 中的 `mcp__<server>__*` 公开名，且不进入已交付目录采集。
- [Code Mode Agent Note](../feature/2026-06-15-code-mode.md) 中的保留传输标识符同为 `dsh_run_code`。
