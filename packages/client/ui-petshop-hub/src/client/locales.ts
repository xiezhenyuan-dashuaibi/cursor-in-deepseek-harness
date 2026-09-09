/** `overlay-petshop-hub` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-petshop-hub'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'brand': '后端信号',
  'kicker': '中继检测',
  'headline': '主页 → 后端 → 数据库 → 回执',
  'blurb': '主页把预约打到本插件，本插件再写入数据库插件；写入成功后回执主页。下面是每一跳的检测记录。',
  'idle': '等待主页来信',
  'listening': '正在监听',
  'failed': '最近一次失败',
  'node.home-in': '主页来信',
  'node.store-out': '发往数据库',
  'node.store-ok': '数据库已写',
  'node.home-ack': '回执主页',
  'stage.home-in': '收到主页',
  'stage.store-out': '转发数据库',
  'stage.store-ok': '写入成功',
  'stage.home-ack': '已回执',
  'stage.failed': '失败',
  'log': '检测日志',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPetshopHubKey, string> = {
  'brand': 'Hub signals',
  'kicker': 'Relay monitor',
  'headline': 'Home → hub → store → ack',
  'blurb': 'The homepage posts a booking here; this plugin writes the store plugin and acks the homepage. The log lists each hop.',
  'idle': 'Waiting for the homepage',
  'listening': 'Listening',
  'failed': 'Last failure',
  'node.home-in': 'Homepage in',
  'node.store-out': 'To store',
  'node.store-ok': 'Store wrote',
  'node.home-ack': 'Ack homepage',
  'stage.home-in': 'Homepage received',
  'stage.store-out': 'Forwarded to store',
  'stage.store-ok': 'Store accepted',
  'stage.home-ack': 'Acked',
  'stage.failed': 'Failed',
  'log': 'Detection log',
}

/** Union of this namespace's dictionary keys. */
export type OverlayPetshopHubKey = keyof typeof zh
