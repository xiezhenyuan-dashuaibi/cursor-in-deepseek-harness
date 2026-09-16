/** `overlay-flower-pot` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-flower-pot'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'water': '浇水',
  'fertilize': '施肥',
  'soil': '刚栽下的种子',
  'sprout': '冒出嫩芽',
  'seedling': '长成幼苗',
  'bud': '打了花蕾',
  'bloom': '牵牛花开了',
  'wilted': '叶子有点蔫',
  'thirsty': '土有点干',
  'growing': '土还润着',
  'label': '窗台花盆',
}

/** English dictionary (same key set). */
export const en: Record<FlowerPotKey, string> = {
  'water': 'Water',
  'fertilize': 'Fertilize',
  'soil': 'Seed in soil',
  'sprout': 'A sprout',
  'seedling': 'A seedling',
  'bud': 'A bud',
  'bloom': 'Morning glory in bloom',
  'wilted': 'Leaves are wilting',
  'thirsty': 'Soil is dry',
  'growing': 'Soil is still moist',
  'label': 'Windowsill flower pot',
}

/** Union of this namespace's dictionary keys. */
export type FlowerPotKey = keyof typeof zh
