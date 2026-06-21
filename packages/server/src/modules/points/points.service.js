'use strict'

/**
 * 积分服务层（2026-06-21 重写）
 *
 * 设计原则（account-ledger pattern）：
 *   - balance 不直接修改；任何积分变动都先写 PointsTransaction，再用聚合更新 PointsAccount.balance
 *   - 单节点 Mongo 不支持事务，靠"写入顺序 + balanceAfter 快照"做对账
 *   - 撤销一笔积分 = 写一条反向流水（trigger='refund'），不直接 delete 流水
 *
 * 本期实现的 trigger：
 *   - manual_earn / manual_deduct：员工手动调整积分（admin 端 PointsAdjustDialog）
 *
 * Future hook 占位（schema 接受，service 未实现具体业务逻辑）：
 *   - order_earn / attendance_earn / streak_earn / share_earn / birthday_earn
 *   - pet / redemption / refund
 *   接入方式：调用 recordTransaction(...) 即可，schema 已就位。
 *
 * 公开 API：
 *   - me / transactions  : 家长端「我的积分」「积分流水」
 *   - earn               : internal-only（阶段 3 分享得积分等业务触发；当前不暴露给家长）
 *   - recordTransaction  : 核心；供 admin 端 manualAdjust + future hooks 调用
 *   - manualAdjust       : 包装 recordTransaction，给 admin 端用
 *   - getAccount / listAccounts / listTransactions / listActiveReasons : admin 端只读
 */

