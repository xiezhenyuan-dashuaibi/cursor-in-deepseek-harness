/* v8 ignore file -- @preserve */
/**
 * One overlay session: Cursor CLI runtime plus at most one viewer socket.
 *
 * Interactive PTY owns slash menus and other below-prompt option surfaces
 * (`{op:"keys"}` / `{op:"mirror"}`). Chat turns use headless
 * `--print --output-format stream-json` so the overlay fold receives real
 * assistant / thinking / tool_call / result events — not PTY screen harvest.
 *
 * The PTY and headless child outlive the WebSocket. Socket close detaches the
 * viewer. `{op:"shutdown"}` or {@link AgentChatRuntime.shutdown} stops the CLI.
 */

import { Buffer } from 'node:buffer'
import {
  type ChildProcessWithoutNullStreams,
  spawn as nodeSpawn,
} from 'node:child_process'
import { createInterface } from 'node:readline'
import WebSocket from 'ws'
import { CURSOR_DSH_MCP_URL_ENV } from '@deepseek-ai/dsh-cursor-mcp-server'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { redactSecrets, type ConversationLog } from './conversation-log.ts'
import {
  buildMcpListArgs,
  DSH_MCP_LIST_TIMEOUT_MS,
  DSH_MCP_RETRY_DISCONNECTED_MS,
  readChildOutput,
  settleDshMcpProbe,
  type DshMcpWireStatus,
} from './dsh-mcp-status.ts'
import { buildHeadlessTurnArgs } from './headless-argv.ts'
import { buildInteractiveArgs } from './interactive-argv.ts'
import {
  applyAskQuestionKey,
  createAskQuestionUi,
  isAskQuestionSkipResult,
  projectAskQuestionMirror,
  readAskQuestionForm,
  type AskQuestionForm,
  type AskQuestionUi,
} from './ask-question-event.ts'
import {
  extractPromptMirror,
  findPromptRow,
  isAskQuestionChrome,
  isCliPickerChrome,
  type PromptMirror,
} from './prompt-mirror.ts'
import {
  spawnNodePtySession,
  type InteractivePty,
  type SpawnInteractivePty,
} from './pty-session.ts'
import type { AgentArgv } from './resolve-agent.ts'
import { ScreenBuffer } from './screen-buffer.ts'
import { applySpineFence } from './spine-fence.ts'

/** Injectable interactive PTY spawn (slash / option surfaces). */
export type SpawnAgentChild = SpawnInteractivePty

/** @deprecated Use {@link SpawnInteractivePty}; kept as the historical export name. */
export type { SpawnInteractivePty }

