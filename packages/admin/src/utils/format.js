/**
 * 通用工具函数
 */
export function formatDate(d, fmt = 'YYYY-MM-DD HH:mm') {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return fmt
    .replace('YYYY', date.getFullYear())
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
}

export function formatMoney(n) {
  if (n == null) return '0.00'
  return Number(n).toFixed(2)
}

/**
 * 千分位整数 (无小数)
 */
export function fmtNumber(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0'
  return Number(n).toLocaleString('zh-CN')
}

/**
 * ms → 紧凑中文: <60s → "Ns"; <60min → "Nm"; >=1h → "Hh Mm"
 *  - 视频/游戏累计时长 admin KpiCard 用
 */
export function fmtMsCompact(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return '0'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) {
    const remSec = sec % 60
    return remSec > 0 ? `${min}m${remSec}s` : `${min}m`
  }
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${hr}h${remMin}m` : `${hr}h`
}