const mongoose = require('mongoose')
const PointsAccount = require('@models/PointsAccount.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const Student = require('@models/Student.model')
const Category = require('@models/Category.model')
const ApiError = require('@utils/ApiError')
const { invalidate: invalidateReportCache } = require('@modules/report/reportCache')
const {
  POINTS_TRIGGERS,
  POINTS_TRIGGER_DIRECTION
} = require('@shared/enums')

const MAX_RECENT_TX = 50 // me/getAccount 返回的最近流水条数

// ─────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────

/**
 * 懒创建积分账户（upsert）。返回账户文档（lean）。
 */
async function ensureAccount(orgId, studentId) {
  const account = await PointsAccount.findOneAndUpdate(
    { org: orgId, student: studentId },
    {
      $setOnInsert: {
        org: orgId,
        student: studentId,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        lastTransactionAt: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()
  return account
}

/**
 * 校验 amount 符号与 trigger 语义一致。
 *   manual_earn / order_earn / attendance_earn / streak_earn / share_earn / birthday_earn → amount > 0
 *   manual_deduct / pet / redemption                                                → amount < 0
 *   refund                                                                          → 任意符号
 */
function assertAmountMatchesTrigger(trigger, amount) {
  const dir = POINTS_TRIGGER_DIRECTION[trigger]
  if (dir === undefined) throw ApiError.badRequest(`不支持的 trigger: ${trigger}`)
  if (!Number.isFinite(amount) || amount === 0) {
    throw ApiError.badRequest('amount 必须是非 0 数字')
  }
  if (dir === 1 && amount <= 0) {
    throw ApiError.badRequest(`trigger=${trigger} 时 amount 必须 > 0`)
  }
  if (dir === -1 && amount >= 0) {
    throw ApiError.badRequest(`trigger=${trigger} 时 amount 必须 < 0`)
  }
}

/**
 * 校验 PointsReason category 合法（同 org / model='PointsReason' / isActive）。
 * 返回 reason 文档（lean）。
 */
async function validateReason({ orgId, reasonId, required }) {
  if (!reasonId) {
    if (required) throw ApiError.badRequest('manual_* 触发必须传 reason')
    return null
  }
  const r = await Category.findOne({ _id: reasonId, org: orgId }).lean()
  if (!r) throw ApiError.badRequest('积分原因不存在或不属于本机构')
  if (r.model !== 'PointsReason') throw ApiError.badRequest('该类别不是积分原因')
  if (required && !r.isActive) throw ApiError.badRequest('该积分原因已停用')
  return r
}

/**
 * 校验学员存在且属于本机构。
 */
async function validateStudent(orgId, studentId) {
  const s = await Student.findOne({ _id: studentId, org: orgId }).select('_id name org isActive isBlocked').lean()
  if (!s) throw ApiError.notFound('学员不存在')
  if (s.isBlocked) throw ApiError.forbidden('该学员已被禁用')
  return s
}

// ─────────────────────────────────────────────────────────────
// 核心：recordTransaction
// ─────────────────────────────────────────────────────────────

/**
 * 记录一笔积分流水 + 更新账户余额（account-ledger 核心）。
 *
 * @param {Object}  opts
 * @param {String}  opts.orgId
 * @param {String}  opts.studentId
 * @param {String}  opts.trigger   - POINTS_TRIGGERS 之一
 * @param {Number}  opts.amount    - signed amount; 符号必须与 trigger 语义一致
 * @param {String}  [opts.reasonId] - PointsReason category _id（manual_* 必填）
 * @param {String}  [opts.operatorId] - User._id（manual_* 必填）
 * @param {String}  [opts.refType]
 * @param {String}  [opts.refId]
 * @param {Object}  [opts.meta]
 * @param {String}  [opts.remark]
 * @returns {Promise<{transaction: Object, account: Object}>}
 */
async function recordTransaction({
  orgId,
  studentId,
  trigger,
  amount,
  reasonId,
  operatorId,
  refType,
  refId,
  meta,
  remark
}) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')
  if (!POINTS_TRIGGERS.includes(trigger)) throw ApiError.badRequest('trigger 不合法')

  assertAmountMatchesTrigger(trigger, amount)
  await validateStudent(orgId, studentId)

  const isManual = trigger === 'manual_earn' || trigger === 'manual_deduct'
  const reason = await validateReason({ orgId, reasonId, required: isManual })
  if (isManual && !operatorId) {
    throw ApiError.badRequest('manual_* 触发必须传 operator')
  }

  // 1. ensure account + 同步更新余额（带余额检查）
  const account = await ensureAccount(orgId, studentId)
  const newBalance = (account.balance || 0) + amount
  if (newBalance < 0) {
    throw ApiError.unprocessable(
      `积分不足: 当前余额 ${account.balance}, 本次变动 ${amount}, 不足 ${-newBalance}`
    )
  }

  // 2. 用 findOneAndUpdate 原子更新账户（带余额再次校验，防止并发透支）
  const incEarned = amount > 0 ? amount : 0
  const incSpent = amount < 0 ? -amount : 0
  const updated = await PointsAccount.findOneAndUpdate(
    {
      _id: account._id,
      $expr: { $gte: [{ $add: ['$balance', amount] }, 0] }
    },
    {
      $inc: {
        balance: amount,
        totalEarned: incEarned,
        totalSpent: incSpent
      },
      $set: { lastTransactionAt: new Date() }
    },
    { new: true }
  ).lean()

  if (!updated) {
    // 表达式守卫拒绝：余额已被并发扣至 < |amount|
    const cur = await PointsAccount.findById(account._id).lean()
    throw ApiError.unprocessable(
      `积分不足: 当前余额 ${cur ? cur.balance : 0}, 本次变动 ${amount}, 不足 ${amount > 0 ? 0 : -((cur ? cur.balance : 0) + amount)}`
    )
  }

  // 3. 写流水（带 balanceAfter 快照）
  const tx = await PointsTransaction.create({
    org: orgId,
    student: studentId,
    account: updated._id,
    amount,
    trigger,
    refType: refType || undefined,
    refId: refId ? new mongoose.Types.ObjectId(refId) : undefined,
    reason: reasonId || undefined,
    operator: operatorId || undefined,
    meta: meta || {},
    balanceAfter: updated.balance,
    remark: remark || undefined
  })

  invalidateReportCache(orgId)
  return {
    transaction: tx.toObject(),
    account: updated
  }
}

// ─────────────────────────────────────────────────────────────
// 手动调整（admin 端 manualAdjust service 入口）
// ─────────────────────────────────────────────────────────────

/**
 * 员工手动调整积分（admin 端调用）。
 *
 * 入参：
 *   - orgId, studentId, operatorId
 *   - amount:    signed 整数（绝对值即调整量；正=加分,负=扣分）
 *   - reasonId:  PointsReason category _id（必填）
 *   - customReason: 可选，自定义备注覆盖 reason.name
 *   - remark:    可选附加备注
 *
 * 业务规则：
 *   - reason 必填，且 model='PointsReason' 且同 orgId 且 isActive
 *   - 扣分不能超额（service 自动校验）
 */
async function manualAdjust({
  orgId,
  studentId,
  operatorId,
  amount,
  reasonId,
  customReason,
  remark
}) {
  if (!Number.isFinite(amount) || amount === 0) {
    throw ApiError.badRequest('amount 必须是非 0 整数')
  }
  const trigger = amount > 0 ? 'manual_earn' : 'manual_deduct'
  const reason = await validateReason({ orgId, reasonId, required: true })
  const finalRemark = customReason || reason.name || remark || undefined
  return recordTransaction({
    orgId,
    studentId,
    trigger,
    amount,
    reasonId,
    operatorId,
    remark: finalRemark
  })
}

// ─────────────────────────────────────────────────────────────
// 家长端只读
// ─────────────────────────────────────────────────────────────

async function me({ orgId, student }) {
  if (!student) throw ApiError.badRequest('缺少 student 参数')
  const account = await ensureAccount(orgId, student)
  const recent = await PointsTransaction.find({ org: orgId, student })
    .sort({ createdAt: -1 })
    .limit(MAX_RECENT_TX)
    .populate('reason', 'name meta')
    .populate('operator', 'realName mobile')
    .lean()
  return {
    student,
    balance: account.balance,
    totalEarned: account.totalEarned,
    totalSpent: account.totalSpent,
    lastTransactionAt: account.lastTransactionAt,
    recentTransactions: recent
  }
}

async function transactions({ orgId, student, page = 1, pageSize = 30 }) {
  if (!student) throw ApiError.badRequest('缺少 student 参数')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 30))
  const filter = { org: orgId, student }
  const [items, total] = await Promise.all([
    PointsTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .populate('reason', 'name meta')
      .populate('operator', 'realName mobile')
      .lean(),
    PointsTransaction.countDocuments(filter)
  ])
  return { items, total, page: safePage, pageSize: safeSize }
}

// ─────────────────────────────────────────────────────────────
// admin 端只读 / 列表
// ─────────────────────────────────────────────────────────────

/**
 * 取单个学员的账户 + 最近流水（admin 端"查看"按钮 / 学生画像摘要）
 */
async function getAccount({ orgId, studentId }) {
  if (!studentId) throw ApiError.badRequest('缺少 studentId')
  await validateStudent(orgId, studentId)
  const account = await ensureAccount(orgId, studentId)
  const recent = await PointsTransaction.find({ org: orgId, student: studentId })
    .sort({ createdAt: -1 })
    .limit(MAX_RECENT_TX)
    .populate('reason', 'name meta')
    .populate('operator', 'realName mobile')
    .lean()
  return {
    account,
    recentTransactions: recent
  }
}

/**
 * 学员余额列表（admin 端"积分账户"tab）
 *  - 支持 keyword（学生名 / 监护人手机号模糊）
 *  - sortBy: 'balance-desc' | 'recent' | 'name'
 */
async function listAccounts({ orgId, page = 1, pageSize = 20, keyword = '', sortBy = 'balance-desc' }) {
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))

  // 先查学员（按 org + 可选 keyword + isActive）；再 left join PointsAccount
  // 重要: aggregate() 不会自动 cast string → ObjectId, 必须手动转
  const orgObjectId = mongoose.Types.ObjectId.isValid(orgId)
    ? new mongoose.Types.ObjectId(orgId)
    : orgId
  const studentFilter = { org: orgObjectId, isActive: true, isBlocked: { $ne: true } }
  if (keyword && keyword.trim()) {
    const kw = keyword.trim()
    studentFilter.$or = [
      { name: { $regex: kw, $options: 'i' } },
      { mobile: { $regex: kw, $options: 'i' } } // Student 自身无 mobile, 兼容老数据若有
    ]
  }
  // 用 aggregate 一次性 join 学员 + 账户 + 监护人（取主监护人手机号末四位展示）
  const pipeline = [
    { $match: studentFilter },
    {
      $lookup: {
        from: 'points_accounts',
        let: { sid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$student', '$$sid'] }, { $eq: ['$org', orgObjectId] }] } } }
        ],
        as: 'account'
      }
    },
    { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'guardians',
        foreignField: '_id',
        as: 'guardianList'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        gender: 1,
        school: 1,
        isActive: 1,
        balance: { $ifNull: ['$account.balance', 0] },
        totalEarned: { $ifNull: ['$account.totalEarned', 0] },
        totalSpent: { $ifNull: ['$account.totalSpent', 0] },
        lastTransactionAt: { $ifNull: ['$account.lastTransactionAt', null] },
        guardians: {
          $map: {
            input: '$guardianList',
            as: 'g',
            in: { _id: '$$g._id', realName: '$$g.realName', mobile: '$$g.mobile' }
          }
        }
      }
    }
  ]

  // 排序
  if (sortBy === 'balance-desc') {
    pipeline.push({ $sort: { balance: -1, name: 1 } })
  } else if (sortBy === 'recent') {
    pipeline.push({ $sort: { lastTransactionAt: -1, name: 1 } })
  } else {
    pipeline.push({ $sort: { name: 1 } })
  }

  // 分页
  const totalPipeline = [...pipeline, { $count: 'total' }]
  const totalArr = await Student.aggregate(totalPipeline)
  const total = totalArr.length ? totalArr[0].total : 0
  pipeline.push({ $skip: (safePage - 1) * safeSize })
  pipeline.push({ $limit: safeSize })
  const items = await Student.aggregate(pipeline)

  return { items, total, page: safePage, pageSize: safeSize }
}

