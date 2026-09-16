/** HTTP(S) address accepted by the television channel plate. */

/**
 * Normalize a channel-plate string into an http(s) URL.
 * Bare hosts gain an `https://` prefix. Non-http schemes are rejected.
 * @param raw - typed channel text.
 * @returns a canonical href, or `undefined` when the text is not a web page.
 */
export function parseChannelUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  return parsed.href
}
