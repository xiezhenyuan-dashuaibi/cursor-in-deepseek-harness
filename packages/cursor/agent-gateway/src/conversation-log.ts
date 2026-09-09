/* v8 ignore file -- @preserve */
/**
 * Append-only JSONL export of one overlay Cursor chat session.
 * Records are operator-facing, not a DeepSeek Harness Session log.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

/** Default cap for one overlay-session JSONL file (8 MiB). */
export const DEFAULT_CONVERSATION_LOG_MAX_BYTES = 8 * 1024 * 1024

/** Hard cap on one string field, in UTF-16 code units. */
export const MAX_CONVERSATION_LOG_RECORD_CHARS = 16_384

/** Replacement written in place of a matched secret. */
export const REDACTED = '[REDACTED]'

/** One JSONL payload before the sink stamps `ts` and `session`. */
export type ConversationLogInput =
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'cursor_event'; readonly event: Record<string, unknown> }
  | {
    readonly kind: 'spawn'
    readonly file: string
    readonly cwd: string
    /** Argv with the user prompt after `--` replaced by `[prompt]`. */
    readonly args: readonly string[]
    readonly approveMcps: boolean
    readonly resume: boolean
  }
  | {
    readonly kind: 'event'
    readonly event: 'open' | 'exit' | 'error' | 'truncated' | 'close'
    readonly exitCode?: number
    readonly message?: string
  }

/**
 * Copy spawn argv for JSONL: redact secrets and hide the prompt text after `--`.
 * @param args - full CLI argv after the program file.
 * @returns a capped, operator-safe argv copy.
 */
export function scrubSpawnArgsForLog(args: readonly string[]): string[] {
  const out = args.map(arg => capLogText(redactSecrets(arg)))
  const dash = out.lastIndexOf('--')
  /* v8 ignore next 3 -- interactive PTY spawns have no trailing `--` prompt. */
  if (dash >= 0 && dash + 1 < out.length) {
    out[dash + 1] = '[prompt]'
    out.length = dash + 2
  }
  return out
}

/** Append-only overlay conversation log. `append` and `close` must not throw. */
export interface ConversationLog {
  /** Overlay session id written on every JSONL record. */
  readonly sessionId: string
  /** Absolute JSONL path chosen when the runtime starts. */
  readonly path: string
  /**
   * Append one prompt, stream event, or lifecycle record.
   * @param input - payload without `ts` / `session`.
   */
  append(input: ConversationLogInput): void
  /** Write the `close` event when the log is still open. Idempotent. */
  close(): void
}

/** Options for {@link createFileConversationLog}. */
export interface FileConversationLogOptions {
  /** Directory that contains `{yyyy-mm-dd}/{session-id}.jsonl`. */
  readonly rootDir: string
  /** Raw session id; sanitized for the filename. */
  readonly sessionId: string
  /** Stop appending text once the file would exceed this many bytes. */
  readonly maxFileBytes: number
  /** Clock for the daily directory and record timestamps; omitted uses local now. */
  readonly now?: () => Date
}

/**
 * Resolve the JSONL root. An empty `conversationLogDir` uses
 * `{cwd}/.cursor/dsh-logs/conversations`. A relative path is joined to `cwd`.
 * @param conversationLogDir - configured directory, or empty for the default.
 * @param cwd - CLI spawn cwd, also the workspace the overlay operates on.
 * @returns an absolute-or-cwd-relative filesystem path (callers pass it to `join`).
 */
export function resolveConversationLogRoot(conversationLogDir: string, cwd: string): string {
  if (conversationLogDir.length === 0) return join(cwd, '.cursor', 'dsh-logs', 'conversations')
  return isAbsolute(conversationLogDir) ? conversationLogDir : join(cwd, conversationLogDir)
}

/**
 * Daily file path for one overlay session.
 * @param rootDir - {@link resolveConversationLogRoot} result.
 * @param sessionId - raw session id.
 * @param at - local calendar date for the directory name.
 * @returns `{root}/{yyyy-mm-dd}/{session-id}.jsonl`.
 */
