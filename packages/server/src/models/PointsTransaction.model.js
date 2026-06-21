'use strict'

const { Schema, model } = require('mongoose')
const { POINTS_TRIGGERS } = require('@shared/enums')

/**
 * 积分流水（PointsTransaction）
 *
 * 学员积分账户的"账本"——每一次积分变动都必须留下一条流水。
 *
 * 关键设计（account-ledger pattern，2026-06 重设）：
 *   - balance 不直接修改；先写一条 PointsTransaction，再聚合更新 PointsAccount.balance
 *   - 这样既能审计（每条变动可追溯），又能对账（sum(amount) 应等于当前 balance）
 *   - 撤销一笔积分 = 写一条反向流水（trigger='refund'），**不要**直接 delete 流水
 *   - balanceAfter 字段记入账后余额快照，用于事后对账 / 审计
 *
 * 字段语义：
 *   - amount:       变动数量；正数=入账（+积分），负数=出账（-积分）；符号必须与 trigger 语义一致
 *                   （manual_earn → +；manual_deduct/pet/redemption → -；refund 任意）
 *   - trigger:      业务触发来源（POINTS_TRIGGERS 枚举），决定业务归因：
 *                   manual_earn/manual_duct [本期] + 8 个 future hooks (order/attendance/...)
 *   - reason:       关联 PointsReason category（model='PointsReason'）；manual_* 必填
 *   - operator:     触发员工（manual_* 必填；auto_* 不填）
 *   - refType/refId: 多态引用业务实体（Pet/StudentProduct/Order/LessonAttendance...）
 *   - meta:         业务扩展字段（如 redemption.subtype='gift_lesson', pet.action='feed'）
 *
 * 与 PointsAccount 的关系：
 *   - account 字段冗余反向引用（便于按账户聚合；与 student 字段一致）
 *   - 写入时同时更新 PointsAccount.{balance, totalEarned, totalSpent, lastTransactionAt}
 */
const PointsTransactionSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 流水所属学员
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 反向引用积分账户（写入时同步填；便于按账户聚合查询）
    account: { type: Schema.Types.ObjectId, ref: 'PointsAccount', index: true },
    // 变动数量（正=入账，负=出账；与 trigger 语义对齐）
    amount: { type: Number, required: true },
    // 业务触发来源（决定归因；具体取值见 @shared/enums 的 POINTS_TRIGGERS）
    trigger: { type: String, enum: POINTS_TRIGGERS, required: true, index: true },
    // 关联业务单据（多态引用；具体指向哪个实体由 trigger 决定）
    refType: { type: String },
    refId: { type: Schema.Types.ObjectId },
    // 关联积分原因（PointsReason category）；manual_* 必填且 model='PointsReason'
    reason: { type: Schema.Types.ObjectId, ref: 'Category' },
    // 触发员工（manual_* 必填；auto_* 不填）
    operator: { type: Schema.Types.ObjectId, ref: 'User' },
    // 业务扩展字段（如 redemption.subtype / pet.action / future 业务标记）
    meta: { type: Schema.Types.Mixed, default: {} },
    // 余额快照（写入流水时的 account.balance；用于事后对账 / 审计展示）
    balanceAfter: { type: Number },
    // 备注（运营手工调整可选填；其他场景也可用作审计补充）
    remark: { type: String }
  },
  { timestamps: true, collection: 'points_transactions' }
)

// 按学员查"积分变动历史"（按时间倒序，parent 端"我的积分"页面）
PointsTransactionSchema.index({ student: 1, createdAt: -1 })
// 按机构 + 流水时间审计（admin 端"流水记录" tab）
PointsTransactionSchema.index({ org: 1, createdAt: -1 })
// 按机构 + trigger 聚合（看板按触发类型聚合时用；如 order_earn 总和 / manual_deduct 总和）
PointsTransactionSchema.index({ org: 1, trigger: 1, createdAt: -1 })

module.exports = model('PointsTransaction', PointsTransactionSchema)
