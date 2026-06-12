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
