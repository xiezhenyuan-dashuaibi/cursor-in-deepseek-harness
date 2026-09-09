# @deepseek-ai/dsh-cursor-mcp-prompt

English | [中文](README.zh.md)

MCP-facing DeepSeek Harness system-prompt projection. Native `ctx.systemPrompt.assemble()` is unchanged. Cursor already owns file, shell, search, todo, web, plan, goals, and subagents, so this renderer keeps only extra-tool rules a DSH MCP server must teach. Cursor-in-DSH identity for this checkout lives in `.cursor/rules/`, not in this projection.

`renderMcpSystemPrompt({ skillCatalog })` returns that markdown. The Skills section is the live model-invocable catalog: name and capped description lines shared with [`@deepseek-ai/dsh-tool-skill`](../../skill/tool-skill/README.md), or an explicit empty-catalog sentence when none are available. Native `dsh-tool-skill` still publishes the same entries as a durable `agent/pre-step` message; this projection is the MCP channel because Cursor never sees that transcript. The opener, extra-tool list, and execution policy are MCP-only: this server is DSH extras, JSON args, optional client name prefix, `dsh_system_prompt` after compaction, and sandbox/approval still applying on these calls. Same-session goal tools stay on the omit list because Cursor already exposes goal tools. The DSH subagent control plane (spawn, query, message, interrupt, job board) is omitted together because Cursor Task owns parent-side delegation. Workflow and Ralph are omitted because their children call the DSH LLM; Cursor-hosted MCP does not use that model. Those names still exist on native DSH.

The package is a prompt library. [`@deepseek-ai/dsh-cursor-mcp-server`](../mcp-server/README.md) mounts this renderer and executes the listed extra tools. It is not in the web-app roster.

## Model Experience

### MCP system prompt

#### What the model sees

When an MCP client has never read these instructions, or compaction dropped them, the DSH MCP server returns the markdown below (`dsh_system_prompt` or initialize instructions). The Skills section is empty-catalog text when `skillCatalog` is omitted or empty. Native `assemble()` for headless, ACP, and Code Mode is a separate request and is not this text.

##### MCP system prompt (empty skill catalog)

```markdown
This MCP server exposes DeepSeek Harness extras to Cursor (initialize name `dsh`): skills. Call them with JSON arguments that match each tool schema. Names on the wire are `dsh_*`; the client may add a server prefix — still call the MCP tool, not a Cursor built-in with a similar name. Do not call DeepSeek Harness clones of file, shell, search, todo, web, plan, goals, or subagents — use Cursor's own tools for those.

If compaction drops these extra-tool instructions, call `dsh_system_prompt` with no arguments and continue from that markdown.

These extra tools are on this MCP server:

- `dsh_skill`

## Skills

No skills are currently available through the `dsh_skill` tool. Do not use names from earlier skill catalogs.

## Execution policy

DeepSeek Harness still enforces its file sandbox and approval policy on these MCP calls. A denial or escalation is the tool result; follow that result. Do not reroute a denied extra-tool write through Cursor's file or shell tools to bypass it. If a write or mutating shell is denied, stop; do not get around it with git apply, patch, python, or by editing a preload or hook.
```

##### Skill catalog when skills exist

A non-empty `skillCatalog` replaces the Skills section with the same `<available_skills>` lines native `dsh-tool-skill` publishes, without the native `<system-reminder>` wrapper and without the user `/name` gesture sentence (that injection does not run on the Cursor conversation):

```markdown
## Skills

A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `<name>`: <normalized-and-capped-description>
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the `dsh_skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
```

#### Token effect

Static wrapper tokens on each MCP return of this projection, plus catalog tokens that scale with skill count and `catalogDescriptionMaxLength`. Native DSH `assemble()` does not include this text.

#### KV Cache effect

Independent of native DSH prompt assembly. Cursor's own system prompt stays the client's prefix. Re-fetching this projection after compaction replaces or re-appends the MCP instructions the client injects; this package does not send a DeepSeek Harness provider request.

## Known Limitations and Deferred Work

- **No MCP server in this package** — `renderMcpSystemPrompt()` is the projection; [`@deepseek-ai/dsh-cursor-mcp-server`](../mcp-server/README.md) snapshots `ctx.skills` and executes the listed `dsh_*` tools.
- **Native `assemble()` is unchanged** — headless, ACP, and Code Mode still receive the full DSH system prompt, including file, shell, search, goal, job-board, workflow, Ralph, and subagent guidance. Native skill catalogs remain durable `agent/pre-step` messages.
- **DSH subagent control plane is omitted** — Cursor Task owns parent-side delegation. Native compositions still register spawn, query, message, interrupt, and the job board; this MCP catalog hides and refuses those names.
- **DSH LLM-child tools are omitted** — workflow and Ralph spawn children that call DeepSeek through this process's credentials. Cursor-hosted MCP does not require `DEEPSEEK_API_KEY`. Fan-out and iteration stay on Cursor Task and Cursor goals. Native compositions still register those tools.
- **No MCP instructions-changed notification** — a catalog mutation is visible on the next `dsh_system_prompt` or a new initialize, not pushed into an already-injected client prefix.
