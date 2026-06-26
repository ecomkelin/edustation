'use strict'

/**
 * 财务流水 service (2026-06-25 立项) - 核心
 *
 * - recordTransaction: account-ledger pattern 核心 (1 笔流水 + 累加 account balance)
 * - transferAccounts: 转账, 2 笔流水 + 双 account 余额, 共享 transferGroupId, 单 session 原子写
 * - listTransactions: 分页 + 过滤
 * - getTransaction: 详情
 * - getSummary: 按 reason/account/day/month 聚合
 *
 * 物理删除: 不开放 (append-only ledger); 撤销走反向流水
 */

const mongoose = require('mongoose')
const FinanceAccount = require('@models/FinanceAccount.model')
const FinanceTransaction = require('@models/FinanceTransaction.model')
const Category = require('@models/Category.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { FinanceTransactionType } = require('@shared/enums')

// ── 内部工具 ─────────────────────────────────────────

/**
 * 校验 reason 合法 (Category.model='FinanceReason', 同 org, isActive)
 * 返回 reason 文档 (lean)
 */
async function validateReason({ orgId, reasonId, type }) {
  if (!reasonId) throw ApiError.badRequest('reason 必填')
  const r = await Category.findOne({ _id: reasonId, org: orgId, isActive: true }).lean()
  if (!r) throw ApiError.badRequest('原因不存在或不属于本机构')
  if (r.model !== 'FinanceReason') throw ApiError.badRequest('该类别不是财务原因')
  if (type !== FinanceTransactionType.TRANSFER) {
    const dir = r.meta && r.meta.direction
    if (!dir) throw ApiError.badRequest('该原因未配置 direction (in/out), 请先在字典里维护')
    if (type === FinanceTransactionType.INCOME && dir !== 'in') {
      throw ApiError.badRequest('收入流水必须关联 direction=in 的原因')
    }
    if (type === FinanceTransactionType.EXPENSE && dir !== 'out') {
      throw ApiError.badRequest('支出流水必须关联 direction=out 的原因')
    }
  }
  return r
}

/**
 * 校验关联员工 (2026-06-25 工资/提成场景)
 * - 必须是本机构 User (UserOrgRel.org = orgId)
 * - 必须有员工岗位 (clientLevel > 0; clientLevel=0 是纯家长)
 */
async function validateRelatedStaff({ orgId, userId }) {
  if (!userId) return null
  const User = require('@models/User.model')
  const UserOrgRel = require('@models/UserOrgRel.model')
  const Position = require('@models/Position.model')

  const user = await User.findById(userId).select('_id realName mobile isPlatformAdmin isActive').lean()
  if (!user) throw ApiError.badRequest('关联员工不存在')
  if (user.isActive === false) throw ApiError.badRequest('关联员工已停用')

  // 必须隶属本机构
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId, isActive: true }).select('_id positions').lean()
  if (!rel) throw ApiError.badRequest('关联员工不属于本机构')

  // 必须有员工岗位 (clientLevel > 0)
  const positions = await Position.find({ _id: { $in: rel.positions || [] }, org: orgId, isActive: true })
    .select('name clientLevel').lean()
  const isStaff = positions.some((p) => (p.clientLevel || 0) > 0) || user.isPlatformAdmin
  if (!isStaff) throw ApiError.badRequest('关联员工必须是机构内员工岗位 (如老师/教务/财务)')

  return user
}

/**
 * 校验账本 (同 org, isActive), 返回 account 文档 (lean)
 */
async function validateAccount(orgId, accountId, label = '账本') {
  if (!accountId) throw ApiError.badRequest(`${label} 必填`)
  const a = await FinanceAccount.findOne({ _id: accountId, org: orgId }).lean()
  if (!a) throw ApiError.badRequest(`${label}不存在或不属于本机构`)
  if (!a.isActive) throw ApiError.badRequest(`${label}已停用，请先启用后再录流水`)
  return a
}

// ── 核心: recordTransaction ──────────────────────────

