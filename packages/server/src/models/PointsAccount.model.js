'use strict'

const { Schema, model } = require('mongoose')

/**
 * 积分账户（PointsAccount）
 *
 * 每个学员（Student）拥有一个积分账户，记录当前可用积分（balance）。
 *
 * 关键约束：
 *   - student 唯一：一对一关系，一个学员只有一个积分账户
 *
 * 数据一致性（重要）：
 *   - balance 是"当前余额"，理论上等于该学员所有 PointsTransaction.amount 的累加。
 *   - 余额变更必须以 PointsTransaction 为唯一真相源（account-ledger pattern）：
 *       任何"加/减积分"操作都先写一条 PointsTransaction，
 *       再用聚合更新 PointsAccount.balance（service 层用写入顺序保证一致性；不依赖
 *       mongoose 事务，因为单节点 Mongo 不支持事务；用 balanceAfter 快照做对账）。
 *   - 严禁绕过 PointsTransaction 直接改 balance —— 会导致账目对不上、无法审计。
 *
 * 累计统计字段（2026-06 新增）：
 *   - totalEarned: 累计入账总额（仅 +amount 部分）
 *   - totalSpent:  累计出账总额（仅 -amount 部分，存为正数）
 *   - lastTransactionAt: 最近一笔流水时间，用于"最近活跃"排序
 *
 * 用途：
 *   - 员工手动加分/扣分（本期实现）
 *   - 家长端"宠物乐园"喂养、分享得积分、积分商城兑换等场景 [future]
 *   - 学员持续学习的正向激励
 */
const PointsAccountSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 账户所属学员（一对一，unique 索引）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    // 当前可用积分（>= 0；变更时务必同时写 PointsTransaction）
    balance: { type: Number, default: 0 },
    // 累计入账（仅 +amount 部分累加；用于"经营分析 > 积分与活跃"看板 / 学员激励统计）
    totalEarned: { type: Number, default: 0 },
    // 累计出账（仅 -amount 部分累加，存为正数）
    totalSpent: { type: Number, default: 0 },
    // 最近一笔流水时间（列表按"最近活跃"排序用）
    lastTransactionAt: { type: Date, default: null, index: true }
  },
  { timestamps: true, collection: 'points_accounts' }
)

// 按机构查询（运营后台"机构积分发放总览"等场景）
PointsAccountSchema.index({ org: 1 })
// 余额排行榜 / 高余额筛选（积分管理页排序用）
PointsAccountSchema.index({ org: 1, balance: -1 })

module.exports = model('PointsAccount', PointsAccountSchema)
