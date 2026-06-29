/**
 * 时间工具 - dayjs 包装
 */
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'
import weekOfYear from 'dayjs/plugin/weekOfYear'

dayjs.extend(relativeTime)
dayjs.extend(weekOfYear)
dayjs.locale('zh-cn')

export const date = {
  /** 'YYYY-MM-DD HH:mm' */
  fmt(d) {
    if (!d) return ''
    return dayjs(d).format('YYYY-MM-DD HH:mm')
  },

  /** 'YYYY-MM-DD' */
  fmtDate(d) {
    if (!d) return ''
    return dayjs(d).format('YYYY-MM-DD')
  },

  /** 'HH:mm' */
  fmtTime(d) {
    if (!d) return ''
    return dayjs(d).format('HH:mm')
  },

  /** 'MM-DD HH:mm' */
  fmtShort(d) {
    if (!d) return ''
    return dayjs(d).format('MM-DD HH:mm')
  },

  /** 友好:3 小时前 / 2 天前 */
  fromNow(d) {
    if (!d) return ''
    return dayjs(d).fromNow()
  },

  /** 开始 / 结束 */
  startOfDay(d = Date.now()) {
    return dayjs(d).startOf('day').toDate()
  },
  endOfDay(d = Date.now()) {
    return dayjs(d).endOf('day').toDate()
  },
  startOfWeek(d = Date.now()) {
    return dayjs(d).startOf('week').toDate()
  },
  endOfWeek(d = Date.now()) {
    return dayjs(d).endOf('week').toDate()
  },
  startOfMonth(d = Date.now()) {
    return dayjs(d).startOf('month').toDate()
  },
  endOfMonth(d = Date.now()) {
    return dayjs(d).endOf('month').toDate()
  },

  /** 计算距今毫秒数 (用于倒计时) */
  diffMs(target) {
    if (!target) return 0
    return dayjs(target).valueOf() - dayjs().valueOf()
  },

  /** 距上课倒计时文字: '还有 2 小时 15 分' */
  countdownLabel(target) {
    const ms = this.diffMs(target)
    if (ms <= 0) return '已过'
    const sec = Math.floor(ms / 1000)
    const days = Math.floor(sec / 86400)
    const hours = Math.floor((sec % 86400) / 3600)
    const mins = Math.floor((sec % 3600) / 60)
    if (days > 0) return `还有 ${days} 天 ${hours} 时`
    if (hours > 0) return `还有 ${hours} 时 ${mins} 分`
    return `还有 ${mins} 分`
  },

  /** 周几文字 '周一'~'周日' */
  weekdayCN(d = Date.now()) {
    const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return map[dayjs(d).day()]
  },

  /** 是否今天 */
  isToday(d) {
    return dayjs(d).isSame(dayjs(), 'day')
  },

  /** 是否本周 */
  isThisWeek(d) {
    return dayjs(d).isSame(dayjs(), 'week')
  },

  /** 加减天数 */
  addDays(d, n) {
    return dayjs(d).add(n, 'day').toDate()
  },

  /** 加减小时 */
  addHours(d, n) {
    return dayjs(d).add(n, 'hour').toDate()
  },

  /** 年龄 (用于学生展示) */
  age(birthday) {
    if (!birthday) return ''
    return dayjs().diff(dayjs(birthday), 'year')
  }
}

export default date