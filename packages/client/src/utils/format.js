/**
 * 格式化工具
 */

/** 金额: 1234567.89 -> '1,234,567.89' */
export function formatMoney(n, withSymbol = true) {
  if (n == null || isNaN(n)) return withSymbol ? '￥0.00' : '0.00'
  const num = Number(n).toFixed(2)
  const parts = num.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (withSymbol ? '￥' : '') + parts.join('.')
}

/** 金额简化: 1234 -> '1.2k', 12345 -> '1.2w' */
export function formatMoneyShort(n) {
  if (n == null || isNaN(n)) return '0'
  const v = Number(n)
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(v)
}

/** 数字: 1000 -> '1,000' */
export function formatNumber(n) {
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString('zh-CN')
}

/** 手机号脱敏: 13800001234 -> '138****1234' */
export function maskPhone(phone) {
  if (!phone) return ''
  const s = String(phone)
  if (s.length < 11) return s
  return s.slice(0, 3) + '****' + s.slice(-4)
}

/** 身份证脱敏: 110101199001011234 -> '1101**********1234' */
export function maskIdCard(id) {
  if (!id) return ''
  const s = String(id)
  if (s.length < 8) return s
  return s.slice(0, 4) + '**********' + s.slice(-4)
}

/** 名字脱敏: '张三' -> '张*' */
export function maskName(name) {
  if (!name) return ''
  const s = String(name)
  if (s.length <= 1) return s
  if (s.length === 2) return s[0] + '*'
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]
}

/** 文件大小: 1024 -> '1KB' */
export function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i]
}

/** 手机号格式校验 */
export function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone)
}

/** 中文姓名校验 (2-10 个字符) */
export function isValidName(name) {
  return /^[一-龥·]{2,10}$/.test(name)
}

/** 身份证号校验 (15/18 位) */
export function isValidIdCard(id) {
  return /(^\d{15}$)|(^\d{17}([0-9]|X|x)$)/.test(id)
}

/** 进度百分比 */
export function percent(value, total) {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}