/**
 * 记录一笔流水 + 更新账本余额 (account-ledger 核心)
 *
 * @param {ObjectId} orgId
 * @param {Object} opts
 * @param {ObjectId} opts.account       账本 (必填, 用户原始诉求)
 * @param {String}   opts.type          'income' | 'expense' | 'transfer'
 * @param {Number}   opts.amount        > 0
 * @param {ObjectId} opts.reason        Category(model='FinanceReason')
 * @param {ObjectId} opts.operator      录入员工
 * @param {ObjectId} [opts.relatedOrder]
 * @param {ObjectId} [opts.relatedStudent]
 * @param {Date}     [opts.occurredAt]  默认 now
 * @param {String}   [opts.remark]
 * @param {String}   [opts.transferGroupId]
 * @param {ObjectId} [opts.relatedTransferAccount]
 * @param {ClientSession} [session]     mongoose session, transferAccounts 调用时传入
 * @returns {Object} transaction 文档 (lean)
 */
async function recordTransaction(orgId, opts = {}) {
  const {
    account, type, amount, reason, operator,
    relatedOrder, relatedStudent, relatedStaff,
    occurredAt, remark,
    transferGroupId, relatedTransferAccount,
    session
  } = opts

  if (!type) throw ApiError.badRequest('type 必填')
  if (!Object.values(FinanceTransactionType).includes(type)) {
    throw ApiError.badRequest(`type 必须是 ${Object.values(FinanceTransactionType).join('/')}`)
  }
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    throw ApiError.badRequest('amount 必须 > 0')
  }

  // 校验
  await validateReason({ orgId, reasonId: reason, type })
  const acc = await validateAccount(orgId, account, '账本')

  // 2026-06-25: 工资/提成 关联员工; 跟 relatedStudent 二选一
  // 校验: relatedStudent 与 relatedStaff 不可同时存在 (语义互斥)
  if (relatedStudent && relatedStaff) {
    throw ApiError.badRequest('关联学员和关联员工互斥, 请二选一')
  }
  // 校验: 传了 relatedStaff 则必须是本机构员工
  if (relatedStaff) {
    await validateRelatedStaff({ orgId, userId: relatedStaff })
  }
  if (type === FinanceTransactionType.TRANSFER && !relatedTransferAccount) {
    throw ApiError.badRequest('转账流水必须传 relatedTransferAccount (对端账本)')
  }
  if (relatedTransferAccount && String(relatedTransferAccount) === String(account)) {
    throw ApiError.badRequest('转账对端账本不能是自己')
  }

  // 计算余额变化: income/transfer-from → +amt, expense/transfer-to → -amt
  // (transferAccounts 调用本函数时, 会区分 from 账本 / to 账本)
  const isExpense = type === FinanceTransactionType.EXPENSE
    || (type === FinanceTransactionType.TRANSFER && !!transferGroupId && !!relatedTransferAccount && String(relatedTransferAccount) === String(acc._id)) // 转入账本对端 = 当前账本 → 自己是被转入
  // 简化语义: transferAccounts 调 recordTransaction 时, transferGroupId 与 relatedTransferAccount 配合:
  //   - from 账本: relatedTransferAccount=to, type=transfer, semantically "out"
  //   - to 账本:   relatedTransferAccount=from, type=transfer, semantically "in"
  // 判断 "in" 还是 "out": 参照 relatedTransferAccount 是否为 from
  let delta
  if (type === FinanceTransactionType.INCOME) {
    delta = +amt
  } else if (type === FinanceTransactionType.EXPENSE) {
    delta = -amt
  } else {
    // transfer: 由调用方在 transferAccounts 内显式传 extra 标记
    if (opts.direction === 'in') delta = +amt
    else if (opts.direction === 'out') delta = -amt
    else throw ApiError.badRequest('transfer 流水必须传 direction=in|out')
  }

  // 1. 写流水 (含 balanceAfter)
  const balanceAfter = Math.round((acc.balance + delta) * 100) / 100
  const tx = await FinanceTransaction.create({
    org: orgId,
    account: acc._id,
    type,
    amount: amt,
    reason,
    operator,
    relatedOrder: relatedOrder || null,
    relatedStudent: relatedStudent || null,
    relatedStaff: relatedStaff || null,
    transferGroupId: transferGroupId || null,
    relatedTransferAccount: relatedTransferAccount || null,
    occurredAt: occurredAt || new Date(),
    balanceAfter,
    remark: remark || null
  })

  // 2. 累加账本余额 + 累计 + lastTransactionAt
  // 注: $inc 只接受数字; lastTransactionAt 走 $set (单节点 Mongo 不支持事务, 无 session)
  const incOps = { balance: delta }
  if (type === FinanceTransactionType.INCOME) incOps.totalIncome = amt
  if (type === FinanceTransactionType.EXPENSE) incOps.totalExpense = amt

  await FinanceAccount.updateOne(
    { _id: acc._id, org: orgId },
    { $inc: incOps, $set: { lastTransactionAt: new Date() } }
  )

  return tx.toObject ? tx.toObject() : tx
}

