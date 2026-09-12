/** `overlay-koi-pond` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-koi-pond'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '摸鱼缸',
  'kicker': '工位消遣',
  'hint': '点水面投喂，点鱼抚摸，点鸭子会晃。双击敲玻璃。猫爪子伸进来时点一下赶走。',
  'clockLabel': '今日摸鱼时长',
  'stats': '投喂 {fed} · 敲缸 {taps} · 抚摸 {pets}',
  'feed': '喂食',
  'tap': '敲缸',
  'mood.night': '开夜灯',
  'mood.day': '开日光',
  'notice.feed': '饲料沉下去了。',
  'notice.tap': '玻璃响了一下，鱼散开了。',
  'notice.pet': '摸了摸{name}，它跟着光点游。',
  'notice.duck': '小黄鸭晃了晃。',
  'notice.chestOpen': '宝箱开了，冒出一串泡。',
  'notice.chestClose': '宝箱盖上了。',
  'notice.paw': '把猫爪子赶回去了。',
  'fish.zhoubao': '周报',
  'fish.moyu': '摸鱼',
  'fish.kafei': '咖啡',
  'fish.huiyi': '会议',
  'fish.youjian': '邮件',
  'fish.rili': '日历',
  'fish.xuqiu': '需求',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Slack tank',
  'kicker': 'Desk toy',
  'hint': 'Click water to feed, a fish to pet, the duck to bob. Double-click taps the glass. Shoo the cat paw when it dips in.',
  'clockLabel': 'Time spent slacking',
  'stats': 'Fed {fed} · taps {taps} · pets {pets}',
  'feed': 'Feed',
  'tap': 'Tap glass',
  'mood.night': 'Night lamp',
  'mood.day': 'Daylight',
  'notice.feed': 'Flakes sank into the tank.',
  'notice.tap': 'The glass rang; the fish scattered.',
  'notice.pet': 'Petted {name}; it follows the pointer.',
  'notice.duck': 'The duck bobbed.',
  'notice.chestOpen': 'The chest opened and bubbled.',
  'notice.chestClose': 'The chest closed.',
  'notice.paw': 'Shooed the cat paw.',
  'fish.zhoubao': 'Weekly',
  'fish.moyu': 'Slacker',
  'fish.kafei': 'Coffee',
  'fish.huiyi': 'Meeting',
  'fish.youjian': 'Mail',
  'fish.rili': 'Calendar',
  'fish.xuqiu': 'Spec',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
