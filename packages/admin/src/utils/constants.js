/**
 * 常量
 */
export const ORDER_STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款'
}

export const ATTENDANCE_STATUS_LABEL = {
  scheduled: '已排课',
  checked_in: '已签到',
  completed: '已完成',
  no_show: '未到',
  leave: '请假'
}

export const GENDER_LABEL = {
  male: '男',
  female: '女',
  other: '其他'
}

// 支付方式标签（与后端 @shared/enums.PAYMENT_METHODS 对应）
export const PAYMENT_METHOD_LABEL = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行转账',
  other: '其他'
}

// 学校学段标签（与后端 @shared/enums.SCHOOL_TYPES 对应）
export const SCHOOL_TYPE_LABEL = {
  kindergarten: '幼儿园',
  elementary: '小学',
  middle: '初中',
  high: '高中'
}

// ─── 招生试听 (2026-06 重构) ───
// 家长 lifecycle 状态 (Parent.lifecycle) - 替代"还有资源"模糊语义
export const PARENT_LIFECYCLE_LABEL = {
  new: '新登记',
  partial: '部分报名',
  full: '已成单',
  lost: '已流失',
  dormant: '沉睡客户'
}
export const PARENT_LIFECYCLE_TAG_TYPE = {
  new: 'info',
  partial: 'warning',
  full: 'success',
  lost: 'danger',
  dormant: ''
}

// ChildLead 状态机标签 (原 LEAD_STATUS_LABEL 改名为 CHILD_LEAD_STATUS_LABEL, 字段相同)
// 保留旧 LEAD_STATUS_* 别名以兼容 3-6 月内可能未改完的代码
export const CHILD_LEAD_STATUS_LABEL = {
  pending: '已登记',
  contacted: '已联系',
  scheduled: '已约试听',
  tried: '已试听',
  converted: '已报名',
  lost: '已流失'
}
export const CHILD_LEAD_STATUS_TAG_TYPE = {
  pending: 'info',
  contacted: '',
  scheduled: 'warning',
  tried: 'primary',
  converted: 'success',
  lost: 'danger'
}
// 旧名 (deprecated)
export const LEAD_STATUS_LABEL = CHILD_LEAD_STATUS_LABEL
export const LEAD_STATUS_TAG_TYPE = CHILD_LEAD_STATUS_TAG_TYPE

// TrialBooking 状态机标签 (2026-06-16 删 no_show; 2026-06-20 加 considering)
//   considering: 试听做完但家长没当场定夺, 谈单老师后续跟进
export const TRIAL_BOOKING_STATUS_LABEL = {
  awaiting_schedule: '待约',
  scheduled: '已约',
  arrived: '已到店',
  completed: '已完成',
  considering: '考虑中',
  cancelled: '已取消'
}
export const TRIAL_BOOKING_STATUS_TAG_TYPE = {
  awaiting_schedule: 'info',
  scheduled: 'warning',
  arrived: 'primary',
  completed: 'success',
  considering: 'warning',
  cancelled: ''
}

// 触点类型标签
export const LEAD_ACTIVITY_TYPE_LABEL = {
  call: '电话',
  wechat: '微信',
  visit: '面访',
  sms: '短信',
  note: '备注'
}
export const LEAD_ACTIVITY_TYPE_ICON = {
  call: 'Phone',
  wechat: 'ChatDotRound',
  visit: 'Location',
  sms: 'Message',
  note: 'EditPen'
}

// ─── 宠物系统 (pet-system-v2-ext 2026-06-21) ───
export const PET_TIERS = ['C', 'B', 'A', 'S']
export const PET_TIER_LABELS = { C: 'C 级', B: 'B 级', A: 'A 级', S: 'S 级' }
export const PET_TIER_TAG_TYPE = { C: '', B: 'success', A: 'warning', S: 'danger' }
export const PET_STATES = ['egg', 'alive', 'dead']
export const PET_STATE_LABELS = { egg: '蛋', alive: '存活', dead: '死亡' }
export const PET_VISUAL_TYPES = ['image', 'svg']
export const PET_VISUAL_TYPE_LABELS = { image: '图片', svg: 'SVG' }
export const PET_ITEM_SLOTS = ['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background']
export const PET_ITEM_SLOT_LABELS = { hat: '帽子', scarf: '围巾', clothes: '衣服', accessory: '饰品', halo: '光环', background: '背景' }
export const PET_ITEM_UNLOCK_TYPES = ['level', 'tier']
export const PET_ITEM_UNLOCK_TYPE_LABELS = { level: '升级解锁', tier: '升阶解锁' }
export const PET_CONSUMABLE_KINDS = ['food', 'toy']
export const PET_CONSUMABLE_KIND_LABELS = { food: '食物', toy: '玩具' }
export const PET_CONSUMABLE_APPLICABLE_TIERS = ['C', 'B', 'A', 'S', 'all']
export const PET_CONSUMABLE_APPLICABLE_TIER_LABELS = { C: '仅 C 阶', B: '仅 B 阶', A: '仅 A 阶', S: '仅 S 阶', all: '通用（各阶独立数值）' }
