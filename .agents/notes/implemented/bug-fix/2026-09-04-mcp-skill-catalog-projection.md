# Agent Note: MCP extra-tool projection omitted the live skill catalog

Status: implemented

English | [中文](2026-09-04-mcp-skill-catalog-projection.zh.md)

## Problem

Native DSH discloses model-invocable skills as a durable `user/message` catalog at `agent/pre-step`: kebab-case `name` and a capped description inside `<available_skills>`. Cursor MCP never runs that waterfall on the client's conversation. [`renderMcpSystemPrompt()`](../../../../packages/cursor/mcp-prompt/README.md) still told the model to call `dsh_skill` with the exact name from "the session skill catalog" while initialize instructions and `dsh_system_prompt` shipped no entries. The model could not see which skills existed or what they were for.

## Decision

[`@deepseek-ai/dsh-tool-skill`](../../../../packages/skill/tool-skill/README.md) exports the catalog entry formatter (`toSkillCatalogEntries`, `renderSkillCatalogLines`) and the shared intro, load-guidance, and empty-catalog sentences. `renderMcpSystemPrompt({ skillCatalog })` embeds those entries in the Skills section using the same `<available_skills>` lines as native, without the native `<system-reminder>` wrapper or the user `/name` gesture sentence (that injection does not run on MCP). An empty catalog states that no skills are available through `dsh_skill`.

[`@deepseek-ai/dsh-cursor-mcp-server`](../../../../packages/cursor/mcp-server/README.md) snapshots `ctx.skills` for the owner Agent at initialize and on every `dsh_system_prompt` call, filters `isModelInvocable`, requires a visible `dsh_skill` tool, and keeps last-good entries when discovery is incomplete. Native `assemble()` and the pre-step catalog remain unchanged. The extra-tool projection note is [MCP system-prompt projection](../feature/2026-08-31-mcp-system-prompt-projection.md); this note owns the catalog channel on that bus.

## Alternatives considered

**Run native pre-step on the MCP owner Agent and hope Cursor sees the session log.** Rejected — Cursor's conversation is not that Agent's transcript.

**Put the list in `dsh_skill`'s tool description.** Rejected — schema descriptions are not a live catalog, and progressive disclosure belongs in the extra-tool instructions the model is told to re-fetch.

**Leave the gap as a Known Limitation.** Rejected — the projection already named a catalog it did not publish.

## Consequences

Token cost of initialize / `dsh_system_prompt` scales with skill count, matching native catalog cost. MCP has no instructions-changed notification; a catalog mutation is visible on the next `dsh_system_prompt` or a new initialize. Cursor workspace skill lists remain a separate client surface and are not this registry snapshot.

## Testing

`packages/cursor/mcp-prompt/tests/prompt.spec.ts` snapshots the empty Skills section against the README fence, greps the shared tool-skill strings, and pins a non-empty `<available_skills>` block to `renderSkillCatalogLines`. `packages/cursor/mcp-server/tests/skill-catalog.spec.ts` and `server.spec.ts` mount a runtime skill and assert initialize plus `dsh_system_prompt` contain that name and description, omit `modelInvocable: false` skills, hide the list when `dsh_skill` is unregistered, and retain last-good on an incomplete snapshot.
