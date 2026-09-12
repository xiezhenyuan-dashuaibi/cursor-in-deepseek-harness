/**
 * Host plugin: upgrade `/cursor-agent` to a hybrid Cursor CLI session.
 * An interactive PTY mirrors option surfaces; chat turns spawn headless
 * stream-json. This plugin owns process lifetime and the same Host/Origin
 * trust fence as `/api`. Overlay session runtimes outlive the WebSocket;
 * `{op:"shutdown"}` or plugin dispose stops the CLI.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { cursorMcpAttachUrl } from '@deepseek-ai/dsh-cursor-mcp-server'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  isTrustedApiRequest,
  rejectWebSocketUpgrade,
} from '@deepseek-ai/dsh-client-connection'
import type { WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import WebSocket, { WebSocketServer } from 'ws'
import {
  createAgentChatRuntime,
  type AgentChatRuntime,
  type SpawnAgentChild,
} from './chat-session.ts'
import {
  createFileConversationLog,
  DEFAULT_CONVERSATION_LOG_MAX_BYTES,
  resolveConversationLogRoot,
} from './conversation-log.ts'
import { CURSOR_AGENT_PTY_PATH } from './path.ts'
import { resolveAgentArgv } from './resolve-agent.ts'

export { CURSOR_AGENT_PTY_PATH } from './path.ts'
export { attachAgentChat, createAgentChatRuntime } from './chat-session.ts'
export type {
  AgentChatRuntime,
  AgentChatRuntimeHooks,
  SpawnAgentChild,
  SpawnHeadlessChild,
  WorkspaceTrustHooks,
} from './chat-session.ts'
export { buildInteractiveArgs } from './interactive-argv.ts'
export { buildHeadlessTurnArgs, HEADLESS_PRINT_FLAGS } from './headless-argv.ts'
export {
  applyAskQuestionKey,
  createAskQuestionUi,
  formatAskQuestionAnswers,
  FREEFORM_OPTION_ID,
  isAskQuestionSkipResult,
  projectAskQuestionMirror,
  readAskQuestionForm,
} from './ask-question-event.ts'
export type {
  AskQuestionForm,
  AskQuestionItem,
  AskQuestionKeyResult,
  AskQuestionOption,
  AskQuestionUi,
} from './ask-question-event.ts'
export {
  encodeBrowserKey,
  extractAskQuestionMirror,
  extractPromptMirror,
  isAskQuestionChrome,
} from './prompt-mirror.ts'
export type { MirrorBelowLine, PromptMirror } from './prompt-mirror.ts'
export { ScreenBuffer } from './screen-buffer.ts'
export { BUNDLED_CLI_ROOT, resolveAgentArgv, resolveBundledAgent } from './resolve-agent.ts'
export type { AgentArgv } from './resolve-agent.ts'
export {
  buildMcpListArgs,
  DSH_MCP_LIST_TIMEOUT_MS,
  dshMcpConnectedFromCliOutput,
} from './dsh-mcp-status.ts'
export type { DshMcpWireStatus } from './dsh-mcp-status.ts'

/** Stable Cordis plugin name. */
export const name = 'cursor-agent-gateway'

/** The HTTP server must exist before the upgrade route can register. */
export const inject = ['webServer']

/** Deployment knobs for the Cursor CLI interactive PTY gateway. */
export interface CursorAgentGatewayConfig {
  /**
   * Authorities this deployment serves beyond loopback, matching the
   * connection plugin's `trustedHosts` (exact `host:port`, or port-less `host`).
   */
  trustedHosts?: string[]
  /** Absolute CLI executable; empty uses the bundled `packages/cursor/cli` tree. */
  agentCommand?: string
  /** Extra argv appended after the resolved program arguments (e.g. MCP trust). */
  agentArgs?: string[]
  /**
   * Bundled CLI directory used when `agentCommand` is empty. Empty uses
   * `packages/cursor/cli` beside this package.
   */
  cliRoot?: string
  /** Spawn cwd; empty uses `process.cwd()`. */
  cwd?: string
  /**
   * Append structured chat events to workspace JSONL. `false` disables logging.
   * Omitted defaults to enabled.
   */
  logConversations?: boolean
  /**
   * Directory that contains `{yyyy-mm-dd}/{session-id}.jsonl`. Empty uses
   * `{cwd}/.cursor/dsh-logs/conversations`.
   */
  conversationLogDir?: string
  /**
   * Stop appending sized rows once one session file would exceed this many bytes
   * (default 8388608). Lifecycle events may still be written.
   */
  maxLogFileBytes?: number
}

/** Schema defaults applied by the Loader. */
export const Config: z<CursorAgentGatewayConfig> = z.object({
  trustedHosts: z.array(String).default([]),
  agentCommand: z.string().default(''),
  agentArgs: z.array(String).default([]),
  cliRoot: z.string().default(''),
  cwd: z.string().default(''),
  logConversations: z.boolean().default(true),
  conversationLogDir: z.string().default(''),
  maxLogFileBytes: z.number().min(1).default(DEFAULT_CONVERSATION_LOG_MAX_BYTES),
})

