'use strict'

/**
 * 前后端共享枚举定义。
 * 所有需要选项的字段在模型、controller、admin form 中都引用这里。
 */

/**
 * 机构业态分类 (2026-06 整改:从 3 类扩展到 10 类)
 * 硬编码平台层统一枚举; Category 字典的 model='Org' 已下线。
 *  - academic       学科类 (K12 语数英, 双减后大幅压减)
 *  - arts           艺术类 (美术/音乐/舞蹈/书法/戏剧)
 *  - sports         体育类 (球类/游泳/田径/武术/跆拳道)
 *  - stem           科技类 (编程/机器人/STEAM/AI/科学实验)
 *  - comprehensive  综合素质 (实践/研学/口才/心理)
 *  - language       语言类 (英语/小语种/对外汉语)
 *  - vocational     职业/成人 (资格证/考研/公考/IT 培训/企培)
 *  - preschool      学前/托育 (0-6 岁早教/托班/感统)
 *  - tutoring_arts  艺考集训 (美术/音乐/传媒艺考)
 *  - other          其他
 */
const OrgType = Object.freeze({
  ACADEMIC: 'academic',
  ARTS: 'arts',
  SPORTS: 'sports',
  STEM: 'stem',
  COMPREHENSIVE: 'comprehensive',
  LANGUAGE: 'language',
  VOCATIONAL: 'vocational',
  PRESCHOOL: 'preschool',
  TUTORING_ARTS: 'tutoring_arts',
  OTHER: 'other'
})
const ORG_TYPES = Object.values(OrgType)
const ORG_TYPE_LABELS = Object.freeze({
  academic: '学科类',
  arts: '艺术类',
  sports: '体育类',
  stem: '科技类',
  comprehensive: '综合素质',
  language: '语言类',
  vocational: '职业/成人',
  preschool: '学前/托育',
  tutoring_arts: '艺考集训',
  other: '其他'
})

// 历史 org.type 兼容映射 (3 老值 → 新 enum), 走 migrate-org-type-to-string.js
const ORG_TYPE_LEGACY_MAP = Object.freeze({
  training: 'academic',  // 老 "培训" → 新 "学科类"
  art: 'arts',
  comprehensive: 'comprehensive'
})

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

/**
 * PointsTransaction.trigger 业务触发来源（2026-06 重设）
 *
 * 方向语义（与 PointsTransaction.amount 符号对齐）：
 *   - 加分类（amount > 0）：order_earn / attendance_earn / streak_earn / share_earn / birthday_earn / manual_earn
 *   - 扣分类（amount < 0）：manual_deduct / pet / redemption
 *   - 反转  （amount 任意）：refund
 *
 * 设计要点（避免 trigger 无限膨胀）：
 *   - 'redemption' 是一个泛化的"兑换"类 trigger；具体兑换品类
 *     （送课 gift_lesson / 商城 mall_item / 抽奖 lottery 等）用 meta.redemptionType 区分。
 *     未来加商城/抽奖/表情包礼物都归 redemption 一类,trigger 不会膨胀。
 *   - 'pet' 是宠物互动（meta.action 区分 feed/play/level_up），与 redemption 不同在于
 *     没有"下游产物"（不创建 StudentProduct 等实体），只是 Pet 状态变化。
 *
 * ★ 本期（2026-06-21）实际实现：manual_earn / manual_deduct
 * ★ future hook 占位（schema 接受、service 未实现）：其余所有值
 */
const PointsTrigger = Object.freeze({
  // 加分类
  MANUAL_EARN: 'manual_earn',         // 员工手动加（reason + operator 必填）
  ORDER_EARN: 'order_earn',            // 下单成功 [future hook]
  ATTENDANCE_EARN: 'attendance_earn',  // 出勤奖励 [future]
  STREAK_EARN: 'streak_earn',          // 连续出勤奖励 [future]
  SHARE_EARN: 'share_earn',            // 分享得积分 [future]
  BIRTHDAY_EARN: 'birthday_earn',      // 生日奖励 [future]
  // 扣分类
  MANUAL_DEDUCT: 'manual_deduct',      // 员工手动扣（reason + operator 必填）
  PET: 'pet',                          // 宠物互动（meta.action 区分） [future]
  REDEMPTION: 'redemption',            // 兑换类（meta.redemptionType 区分） [future]
  // 反转
  REFUND: 'refund'                     // 冲正 [future]
})
const POINTS_TRIGGERS = Object.values(PointsTrigger)

