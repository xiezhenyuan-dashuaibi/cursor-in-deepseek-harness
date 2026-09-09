# Agent Note: Subagent 身份投影键保持为 `subagent`

Status: implemented

[English](2026-09-03-subagent-identity-projection-key.md) | 中文

## 问题

`dsh_list_agents` 用 `sessionProjections.snapshot(…).values.subagent`（以及冷恢复上的同一字段）分类每个 child。身份单元的 `ProjectionDefinition.key` 就是该 map 键。把它改成 `dsh_subagent`、当作工具名来处理，会把身份写到列表从不读取的键下。没有值的在线 child 会被省略（创建窗口）；没有值的已定局 child 会变成 `[diagnostic: corrupt]`。因此每个已经进入 idle 的 MCP 额外工具 child，即使日志里有 descriptor 事件，也会被列成 corrupt。

## 决策

身份单元注册为 `subagent`，与 `SessionProjectionMap.subagent` 一致。[面向模型的工具名一律为 `dsh_*`](../architecture/2026-08-31-model-facing-tool-names-dsh-prefix.md) 已经排除非工具标识符；本 map 键属于其中之一。`dsh_subagent` 只保留为 spawn 工具的线上名称。

## 曾考虑的替代方案

**改为从列表读取 `values.dsh_subagent`。** 否决——投影 map 不是工具目录，缓存、API proxy 和测试消费者已经使用 `subagent`。

**同时提供两个键。** 否决——一个单元两套身份；以后再改名仍会漏掉一侧读取。

## 结果

- 有 descriptor 支撑的 child 在折叠成功时会列为 `running`、`idle` 或 `ready`，而不是 `corrupt`。
- Cursor MCP 额外工具冒烟仍有独立缺陷（任务板与可继续 id、parent session 稳定性）。一次性 fork 失败正文由 [turn/end 诊断呈现](2026-09-03-subagent-turn-end-error-diagnostic.md) 负责。

## 测试

`packages/subagent/subagent/tests/timing-projection.spec.ts` 断言 `subagentIdentityProjectionDefinition.key === 'subagent'`，且空日志提供 `values.subagent === null`。`packages/subagent/subagent/tests/list-children.spec.ts` 把已持久化的可继续 child 列为带持久化标签的 `kind: 'child'`；若折叠写在别的键下，该断言会失败。
