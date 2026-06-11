'use strict'

/**
 * 前后端共享枚举定义。
 * 所有需要选项的字段在模型、controller、admin form 中都引用这里。
 */

const OrgType = Object.freeze({
  TRAINING: 'training',
  ART: 'art',
  COMPREHENSIVE: 'comprehensive'
})
const ORG_TYPES = Object.values(OrgType)

const Gender = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
})
const GENDERS = Object.values(Gender)

const CourseInstanceStatus = Object.freeze({
  PLANNING: 'planning',
  ENROLLING: 'enrolling',
  ACTIVE: 'active',
  CLOSED: 'closed',
  // 取消：死胡同状态，只能被超管设置；不能重开，只能软删
  CANCELLED: 'cancelled'
})
const COURSE_INSTANCE_STATUSES = Object.values(CourseInstanceStatus)

const CourseEnrollmentStatus = Object.freeze({
  ENROLLED: 'enrolled',
  // 归档：开班 active→closed 时由后端级联写入；亦可由管理员经 setStatus 手工覆盖
  ARCHIVED: 'archived',
  DROPPED: 'dropped',
  WITHDREW: 'withdrew'
})
const COURSE_ENROLLMENT_STATUSES = Object.values(CourseEnrollmentStatus)

const LessonScheduleStatus = Object.freeze({
  // 初始化：CourseInstance 排课时自动生成
  SCHEDULED: 'scheduled',
  // 准备上课：教务手动从 scheduled 转来（仅在 plannedStartTime 24h 内可转）
  // 转 preparing 后可以预先登记请假学生的考勤
  PREPARING: 'preparing',
  // 正在上课：老师点击「开始上课」后状态；actualStartTime 由 service 写入
  IN_PROGRESS: 'in_progress',
  // 结束上课：教务填实际下课时间后转；必须有 actualEndTime
  COMPLETED: 'completed',
  // 完成归档：所有考勤完成课评后教务从 completed → archived；归档后家长可对老师评价
  // 归档后不可再修改业务字段，仅允许改 notes/title
  ARCHIVED: 'archived',
  // 死胡同状态：取消；不可重开
  CANCELLED: 'cancelled'
})
const LESSON_SCHEDULE_STATUSES = Object.values(LessonScheduleStatus)

const AttendanceStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  CHECKED_IN: 'checked_in',
  COMPLETED: 'completed',
  // 「补课」考勤（2026-06 改为「就地转状态」语义）：
  // makeup() 把原考勤 status 从 leave/no_show/scheduled/checked_in 就地翻成 madeup，
  // 同一 (lessonSchedule, student) 只有一条考勤；meta 字段记录 originalStatus / makeupAt 用于审计。
  MADEUP: 'madeup',
  NO_SHOW: 'no_show',
  LEAVE: 'leave'
})
const ATTENDANCE_STATUSES = Object.values(AttendanceStatus)

const OrderStatus = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
})
const ORDER_STATUSES = Object.values(OrderStatus)

const PaymentMethod = Object.freeze({
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  CASH: 'cash',
  OTHER: 'other'
})
const PAYMENT_METHODS = Object.values(PaymentMethod)

const PointsType = Object.freeze({
  EARN: 'earn',
  SPEND: 'spend',
  REFUND: 'refund'
})
const POINTS_TYPES = Object.values(PointsType)

const PetType = Object.freeze({
  CAT: 'cat',
  DOG: 'dog',
  RABBIT: 'rabbit'
})
const PET_TYPES = Object.values(PetType)

/**
 * StudentProduct 来源（source 字段）
 *  - order: 由 Order 支付成功自动创建
 *  - gift:  由员工调用 studentProduct.service.gift 创建（需 studentProduct.gift 权限）
 */
const StudentProductSource = Object.freeze({
  ORDER: 'order',
  GIFT: 'gift'
})
const STUDENT_PRODUCT_SOURCES = Object.values(StudentProductSource)

/**
 * 开班排课计划模式（CourseInstance.schedulePlan.mode）
 *  - weekly: 每周 N 节 + 固定休息日（按日历周分布）
 *  - cycle:  上 X 休 Y（连续滚动周期；不绑日历周）
 * 两种模式互斥；由 CourseInstance.schedulePlan.{mode,lessonsPerWeek,restDays,cycleOnDays,cycleOffDays} 决定。
 */
const SchedulePlanMode = Object.freeze({
  WEEKLY: 'weekly',
  CYCLE: 'cycle'
})
const SCHEDULE_PLAN_MODES = Object.values(SchedulePlanMode)

/**
 * 客户端（家长）岗位等级
 *  0 = 非家长（staff 端岗位）
 *  1 = 基础家长
 *  2 = VIP 家长
 *  3 = 钻石家长
 *  4+ = 机构自留扩展位，default label 用 `L${n} 家长`
 *
 * 数字本身是协议（前后端共用），不可在运行时改动；
 * 每个 level 实际的展示名 / 权限勾选仍由各机构在 admin 后台自定义。
 */
const CLIENT_LEVEL = Object.freeze({
  NONE: 0,
  BASIC: 1,
  VIP: 2,
  DIAMOND: 3
})

const CLIENT_LEVEL_LABEL = Object.freeze({
  0: '非家长',
  1: '基础家长',
  2: 'VIP 家长',
  3: '钻石家长'
})

function labelOfClientLevel(level) {
  const n = Number(level)
  if (Number.isFinite(n) && CLIENT_LEVEL_LABEL[n]) return CLIENT_LEVEL_LABEL[n]
  if (Number.isFinite(n) && n >= 4) return `L${n} 家长`
  return `未知等级(${level})`
}

module.exports = {
  OrgType,
  ORG_TYPES,
  Gender,
  GENDERS,
  CourseInstanceStatus,
  COURSE_INSTANCE_STATUSES,
  CourseEnrollmentStatus,
  COURSE_ENROLLMENT_STATUSES,
  LessonScheduleStatus,
  LESSON_SCHEDULE_STATUSES,
  AttendanceStatus,
  ATTENDANCE_STATUSES,
  OrderStatus,
  ORDER_STATUSES,
  PaymentMethod,
  PAYMENT_METHODS,
  PointsType,
  POINTS_TYPES,
  PetType,
  PET_TYPES,
  StudentProductSource,
  STUDENT_PRODUCT_SOURCES,
  SchedulePlanMode,
  SCHEDULE_PLAN_MODES,
  CLIENT_LEVEL,
  CLIENT_LEVEL_LABEL,
  labelOfClientLevel
}
