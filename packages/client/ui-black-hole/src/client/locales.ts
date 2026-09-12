/** `overlay-black-hole` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-black-hole'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '黑洞',
  'kicker': '事件视界',
  'clockLabel': '坐标时',
  'stats': '已吞没 {count} 枚光子',
  'hint': '场景可穿透，卡片和对话仍可点到。',
  'ingest': '投入光子',
  'notice': '一枚光子越过了视界。',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Black hole',
  'kicker': 'Event horizon',
  'clockLabel': 'Coordinate time',
  'stats': 'Swallowed {count} photons',
  'hint': 'The scene is click-through; cards and conversation stay reachable.',
  'ingest': 'Drop a photon',
  'notice': 'A photon crossed the horizon.',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