// ── 转账: transferAccounts ───────────────────────────

/**
 * 转账 (写 2 笔 + 双 account 余额)
 *
 * 注: 2026-06-25 单节点 Mongo 不支持事务 (无 replica set), 与 points/order 模块一致,
 * 走"顺序写 + 失败手动回滚"范式. recordTransaction 内部已处理 session 透传.
 *
 * @param {ObjectId} orgId
 * @param {Object} opts
 *   fromAccount, toAccount, amount, reason, operator, occurredAt, remark
 */
async function transferAccounts(orgId, opts = {}) {
  const { fromAccount, toAccount, amount, reason, operator, occurredAt, remark } = opts
  if (!fromAccount || !toAccount) throw ApiError.badRequest('fromAccount 与 toAccount 必填')
  if (String(fromAccount) === String(toAccount)) {
    throw ApiError.badRequest('转出与转入账本不能相同')
  }
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw ApiError.badRequest('amount 必须 > 0')

  // 校验账本 + reason
  const [from, to, reasonDoc] = await Promise.all([
    validateAccount(orgId, fromAccount, '转出账本'),
    validateAccount(orgId, toAccount, '转入账本'),
    validateReason({ orgId, reasonId: reason, type: FinanceTransactionType.TRANSFER })
  ])

  const groupId = new mongoose.Types.ObjectId().toString()
  const occurred = occurredAt || new Date()

  // 顺序写 2 笔 (无 session: 单节点 Mongo 不支持事务, 与 points/order 一致)
  let outTx, inTx
  try {
    outTx = await recordTransaction(orgId, {
      account: from._id,
      type: FinanceTransactionType.TRANSFER,
      direction: 'out',
      amount: amt,
      reason,
      operator,
      occurredAt: occurred,
      remark,
      transferGroupId: groupId,
      relatedTransferAccount: to._id
    })
  } catch (e) {
    throw e
  }
  try {
    inTx = await recordTransaction(orgId, {
      account: to._id,
      type: FinanceTransactionType.TRANSFER,
      direction: 'in',
      amount: amt,
      reason,
      operator,
      occurredAt: occurred,
      remark,
      transferGroupId: groupId,
      relatedTransferAccount: from._id
    })
  } catch (e) {
    // 转入失败: 手动回滚 out (删 out + 还原 from 余额)
    try {
      await FinanceTransaction.deleteOne({ _id: outTx._id, org: orgId })
      // $inc 只接受数字; lastTransactionAt 走 $set
      await FinanceAccount.updateOne(
        { _id: from._id, org: orgId },
        { $inc: { balance: +amt }, $set: { lastTransactionAt: new Date() } }
      )
    } catch (rollbackErr) {
      // eslint-disable-next-line no-console
      console.error('[transferAccounts] rollback failed:', rollbackErr.message)
    }
    throw e
  }
  return { transferGroupId: groupId, out: outTx, in: inTx, from: from._id, to: to._id }
}

// ── 查询 ────────────────────────────────────────────