/** Injectable headless child spawn for one stream-json turn. */
export type SpawnHeadlessChild = (
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams

/** Optional lifecycle hook for a registry that owns this runtime. */
export type AgentChatRuntimeHooks = {
  /** Called once from {@link AgentChatRuntime.shutdown} after processes stop. */
  readonly onStop?: () => void
}

/** Working directory plus the resolved CLI program. */
export interface AgentChatRequest extends AgentArgv {
  /** Spawn cwd in this host's filesystem. */
  readonly cwd: string
  /** Append-only overlay conversation log; omitted skips logging. */
  readonly log?: ConversationLog
  /** Interactive PTY spawn; omitted uses node-pty. */
  readonly spawnChild?: SpawnInteractivePty
  /** Headless turn spawn; omitted uses `child_process.spawn`. */
  readonly spawnHeadless?: SpawnHeadlessChild
  /**
   * `mcp list-tools dsh` spawn for overlay `dsh` chrome. Omitted uses
   * `child_process.spawn` in production. Tests that inject {@link spawnHeadless}
   * skip the probe unless they pass this too, so the listing child does not
   * collide with stream-json children.
   */
  readonly spawnMcpList?: SpawnHeadlessChild
  /**
   * Streamable HTTP MCP on this `dsh web` Host. Overlay CLI children inherit
   * `CURSOR_DSH_MCP_URL` so `bin/stdio.mjs` attaches instead of booting
   * `cursor-mcp`.
   */
  readonly mcpAttachUrl?: string
  /** Terminal columns for the interactive PTY. */
  readonly cols?: number
  /** Terminal rows for the interactive PTY. */
  readonly rows?: number
}

/** Host-side overlay CLI that a browser socket can attach to and leave. */
export interface AgentChatRuntime {
  /**
   * Bind a viewer. A previous viewer is closed. Rebind replays the snapshot.
   * @param socket - accepted WebSocket.
   */
  bind: (socket: WebSocket) => void
  /** Kill the PTY and headless child, close the log, and drop the viewer. */
  shutdown: () => void
  /** True after {@link AgentChatRuntime.shutdown} or a failed PTY spawn. */
  readonly dead: boolean
}

/** CLI / overlay status published on the wire. */
type HostStatus = 'starting' | 'idle' | 'running' | 'error'

/** Interval for WebSocket ping frames so idle tabs do not drop the upgrade. */
const PING_INTERVAL_MS = 25_000

/**
 * Start a hybrid Cursor CLI runtime. Call {@link AgentChatRuntime.bind} to
 * attach a viewer. Chat turns start on `{op:"prompt"}` (headless stream-json).
 * The PTY stays for option-surface mirroring only and never harvests assistant text.
 * @param request - executable, base args, cwd, and optional conversation log.
 * @param hooks - optional registry callback when the runtime stops.
 * @returns the runtime; bind a socket to send `{op:"ready"}` and a snapshot.
 */
export function createAgentChatRuntime(
  request: AgentChatRequest,
  hooks?: AgentChatRuntimeHooks,
): AgentChatRuntime {
  /* v8 ignore next -- production omits spawnChild and uses spawnNodePtySession. */
  const spawnPty = request.spawnChild ?? spawnNodePtySession
  /* v8 ignore next -- production omits spawnHeadless and uses defaultSpawn. */
  const spawnHeadless = request.spawnHeadless ?? defaultSpawn
  const spawnMcpList = request.spawnMcpList
    ?? (request.spawnHeadless === undefined ? defaultSpawn : undefined)
  const cols = request.cols ?? 100
  const rows = request.rows ?? 32
  const screen = new ScreenBuffer(cols, rows)
  let pty: InteractivePty | undefined
  let child: ChildProcessWithoutNullStreams | undefined
  let mcpListChild: ChildProcessWithoutNullStreams | undefined
  let dshMcpStatus: DshMcpWireStatus = spawnMcpList === undefined ? 'disconnected' : 'checking'
  let mcpRetryTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let spawnFailed: string | undefined
  let cliReady = false
  let ignoreNextExit = false
  let cursorSessionId: string | undefined
  let lastMirror: PromptMirror = { input: '', below: [] }
  let pendingAsk: AskQuestionForm | undefined
  let askUi: AskQuestionUi | undefined
  let hostStatus: HostStatus = 'starting'
  let hostStatusMessage: string | undefined
  let viewer: WebSocket | undefined
  let pingTimer: ReturnType<typeof setInterval> | undefined
  const transcriptEvents: Record<string, unknown>[] = []
  /** Follow-ups waiting for the current headless turn to exit (`mode:"queue"`). */
  const pendingFollowUps: string[] = []

  request.log?.append({ kind: 'event', event: 'open' })

  try {
    const args = buildInteractiveArgs(request.args)
    pty = spawnPty(request.file, args, {
      cwd: request.cwd,
      env: overlayChildEnv(request.mcpAttachUrl),
      cols,
      rows,
    })
    request.log?.append({
      kind: 'spawn',
      file: request.file,
      cwd: request.cwd,
      args,
      approveMcps: args.includes('--approve-mcps'),
      resume: false,
    })
  } catch (error) {
    spawnFailed = error instanceof Error ? error.message : String(error)
    request.log?.append({ kind: 'event', event: 'error', message: spawnFailed })
    hostStatus = 'error'
    hostStatusMessage = spawnFailed
  }

  const push = (payload: unknown): void => {
    sendText(viewer, payload)
  }

  const publishStatus = (status: HostStatus, message?: string): void => {
    hostStatus = status
    hostStatusMessage = message
    if (message !== undefined) {
      push({ op: 'status', status, message })
      return
    }
    push({ op: 'status', status })
  }

  const publishEvent = (event: Record<string, unknown>): void => {
    transcriptEvents.push(event)
    push({ op: 'event', event })
  }

  const snapshotPayload = (): Record<string, unknown> => ({
    op: 'snapshot',
    status: hostStatus,
    ...(hostStatusMessage !== undefined ? { message: hostStatusMessage } : {}),
    events: [...transcriptEvents],
    followUps: [...pendingFollowUps],
    cursorSessionId: cursorSessionId ?? null,
    mirror: lastMirror,
    dshMcp: dshMcpStatus,
  })

  const emitFollowUp = (
    status: 'queued' | 'popped' | 'started' | 'cleared',
    text?: string,
  ): void => {
    push({
      op: 'followup',
      status,
      ...(text !== undefined ? { text } : {}),
      items: [...pendingFollowUps],
    })
  }

  const stopChild = (): void => {
    if (child === undefined) return
    const running = child
    child = undefined
    ignoreNextExit = true
    try {
      running.kill()
    } catch {
      // Process exit races interrupt/close.
    }
  }

  const stopPty = (): void => {
    if (pty === undefined) return
    const running = pty
    pty = undefined
    try {
      running.kill()
    } catch {
      // Exit races close.
    }
  }

  const stopPing = (): void => {
    if (pingTimer === undefined) return
    clearInterval(pingTimer)
    pingTimer = undefined
  }

  const stopMcpList = (): void => {
    if (mcpRetryTimer !== undefined) {
      clearTimeout(mcpRetryTimer)
      mcpRetryTimer = undefined
    }
    if (mcpListChild === undefined) return
    const running = mcpListChild
    mcpListChild = undefined
    try {
      running.kill()
    } catch {
      // Probe exit races shutdown.
    }
  }

  const publishDshMcp = (status: DshMcpWireStatus): void => {
    if (dshMcpStatus === status) return
    dshMcpStatus = status
    push({ op: 'dsh_mcp', status })
  }

  const scheduleMcpRetry = (delay: number): void => {
    if (closed || spawnMcpList === undefined) return
    mcpRetryTimer = setTimeout(() => { void runMcpListProbe() }, delay)
  }

  const runMcpListProbe = async (): Promise<void> => {
    if (closed || spawnMcpList === undefined) return
    if (mcpListChild !== undefined) return
    if (dshMcpStatus === 'disconnected') {
      publishDshMcp('checking')
    }
    const listArgs = buildMcpListArgs(request.args)
    let spawned: ChildProcessWithoutNullStreams
    try {
      const fenced = applySpineFence({
        file: request.file,
        args: listArgs,
        cwd: request.cwd,
        env: overlayChildEnv(request.mcpAttachUrl),
      })
      spawned = spawnMcpList(fenced.file, fenced.args, {
        cwd: request.cwd,
        env: fenced.env,
      })
    } catch {
      publishDshMcp('disconnected')
      scheduleMcpRetry(DSH_MCP_RETRY_DISCONNECTED_MS)
      return
    }
    mcpListChild = spawned
    const drain = await readChildOutput(spawned, DSH_MCP_LIST_TIMEOUT_MS)
    if (closed || mcpListChild !== spawned) return
    mcpListChild = undefined
    const settled = settleDshMcpProbe(drain)
    publishDshMcp(settled.status)
    scheduleMcpRetry(settled.retryMs)
  }

  const startPing = (socket: WebSocket): void => {
    stopPing()
    pingTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return
      try {
        socket.ping()
      } catch {
        // Viewer stubs in tests have no ping; live sockets may already be closing.
      }
    }, PING_INTERVAL_MS)
  }

  const detach = (socket: WebSocket): void => {
    if (viewer !== socket) return
    stopPing()
    viewer = undefined
  }

  const teardown = (): void => {
    if (closed) return
    closed = true
    stopChild()
    stopPty()
    stopMcpList()
    stopPing()
    const current = viewer
    viewer = undefined
    if (current !== undefined && current.readyState === WebSocket.OPEN) {
      current.close()
    }
    request.log?.close()
    hooks?.onStop?.()
  }

  const publishMirror = (): void => {
    if (pendingAsk !== undefined && askUi !== undefined) {
      const next = projectAskQuestionMirror(pendingAsk, askUi)
      if (mirrorsEqual(lastMirror, next)) return
      lastMirror = next
      push({ op: 'mirror', input: next.input, below: next.below })
      return
    }
    const next = extractPromptMirror(screen.snapshot())
    if (mirrorsEqual(lastMirror, next)) return
    lastMirror = next
    push({ op: 'mirror', input: next.input, below: next.below })
  }

  const clearAskForm = (): void => {
    if (pendingAsk === undefined) return
    pendingAsk = undefined
    askUi = undefined
    publishMirror()
  }

  const markCliReadyIfPromptVisible = (): void => {
    if (cliReady || closed) return
    const snap = screen.snapshot()
    const promptRow = findPromptRow(
      snap.lines,
      snap.cursorRow,
      snap.reverseRows,
      snap.barBgRows ?? snap.lightBgRows,
      snap.accentRows,
    )
    if (promptRow === undefined) return
    cliReady = true
    // Do not paint idle over an in-flight headless turn.
    if (child === undefined) publishStatus('idle')
  }

  const drainFollowUp = (): boolean => {
    const queued = pendingFollowUps.shift()
    if (queued === undefined) return false
    emitFollowUp('started', queued)
    beginPrompt(queued)
    return true
  }

  const beginPrompt = (trimmed: string, mode?: 'steer' | 'queue'): void => {
    clearAskForm()
    if (child !== undefined) {
      // Bare prompts while busy default to queue so a UI race (status:running not
      // yet painted) still holds the follow-up instead of erroring out.
      const effective = mode ?? 'queue'
      if (effective === 'queue') {
        pendingFollowUps.push(trimmed)
        emitFollowUp('queued', trimmed)
        return
      }
      // Headless turns have no stdin steer channel; approximate CLI "send now"
      // by stopping the active child and starting a resume turn with the text.
      const queuedAt = pendingFollowUps.indexOf(trimmed)
      if (queuedAt >= 0) pendingFollowUps.splice(queuedAt, 1)
      stopChild()
    }
    if (isClearSlash(trimmed)) {
      stopChild()
      cursorSessionId = undefined
      pendingFollowUps.length = 0
      emitFollowUp('cleared')
      request.log?.append({ kind: 'prompt', text: redactSecrets(trimmed) })
      push({ op: 'cursor_session', sessionId: null })
      publishStatus('idle')
      return
    }

    request.log?.append({ kind: 'prompt', text: redactSecrets(trimmed) })
    publishStatus('running')
    // Echo the user turn so the overlay fold paints before stream-json arrives.
    publishEvent({
      type: 'user',
      timestamp_ms: Date.now(),
      message: { content: [{ type: 'text', text: trimmed }] },
      session_id: cursorSessionId ?? null,
    })
    // Keep the interactive bar clear so mirrored chrome does not fight the dock.
    if (pty !== undefined) {
      try {
        pty.write('\x15')
      } catch {
        // PTY may already be exiting.
      }
    }

    const turnArgs = buildHeadlessTurnArgs(request.args, {
      resumeSessionId: cursorSessionId,
      prompt: trimmed,
    })
    try {
      const fenced = applySpineFence({
        file: request.file,
        args: turnArgs,
        cwd: request.cwd,
        env: overlayChildEnv(request.mcpAttachUrl),
      })
      child = spawnHeadless(fenced.file, fenced.args, {
        cwd: request.cwd,
        env: fenced.env,
      })
      request.log?.append({
        kind: 'spawn',
        file: fenced.file,
        cwd: request.cwd,
        args: fenced.args,
        approveMcps: fenced.args.includes('--approve-mcps'),
        resume: cursorSessionId !== undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      child = undefined
      request.log?.append({ kind: 'event', event: 'error', message })
      publishStatus('error', message)
      push({ op: 'error', message })
      return
    }

    const runningChild = child
    wireChild(runningChild, {
      onLine(line) {
        // A steered replacement may already own `child`; ignore late stdout.
        if (child !== runningChild) return
        const event = parseStreamLine(line)
        if (event === undefined) return
        const sessionFromEvent = readSessionId(event)
        if (sessionFromEvent !== undefined && sessionFromEvent !== cursorSessionId) {
          cursorSessionId = sessionFromEvent
          push({ op: 'cursor_session', sessionId: sessionFromEvent })
        }
        request.log?.append({ kind: 'cursor_event', event: redactEvent(event) })
        const ask = readAskQuestionForm(event)
        if (ask !== undefined) {
          pendingAsk = ask
          askUi = createAskQuestionUi(ask)
          publishMirror()
        }
        if (isAskQuestionSkipResult(event) && pendingAsk !== undefined) {
          stopChild()
          publishStatus('idle')
        }
        publishEvent(event)
      },
      onExit(exitCode, stderrText) {
        const wasCurrent = child === runningChild
        if (wasCurrent) child = undefined
        const stderr = stderrText.trim()
        request.log?.append({
          kind: 'event',
          event: 'exit',
          exitCode,
          ...(stderr.length > 0
            ? { message: redactSecrets(stderr).slice(0, 2000) }
            : {}),
        })
        if (ignoreNextExit) {
          ignoreNextExit = false
          return
        }
        if (!wasCurrent) return
        if (exitCode !== 0 && stderr.length > 0) {
          publishStatus('error', redactSecrets(stderr).slice(0, 2000))
          return
        }
        publishStatus('idle')
        drainFollowUp()
      },
    })
  }

  const onPtyData = (data: string): void => {
    if (closed) return
    screen.write(data)
    publishMirror()
    markCliReadyIfPromptVisible()
  }

  if (pty !== undefined) {
    pty.onData(onPtyData)
    pty.onExit((exitCode) => {
      request.log?.append({
        kind: 'event',
        event: 'exit',
        exitCode,
      })
      pty = undefined
      if (closed) return
      if (exitCode !== 0) {
        publishStatus('error', `Cursor CLI exited with code ${String(exitCode)}`)
      }
    })
  }

  const onClientMessage = (raw: WebSocket.RawData): void => {
    if (closed) return
    applyClientControl(frameText(raw), {
      onPrompt(text, mode) {
        const trimmed = text.trim()
        if (trimmed.length === 0) return
        beginPrompt(trimmed, mode)
      },
      onKeys(data) {
        if (closed) return
        if (pendingAsk !== undefined && askUi !== undefined) {
          const result = applyAskQuestionKey(pendingAsk, askUi, data)
          if (result.kind === 'update') {
            askUi = result.ui
            publishMirror()
            return
          }
          if (result.kind === 'dismiss') {
            clearAskForm()
            return
          }
          if (result.kind === 'submit') {
            beginPrompt(result.text)
            return
          }
          return
        }
        if (pty === undefined) return
        // Chat Enter must not arm PTY harvest — the overlay uses `{op:"prompt"}`.
        // Option surfaces still need every keystroke, including Enter.
        if (
          data.includes('\r')
          && !lastMirror.below.some(line => (
            line.highlighted
            || isCliPickerChrome(line.text)
            || isAskQuestionChrome(line.text)
          ))
          && isChatSubmitDraft(lastMirror.input)
        ) {
          // Client should have sent `{op:"prompt"}` instead; ignore stray Enter.
          return
        }
        pty.write(data)
      },
      onInterrupt() {
        stopChild()
        if (pty !== undefined) {
          try {
            pty.write('\x03')
          } catch {
            // PTY may already be exiting.
          }
        }
        publishStatus('idle')
        // Keep a queued follow-up and start it after the interrupt settles.
        if (drainFollowUp()) return
      },
      onFollowUpCancel() {
        if (pendingFollowUps.length === 0) return
        const removed = pendingFollowUps.pop()
        /* v8 ignore next -- length check guarantees a string. */
        if (removed === undefined) return
        emitFollowUp('popped', removed)
      },
      onReset() {
        stopChild()
        pendingFollowUps.length = 0
        emitFollowUp('cleared')
        cursorSessionId = undefined
        if (pty !== undefined) {
          try {
            pty.write('\x15')
          } catch {
            // PTY may already be exiting.
          }
        }
        push({ op: 'cursor_session', sessionId: null })
        publishStatus('idle')
      },
      onShutdown() {
        teardown()
      },
    })
  }

  const bind = (socket: WebSocket): void => {
    if (closed) {
      sendText(socket, { op: 'error', message: 'session closed' })
      socket.close()
      return
    }
    const previous = viewer
    if (previous !== undefined && previous !== socket) {
      previous.removeAllListeners('message')
      previous.removeAllListeners('close')
      previous.removeAllListeners('error')
      if (previous.readyState === WebSocket.OPEN) previous.close()
    }
    viewer = socket
    startPing(socket)
    sendText(socket, { op: 'ready' })
    sendText(socket, snapshotPayload())
    if (spawnFailed !== undefined) {
      sendText(socket, { op: 'error', message: spawnFailed })
      sendText(socket, { op: 'status', status: 'error', message: spawnFailed })
    }
    socket.on('message', onClientMessage)
    socket.on('close', () => { detach(socket) })
    socket.on('error', () => { detach(socket) })
  }

  void runMcpListProbe()

  return {
    bind,
    shutdown: teardown,
    get dead() { return closed || spawnFailed !== undefined },
  }
}

/**
 * Attach one already-upgraded socket to a hybrid Cursor CLI session.
 * @param socket - accepted WebSocket.
 * @param request - executable, base args, cwd, and optional conversation log.
 * @returns the runtime; socket close detaches, it does not stop the CLI.
 */
export function attachAgentChat(
  socket: WebSocket,
  request: AgentChatRequest,
): AgentChatRuntime {
  const runtime = createAgentChatRuntime(request)
  runtime.bind(socket)
  return runtime
}

function wireChild(
  process: ChildProcessWithoutNullStreams,
  handlers: {
    onLine: (line: string) => void
    onExit: (exitCode: number, stderrText: string) => void
  },
): void {
  const stderrChunks: string[] = []
  process.stderr.setEncoding('utf8')
  process.stderr.on('data', (chunk: string) => { stderrChunks.push(chunk) })
  const lines = createInterface({ input: process.stdout, crlfDelay: Infinity })
  lines.on('line', (line) => { handlers.onLine(line) })
  process.on('error', (error) => {
    handlers.onExit(1, error.message)
  })
  process.on('close', (code) => {
    lines.close()
    handlers.onExit(code ?? 1, stderrChunks.join(''))
  })
}

function applyClientControl(
  text: string,
  handlers: {
    onPrompt: (text: string, mode: 'queue' | 'steer' | undefined) => void
    onKeys: (data: string) => void
    onInterrupt: () => void
    onFollowUpCancel: () => void
    onReset: () => void
    onShutdown: () => void
  },
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return
  }
  /* v8 ignore next -- non-object JSON is ignored. */
  if (typeof parsed !== 'object' || parsed === null) return
  const op = (parsed as { op?: unknown }).op
  if (op === 'prompt') {
    const prompt = (parsed as { text?: unknown }).text
    const modeRaw = (parsed as { mode?: unknown }).mode
    const mode = modeRaw === 'queue' || modeRaw === 'steer' ? modeRaw : undefined
    if (typeof prompt === 'string') handlers.onPrompt(prompt, mode)
    return
  }
  if (op === 'keys') {
    const data = (parsed as { data?: unknown }).data
    if (typeof data === 'string' && data.length > 0) handlers.onKeys(data)
    return
  }
  if (op === 'interrupt') {
    handlers.onInterrupt()
    return
  }
  if (op === 'followup_cancel') {
    handlers.onFollowUpCancel()
    return
  }
  if (op === 'reset') {
    handlers.onReset()
    return
  }
  if (op === 'shutdown') {
    handlers.onShutdown()
  }
}

function parseStreamLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (trimmed.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined
  }
  return parsed as Record<string, unknown>
}

function readSessionId(event: Record<string, unknown>): string | undefined {
  const id = event.session_id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

function redactEvent(event: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(redactSecrets(JSON.stringify(event))) as Record<string, unknown>
  } catch {
    return { type: 'opaque' }
  }
}

function isClearSlash(text: string): boolean {
  return text === '/clear' || text === '/new'
}

function isChatSubmitDraft(input: string): boolean {
  const submitted = input.trim()
  if (submitted.length === 0) return false
  if (submitted.startsWith('/')) return false
  return true
}

function mirrorsEqual(a: PromptMirror, b: PromptMirror): boolean {
  if (a.input !== b.input || a.below.length !== b.below.length) return false
  return a.below.every((line, i) => (
    line.text === b.below[i]?.text && line.highlighted === b.below[i]?.highlighted
  ))
}

function overlayChildEnv(mcpAttachUrl: string | undefined): NodeJS.ProcessEnv {
  const env = scrubbedParentEnv()
  if (mcpAttachUrl !== undefined && mcpAttachUrl.length > 0) {
    env[CURSOR_DSH_MCP_URL_ENV] = mcpAttachUrl
  }
  return env
}

function defaultSpawn(
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams {
  return nodeSpawn(file, [...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function sendText(socket: WebSocket | undefined, payload: unknown): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(payload))
}

function frameText(raw: WebSocket.RawData): string {
  if (typeof raw === 'string') return raw
  /* v8 ignore start -- ws delivers strings in unit tests; binary frames still decode. */
  if (raw instanceof Buffer) return raw.toString('utf8')
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8')
  return Buffer.from(raw).toString('utf8')
  /* v8 ignore stop */
}

/**
 * @deprecated Interactive CLI owns trust dialogs via the below-prompt mirror.
 * Kept so older call sites typecheck as optional.
 */
export type WorkspaceTrustHooks = {
  readonly isTrusted?: (cwd: string) => Promise<boolean>
  readonly hasMcp?: (cwd: string) => Promise<boolean>
  readonly writeMarker?: (cwd: string) => Promise<string>
}
