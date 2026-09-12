/** `overlay-office-desk` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-office-desk'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '工位',
  'kicker': '今日在岗',
  'clockLabel': '当前时间',
  'date': '{month}月{day}日',
  'weekday.sun': '星期日',
  'weekday.mon': '星期一',
  'weekday.tue': '星期二',
  'weekday.wed': '星期三',
  'weekday.thu': '星期四',
  'weekday.fri': '星期五',
  'weekday.sat': '星期六',
  'tasks.legend': '今日待办',
  'tasks.clear': '今日事项已清',
  'task.review': '对齐上午的需求评审',
  'task.report': '把周报草稿发给主管',
  'task.inbox': '下班前清掉待办邮件',
  'focus.start': '进入专注',
  'focus.stop': '结束专注',
  'focus.hint': '勿扰开启，把这一小时留给眼前的事',
  'mood.legend': '光线',
  'mood.day': '日光',
  'mood.night': '夜色',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Workstation',
  'kicker': 'On duty today',
  'clockLabel': 'Current time',
  'date': '{month}/{day}',
  'weekday.sun': 'Sunday',
  'weekday.mon': 'Monday',
  'weekday.tue': 'Tuesday',
  'weekday.wed': 'Wednesday',
  'weekday.thu': 'Thursday',
  'weekday.fri': 'Friday',
  'weekday.sat': 'Saturday',
  'tasks.legend': 'Today',
  'tasks.clear': 'Today’s list is clear',
  'task.review': 'Align on this morning’s review',
  'task.report': 'Send the weekly draft to your lead',
  'task.inbox': 'Clear the remaining mail before leaving',
  'focus.start': 'Start focus',
  'focus.stop': 'End focus',
  'focus.hint': 'Do not disturb is on for this hour',
  'mood.legend': 'Light',
  'mood.day': 'Daylight',
  'mood.night': 'Evening',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