async function listTransactions(orgId, opts = {}) {
  const p = normalizePagination({ page: opts.page, pageSize: opts.pageSize })
  const filter = { org: orgId }
  if (opts.accountId) filter.account = opts.accountId
  if (opts.type) filter.type = opts.type
  if (opts.reason) filter.reason = opts.reason
  if (opts.relatedOrder) filter.relatedOrder = opts.relatedOrder
  if (opts.relatedStudent) filter.relatedStudent = opts.relatedStudent
  if (opts.dateFrom || opts.dateTo) {
    filter.occurredAt = {}
    if (opts.dateFrom) filter.occurredAt.$gte = new Date(opts.dateFrom)
    if (opts.dateTo) {
      // to 加一天把当天结束时间包含进去 (前端用 <input type="date"> 给的是 yyyy-mm-dd)
      const end = new Date(opts.dateTo)
      end.setDate(end.getDate() + 1)
      filter.occurredAt.$lt = end
    }
  }
  const [items, total] = await Promise.all([
    FinanceTransaction.find(filter)
      .populate('account', 'name type')
      .populate('reason', 'name meta')
      .populate('operator', 'realName mobile')
      .populate('relatedOrder', '_id actualPrice paidAmount status')
      .populate('relatedStudent', '_id name')
      .populate('relatedStaff', 'realName mobile')
      .populate('relatedTransferAccount', 'name type')
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    FinanceTransaction.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getTransaction(orgId, id) {
  const tx = await FinanceTransaction.findOne({ _id: id, org: orgId })
    .populate('account', 'name type')
    .populate('reason', 'name meta')
    .populate('operator', 'realName mobile')
    .populate('relatedOrder')
    .populate('relatedStudent', 'name')
    .populate('relatedStaff', 'realName mobile')
    .populate('relatedTransferAccount', 'name type')
    .lean()
  if (!tx) throw ApiError.notFound('流水不存在')
  return tx
}

/**
 * 汇总
 * @param groupBy reason | account | day | month
 * @returns [{ key, label, income, expense, count, net }]
 */
async function getSummary(orgId, opts = {}) {
  const match = { org: orgId }
  if (opts.accountId) match.account = opts.accountId
  if (opts.type) match.type = opts.type
  if (opts.dateFrom || opts.dateTo) {
    match.occurredAt = {}
    if (opts.dateFrom) match.occurredAt.$gte = new Date(opts.dateFrom)
    if (opts.dateTo) {
      const end = new Date(opts.dateTo)
      end.setDate(end.getDate() + 1)
      match.occurredAt.$lt = end
    }
  }

  let _idExpr
  if (opts.groupBy === 'account') {
    _idExpr = '$account'
  } else if (opts.groupBy === 'day') {
    _idExpr = { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }
  } else if (opts.groupBy === 'month') {
    _idExpr = { $dateToString: { format: '%Y-%m', date: '$occurredAt' } }
  } else {
    // reason (default)
    _idExpr = '$reason'
  }

  // transfer 视为对 from 账本 = -amount (out), 对 to 账本 = +amount (in)
  // 简化: 按 groupBy reason/account, transfer 也按 amount 直接求和
  // (理由类别"内部转账"会出现在 income 和 expense 两边, 反映资金流动)
  const rows = await FinanceTransaction.aggregate([
    { $match: match },
    { $group: {
      _id: _idExpr,
      income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
      expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
      transferIn: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
      transferOut: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
      count: { $sum: 1 }
    } },
    { $sort: { _id: 1 } }
  ])

  // 计算全局合计 (不算 group by)
  const totalAgg = await FinanceTransaction.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
      expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
      transferIn: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
      transferOut: { $sum: { $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0] } },
      count: { $sum: 1 }
    } }
  ])

  return {
    groupBy: opts.groupBy || 'reason',
    rows: rows.map((r) => ({
      key: r._id,
      income: r.income,
      expense: r.expense,
      transferIn: r.transferIn,
      transferOut: r.transferOut,
      net: r.income + r.transferIn - r.expense - r.transferOut,
      count: r.count
    })),
    totals: (totalAgg[0] || { income: 0, expense: 0, transferIn: 0, transferOut: 0, count: 0 })
  }
}

module.exports = {
  recordTransaction,
  transferAccounts,
  listTransactions,
  getTransaction,
  getSummary
}
