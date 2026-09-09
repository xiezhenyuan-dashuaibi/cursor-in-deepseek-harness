# Agent Note: Cursor CLI enter/exit DSH-mode skills

Status: implemented
Archived: 2026-08-31

English | [中文](2026-08-31-cursor-cli-dsh-mode-skills.zh.md)

## Problem

The floating Cursor CLI is the chat brain, but it has no durable way to pick up DeepSeek Harness extra capabilities without either restating the whole DSH tool set (including file/shell clones Cursor already owns) or stuffing that prompt into chat history, where compact drops it.

## Decision

Two project Cursor skills, [enter-dsh-mode](../../../../.cursor/skills/enter-dsh-mode/SKILL.md) and [exit-dsh-mode](../../../../.cursor/skills/exit-dsh-mode/SKILL.md), run [`@deepseek-ai/dsh-cursor-dsh-mode`](../../../../packages/cursor/dsh-mode/README.md).

First enter in a CLI session panel writes `.cursor/rules/dsh-mode.mdc` with `alwaysApply: true` and prints that extra-capability DSH system-prompt projection (harness identity plus standard-preset extra-tool guidance). Cursor re-injects the rule on later requests, so compact cannot eat it. Later enters in the same session, including re-enter after exit, only print one Chinese reminder: use the `dsh_*` prefix, follow the project prompt, and call only tools named there.

Exit deletes the `.mdc` and prints that the `dsh_*` prefix must stop; available tools are those named in Cursor's system prompt. Session first-enter memory is `.cursor/dsh-mode/state.json` keyed by the Cursor CLI agent pid above `pnpm exec` (or `DSH_CURSOR_SESSION` / `--session-key`), not a forever global flag. A new session panel is first-enter again.

The projection omits DSH clones of Cursor file, shell, search, todo, web, and plan tools. Those stay on Cursor's own system prompt.

## Alternatives considered

**MCP `enter`/`exec`/`exit` bridge.** That would execute DSH tools from Cursor. This change only switches instructions; execution remains a later track.

**Rewrite root `AGENTS.md`.** That file is standing orders for this repository's agents, not a per-session DSH-mode switch, and it would leak extra-tool instructions into every Cursor session in the repo.

**Chat-only injection.** First-enter text in the transcript is lost to `/summarize`. The always-apply project rule is the channel Cursor re-reads every request.

**Live `ctx.systemPrompt.assemble()`.** That needs a booted DSH host and would copy overlapping tools unless filtered anyway. The maintained extra-tool projection is the filter plus the shipped guidance strings.

## Consequences

Invoking 进入 dsh 模式 / 退出 dsh 模式 in the official `agent` TUI (cwd = this repo) runs the skills. Operators still need `packages/cursor/cli` and `agent login`. Generated `.mdc` and state files are gitignored. Two CLI sessions in one workspace share the on-disk rule; first-enter vs reminder follows the session key. Extra-tool JSON calling is [`mcp-server`](../../../../packages/cursor/mcp-server/README.md); MCP presence is using DSH tools, and these skills are not that path. The MCP-facing extra-tool projection is [`mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md); see [the MCP system-prompt projection Agent Note](2026-08-31-mcp-system-prompt-projection.md) and [the Cursor MCP server Agent Note](2026-08-31-cursor-mcp-server.md).

## Testing

Package tests cover first-enter write + full prompt, same-session reminder, exit deleting the rule, re-enter after exit without reprinting the prompt, a new session key as first-enter, overlapping tool names absent from the projection, Node `--import tsx/esm` launch of the skill CLI, and byte alignment of identity/jobs/skill/ralph guidance with their owning sources.
