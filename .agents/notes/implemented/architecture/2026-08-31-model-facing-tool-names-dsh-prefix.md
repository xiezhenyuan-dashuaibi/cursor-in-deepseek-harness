# Agent Note: Model-facing tool names are `dsh_*`

Status: implemented

English | [中文](2026-08-31-model-facing-tool-names-dsh-prefix.zh.md)

## Problem

DSH tools and Cursor built-in tools share short names such as `read` and `bash` / `Read` / `Shell`. A model that sees both catalogs maps “use the read tool” onto Cursor’s `Read` instead of DSH’s file tool. Prefixing only at a Cursor injection layer would teach two names for one capability.

## Decision

Every shipped model-facing `ToolSchema.name` is `dsh_*` (`dsh_read`, `dsh_bash`, `dsh_run_code`, `dsh_subagent`, …). Prompts and Code Mode SDK members use those names. Execution matches `block.name` against the registry; there is no text scan.

`scripts/gen-tool-catalog.ts` harvests shipped tools and rejects any name that is not `^dsh_[a-z0-9_]+$`, including `shippedNames` aliases such as `dsh_subagent_fork`. `defineTool` itself does not enforce the pattern, so tests and demos may still register `echo`. MCP-imported remote tools keep the remote name and are outside that catalog.

The reserved Code Mode transport is `dsh_run_code` (`RUN_CODE_NAME` in `dsh-tools`). Configurable `toolName` defaults (`dsh_subagent`, `dsh_workflow`) and keyed `tool.call.toolview` registrations follow the wire name.

Job `kind` values, UI `card` / `kind` render intents, Cordis `inject` service names, slash commands, input-trigger source ids, and `SessionProjectionMap` unit keys (`subagent`, `subagentTiming`) are not model-facing tool names and keep their existing identifiers ([projection-key restore](../bug-fix/2026-09-03-subagent-identity-projection-key.md)).

## Alternatives considered

- **Prefix only at a Cursor bridge:** rejected — the model would still see unprefixed DSH names in this repo’s prompts, SDK, and logs, so Cursor mapping would remain.
- **Keep unprefixed names and forbid Cursor `Read`/`Shell`:** rejected — the product choice is not a Cursor denylist; DSH names must be distinct on their own.
- **Old-name aliases:** rejected — the project is pre-release and backends already refuse old on-disk formats; dual names recreate the collision.

## Consequences

- Native function-calling and Code Mode both call `dsh_*` (`await tools.dsh_read(...)`).
- Web keyed tool rows dispatch on the prefixed wire name (`key: 'dsh_bash'`).
- Sandbox-escalation `approval/asked.toolName` is the wire name (`dsh_write`, `dsh_bash`), not a family alias.
- DeepSeek `web_search_20250305` and other provider-native tool names stay as the upstream API requires; they are not DSH registry names.
- MCP-imported tools keep the remote or `mcp__<server>__*` public name from [the MCP client Agent Note](../feature/2026-07-07-mcp-client-plugin.md) and stay outside the shipped catalog harvest.
- The Code Mode reservation in [the Code Mode Agent Note](../feature/2026-06-15-code-mode.md) is the same identifier: `dsh_run_code`.
