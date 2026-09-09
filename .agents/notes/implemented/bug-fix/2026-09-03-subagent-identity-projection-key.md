# Agent Note: Subagent identity projection key stays `subagent`

Status: implemented

English | [中文](2026-09-03-subagent-identity-projection-key.zh.md)

## Problem

`dsh_list_agents` classifies each child from `sessionProjections.snapshot(…).values.subagent` (and the same field on a cold restore). The identity unit’s `ProjectionDefinition.key` is that map key. Renaming it to `dsh_subagent` as if it were the tool name stored identity under a key listing never reads. A live child with no value is omitted (creation window); a settled child with no value is `[diagnostic: corrupt]`. Every MCP extra-tool child that had already gone idle therefore listed as corrupt, even when its descriptor event was present.

## Decision

The identity unit registers as `subagent`, matching `SessionProjectionMap.subagent`. [Model-facing tool names are `dsh_*`](../architecture/2026-08-31-model-facing-tool-names-dsh-prefix.md) already excludes non-tool identifiers; this map key is one of them. `dsh_subagent` remains the spawn tool’s wire name only.

## Alternatives considered

**Read `values.dsh_subagent` from listing instead.** Rejected — the projection map is not a tool catalog, and every cache, API-proxy, and test consumer already uses `subagent`.

**Serve both keys.** Rejected — two identities for one unit; a later rename would still leave one reader behind.

## Consequences

- A descriptor-backed child lists as `running`, `idle`, or `ready` instead of `corrupt` when the fold succeeds.
- Cursor MCP extra-tool smoke still has separate defects (job-board vs continuable ids, parent-session stability). One-shot fork failure text is owned by [turn/end diagnostic surfacing](2026-09-03-subagent-turn-end-error-diagnostic.md).

## Testing

`packages/subagent/subagent/tests/timing-projection.spec.ts` asserts `subagentIdentityProjectionDefinition.key === 'subagent'` and that an empty log serves `values.subagent === null`. `packages/subagent/subagent/tests/list-children.spec.ts` lists a persisted continuable child as `kind: 'child'` with its durable label, which fails if the fold is stored under a different key.
