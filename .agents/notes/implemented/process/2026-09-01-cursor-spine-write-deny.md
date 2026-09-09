# Agent Note: Cursor Agent spine write deny

Status: implemented

English | [中文](2026-09-01-cursor-spine-write-deny.zh.md)

## Problem

The Cursor-hosted product keeps file, shell, and search on Cursor's own tools and omits the DSH clones from the MCP catalog. The DSH file sandbox therefore never sees those writes. Its default `workspace-write` mode also has no in-repo path denylist: when the session workspace is this checkout, every path under the repo is writable through DSH tools as well.

A contributor converting this repository to a Cursor-hosted surface therefore has no mechanical stop if an Agent patches `packages/core`, `vendor`, `packages/boot`, or `native`. Those trees own the loop, the vendored Cordis runtime, profile boot, and the Landlock launcher. Editing them is how a live `cursor-mcp` source-launch or a later process start fails, which is not the same as "the sandbox already protects the files that keep the project running."

The product brain on `dsh web` is the bundled Cursor CLI spawned by [`@deepseek-ai/dsh-cursor-agent-gateway`](../../../../packages/cursor/agent-gateway/README.md) with `--print --force`. Project `hooks.json` is a Cursor config file both the IDE and CLI can read, but CLI hook event coverage is incomplete, and `--force` skips confirmation. Wrapping that child in DSH `workspace-write` confinement would also block `~/.cursor` session and auth writes the CLI needs.

## Decision

Two enforcement paths share the deny list in [`.cursor/hooks/protect-spine.mjs`](../../../../.cursor/hooks/protect-spine.mjs):

