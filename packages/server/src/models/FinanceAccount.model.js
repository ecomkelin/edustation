'use strict'

const { Schema, model } = require('mongoose')
const { FINANCE_ACCOUNT_TYPES } = require('@shared/enums')

/**
 * 财务账号 (FinanceAccount, 2026-06-25 立项)
 *
 * 机构的"资金账本"：每个收款渠道/支付方式各开一本账
 *  - bank    银行账户（对公/个人银行卡）
 *  - wechat  微信收款
 *  - alipay  支付宝收款
 *  - cash    现金账本（保险柜/抽屉）
 *  - other   其他（第三方代收、内部挂账）
 *
 * 关键设计 (account-ledger pattern, 与 PointsAccount 同源):
 *   - balance 不直接修改; 写一笔 FinanceTransaction 后用 $inc 聚合更新
 *   - totalIncome / totalExpense 记录累计入/出账, 看板与对账用
 *   - lastTransactionAt 用于"最近活跃"排序
 *
 * 类型相关子字段 (service 层按 type 强校验必填):
 *   - bank    → bankName (开户行) + accountHolder (户名) + accountNumberLast4 (账号末四位, 脱敏)
 *              + branch (支行, 可选)
 *   - wechat  → wechatId (微信账号/昵称)
 *   - alipay  → alipayId (支付宝账号)
 *   - cash    → location (保险柜/抽屉位置, 可选)
 *   - other   → 任意描述放 remark
 *
 * isPrimary (机构默认账本):
 *   - 每 org 至多一个 isPrimary=true (partial unique 索引保证)
 *   - 财务岗录入流水时默认选中
 *   - 切换默认时 service 用 updateMany({org, _id: {$ne: id}}, {isPrimary: false}) 先清
 *
 * 物理删除门控 (CLAUDE.md §8.1):
 *   - 删除前必须 balance === 0 且无任何 FinanceTransaction 引用
 *   - 业务硬门挡 + assertUnused 互锁, 详见 financeAccount.service.remove
 *
 * 与 Order.paymentMethod 的区别:
 *   - Order.paymentMethod 只是 5 个枚举值的"渠道标签", 没有任何余额/累计信息
 *   - FinanceAccount 是真正的"账本", 有 balance / 流水 / 对账能力
 *   - 财务模块 Phase 1 不挂 Order 自动联动 (见 plans/enchanted-swinging-rocket.md §7)
 */
const FinanceAccountSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 账本名（"招商银行卡-王校长" / "现金账本"）；同 org 唯一
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // 账本类型（见文件头）
    type: { type: String, enum: FINANCE_ACCOUNT_TYPES, required: true, index: true },

    // ── 类型相关子字段（service 按 type 强校验必填/可选）──
    bankName: { type: String, trim: true, maxlength: 50 },            // bank: 开户行
    accountHolder: { type: String, trim: true, maxlength: 50 },       // bank: 户名
    accountNumberLast4: { type: String, trim: true, maxlength: 4 },   // bank: 账号末四位（脱敏）
    branch: { type: String, trim: true, maxlength: 50 },              // bank: 支行（可选）
    wechatId: { type: String, trim: true, maxlength: 50 },            // wechat: 微信账号
    alipayId: { type: String, trim: true, maxlength: 80 },            // alipay: 支付宝账号
    location: { type: String, trim: true, maxlength: 100 },           // cash: 物理位置

    // ── 状态与累计 ──
    isActive: { type: Boolean, default: true, index: true },
    isPrimary: { type: Boolean, default: false, index: true },  // 机构默认账本
    // 当前余额（变更时务必先写 FinanceTransaction, 用 $inc 累加, balanceAfter 快照对账）
    balance: { type: Number, default: 0 },
    // 累计收入（income 类型累加 amount）
    totalIncome: { type: Number, default: 0 },
    // 累计支出（expense 类型累加 amount）
    totalExpense: { type: Number, default: 0 },
    // 最近一笔流水时间（按"最近活跃"排序用）
    lastTransactionAt: { type: Date, default: null, index: true },

    // ── 审计 ──
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    remark: { type: String, trim: true, maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'finance_accounts' }
)

// 同 org 账本名唯一
FinanceAccountSchema.index({ org: 1, name: 1 }, { unique: true })
// 列表 + 过滤（按启用状态）
FinanceAccountSchema.index({ org: 1, isActive: 1 })
// 按类型筛
FinanceAccountSchema.index({ org: 1, type: 1 })
// 强制每 org 至多一个 isPrimary=true 账本 (partial unique)
FinanceAccountSchema.index(
  { org: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true } }
)

module.exports = model('FinanceAccount', FinanceAccountSchema)
