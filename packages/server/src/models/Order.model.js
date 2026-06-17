'use strict'

const { Schema, model } = require('mongoose')
const { ORDER_STATUSES, PAYMENT_METHODS } = require('@shared/enums')

/**
 * 订单（Order）
 *
 * 家长为学生购买课程产品的订单。一个订单可包含**多个 CourseProduct**（打包购买），
 * 每个 CourseProduct 作为 `items` 数组中的一项独立结算。
 *
 * 金额字段语义：
 *   - originalPrice: 订单原价 = Σ items[].unitPrice * items[].quantity
 *                    （创建订单时由 CourseProduct.discountPrice 或 promotionPrice
 *                     拷贝锁定；后续产品调价不影响历史订单）
 *   - actualPrice:   实际成交价（应用优惠/折扣之后；<= originalPrice）
 *   - paidAmount:    已实付金额（多次付款可累加；分期付款时 < actualPrice）
 *   - paidAt:        最近一次支付成功时间（service 写入）
 *
 * 状态机（ORDER_STATUSES）：
 *   pending   已下单未支付
 *   paid      已支付完成（paidAmount >= actualPrice）→ 触发按 items 创建 StudentProduct
 *   cancelled 已取消（未支付前主动取消）
 *   refunded  已退款（可能涉及回滚 StudentProduct；阶段 3 财务模块完善）
 *
 * 联动：
 *   - status 进入 paid 时，service 在同一事务中按 items 逐项创建 StudentProduct
 *     （source='order'，totalLessons/remainingLessons 取自 CourseProduct，
 *       expireDate = 生效日 + validDays 天）
 *   - paymentMethod 记录支付渠道（微信/支付宝/现金/银行转账等），便于对账
 *
 * ─── items 子文档 ───
 * 一个订单可以同时买"国画 48 节 + 书法 24 节"等组合。`unitPrice` 在创建时从
 * CourseProduct 当前售价拷贝（promotionActive=true 时取 promotionPrice，否则
 * discountPrice），下单后该字段不再随产品调价变化。
 */
const OrderItemSchema = new Schema(
  {
    // 课程产品（创建时校验 org + isActive）
    courseProduct: { type: Schema.Types.ObjectId, ref: 'CourseProduct', required: true },
    // 数量（>= 1；默认 1）
    quantity: { type: Number, required: true, min: 1, default: 1 },
    // 单价快照（创建时从 CourseProduct 当前售价拷贝；不再随产品调价变化）
    unitPrice: { type: Number, required: true, min: 0 },
    // 产品名快照（创建时拷贝；产品改名后历史订单仍显示原名）
    name: { type: String, required: true, trim: true, maxlength: 100 }
  },
  { _id: false }
)

/**
 * 订单同意的法律协议快照 (2026-06 立项)
 *
 * 一旦订单创建成功, 这里锁定的版本号即为审计依据;
 * 后续协议升级**不**回填历史订单 (订单时间 = 同意时间).
 *
 * 字段:
 *   - docKey: 'purchase-agreement' | 'refund-policy' | ...
 *   - version: semver, 当前生效版本号
 *   - type: 'platform' | 'org' (机构购买协议是 'org')
 *   - org: 机构级 = orgId; 平台级 = null
 *   - agreedAt: 同意时间
 */
const OrderAgreementSchema = new Schema(
  {
    docKey: { type: String, required: true },
    version: { type: String, required: true },
    type: { type: String, enum: ['platform', 'org'], required: true },
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null },
    agreedAt: { type: Date, default: Date.now }
  },
  { _id: false }
)

const OrderSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 订单对应的学生（购买受益人；下单人通常是其家长）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 订单明细（至少 1 项；每项独立对应一个 CourseProduct）
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, '订单至少包含 1 个 item']
    },
    // 订单原价 = Σ items[].unitPrice * items[].quantity（service 创建时计算）
    originalPrice: { type: Number, required: true, min: 0 },
    // 实际成交价（>= 0；<= originalPrice；优惠后的最终应付金额）
    actualPrice: { type: Number, required: true, min: 0 },
    // 已实付金额（>= 0；支持多次付款累加；分期付款时尤其有用）
    paidAmount: { type: Number, default: 0, min: 0 },
    // 最近一次支付成功时间（service 在每次 pay 时更新；pending 时为 null）
    paidAt: { type: Date, default: null },
    // 订单状态（见文件头说明）
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    // 支付方式（具体取值见 @shared/enums 的 PAYMENT_METHODS）
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    // 订单备注（家长留言、特殊优惠说明等）
    remark: { type: String },
    // 创建时同意的协议快照 (2026-06)
    // 仅在 client 端"立即购买"流程中由前端携带; 后台手动开单可不传 (跳过校验).
    agreements: { type: [OrderAgreementSchema], default: [] }
  },
  { timestamps: true, collection: 'orders' }
)

// 按机构 + 状态过滤（财务报表："本月已支付/待支付"）
OrderSchema.index({ org: 1, status: 1 })
// 按学生查"这个学生的所有订单"（家长端订单历史）
OrderSchema.index({ student: 1 })
// 按机构 + 创建时间排序（财务报表按月聚合）
OrderSchema.index({ org: 1, createdAt: -1 })
// 按 items.courseProduct 反查（"这门课卖出了多少"）
OrderSchema.index({ 'items.courseProduct': 1 })

module.exports = model('Order', OrderSchema)
