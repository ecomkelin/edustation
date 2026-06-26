'use strict'

const { Schema, model } = require('mongoose')
const { FINANCE_TRANSACTION_TYPES } = require('@shared/enums')

/**
 * 财务流水 (FinanceTransaction, 2026-06-25 立项)
 *
 * 财务账本（FinanceAccount）的"账本"——每笔资金变动都留一条流水, 不可删
 * (append-only ledger, 撤销走反向流水, 复用 points 范式).
 *
 * 关键设计 (account-ledger pattern):
 *   - balance 不直接修改; service.recordTransaction 先 insertOne tx,
 *     再用 $inc 聚合更新 FinanceAccount.balance + totalIncome / totalExpense
 *   - balanceAfter 字段记入账后余额快照, 事后对账 / 审计展示用
 *   - transfer 类型产生 2 条流水 (一出一入), 共享 transferGroupId 关联
 *
 * 字段语义:
 *   - account:       必填 (用户诉求 "财务流水的账号必填")
 *   - type:          income (入) / expense (出) / transfer (转账)
 *   - amount:        永远 > 0; 方向由 type 决定 (income → +balance, expense → -balance)
 *   - reason:        必填, 指向 Category(model='FinanceReason'), meta.direction 必填 in|out
 *                    service 校验: income+in / expense+out 一致; transfer 无 direction 强约束
 *   - transferGroupId: transfer 类型时, 2 笔流水共享同一 id (e.g. ObjectId.toString())
 *   - relatedTransferAccount: transfer 类型时, 指对端账本 (e.g. 转出账本流水对端 = 转入账本)
 *   - relatedOrder:  可选, 关联订单 (Phase 2 联动后写入; Phase 1 财务岗手工录入)
 *   - relatedStudent: 可选, 关联学员 (学员报名费 / 退费场景)
 *   - operator:      必填, 录入员工
 *   - occurredAt:    业务发生时间 (财务岗录入时可改历史日期; 默认 now)
 *   - balanceAfter:  必填, 写后余额快照
 *
 * 物理删除: 不开放. 撤销业务走反向流水 (e.g. 误录了一笔支出, 写一条同金额 income,
 *          备注 "冲销 <原 _id>"; 余额自动归零).
 */
const FinanceTransactionSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 必填：账本（用户原始诉求）
    account: { type: Schema.Types.ObjectId, ref: 'FinanceAccount', required: true, index: true },
    // 流水类型
    type: { type: String, enum: FINANCE_TRANSACTION_TYPES, required: true, index: true },
    // 金额（永远 > 0；方向由 type 决定）
    amount: { type: Number, required: true, min: 0.01 },
    // 必填：收支原因（Category.model='FinanceReason'）
    reason: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

    // ── 业务引用（可选）──
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    relatedStudent: { type: Schema.Types.ObjectId, ref: 'Student', index: true },
    // 2026-06-25: 工资/提成等支出需要关联员工 (跟 relatedStudent 二选一, 由 reason.category 决定)
    //  - 人工 (category='人工'): 用 relatedStaff
    //  - 学费 (category='学费'): 用 relatedStudent
    //  - 其他: 二者皆空
    relatedStaff: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    // 转账关联（同 transferGroupId 关联 2 笔：一笔 out / 一笔 in）
    transferGroupId: { type: String, index: true },
    // 转账对端账本（仅 type=transfer 时有值）
    relatedTransferAccount: { type: Schema.Types.ObjectId, ref: 'FinanceAccount' },

    // ── 审计 ──
    // 必填：录入员工
    operator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 业务发生时间（财务岗录入时允许改历史日期；默认 now）
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    // 写后余额快照（与对应 account.balance 在同一时刻应一致；不一致 = 数据损坏）
    balanceAfter: { type: Number, required: true },
    // 备注（财务凭证 / 家长沟通记录 / 撤销引用 etc.）
    remark: { type: String, trim: true, maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'finance_transactions' }
)

// 主列表查询（按账本 + 时间倒序）
FinanceTransactionSchema.index({ org: 1, account: 1, occurredAt: -1 })
// 按类型过滤
FinanceTransactionSchema.index({ org: 1, type: 1, occurredAt: -1 })
// 按原因聚合（看板 / 汇总）
FinanceTransactionSchema.index({ org: 1, reason: 1, occurredAt: -1 })
// 转账对账（按 groupId 找到 2 笔）
FinanceTransactionSchema.index({ org: 1, transferGroupId: 1 })
// 订单反向查询（订单详情显示"已记账"）
// 索引已在 relatedOrder 字段定义中包含

module.exports = model('FinanceTransaction', FinanceTransactionSchema)