export function conversationLogFilePath(rootDir: string, sessionId: string, at: Date): string {
  return join(rootDir, formatDay(at), `${sanitizeSessionId(sessionId)}.jsonl`)
}

/**
 * Replace obvious API keys, bearer tokens, and login-query secrets.
 * Heuristic only: stream payloads may still leak values that do not match these patterns.
 * @param text - decoded text.
 * @returns the same text with matched secrets replaced by {@link REDACTED}.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b((?:CURSOR_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY)\s*[=:]\s*)\S+/gi,
      `$1${REDACTED}`,
    )
    .replace(/([?&])(token|code|key|secret|api[_-]?key)=[^\s&]+/gi, `$1$2=${REDACTED}`)
}

/**
 * Cap a long string for a log field.
 * @param text - source text.
 * @returns truncated text.
 */
export function capLogText(text: string): string {
  if (text.length <= MAX_CONVERSATION_LOG_RECORD_CHARS) return text
  return text.slice(0, MAX_CONVERSATION_LOG_RECORD_CHARS)
}

/**
 * Open one session file. The path is fixed at construction (a session that
 * crosses midnight keeps writing to the original daily file).
 * @param options - root, id, size cap, and optional clock.
 * @returns a sink that swallows disk errors so the overlay session stays up.
 */
export function createFileConversationLog(options: FileConversationLogOptions): ConversationLog {
  const now = options.now ?? (() => new Date())
  const sessionId = sanitizeSessionId(options.sessionId)
  const filePath = conversationLogFilePath(options.rootDir, sessionId, now())
  let bytes = 0
  let closed = false
  let truncated = false

  const writePayload = (payload: Record<string, unknown>): void => {
    if (closed) return
    const line = `${JSON.stringify({ ts: now().toISOString(), session: sessionId, ...payload })}\n`
    const lineBytes = Buffer.byteLength(line, 'utf8')
    try {
      mkdirSync(dirname(filePath), { recursive: true })
    } catch (_cannotCreateDir) {
      // A colliding file at a parent path fails the later append; keep the session up.
    }
    try {
      appendFileSync(filePath, line)
    } catch (_cannotAppend) {
      // Disk errors must not kill the overlay chat session.
      return
    }
    bytes += lineBytes
  }

  const writeSized = (payload: Record<string, unknown>): void => {
    if (truncated) return
    const probe = `${JSON.stringify({ ts: now().toISOString(), session: sessionId, ...payload })}\n`
    if (bytes + Buffer.byteLength(probe, 'utf8') > options.maxFileBytes) {
      truncated = true
      writePayload({ kind: 'event', event: 'truncated' })
      return
    }
    writePayload(payload)
  }

  return {
    sessionId,
    path: filePath,
    append(input) {
      if (input.kind === 'prompt') {
        writeSized({ kind: 'prompt', text: capLogText(input.text) })
        return
      }
      if (input.kind === 'cursor_event') {
        writeSized({ kind: 'cursor_event', event: input.event })
        return
      }
      if (input.kind === 'spawn') {
        writeSized({
          kind: 'spawn',
          file: capLogText(input.file),
          cwd: capLogText(input.cwd),
          args: scrubSpawnArgsForLog(input.args),
          approveMcps: input.approveMcps,
          resume: input.resume,
        })
        return
      }
      const event: Record<string, unknown> = { kind: 'event', event: input.event }
      if (input.exitCode !== undefined) event.exitCode = input.exitCode
      if (input.message !== undefined) event.message = capLogText(input.message)
      writePayload(event)
    },
    close() {
      writePayload({ kind: 'event', event: 'close' })
      closed = true
    },
  }
}

function formatDay(at: Date): string {
  const year = String(at.getFullYear()).padStart(4, '0')
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sanitizeSessionId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9_-]/g, '')
  return cleaned.length > 0 ? cleaned : 'session'
}
