'use strict'

const { Schema, model } = require('mongoose')
const { POINTS_TYPES } = require('@shared/enums')

/**
 * 积分流水（PointsTransaction）
 *
 * 学员积分账户的"账本"——每一次积分变动都必须留下一条流水。
 *
 * 关键设计（account-ledger pattern）：
 *   - balance 不直接修改；先写一条 PointsTransaction，再聚合更新 PointsAccount.balance
 *   - 这样既能审计（每条变动可追溯），又能对账（sum(amount) 应等于当前 balance）
 *   - 撤销一笔积分 = 写一条反向流水，**不要**直接 delete 流水
 *
 * 字段语义：
 *   - amount: 变动数量；正数=入账（+积分），负数=出账（-积分）
 *   - type:   变动类型（POINTS_TYPES 枚举），决定业务来源：
 *       signup_bonus  注册奖励
 *       share         分享得积分
 *       attendance    出勤奖励
 *       pet_feed      喂养宠物消耗
 *       mall_exchange 积分商城兑换
 *       manual_adjust 运营手工调整
 *       ...
 *   - refId: 关联业务单据 ID（多态引用，例如 attendance/lessonShare/order 等的 _id）
 *     不写 refModel 是因为业务类型多样，使用方知道指向哪个实体即可
 */
const PointsTransactionSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 流水所属学员
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 变动数量（正=入账，负=出账）
    amount: { type: Number, required: true },
    // 变动类型（决定业务来源；具体取值见 @shared/enums 的 POINTS_TYPES）
    type: { type: String, enum: POINTS_TYPES, required: true },
    // 关联业务单据（多态引用；具体指向哪个实体由 type 决定，调用方自行 populate）
    refId: { type: Schema.Types.ObjectId },
    // 备注（运营手工调整必填；其他场景可选）
    remark: { type: String }
  },
  { timestamps: true, collection: 'points_transactions' }
)

// 按学员查"积分变动历史"（按时间倒序，parent 端"我的积分"页面）
PointsTransactionSchema.index({ student: 1, createdAt: -1 })
// 按机构查询（运营审计）
PointsTransactionSchema.index({ org: 1 })

module.exports = model('PointsTransaction', PointsTransactionSchema)
