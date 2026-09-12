/**
 * Attach Cursor stdio MCP to a already-listening Streamable HTTP `/cursor-mcp`.
 * Stdout stays JSON-RPC only.
 */

/**
 * True when `url` answers on loopback (any HTTP status except network failure).
 * @param url - `CURSOR_DSH_MCP_URL`.
 * @param timeoutMs - give up and let stdio.mjs spawn cursor-mcp.
 * @returns whether the Host MCP route is reachable.
 */
export async function waitForMcpHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      })
      await res.arrayBuffer()
      return true
    } catch {
      await sleep(100)
    }
  }
  return false
}

/**
 * Forward stdin JSON-RPC lines to Streamable HTTP and write responses to stdout.
 * @param url - `CURSOR_DSH_MCP_URL`.
 * @param stdin - Cursor MCP client stdin.
 * @param stdout - Cursor MCP client stdout.
 */
export async function proxyStdioToHttp(url, stdin = process.stdin, stdout = process.stdout) {
  const { createInterface } = await import('node:readline')
  let sessionId
  const rl = createInterface({ input: stdin })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const message = JSON.parse(trimmed)
    const posted = await postMcp(url, message, sessionId)
    sessionId = posted.sessionId ?? sessionId
    for (const body of posted.bodies) {
      stdout.write(`${JSON.stringify(body)}\n`)
    }
  }
}

async function postMcp(url, message, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId !== undefined) headers['mcp-session-id'] = sessionId
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  })
  const nextSession = res.headers.get('mcp-session-id') ?? undefined
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (text.trim().length === 0) {
    return { sessionId: nextSession, bodies: [] }
  }
  if (contentType.includes('text/event-stream')) {
    return { sessionId: nextSession, bodies: parseSseData(text) }
  }
  return { sessionId: nextSession, bodies: [JSON.parse(text)] }
}

function parseSseData(text) {
  const bodies = []
  for (const block of text.split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload.length === 0 || payload === '[DONE]') continue
      bodies.push(JSON.parse(payload))
    }
  }
  return bodies
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
