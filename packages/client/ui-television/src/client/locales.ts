/** `overlay-television` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-television'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'set.label': '电视机',
  'screen': '屏幕',
  'channel.label': '频道',
  'channel.go': '换台',
  'channel.invalid': '打不开这个地址',
  'brand': '远眺',
}

/** English dictionary (same key set). */
export const en: Record<TelevisionKey, string> = {
  'set.label': 'Television',
  'screen': 'Screen',
  'channel.label': 'Channel',
  'channel.go': 'Tune',
  'channel.invalid': 'That address will not open',
  'brand': 'Yuantiao',
}

/** Union of this namespace's dictionary keys. */
export type TelevisionKey = keyof typeof zh
