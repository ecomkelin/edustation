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
