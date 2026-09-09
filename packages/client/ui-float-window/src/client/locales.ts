/** `overlay-card` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-card'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'chrome.identity': '{title} {id}',
  'chrome.empty': '空卡片',
  'chrome.minimize': '缩小',
  'chrome.restore': '展开 {title} {id}',
}

/** English dictionary (same key set). */
export const en: Record<OverlayCardKey, string> = {
  'chrome.identity': '{title} {id}',
  'chrome.empty': 'Empty card',
  'chrome.minimize': 'Minimize',
  'chrome.restore': 'Expand {title} {id}',
}

/** Union of this namespace's dictionary keys. */
export type OverlayCardKey = keyof typeof zh
