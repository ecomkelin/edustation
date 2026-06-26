'use strict'

/**
 * 财务账号 service (2026-06-25 立项)
 *
 * - createAccount / listAccounts / getAccount / updateAccount / deleteAccount
 * - getPrimaryAccount: 内部用, 财务录入流水时默认选中
 * - 物理删除走 requirePlatformPassword (路由层) + 业务硬门 + assertUnused
 */

const FinanceAccount = require('@models/FinanceAccount.model')
const FinanceTransaction = require('@models/FinanceTransaction.model')
const Category = require('@models/Category.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')
const { FinanceAccountType, FinanceTransactionType } = require('@shared/enums')

// ── 内部工具 ─────────────────────────────────────────

/**
 * 按 type 强校验子字段必填
 *   - bank    → bankName / accountHolder / accountNumberLast4
 *   - wechat  → wechatId
 *   - alipay  → alipayId
 *   - cash    → 无强制（location 可选）
 *   - other   → 无强制
 */
function assertTypeFields(type, payload) {
  const requiredByType = {
    [FinanceAccountType.BANK]: ['bankName', 'accountHolder', 'accountNumberLast4'],
    [FinanceAccountType.WECHAT]: ['wechatId'],
    [FinanceAccountType.ALIPAY]: ['alipayId'],
    [FinanceAccountType.CASH]: [],
    [FinanceAccountType.OTHER]: []
  }
  const required = requiredByType[type] || []
  for (const k of required) {
    if (!payload[k] || !String(payload[k]).trim()) {
      throw ApiError.badRequest(`type=${type} 时 ${k} 必填`)
    }
  }
  // accountNumberLast4 长度校验
  if (type === FinanceAccountType.BANK && payload.accountNumberLast4) {
    if (!/^\d{4}$/.test(String(payload.accountNumberLast4))) {
      throw ApiError.badRequest('accountNumberLast4 必须是 4 位数字')
    }
  }
}

// ── CRUD ─────────────────────────────────────────────

/**
 * 列出本机构所有账本
 * @param {ObjectId} orgId
 * @param {Object} opts { type, isActive, search, page, pageSize }
 */
