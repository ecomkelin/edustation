/**
 * 业务枚举常量 - 与 shared/enums.js 保持同步
 * 运行时用于 UI 展示;后端是 source of truth
 */

// === 宠物 ===
export const PetTier = {
  C: 'C',
  B: 'B',
  A: 'A',
  S: 'S'
}
export const PetTierLabel = { C: 'C 阶', B: 'B 阶', A: 'A 阶', S: 'S 阶' }
export const PetTierColor = {
  C: '#9CA3AF', // 灰
  B: '#7CD9B7', // 绿
  A: '#5B9EE6', // 蓝
  S: '#F5C148'  // 金
}

export const PetState = {
  EGG: 'egg',
  ALIVE: 'alive',
  DEAD: 'dead'
}
export const PetStateLabel = { egg: '蛋', alive: '已破壳', dead: '沉睡中' }

export const PetSlot = {
  HAT: 'hat',
  SCARF: 'scarf',
  CLOTHES: 'clothes',
  ACCESSORY: 'accessory',
  HALO: 'halo',
  BACKGROUND: 'background'
}
export const PetSlotLabel = {
  hat: '帽子',
  scarf: '围巾',
  clothes: '衣服',
  accessory: '配饰',
  halo: '光环',
  background: '背景'
}

// 兜底 emoji (visualType 找不到记录时)
export const PET_SPECIES_EMOJI = {
  cat_orange: '🐱',
  cat_white: '😺',
  cat_black: '🐈‍⬛',
  dog_brown: '🐶',
  rabbit_pink: '🐰',
  fox_red: '🦊',
  bear_brown: '🐻',
  panda_black: '🐼',
  penguin: '🐧',
  owl: '🦉',
  dragon_green: '🐲',
  unicorn: '🦄',
  axolotl: '🦎',
  hamster: '🐹',
  parrot: '🦜',
  frog_green: '🐸'
}

// === 考勤 ===
export const AttendanceStatus = {
  SCHEDULED: 'scheduled',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
  LEAVE: 'leave',
  MADEUP: 'madeup'
}
export const AttendanceStatusLabel = {
  scheduled: '待上课',
  arrived: '已签到',
  completed: '已完成',
  no_show: '缺席',
  leave: '请假',
  madeup: '已补课'
}
export const AttendanceStatusColor = {
  scheduled: '#9CA3AF',
  arrived: '#5B9EE6',
  completed: '#7CD9B7',
  no_show: '#FF6B6B',
  leave: '#F5C148',
  madeup: '#B89AE6'
}

// === 订单 ===
export const OrderStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  PARTIALLY_REFUNDED: 'partially_refunded',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
}
export const OrderStatusLabel = {
  pending: '待支付',
  paid: '已支付',
  partially_refunded: '部分退款',
  cancelled: '已取消',
  refunded: '已退款'
}
export const OrderStatusColor = {
  pending: '#FF8A65',
  paid: '#7CD9B7',
  partially_refunded: '#F5C148',
  cancelled: '#9CA3AF',
  refunded: '#FF6B6B'
}

// === 课包来源 ===
export const StudentProductSource = {
  ORDER: 'order',
  GIFT: 'gift'
}
export const StudentProductSourceLabel = {
  order: '购买',
  gift: '赠课'
}

// === 积分触发 ===
export const PointsTriggerEmoji = {
  manual_earn: '✨',
  manual_deduct: '⚠️',
  order_earn: '🎁',
  attendance_earn: '📚',
  streak_earn: '🔥',
  share_earn: '💌',
  birthday_earn: '🎂',
  pet: '🍖',
  redemption: '🎀',
  refund: '↩️'
}
export const PointsTriggerLabel = {
  manual_earn: '管理员加分',
  manual_deduct: '管理员扣分',
  order_earn: '购课奖励',
  attendance_earn: '出勤奖励',
  streak_earn: '连续出勤',
  share_earn: '分享奖励',
  birthday_earn: '生日奖励',
  pet: '宠物相关',
  redemption: '兑换消耗',
  refund: '退款冲正'
}

// === 课程报名状态 ===
export const EnrollmentStatus = {
  ENROLLED: 'enrolled',
  COMPLETED: 'completed',
  DROPPED: 'dropped',
  WITHDREW: 'withdrew'
}
export const EnrollmentStatusLabel = {
  enrolled: '在读',
  completed: '已结课',
  dropped: '已分班',
  withdrew: '已退班'
}

// === 课程开班状态 ===
export const CourseInstanceStatus = {
  PLANNING: 'planning',
  ENROLLING: 'enrolling',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}
export const CourseInstanceStatusLabel = {
  planning: '筹备中',
  enrolling: '招生中',
  active: '进行中',
  completed: '已结课',
  cancelled: '已取消'
}

// === 接送授权事件类型 ===
export const AccessEventType = {
  ENTRY: 'entry',
  EXIT: 'exit',
  DENIED: 'denied'
}
export const AccessEventTypeLabel = {
  entry: '进入',
  exit: '离开',
  denied: '拒绝'
}

export const PersonType = {
  STUDENT: 'student',
  AUTHORIZED_PICKUP: 'authorizedPickup',
  STAFF: 'staff',
  UNKNOWN: 'unknown'
}
export const PersonTypeLabel = {
  student: '学员',
  authorizedPickup: '接送人',
  staff: '员工',
  unknown: '陌生人'
}

// === 周几 ===
export const WeekdayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const WeekdayShort = ['日', '一', '二', '三', '四', '五', '六']

// === 时段问候 ===
export function greetingByHour(h = new Date().getHours()) {
  if (h < 6) return '凌晨好'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
}

// === 角色关系（学生 + 家长）===
export const GuardianRelation = {
  FATHER: '父亲',
  MOTHER: '母亲',
  GRANDFATHER: '爷爷',
  GRANDMOTHER: '奶奶',
  OTHER: '其他'
}