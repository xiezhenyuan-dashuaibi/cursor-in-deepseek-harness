/** `overlay-desktop` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-desktop'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'empty': '空桌面',
}

/** English dictionary (same key set). */
export const en: Record<OverlayDesktopKey, string> = {
  'empty': 'Empty desktop',
}

/** Union of this namespace's dictionary keys. */
export type OverlayDesktopKey = keyof typeof zh