/**
 * Register the `/cursor-agent` upgrade for interactive Cursor CLI sessions.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config?: CursorAgentGatewayConfig): void {
  mountCursorAgentGateway(ctx, config ?? {})
}

/**
 * Same as {@link apply} with an injectable PTY spawner for tests.
 * @param ctx - host plugin context carrying `webServer`.
 * @param config - trusted hosts and CLI location.
 * @param spawnChild - optional interactive PTY stand-in.
 */
export function mountCursorAgentGateway(
  ctx: Context,
  config: CursorAgentGatewayConfig,
  spawnChild?: SpawnAgentChild,
): void {
  const trustedHosts = config.trustedHosts ?? []
  const agentCommand = config.agentCommand ?? ''
  const agentArgs = config.agentArgs ?? []
  const cliRoot = config.cliRoot ?? ''
  /* v8 ignore next -- empty cwd falls back to process.cwd(). */
  const cwd = config.cwd !== undefined && config.cwd.length > 0 ? config.cwd : process.cwd()
  const logConversations = config.logConversations !== false
  /* v8 ignore next -- schema defaults empty string when omitted. */
  const conversationLogDir = config.conversationLogDir ?? ''
  /* v8 ignore next -- schema defaults the byte cap when omitted. */
  const maxLogFileBytes = config.maxLogFileBytes ?? DEFAULT_CONVERSATION_LOG_MAX_BYTES
  const server = new WebSocketServer({ noServer: true })
  const runtimes = new Map<string, AgentChatRuntime>()
  const route: WebUpgradeRoute = {
    path: CURSOR_AGENT_PTY_PATH,
    handler: (req, socket, head) => {
      acceptUpgrade(req, socket, head, {
        trustedHosts,
        agentCommand,
        agentArgs,
        cliRoot,
        cwd,
        logConversations,
        conversationLogDir,
        maxLogFileBytes,
        mcpAttachUrl: cursorMcpAttachUrl(ctx.webServer.port),
      }, server, spawnChild, runtimes)
    },
  }
  ctx.effect(() => {
    const disposeRoute = ctx.webServer.registerUpgrade(route)
    return () => {
      disposeRoute()
      for (const runtime of [...runtimes.values()]) runtime.shutdown()
      runtimes.clear()
      for (const client of server.clients) client.terminate()
      server.close()
    }
  }, 'cursor-agent-gateway: /cursor-agent WebSocket')
}

function acceptUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  config: {
    readonly trustedHosts: readonly string[]
    readonly agentCommand: string
    readonly agentArgs: readonly string[]
    readonly cliRoot: string
    readonly cwd: string
    readonly logConversations: boolean
    readonly conversationLogDir: string
    readonly maxLogFileBytes: number
    readonly mcpAttachUrl: string
  },
  server: WebSocketServer,
  spawnChild: SpawnAgentChild | undefined,
  runtimes: Map<string, AgentChatRuntime>,
): void {
  if (!isTrustedApiRequest(req, config.trustedHosts)) {
    rejectWebSocketUpgrade(socket)
    return
  }
  const sessionKey = overlaySessionKey(req)
  server.handleUpgrade(req, socket, head, (websocket) => {
    try {
      const live = runtimes.get(sessionKey)
      if (live !== undefined && !live.dead) {
        live.bind(websocket)
        return
      }
      const argv = resolveAgentArgv(
        config.agentCommand,
        config.agentArgs,
        config.cliRoot.length > 0 ? config.cliRoot : undefined,
      )
      /* v8 ignore start -- optional log sink and injectable PTY; both arms exercised in mount tests where practical. */
      const log = config.logConversations
        ? createFileConversationLog({
          rootDir: resolveConversationLogRoot(config.conversationLogDir, config.cwd),
          sessionId: sessionKey,
          maxFileBytes: config.maxLogFileBytes,
        })
        : undefined
      const runtime = createAgentChatRuntime({
        ...argv,
        cwd: config.cwd,
        mcpAttachUrl: config.mcpAttachUrl,
        ...(log !== undefined ? { log } : {}),
        ...(spawnChild !== undefined ? { spawnChild } : {}),
      }, {
        onStop() { runtimes.delete(sessionKey) },
      })
      if (!runtime.dead) runtimes.set(sessionKey, runtime)
      runtime.bind(websocket)
      /* v8 ignore stop */
    } catch (error) {
      /* v8 ignore start -- handleUpgrade delivers an open socket; setup throws Error. */
      if (websocket.readyState !== WebSocket.OPEN) return
      const message = error instanceof Error ? error.message : String(error)
      websocket.send(JSON.stringify({ op: 'error', message }))
      websocket.close()
      /* v8 ignore stop */
    }
  })
}

/** Overlay rail ids and UUIDs; anything else mints a fresh anonymous session. */
const OVERLAY_SESSION_KEY = /^[A-Za-z0-9._:-]{1,128}$/

/**
 * Session key from `/cursor-agent?session=`. Missing or invalid values mint a UUID.
 * @param req - upgrade request.
 * @returns the registry key for this overlay CLI runtime.
 */
function overlaySessionKey(req: IncomingMessage): string {
  const url = new URL(req.url ?? '/', 'http://dsh.internal')
  const raw = url.searchParams.get('session')?.trim() ?? ''
  if (OVERLAY_SESSION_KEY.test(raw)) return raw
  return randomUUID()
}
