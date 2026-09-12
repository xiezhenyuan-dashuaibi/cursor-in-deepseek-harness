/** `overlay-dew-journal` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-dew-journal'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '晨露手帐',
  'body': '记下此刻的天气和一句轻话。盖章只留在本页。',
  'mood': '今日天气',
  'sunny': '晴',
  'breeze': '微风',
  'rain': '小雨',
  'noteLabel': '一句轻话',
  'notePlaceholder': '窗边有一点绿……',
  'action': '盖章',
  'actionDone': '已盖章',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Dew journal',
  'body': 'Pick a sky and one quiet line. The stamp lives on this page only.',
  'mood': 'Today’s sky',
  'sunny': 'Clear',
  'breeze': 'Breeze',
  'rain': 'Drizzle',
  'noteLabel': 'A quiet line',
  'notePlaceholder': 'A little green by the window…',
  'action': 'Stamp',
  'actionDone': 'Stamped',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
