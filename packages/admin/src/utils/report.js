// 经营看板通用工具（5 个 page 共享）
// 2026-06 重构时从各 .vue 抽出，详见 /Users/kelin/.claude/plans/quiet-whistling-treasure.md

/**
 * 金额格式：¥ 0 / ¥ 1,200.50
 *  - null / undefined / 非有限数 → '¥ 0'
 */
export function fmtMoney(v) {
  if (v == null) return '¥ 0'
  return '¥ ' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * 百分比格式：12.3%
 *  - null / undefined / 非有限数 → '—'
 */
export function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}

/**
 * 日期时间格式：2026-06-14 13:11:23
 *  - null / 空 / 解析失败 → '—'
 */
export function formatDT(s) {
  if (!s) return '—'
  const dt = new Date(s)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 开班状态中文映射（CourseInstance.status）
 */
export const COURSE_INSTANCE_STATUS_LABEL = {
  planning: '筹备',
  enrolling: '招生中',
  active: '进行中',
  closed: '已关闭',
  cancelled: '已取消'
}

export function statusLabel(s) {
  return COURSE_INSTANCE_STATUS_LABEL[s] || s
}