/**
 * POINTS_TRIGGER_DIRECTION — trigger → 期望 amount 符号（service 层校验）
 *   1 = in (amount > 0)
 *  -1 = out (amount < 0)
 *   0 = 不限（refund 任意符号）
 */
const POINTS_TRIGGER_DIRECTION = Object.freeze({
  manual_earn: 1,
  order_earn: 1,
  attendance_earn: 1,
  streak_earn: 1,
  share_earn: 1,
  birthday_earn: 1,
  manual_deduct: -1,
  pet: -1,
  redemption: -1,
  refund: 0
})

// 旧的 PointsType (earn/spend/refund) 保留以向后兼容旧 model/seed 引用; 不再用于 PointsTransaction
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
 * 学校学段（School.type 字段）
 *  - kindergarten: 幼儿园
 *  - elementary:   小学（默认）
 *  - middle:       初中
 *  - high:         高中
 */
const SchoolType = Object.freeze({
  KINDERGARTEN: 'kindergarten',
  ELEMENTARY: 'elementary',
  MIDDLE: 'middle',
  HIGH: 'high'
})
const SCHOOL_TYPES = Object.values(SchoolType)

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

// 导出 (双形式):
//   1. `exports.X = X` —— esbuild CJS→ESM 静态分析 100% 识别 named export
//      (Vite / admin 前端 named import 直接拿到, 不用 .default)
//   2. `module.exports = { ... }` —— 保留给 server 端 require 兜底
//      (server 端目前全部走解构 require, 但 module.exports 必须是完整对象,
//       否则 `const { X } = require('@shared/enums')` 会拿不到)
//
// 顺序很重要: 先用 `exports.X = X` 形式把每个 key 暴露出来 (这同时也会把 key 挂到
// module.exports 上, 因为 exports === module.exports), 最后再用对象字面量覆盖
// module.exports —— 两次赋值结果一致, server 解构拿到完整对象, Vite 静态分析
// 也认得所有 named export.
exports.OrgType = OrgType
exports.ORG_TYPES = ORG_TYPES
exports.ORG_TYPE_LABELS = ORG_TYPE_LABELS
exports.ORG_TYPE_LEGACY_MAP = ORG_TYPE_LEGACY_MAP
exports.Gender = Gender
exports.GENDERS = GENDERS
exports.CourseInstanceStatus = CourseInstanceStatus
exports.COURSE_INSTANCE_STATUSES = COURSE_INSTANCE_STATUSES
exports.CourseEnrollmentStatus = CourseEnrollmentStatus
exports.COURSE_ENROLLMENT_STATUSES = COURSE_ENROLLMENT_STATUSES
exports.LessonScheduleStatus = LessonScheduleStatus
exports.LESSON_SCHEDULE_STATUSES = LESSON_SCHEDULE_STATUSES
exports.AttendanceStatus = AttendanceStatus
exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES
exports.OrderStatus = OrderStatus
exports.ORDER_STATUSES = ORDER_STATUSES
exports.PaymentMethod = PaymentMethod
exports.PAYMENT_METHODS = PAYMENT_METHODS
exports.PointsTrigger = PointsTrigger
exports.POINTS_TRIGGERS = POINTS_TRIGGERS
exports.POINTS_TRIGGER_DIRECTION = POINTS_TRIGGER_DIRECTION
exports.PointsType = PointsType
exports.POINTS_TYPES = POINTS_TYPES
exports.PetType = PetType
exports.PET_TYPES = PET_TYPES
exports.StudentProductSource = StudentProductSource
exports.STUDENT_PRODUCT_SOURCES = STUDENT_PRODUCT_SOURCES
exports.SchedulePlanMode = SchedulePlanMode
exports.SCHEDULE_PLAN_MODES = SCHEDULE_PLAN_MODES
exports.SchoolType = SchoolType
exports.SCHOOL_TYPES = SCHOOL_TYPES
exports.CLIENT_LEVEL = CLIENT_LEVEL
exports.CLIENT_LEVEL_LABEL = CLIENT_LEVEL_LABEL
exports.labelOfClientLevel = labelOfClientLevel

// 兜底: module.exports 直接给完整对象 (server 端 require 解构)
module.exports = exports
