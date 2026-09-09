# @deepseek-ai/dsh-cursor-mcp-server

English | [中文](README.zh.md)

stdio MCP server that exposes DeepSeek Harness extra tools to Cursor. Cursor keeps file, shell, search, todo, web, plan, goals, and subagents on its own tools every turn. This plugin is the reverse of [`@deepseek-ai/dsh-mcp-client`](../../mcp/mcp-client/README.md): DSH is the MCP server, Cursor is the client.

`pnpm dsh --profile cursor-mcp` boots `dsh-base` plus this bundle with no Host, HTTP, or browser layer. Stdout is MCP JSON-RPC. The overlay `agent` TUI still needs `pnpm dsh --profile web`; Cursor CLI and the IDE both read [`.cursor/mcp.json`](../../../.cursor/mcp.json), which launches [`bin/stdio.mjs`](bin/stdio.mjs). That entry re-execs Node with an absolute `tsx/esm` import and `cwd` set to the workspace root, so a non-workspace spawn cwd cannot miss `node_modules` and leave the IDE without a `dsh` tool catalog. Approve the server once with `packages/cursor/cli/agent.cmd mcp enable dsh`; `mcp list-tools dsh` prints the filtered catalog. The web overlay launches the CLI with `--approve-mcps --trust` so the TUI session loads project `dsh` without a per-session approval prompt. If an IDE Agent chat has no `dsh` tools, open Cursor Settings → Tools & MCP, toggle `dsh` off/on (or fully restart Cursor), then start a **new** chat — existing sessions do not pick up a late mount.

## Usage

```yaml
- id: cursor-mcp-server
  name: '@deepseek-ai/dsh-cursor-mcp-server'
  config:
    cwd: !!js process.cwd()
```

The plugin awaits the rest of the Loader tree, creates one owner Agent, and connects MCP. `apply` returns before that settlement when a Loader is present so this fiber does not deadlock waiting on itself. `tools/list` is `ctx.tools.schemas()` minus [`MCP_OMITTED_TOOL_NAMES`](../mcp-prompt/README.md), plus `dsh_system_prompt`. `tools/call` runs `ctx.tools.execute()` on the owner Agent. `tools/change` sends MCP `listChanged`. The server does not guess that the model forgot the instructions; the model re-fetches `dsh_system_prompt` (or initialize `instructions`).

The DSH subagent control plane (spawn, query, message, interrupt, job board) is omitted together; Cursor Task owns parent-side delegation. Workflow and Ralph are omitted because their children call the DSH LLM; this catalog does not require `DEEPSEEK_API_KEY`.

## Config

| Field | Required | Description |
|---|---|---|
| `cwd` | no | Workspace cwd for the owner Agent. Empty uses `process.cwd()`. |

## MCP contract

Initialize `serverInfo.name` is `dsh`, so Cursor may show `mcp__dsh__dsh_skill`. Wire names remain `dsh_*`. JSON arguments. Omitted names fail with `isError` and never reach `ctx.tools.execute`.

Sandbox and approval still apply. There is no approval UI on this stdio process; a call that asks may deny or sit until the policy plugin settles.

Extra-tool execute runs on this process's owner Agent, not in the web GUI.

## Model Experience

### Initialize instructions

#### What the model sees

MCP `initialize` `instructions` are the markdown from [`renderMcpSystemPrompt()`](../mcp-prompt/README.md) for the owner Agent's current model-invocable skill catalog. This package snapshots `ctx.skills` and does not duplicate that projection.

#### Token effect

Data-dependent: the static extra-tool wrapper plus the live skill catalog, paid when the client injects initialize instructions.

#### KV Cache effect

Independent of native DSH `assemble()`. Cursor's own system prompt stays the client's prefix.

### `dsh_system_prompt`

#### What the model sees

No-argument tool. The description is:

##### `dsh_system_prompt` description

```markdown
Return DeepSeek Harness extra-capability instructions for this MCP server. Call this when you have never read those instructions, or after compaction dropped them. Do not wait for the server to guess you forgot.
```

The result text is the same markdown as initialize instructions.

#### Token effect

Fixed schema tokens on every request that includes this tool, plus the current projection (including the live skill catalog) when the model calls it.

#### KV Cache effect

Re-fetching after compaction replaces or re-appends the MCP instructions the client injects. This package does not send a DeepSeek Harness provider request for the projection itself.

### Extra-tool catalog

#### What the model sees

Each live `ctx.tools` schema that is not on the omit list, with that tool's name, description, and JSON Schema as MCP `inputSchema`. Owning plugins document those strings; this package only filters and forwards.

#### Token effect

Data-dependent schema cost for every listed extra tool, paid on Cursor's request while the MCP server advertises them.

#### KV Cache effect

Prefix-stable on Cursor's side while the advertised list and schemas are unchanged. A `tools/change` that adds, removes, or edits a schema may invalidate reuse from the first changed tool token.

## Known Limitations and Deferred Work

- **Separate process from the web GUI** — overlay Cursor CLI spawns this profile; extra-tool execute does not appear in the web session.
- **No approval UI** — `ask` policy has no operator widget on stdio; denials surface as tool results.
- **No DSH LLM on this catalog** — workflow and Ralph are omitted ([LLM-child omit note](../../../.agents/notes/implemented/architecture/2026-09-04-mcp-omit-dsh-llm-child-tools.md)). Skill and editor do not call DeepSeek. Cursor membership is not `DEEPSEEK_API_KEY`. Native headless, ACP, and web still register those tools.
- **Process-scoped owner Agent** — `createOwnerAgent` mints `mcp-<uuid>` at each stdio start. Extra-tool session state dies with that process. Concurrent MCP processes for one workspace each have their own owner; they do not share one persisted session id.
- **Resources and Prompts are unused** — instructions are `dsh_system_prompt` plus initialize `instructions`, which Cursor clients invoke more reliably than MCP Resources.
- **No MCP instructions-changed notification** — a skill-catalog mutation is visible on the next `dsh_system_prompt` or a new initialize; incomplete snapshots keep the last complete catalog for that owner Agent.