/**
 * 全机构流水列表（admin 端"流水记录"tab）
 *  - 支持 studentId / trigger 多选 / 日期范围 / keyword
 */
async function listTransactions({
  orgId,
  page = 1,
  pageSize = 30,
  studentId,
  trigger,
  from,
  to
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 30))
  const filter = { org: orgId }
  if (studentId) filter.student = studentId
  if (trigger) {
    const triggers = Array.isArray(trigger) ? trigger : String(trigger).split(',').filter(Boolean)
    if (triggers.length === 1) filter.trigger = triggers[0]
    else if (triggers.length > 1) filter.trigger = { $in: triggers }
  }
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(from)
    if (to) filter.createdAt.$lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    PointsTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .populate('student', 'name gender')
      .populate('reason', 'name meta')
      .populate('operator', 'realName mobile')
      .lean(),
    PointsTransaction.countDocuments(filter)
  ])
  return { items, total, page: safePage, pageSize: safeSize }
}

/**
 * 取活跃积分原因列表（前端 dialog 下拉用）
 * 返回 [{ id, name, defaultValue, direction }]
 */
async function listActiveReasons({ orgId }) {
  const docs = await Category.find({ org: orgId, model: 'PointsReason', isActive: true })
    .select('name meta sort')
    .sort({ sort: 1, name: 1 })
    .lean()
  return docs.map((d) => {
    const dv = Number(d.meta && d.meta.defaultValue)
    const direction = d.meta && d.meta.direction
      ? d.meta.direction
      : (Number.isFinite(dv) ? (dv >= 0 ? 'in' : 'out') : 'in')
    return {
      id: String(d._id),
      name: d.name,
      defaultValue: Number.isFinite(dv) ? dv : 0,
      direction
    }
  })
}

module.exports = {
  // 内部工具（导出供 pointsAdmin.service 复用）
  ensureAccount,
  recordTransaction,
  validateReason,
  // 家长端
  me,
  transactions,
  // admin 端
  manualAdjust,
  getAccount,
  listAccounts,
  listTransactions,
  listActiveReasons
}
