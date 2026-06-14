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

// ─── 招生试听 (2026-06) ───
// Lead 状态机标签
export const LEAD_STATUS_LABEL = {
  pending: '已登记',
  contacted: '已联系',
  scheduled: '已约试听',
  tried: '已试听',
  converted: '已报名',
  lost: '已流失'
}
// Lead 状态 tag 类型 (UI 颜色)
export const LEAD_STATUS_TAG_TYPE = {
  pending: 'info',
  contacted: '',
  scheduled: 'warning',
  tried: 'primary',
  converted: 'success',
  lost: 'danger'
}

// TrialBooking 状态机标签
export const TRIAL_BOOKING_STATUS_LABEL = {
  awaiting_schedule: '待约',
  scheduled: '已约',
  arrived: '已到店',
  no_show: '未到',
  completed: '已完成',
  cancelled: '已取消'
}
export const TRIAL_BOOKING_STATUS_TAG_TYPE = {
  awaiting_schedule: 'info',
  scheduled: 'warning',
  arrived: 'primary',
  no_show: 'danger',
  completed: 'success',
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
