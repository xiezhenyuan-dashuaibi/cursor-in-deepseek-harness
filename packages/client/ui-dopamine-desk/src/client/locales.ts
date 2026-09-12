/** `overlay-dopamine-desk` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-dopamine-desk'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '脉冲奖台',
  'body': '整张桌面就是舞池。踩亮地面圆垫，分数只留在本页。',
  'score': '多巴胺',
  'hitA': '小确幸',
  'hitB': '连击',
  'hitC': '爆发',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Pulse floor',
  'body': 'The whole desktop is the floor. Step on a pad. The score lives on this page only.',
  'score': 'Dopamine',
  'hitA': 'Tiny win',
  'hitB': 'Combo',
  'hitC': 'Burst',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
