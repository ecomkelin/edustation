/**
 * 时间/日期格式化工具。
 * 跨端兼容：uni-app 内置 Date 行为一致；格式化在客户端完成。
 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** yyyy-MM-dd HH:mm */
export function formatDateTime(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** yyyy-MM-dd */
export function formatDate(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** HH:mm */
export function formatTime(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 中文友好："刚刚"/"X 分钟前"/"X 小时前"/"X 天前" */
export function formatRelativeTime(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  return formatDate(date)
}

/** 把分钟数格式化为 "Xh Ym" */
export function formatMinutes(mins) {
  if (!mins && mins !== 0) return ''
  const m = Number(mins)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h} 小时 ${r} 分钟` : `${h} 小时`
}

/** 把当前 Date 转成所在一周的周一 00:00:00 */
export function startOfWeek(d = new Date()) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  // 周一为一周开始（周日 getDay=0；调整到周一为首日）
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return date
}

/** Date 加 N 天，返回新 Date */
export function addDays(d, n) {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

/** 返回 [start, end] 包含首尾那天的 7 天数组 */
export function weekDays(d = new Date()) {
  const s = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}

/** 校验手机号 */
export function isValidMobile(mobile = '') {
  return /^1[3-9]\d{9}$/.test(mobile)
}

/** 金额格式化：1234.5 -> "1234.50"；null/undefined 视为 0 */
export function formatMoney(n, withSymbol = true) {
  const v = Number(n)
  const num = Number.isFinite(v) ? v : 0
  const text = num.toFixed(2)
  return withSymbol ? `¥${text}` : text
}

/** 数字千分位（家长端用得少，但订单列表有用） */
export function formatNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('zh-CN')
}

/** 防抖（轻量） */
export function debounce(fn, wait = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}
