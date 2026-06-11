'use strict'

const { Schema, model } = require('mongoose')
const { STUDENT_PRODUCT_SOURCES } = require('@shared/enums')

/**
 * 学员持有的课程产品（StudentProduct）
 *
 * 家长为某个学员购买的"课时包"。订单（Order）支付成功后由 order.service.pay 创建
 * 本实体（source='order'）；员工赠课时由 studentProduct.service.gift 创建
 * （source='gift'）。消课（LessonAttendance.status='completed'）时按 FIFO 规则
 * 扣减 remainingLessons。
 *
 * 历史命名：本实体原名 `StudentPackage`（学员课包），2026-06 与 `CourseProduct` 命名
 * 对齐改名为 `StudentProduct`（学员持有的产品实例）；Mongoose model 名 `StudentProduct`、
 * MongoDB collection `student_products`。
 *
 * 生命周期：
 *   - 创建（order）：Order.status → paid 时，service 在同一事务中按 items 逐项创建
 *     · totalLessons     ← CourseProduct.totalLessons
 *     · remainingLessons ← totalLessons（初始未用）
 *     · expireDate       ← 生效日 + CourseProduct.validDays 天
 *   - 创建（gift）：员工调用 studentProduct.service.gift，需携带 giftReason 与 giftedBy
 *     · source='gift'  · giftReason 必填（写明"试听课奖励"/"投诉补偿"等）
 *     · giftedBy = 操作员工 User._id
 *     · giftedAt 自动写入
 *   - 消耗：LessonAttendance 标 completed 时，按 FIFO 选最早过期的产品扣 1 课时
 *   - 失效：remainingLessons=0 或 expireDate 过期 → 不能再用于消课
 *
 * 关键业务规则（FIFO 选包）：
 *   - 学员在 CourseInstance.acceptedCourseProducts 范围内若持有多个未过期未用完的
 *     StudentProduct，消课时按 expireDate 升序选最早过期的（即"快过期的先用掉"）
 *   - 选包与扣减必须放在 LessonAttendance 的写入事务中，避免并发扣同一个包
 *
 * 字段语义：
 *   - source:    'order' / 'gift'（来源；'gift' 时 order 字段为 null）
 *   - order:     来源订单（仅 source='order' 时必填；用于追溯/退款联动）
 *   - isActive:  是否启用；停用后不再参与选包（一般用于退课/冻结场景）
 *   - giftReason: 赠课原因（仅 source='gift' 时必填；管理后台/家长端展示）
 *   - giftedBy:  赠课员工（仅 source='gift' 时必填；权限要求：studentProduct.gift）
 *   - giftedAt:  赠课时间（仅 source='gift' 时由 service 写入）
 */
const StudentProductSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 产品所属学员
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 来源类型：order=订单付款成功创建；gift=员工赠课
    source: { type: String, enum: STUDENT_PRODUCT_SOURCES, default: 'order', required: true },
    // 来源订单（仅 source='order' 时必填；赠课时为 null）
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    // 课程产品（与 CourseProduct.totalLessons/validDays 对应；可能存在产品改名/调价后历史包不变）
    courseProduct: { type: Schema.Types.ObjectId, ref: 'CourseProduct', required: true },
    // 总课时数（订单支付/赠课时由 CourseProduct.totalLessons 拷贝；>= 0）
    totalLessons: { type: Number, required: true, min: 0 },
    // 剩余课时数（>= 0；FIFO 选包时消费这个字段；= 0 时不再参与选包）
    remainingLessons: { type: Number, required: true, min: 0 },
    // 过期日期（订单生效日 + validDays 天；过期不再参与选包；赠课时同样按此计算）
    expireDate: { type: Date, required: true },
    // 是否启用；停用后不参与选包（退课/冻结场景）；默认 true
    isActive: { type: Boolean, default: true },
    // ─── 赠课相关字段（仅 source='gift' 时有值/必填）───
    // 赠课原因（试听课奖励 / 投诉补偿 / 老学员维护 / 内部测试等；最多 500 字）
    giftReason: { type: String, maxlength: 500, default: null },
    // 赠课操作人（员工 User._id；权限要求 studentProduct.gift）
    giftedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 赠课时间（service 写入）
    giftedAt: { type: Date, default: null },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'student_products' }
)

// 必填校验：source='order' 时 order 必填；source='gift' 时 giftReason/giftedBy 必填
StudentProductSchema.path('order').validate(function (v) {
  if (this.source === 'order' && !v) return false
  if (this.source === 'gift' && v) return false // 赠课不允许有 order 引用
  return true
}, "source='order' 时 order 必填；source='gift' 时 order 必须为空")

StudentProductSchema.path('giftReason').validate(function (v) {
  if (this.source === 'gift' && (!v || !v.trim())) return false
  return true
}, "source='gift' 时 giftReason 必填且非空")

StudentProductSchema.path('giftedBy').validate(function (v) {
  if (this.source === 'gift' && !v) return false
  return true
}, "source='gift' 时 giftedBy 必填")

// 按学员查"所有有效产品"（选包/家长端"我的产品"）
StudentProductSchema.index({ student: 1, isActive: 1 })
// 按机构查"所有有效产品"（机构工作台"课时使用情况"）
StudentProductSchema.index({ org: 1, isActive: 1 })
// 按过期时间查询（清理过期数据 / 到期提醒）
StudentProductSchema.index({ expireDate: 1 })
// 按 source 过滤（如家长端"我的赠课"）
StudentProductSchema.index({ org: 1, source: 1 })

module.exports = model('StudentProduct', StudentProductSchema)
