/** Index-html boot id so the overlay rail can tell one `dsh web` process from the next. */

/** `meta[name]` the host writes and the browser rail reads. */
export const CURSOR_HOST_BOOT_META = 'dsh-cursor-host-boot'

/**
 * Insert the process boot id as a document meta tag.
 * @param html - raw application index HTML.
 * @param bootId - opaque id minted once per host `apply`.
 * @returns HTML containing the meta tag.
 */
export function injectCursorHostBoot(html: string, bootId: string): string {
  const tag = `<meta name="${CURSOR_HOST_BOOT_META}" content="${escapeAttribute(bootId)}">`
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  if (head === null) return `${tag}${html}`
  const at = head.index + head[0].length
  return `${html.slice(0, at)}${tag}${html.slice(at)}`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
