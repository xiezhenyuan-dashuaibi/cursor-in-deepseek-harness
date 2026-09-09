/** `overlay-petshop-store` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-petshop-store'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'brand': '数据库',
  'kicker': 'SQLite 实时表',
  'headline': '数据库里此刻有哪些数据',
  'blurb': '后端写入成功后，这一页按写入时间倒序刷新。卸载插件不会删除磁盘上的 sqlite 文件。',
  'empty': '库里还没有预约',
  'count': '共 {n} 条',
  'col.id': '编号',
  'col.dog': '狗狗',
  'col.breed': '品种',
  'col.pkg': '套餐',
  'col.slot': '时段',
  'col.owner': '家长',
  'col.phone': '手机',
  'col.at': '写入时间',
  'pkg.bath': '清爽洗护',
  'pkg.cut': '洗剪吹',
  'pkg.full': '精致造型',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPetshopStoreKey, string> = {
  'brand': 'Database',
  'kicker': 'Live SQLite table',
  'headline': 'What is in the database right now',
  'blurb': 'Rows appear newest first after the hub writes. Unloading the plugin does not delete the sqlite file.',
  'empty': 'No bookings yet',
  'count': '{n} rows',
  'col.id': 'Id',
  'col.dog': 'Dog',
  'col.breed': 'Breed',
  'col.pkg': 'Package',
  'col.slot': 'Slot',
  'col.owner': 'Owner',
  'col.phone': 'Phone',
  'col.at': 'Written at',
  'pkg.bath': 'Bath',
  'pkg.cut': 'Wash, cut & blow',
  'pkg.full': 'Full style',
}

/** Union of this namespace's dictionary keys. */
export type OverlayPetshopStoreKey = keyof typeof zh