- **Desktop IDE.** [`.cursor/hooks.json`](../../../../.cursor/hooks.json) runs that script on `preToolUse` and `beforeShellExecution` with `failClosed: true`. The script strips a leading UTF-8 BOM (Windows stdin), then denies Write, StrReplace, Delete, and mutating shell commands whose targets canonicalize under the prefixes below.
- **Overlay CLI.** When the gateway spawn cwd is this DeepSeek Harness checkout (this package's `package.json` name plus `packages/core`, `packages/boot`, `vendor`, and `native`), it injects [`fence/preload.mjs`](../../../../packages/cursor/agent-gateway/fence/preload.mjs) through Node `--import` and `NODE_OPTIONS`, and sets `CURSOR_SPINE_FENCE_ROOT` to that cwd. The preload patches `fs` / `fs/promises` / `child_process` / `worker_threads` in the CLI process and denies the same prefixes. `child_process` hooks use `Proxy` `apply`/`construct` traps; replacing `spawn` with a plain JS function breaks headless `--print` project MCP mounting. Spawns whose argv names `worker-server` or `packages/cursor/mcp-server/bin/stdio.mjs` keep spine `decide()` checks but do not receive `--import` or a preload-bearing `NODE_OPTIONS`, so the print worker can still start project `dsh`. A missing preload fails closed. A consumer project that is not this checkout is not fenced.

Denied prefixes:

- `vendor/` — vendored Cordis; local divergence must follow [vendor/README.md](../../../../vendor/README.md)
- `packages/core/` — session, agent, agent-loop, tools, system-prompt, scope, and the other spine packages in [architecture.md](../../../../docs/architecture.md)
- `packages/boot/` — profile composition and launcher glue every `dsh --profile` loads, including `cursor-mcp`
- `native/` — Landlock launcher sources; confinement must fail closed
- `.cursor/hooks.json` and `.cursor/hooks/` — the IDE hook must not delete itself

Reads, ripgrep, and package-manager / compiler / test commands that only mention those paths remain allowed. Writes under `packages/cursor/`, `packages/client/`, bundle patches, and other product trees remain allowed. The overlay preload still intercepts Node `fs` under the denied prefixes, except a resolved path whose posix segments include `node_modules` (pnpm workspace links). The last path component is the inode being created or replaced, so replacing a workspace symlink under `node_modules` is allowed even when that link's realpath is spine source. Existing prefixes of the parent are realpath'd so a write through a directory link into spine source stays denied. Cursor Write/StrReplace and mutating shells that name spine source stay denied. Repo-root `pnpm install` (or `pnpm install --filter ./packages/client/<name>...`) is the overlay path that makes a new client package resolve `react`; do not junction another package's `node_modules`. Profile `pnpm install` under `$DSH_HOME` remains the live `file:` copy path.

Root [`AGENTS.md`](../../../../AGENTS.md) already orders plugins instead of loop changes. Cursor-only standing text lives in [`.cursor/rules/dsh-cursor-in-dsh.mdc`](../../../../.cursor/rules/dsh-cursor-in-dsh.mdc) (hosted-by identity, MCP connection check, follow this checkout's AGENTS.md) and [`.cursor/rules/dsh-spine-protection.mdc`](../../../../.cursor/rules/dsh-spine-protection.mdc) (`alwaysApply: true`) so the root word budget does not duplicate those orders. The spine rule names channels the hook and preload do not close: a mutating shell that omits the path, `git apply` / patch / python, editing `fence/preload.mjs`, and DSH children that keep file tools. The MCP execution policy in [`@deepseek-ai/dsh-cursor-mcp-prompt`](../../../../packages/cursor/mcp-prompt/README.md) states the child-tool and retry rule for every overlay workspace without this checkout's prefixes. Neither the rules nor that prompt is the overlay enforcement path.

## Alternatives considered

**Copy DSH sandbox modes into Cursor.** Rejected because those modes are "no writes", "writes under the session workspace", or "unfenced". They never named an in-repo core-file list, so there is nothing to copy. Confining the overlay CLI under `workspace-write` would also deny `~/.cursor`, which the CLI uses for auth and resume.

**Kill the CLI on `stream-json` `writeToolCall.started`.** Rejected because the write can already be in flight; the event is not a permission protocol.

**Re-expose `dsh_write` / `dsh_edit` on the MCP server and let `fs-sandbox` fence them.** Rejected because the MCP projection exists to keep overlapping tools off Cursor's catalog; putting file clones back would duplicate Cursor's tools and still leave Cursor's own Write path unfenced.

**Protect every package `cursor-mcp` loads from `dsh-base`.** Rejected because that set includes LLM adapters, sandbox extras, skills, and persistence — most of the repo — and would block ordinary Cursor-version work in `packages/cursor` and overlay UI. Breakage there stays a test/CI concern.

**Protect `packages/cursor/mcp-server` because this checkout source-launches it.** Rejected because converting the product to Cursor requires editing that tree. Operators who need a live MCP process isolated from edits use a second checkout or built `lib/`, which this note does not invent a mechanism for.

**Prompt-only `.cursor/rules` without hooks or a preload.** Rejected because rules are not a write fence; an Agent can ignore them.

**Rely on project hooks alone for the overlay CLI.** Rejected because headless `--print --force` turns do not document a permission event, CLI hook coverage is partial, and this repository cannot assert that the bundled `2026.08.25` CLI spawns `hooks.json` before Write.

**Deny every overlay `fs` write under `native/` including `node_modules`.** Rejected — overlay `pnpm install` inherits `NODE_OPTIONS --import` of this fence, and a workspace install must link members under `vendor/`, `packages/core/`, `packages/boot/`, and `native/`. Those `node_modules` trees are install artifacts. Spine source stays denied. Junctioning another package's `node_modules` is not the install path.

**Allow any path string that contains a `node_modules` segment without resolving.** Rejected — a workspace directory link under `node_modules` can point at spine source. The exception applies to the inode named by the last component after resolving the parent.

## Consequences

Cursor Agent file tools and mutating shells that name the listed prefixes are denied with an agent-facing instruction to add a plugin beside the spine. Tab completions have no pre-write hook in the current Cursor hook set (`afterTabFileEdit` is post-facto). A shell that mutates a spine file without naming a recognizable path can still slip through the hook; the overlay preload still catches Node `fs` writes and `child_process` commands `decide()` classifies as mutations. A native binary the CLI execs without those APIs can still mutate a spine path. Overlay agents can edit `packages/cursor/agent-gateway/fence/preload.mjs` because that tree stays writable for Cursor-version work. Cursor MCP omits `dsh_workflow` and `dsh_ralph`; if those parent tools reappear, their DSH children keep file tools under `workspace-write` on this checkout and are outside this fence. The project rule instructs the model not to use those channels.

## Testing

`.cursor/hooks/protect-spine.test.mjs` is a `node --test` suite: prefix classification, Write deny/allow, Read allow, mutating-shell deny, redirection deny, `rg` / `pnpm test` allow, BOM-prefixed JSON, and a real stdin spawn of the hook entry.

`packages/cursor/agent-gateway/tests/spine-fence.spec.ts` pins harness-cwd detection, `--import` / `NODE_OPTIONS` injection, fail-closed missing preload, a real Node child under `--import` that cannot `writeFileSync` / `copyFileSync` / `open(..., 'w')` / mutating `spawnSync` a spine file while a `packages/cursor` write still lands, that a `node_modules` path under `native/` writes while sibling spine source stays denied, that a write through a `node_modules` junction into spine source stays denied, that replacing a `node_modules` workspace symlink whose realpath is spine source still succeeds, and that `packages/cursor/mcp-server/bin/stdio.mjs` and `worker-server` children stay unfenced while a sibling Node child still loads the preload. `tests/gateway.spec.ts` asserts the overlay chat spawn prepends `--import` when the program is Node and cwd is this checkout.
