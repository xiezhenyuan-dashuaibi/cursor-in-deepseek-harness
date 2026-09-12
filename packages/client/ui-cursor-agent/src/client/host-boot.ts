import { CURSOR_HOST_BOOT_META } from '../boot-html.ts'

export { CURSOR_HOST_BOOT_META }

/**
 * Read this `dsh web` process's boot id from the index meta tag.
 * @returns the boot id, or `undefined` when the tag is missing or empty.
 */
export function readHostBootId(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const content = document.querySelector(`meta[name="${CURSOR_HOST_BOOT_META}"]`)?.getAttribute('content')
  if (content === null || content === undefined || content.length === 0) return undefined
  return content
}