async function listAccounts(orgId, opts = {}) {
  const p = normalizePagination({ page: opts.page, pageSize: opts.pageSize })
  const filter = { org: orgId }
  if (opts.type) filter.type = opts.type
  if (opts.isActive === 'true' || opts.isActive === true) filter.isActive = true
  if (opts.isActive === 'false' || opts.isActive === false) filter.isActive = false
  if (opts.search) {
    const re = { $regex: String(opts.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    filter.$or = [{ name: re }, { bankName: re }, { accountHolder: re }, { wechatId: re }, { alipayId: re }, { location: re }]
  }
  const [items, total] = await Promise.all([
    FinanceAccount.find(filter).sort({ isPrimary: -1, createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    FinanceAccount.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getAccount(orgId, id) {
  const a = await FinanceAccount.findOne({ _id: id, org: orgId }).lean()
  if (!a) throw ApiError.notFound('账本不存在')
  // 顺便返回最近 10 笔流水（前端详情页用）
  const recentTransactions = await FinanceTransaction.find({ org: orgId, account: id })
    .populate('reason', 'name meta')
    .populate('operator', 'realName mobile')
    .populate('relatedOrder', '_id')
    .populate('relatedStudent', 'name')
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(10)
    .lean()
  return { account: a, recentTransactions }
}

/**
 * 新建账本
 * - 按 type 强校验子字段
 * - 机构第一本 cash 账本自动 isPrimary=true
 * - 显式传 isPrimary=true 时, 先清其他账本的 isPrimary (partial unique 保护)
 */
async function createAccount(orgId, payload, operatorId) {
  if (!payload.name || !payload.name.trim()) throw ApiError.badRequest('账本名必填')
  if (!payload.type) throw ApiError.badRequest('type 必填')
  assertTypeFields(payload.type, payload)

  const data = {
    org: orgId,
    name: String(payload.name).trim(),
    type: payload.type,
    bankName: payload.bankName || null,
    accountHolder: payload.accountHolder || null,
    accountNumberLast4: payload.accountNumberLast4 || null,
    branch: payload.branch || null,
    wechatId: payload.wechatId || null,
    alipayId: payload.alipayId || null,
    location: payload.location || null,
    remark: payload.remark || null,
    isActive: payload.isActive !== false,
    createdBy: operatorId
  }

  // 检查同 org 是否已有账本（首本 cash 自动设 isPrimary）
  const existingCount = await FinanceAccount.countDocuments({ org: orgId })
  let wantPrimary = !!payload.isPrimary
  if (existingCount === 0 && payload.type === FinanceAccountType.CASH) {
    wantPrimary = true
  }
  data.isPrimary = wantPrimary

  if (wantPrimary) {
    // 先清其他
    await FinanceAccount.updateMany({ org: orgId, _id: { $ne: null } }, { $set: { isPrimary: false } })
  }

  const account = await FinanceAccount.create(data)
  return account.toObject()
}

/**
 * 更新账本（仅允许白名单字段）
 *   - 禁止改 type（已锁定收款渠道）
 *   - 禁止改 balance（仅流水可调整）
 *   - 禁止改 isPrimary（独立 API；本期暂不开 R-34xx 切换默认入口，
 *     由创建时首本 cash 自动设定 + 用户后台手动改 database 即可）
 */
async function updateAccount(orgId, id, patch) {
  const allowed = ['name', 'bankName', 'accountHolder', 'accountNumberLast4', 'branch', 'wechatId', 'alipayId', 'location', 'isActive', 'remark']
  const update = {}
  for (const k of allowed) {
    if (patch[k] !== undefined) update[k] = patch[k]
  }
  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('没有可更新字段')
  }
  if (update.name !== undefined && !String(update.name).trim()) {
    throw ApiError.badRequest('账本名不能为空')
  }
  // 拿到原 doc, type 一旦定下来不可改（重新校验子字段）
  const existing = await FinanceAccount.findOne({ _id: id, org: orgId }).select('type').lean()
  if (!existing) throw ApiError.notFound('账本不存在')
  assertTypeFields(existing.type, { ...update, type: existing.type })

  const doc = await FinanceAccount.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: update },
    { new: true, runValidators: true }
  )
  return doc.toObject()
}

// ── 物理删除 + 预检 ─────────────────────────────────

/**
 * 互锁检查声明 (与 remove / removableCheck 共用, 单点维护)
 *   - "FinanceAccount → FinanceTransaction": 任意一笔流水引用该账本即挡
 *   - 业务硬门: balance !== 0 也挡 (audit 完整性)
 */
function financeAccountUsageChecks(orgId, accountId) {
  return [
    {
      model: FinanceTransaction,
      filter: { org: orgId, account: accountId },
      label: '关联的财务流水',
      hint: '请先将该账本下的流水迁移/清空后再删账本（建议改用"停用"）'
    }
  ]
}

/**
 * 物理删除账本 (中风险)
 *   1. requirePlatformPassword (路由层)
 *   2. 业务硬门: balance !== 0 → 422
 *   3. assertUnused: 无任何流水 → 才能删
 *   失败响应: 422 + data.blockers
 */
async function removeAccount(orgId, id) {
  const account = await FinanceAccount.findOne({ _id: id, org: orgId })
    .select('_id balance isPrimary')
    .lean()
  if (!account) throw ApiError.notFound('账本不存在')
  if (account.balance && Math.abs(account.balance) > 0.01) {
    throw ApiError.unprocessable(
      `账本当前余额 ¥${account.balance.toFixed(2)} 不为 0，请先通过反向流水冲销后再删`
    )
  }
  if (account.isPrimary) {
    throw ApiError.unprocessable('默认账本不可物理删除，请先在后台指定其他账本为默认')
  }
  await removable.assertUnused(orgId, financeAccountUsageChecks(orgId, id))
  await FinanceAccount.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

async function removableCheck(orgId, id) {
  const account = await FinanceAccount.findOne({ _id: id, org: orgId })
    .select('_id balance isPrimary')
    .lean()
  if (!account) {
    return {
      canRemove: false,
      blockers: [{ entity: 'FinanceAccount', label: '账本', count: 0, hint: '该账本不存在或不属于本机构' }]
    }
  }
  const blockers = []
  if (account.balance && Math.abs(account.balance) > 0.01) {
    blockers.push({
      entity: 'FinanceAccount', label: '账本余额', count: 1,
      hint: `当前余额 ¥${account.balance.toFixed(2)} 不为 0，请先冲销`
    })
  }
  if (account.isPrimary) {
    blockers.push({
      entity: 'FinanceAccount', label: '默认账本', count: 1,
      hint: '默认账本不可物理删除，请先把其他账本设为默认'
    })
  }
  const usageBlockers = await removable.check(orgId, financeAccountUsageChecks(orgId, id))
  return {
    canRemove: blockers.length === 0 && usageBlockers.canRemove,
    blockers: [...blockers, ...(usageBlockers.blockers || [])]
  }
}

// ── 内部查询 ────────────────────────────────────────

/**
 * 取出本机构默认账本 (isPrimary=true && isActive=true)
 * 供 financeTransaction.service.recordTransaction 在未指定 account 时回退
 */
async function getPrimaryAccount(orgId) {
  return FinanceAccount.findOne({ org: orgId, isPrimary: true, isActive: true }).lean()
}

module.exports = {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  removeAccount,
  removableCheck,
  getPrimaryAccount,
  // 内部导出, financeTransaction.service 用
  assertTypeFields
}
