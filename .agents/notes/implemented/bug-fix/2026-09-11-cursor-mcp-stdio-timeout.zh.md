# Agent Note: Cursor MCP stdio 必须在客户端 30 秒超时内完成 initialize

Status: implemented

[English](2026-09-11-cursor-mcp-stdio-timeout.md) | 中文

## Problem

Cursor 的 MCP 客户端给 stdio 服务器大约 30 秒完成 `initialize`。`dsh --profile cursor-mcp` 经 tsx 加载整棵 `dsh-base`。在 Windows 上这次握手大约 26 秒；`cursor-agent mcp list` 再包一层大约 31 秒，于是 CLI 把 `dsh` 标成失败。会话开始时没有 `dsh` 就不会再补进该会话。桌面 IDE 会再试一次，有时显示已连接；overlay `--print` 和终端 CLI 不会。overlay CLI 和桌面 IDE 是两套 MCP 客户端；在桌面 Settings 启用 `dsh` 不会给 overlay Cursor 挂上额外工具。`pms_mcp` 失败是另一条 HTTP/OAuth 错误。

## Decision

继续用 `dsh-base` 当 bundle。[`packages/cursor/mcp-server/cordis.patch.yml`](../../../../packages/cursor/mcp-server/cordis.patch.yml) 禁用用不到的 base 行，让 Loader 不再激活它们。Windows 的 `shell`（`pwsh-sandbox`）以及 `permission` / `approval` / `sandbox` / `fs-sandbox` / `skill` / `tool-skill` / `tools` / `agents` / `cursor-mcp-server` 保持启用：`permission-presets` 等待 `shell`，禁用 `pwsh-sandbox` 会以 `cannot create effect on inactive context` 让整树失败。

`$DSH_HOME/profiles/cursor-mcp/cordis.patch.yml` 可以重复同一组禁用；新 profile 以随包 patch 为源。加上该层之后，`cursor-agent --trust --approve-mcps mcp list` 在远低于 30 秒内报告 `dsh: ready`，并列出 `dsh_skill`、`dsh_str_replace_editor`、`dsh_system_prompt`。

## Alternatives considered

**让已打开的对话空等、去桌面 Settings 开关、或把新开 overlay 对话当成重挂步骤。** 否决——Cursor 在会话开始时冻住工具目录；桌面 Settings 是另一套 MCP 客户端；overlay chrome 不会把额外工具挂进正在进行的 `--print` 回合。

**网关预热 / 第一句 prompt 前等待。** 本轮否决——过滤目录和推迟第一句 prompt 都不会缩短 Loader 启动。精简 stdio 树才是 initialize 超时的修复。

**只在 `listMcpTools` 允许名单里留 `dsh_skill`。** 否决作为超时修复——过滤目录不会缩短 Loader 启动。省略表策略仍在 [cursor MCP server](../feature/2026-08-31-cursor-mcp-server.md)。

**改用已编译的 `apps/cli/lib/bin.js` 而不是 tsx 源码。** 本轮否决——`stdio.mjs` 拥有那段 argv；缺少 `apps/cli/lib` 产物时仍会走 tsx。

**把 `pwsh-sandbox` / `tool-pwsh` 和其他 extras 一起禁用。** 否决——`permission-presets` inject `shell`；win32 上的 shell 行是 `pwsh-sandbox`。

## Consequences

之后 extras 真正需要的 `dsh-base` 行会在 Loader 时失败，而不是静默缺能力。重置 cursor-mcp profile 的操作者仍会拿到随包 patch。`pms_mcp` 不在本改动范围内。overlay chrome **dsh_mcp 已连接** 可以在迟到的 `mcp list` 之后翻转；已经打开的那一轮仍然没有额外工具，直到下一次 CLI spawn。Host `/cursor-mcp` 上的 overlay 挂接在路由可应答时跳过这次 Loader 启动；精简 patch 仍服务桌面 IDE 以及挂接失败（[overlay 共享 web MCP](../feature/2026-09-12-overlay-shared-web-mcp.md)）。

## Testing

随包 [`cordis.patch.yml`](../../../../packages/cursor/mcp-server/cordis.patch.yml) 为每个用不到的 `dsh-base` id 写上 `disabled: true`，且不禁用 `pwsh-sandbox`。Windows 上的操作者检查是冷启动 `cursor-agent --trust --approve-mcps mcp list` 在 30 秒内报告 `dsh: ready`。
