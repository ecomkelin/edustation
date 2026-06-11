/**
 * 全局常量（与 server shared/enums.js 保持一致）
 * 客户端只关心家长端展示所需的子集
 */

export const Gender = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
})

export const GenderLabel = Object.freeze({
  male: '男',
  female: '女',
  other: '其他'
})

export const LessonScheduleStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled'
})

export const LessonScheduleStatusLabel = Object.freeze({
  scheduled: '未开始',
  in_progress: '进行中',
  completed: '已结束',
  archived: '已归档',
  cancelled: '已取消'
})

export const AttendanceStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  CHECKED_IN: 'checked_in',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
  LEAVE: 'leave'
})

export const AttendanceStatusLabel = Object.freeze({
  scheduled: '已排课',
  checked_in: '已签到',
  completed: '已消课',
  no_show: '未到',
  leave: '请假'
})

export const OrderStatus = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
})

export const OrderStatusLabel = Object.freeze({
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款'
})

export const CourseInstanceStatus = Object.freeze({
  PLANNING: 'planning',
  ENROLLING: 'enrolling',
  ACTIVE: 'active',
  CLOSED: 'closed'
})

export const CourseInstanceStatusLabel = Object.freeze({
  planning: '规划中',
  enrolling: '招生中',
  active: '进行中',
  closed: '已结班'
})

export const CourseEnrollmentStatus = Object.freeze({
  ENROLLED: 'enrolled',
  ARCHIVED: 'archived',
  DROPPED: 'dropped',
  WITHDREW: 'withdrew'
})

export const CourseEnrollmentStatusLabel = Object.freeze({
  enrolled: '在读',
  archived: '已归档',
  dropped: '退班',
  withdrew: '休学'
})

export const PaymentMethod = Object.freeze({
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  CASH: 'cash',
  OTHER: 'other'
})

export const PaymentMethodLabel = Object.freeze({
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  other: '其他'
})

export const PetType = Object.freeze({
  CAT: 'cat',
  DOG: 'dog',
  RABBIT: 'rabbit'
})

export const PetTypeLabel = Object.freeze({
  cat: '猫咪',
  dog: '狗狗',
  rabbit: '兔子'
})

export const PetEmoji = Object.freeze({
  cat: '🐱',
  dog: '🐶',
  rabbit: '🐰'
})

export const StudentProductSource = Object.freeze({
  ORDER: 'order',
  GIFT: 'gift'
})

export const StudentProductSourceLabel = Object.freeze({
  order: '购买',
  gift: '赠课'
})

/**
 * 课包选包排序：FIFO（expireDate 升序）。返回排序后的副本。
 * 客户端的 List 页面、首页"剩余课时"卡片都可以使用。
 */
export function sortStudentProductsFifo(list = []) {
  return [...list].sort((a, b) => {
    const ea = a.expireDate ? new Date(a.expireDate).getTime() : Number.POSITIVE_INFINITY
    const eb = b.expireDate ? new Date(b.expireDate).getTime() : Number.POSITIVE_INFINITY
    return ea - eb
  })
}

/**
 * 把"剩余有效课时"汇总：过滤 isActive=true、remainingLessons>0、且未过期
 */
export function summarizeRemainingLessons(list = []) {
  const now = Date.now()
  return list
    .filter((sp) => sp.isActive && sp.remainingLessons > 0)
    .filter((sp) => !sp.expireDate || new Date(sp.expireDate).getTime() >= now)
    .reduce((acc, sp) => acc + (sp.remainingLessons || 0), 0)
}

export const WeekdayLabel = ['日', '一', '二', '三', '四', '五', '六']

export const WxShareSceneLabel = {
  WXSceneSession: '微信好友',
  WXSceneTimeline: '朋友圈',
  'WXSceneSession:': '微信好友',
  'WXSceneTimeline:': '朋友圈'
}
