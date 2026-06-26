'use strict'

/**
 * 财务模块种子 (2026-06-25 立项)
 *
 * 预置内容 (按每个启用 org 写):
 *   - 8 条 FinanceReason 字典 (Category.model='FinanceReason'):
 *       学员报名(in) / 退费(out) / 工资(out) / 租金(out) / 水电(out) /
 *       办公用品(out) / 其他收入(in) / 其他支出(out)
 *   - 4 条 FinanceAccount 账本:
 *       现金账本 (cash, isPrimary=true) / 微信收款 (wechat) /
 *       支付宝收款 (alipay) / 对公账户 (bank)
 *   - 3 条 FinanceTransaction 演示流水:
 *       现金 收入 ¥10,000 (学员报名) / 现金 支出 ¥3,500 (工资) /
 *       微信 → 现金 转账 ¥2,000 (transferGroupId, 2 笔)
 *
 * 幂等: Category 走 (org, model, name, parentCategory=null) 唯一索引;
 *       FinanceAccount 走 (org, name) 唯一索引;
 *       FinanceTransaction 用 (org, account, occurredAt, amount, remark) 复合检查, 已存在跳过.
 *
 * 调用:
 *   node -e "require('module-alias/register'); require('./scripts/db/seeds/finance.seed').run().then(()=>process.exit())"
 *   或通过 init-seeds.js 一并跑 (默认)
 */

const mongoose = require('mongoose')
const Category = require('@models/Category.model')
const FinanceAccount = require('@models/FinanceAccount.model')
const FinanceTransaction = require('@models/FinanceTransaction.model')
const User = require('@models/User.model')
const Student = require('@models/Student.model')
const Org = require('@models/Org.model')

const FINANCE_REASONS = [
  { name: '学员报名', direction: 'in',  category: '学费', sort: 1 },
  { name: '退费',     direction: 'out', category: '学费', sort: 2 },
  { name: '工资',     direction: 'out', category: '人工', sort: 3 },
  { name: '租金',     direction: 'out', category: '场地', sort: 4 },
  { name: '水电',     direction: 'out', category: '办公', sort: 5 },
  { name: '办公用品', direction: 'out', category: '办公', sort: 6 },
  { name: '其他收入', direction: 'in',  category: '其他', sort: 7 },
  { name: '其他支出', direction: 'out', category: '其他', sort: 8 },
  // 内部转账类: in+out 都允许, transfer 类型不校验 direction, 所以单条双向可用
  { name: '内部转账', direction: 'in',  category: '转账', sort: 9 }
]

const FINANCE_ACCOUNTS = [
  { name: '现金账本',     type: 'cash',   location: '前台保险柜', isPrimary: true },
  { name: '微信收款',     type: 'wechat', wechatId: 'demo_wechat_zitong' },
  { name: '支付宝收款',   type: 'alipay', alipayId: 'demo@alipay.zitong' },
  { name: '对公账户',     type: 'bank',   bankName: '中国农业银行梓潼支行', accountHolder: '梓潼县人工智网科技培训学校有限公司', accountNumberLast4: '0000', branch: '梓潼支行' }
]

// 演示流水 (按 org 找演示 operator 和 student)
async function buildDemoTransactions(orgId) {
  // 找一个 org 下第一个 isPlatformAdmin 角色或 admin 岗位的用户
  const UserOrgRel = require('@models/UserOrgRel.model')
  const Position = require('@models/Position.model')
  const adminPos = await Position.findOne({ org: orgId, name: '管理员' }).select('_id').lean()
  let operator = null
  if (adminPos) {
    const rel = await UserOrgRel.findOne({ org: orgId, positions: adminPos._id })
      .select('user')
      .lean()
    if (rel && rel.user) operator = rel.user
  }
  if (!operator) {
    const u = await User.findOne({ isPlatformAdmin: true }).select('_id').lean()
    if (u) operator = u._id
  }
  if (!operator) {
    console.warn(`[seed.finance] org=${orgId} 找不到 operator, 跳过演示流水`)
    return []
  }
  const student = await Student.findOne({ org: orgId }).select('_id name').lean()

  // 找一个本机构老师 (2026-06-25: 工资流水需关联员工)
  const teacherPos = await Position.findOne({ org: orgId, name: '老师' }).select('_id').lean()
  let teacher = null
  if (teacherPos) {
    const rel = await UserOrgRel.findOne({ org: orgId, positions: teacherPos._id, isActive: true })
      .select('user')
      .lean()
    if (rel && rel.user) teacher = rel.user
  }
  // 兜底: 找任意非 operator 的本机构员工
  if (!teacher) {
    const rel = await UserOrgRel.findOne({
      org: orgId,
      isActive: true,
      user: { $ne: operator }
    }).select('user').lean()
    if (rel && rel.user) teacher = rel.user
  }
  if (!teacher) {
    console.warn(`[seed.finance] org=${orgId} 找不到第二个员工作为工资关联员工, 工资 demo 不关联`)
  }

  return [
    {
      accountName: '现金账本',
      type: 'income',
      amount: 10000,
      reasonName: '学员报名',
      relatedStudentId: student ? student._id : null,
      operatorId: operator,
      occurredAt: '2026-06-01T10:00:00.000Z',
      remark: student ? `演示流水: 学员 ${student.name || ''} 报名费` : '演示流水: 报名费 10000'
    },
    {
      accountName: '现金账本',
      type: 'expense',
      amount: 3500,
      reasonName: '工资',
      operatorId: operator,
      relatedStaffId: teacher || null,
      occurredAt: '2026-06-10T15:00:00.000Z',
      remark: '演示流水: 6 月王老师工资'
    },
    {
      accountName: '微信收款',
      type: 'expense', // 转出: 微信
      toAccountName: '现金账本', // 转入: 现金
      amount: 2000,
      reasonName: '内部转账',
      operatorId: operator,
      occurredAt: '2026-06-15T11:00:00.000Z',
      remark: '演示流水: 微信余额提现到现金账本'
    }
  ]
}

async function run() {
  console.log('[seed.finance] starting ...')

  // 显式建立连接 (mongoose 在 require 时不会自动 connect, 而 .find() 不允许 buffer 等待)
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edustation_dev'
    await mongoose.connect(uri)
  }

  const allOrgs = await Org.find({ isActive: true }).select('_id name').lean()
  if (!allOrgs.length) {
    console.warn('[seed.finance] 找不到任何启用 org, 跳过')
    return { reasons: 0, accounts: 0, transactions: 0 }
  }

  let totalReasons = 0
  let totalAccounts = 0
  let totalTx = 0

  for (const org of allOrgs) {
    const orgId = org._id
    console.log(`[seed.finance] org=${org.name || orgId} ...`)

    // 1. 写 8 条 FinanceReason (Category)
    const reasonIdMap = {} // name -> _id
    for (const r of FINANCE_REASONS) {
      const existing = await Category.findOne({
        org: orgId,
        model: 'FinanceReason',
        name: r.name,
        parentCategory: null
      }).select('_id').lean()
      let id
      if (existing) {
        id = existing._id
        // 修正 sort / isActive
        await Category.updateOne(
          { _id: existing._id },
          { $set: { sort: r.sort, isActive: true, 'meta.direction': r.direction, 'meta.category': r.category } }
        )
      } else {
        const created = await Category.create({
          org: orgId,
          model: 'FinanceReason',
          name: r.name,
          level: 0,
          parentCategory: null,
          sort: r.sort,
          isActive: true,
          code: '',
          meta: { direction: r.direction, category: r.category }
        })
        id = created._id
        totalReasons++
      }
      reasonIdMap[r.name] = id
    }

    // 2. 写 4 条 FinanceAccount
    const accountIdMap = {} // name -> _id
    for (const a of FINANCE_ACCOUNTS) {
      const existing = await FinanceAccount.findOne({ org: orgId, name: a.name })
        .select('_id isPrimary')
        .lean()
      let id
      if (existing) {
        id = existing._id
        // 不主动改 isPrimary (避免覆盖用户切换)
      } else {
        const created = await FinanceAccount.create({
          org: orgId,
          name: a.name,
          type: a.type,
          bankName: a.bankName || null,
          accountHolder: a.accountHolder || null,
          accountNumberLast4: a.accountNumberLast4 || null,
          branch: a.branch || null,
          wechatId: a.wechatId || null,
          alipayId: a.alipayId || null,
          location: a.location || null,
          isActive: true,
          isPrimary: !!a.isPrimary,
          balance: 0,
          totalIncome: 0,
          totalExpense: 0,
          remark: a.isPrimary ? '机构默认账本 (现金)' : null
        })
        id = created._id
        totalAccounts++
      }
      accountIdMap[a.name] = id
    }

    // 若 isPrimary 还没设 (用户后续删了又建), 兜底把"现金账本"设为默认
    const primaryAcc = await FinanceAccount.findOne({ org: orgId, isPrimary: true, isActive: true }).lean()
    if (!primaryAcc) {
      const cash = await FinanceAccount.findOne({ org: orgId, name: '现金账本' }).select('_id').lean()
      if (cash) {
        await FinanceAccount.updateOne({ _id: cash._id }, { $set: { isPrimary: true } })
      }
    }

    // 3. 写演示流水 (幂等: 用 (org, type, amount, occurredAt, remark) 查, 不限 account — 同一笔 income 应对 from/in 两笔账户都生效)
    const demoTxs = await buildDemoTransactions(orgId)
    for (const tx of demoTxs) {
      const accId = accountIdMap[tx.accountName]
      const reasonId = reasonIdMap[tx.reasonName]
      if (!accId || !reasonId) continue

      // 幂等: 已存在 (同 org + type + amount + occurredAt + remark) 则跳过
      // 注意: transfer 类会写 2 笔 (from 和 to), 共享 groupId; 幂等只按"业务发生条件"判, 一次跑只插入一对
      const exists = await FinanceTransaction.findOne({
        org: orgId,
        type: tx.type,
        amount: tx.amount,
        occurredAt: new Date(tx.occurredAt),
        remark: tx.remark
      }).select('_id').lean()
      if (exists) continue

      if (tx.toAccountName) {
        // 转账: 走 service 风格的"双写" (此处 seed 简化为手工顺序写, 与 service 一致, 无 session)
        const toId = accountIdMap[tx.toAccountName]
        if (!toId) continue
        const groupId = new mongoose.Types.ObjectId().toString()
        try {
          const fromAcc = await FinanceAccount.findOne({ _id: accId, org: orgId }).lean()
          const toAcc = await FinanceAccount.findOne({ _id: toId, org: orgId }).lean()
          // out
          await FinanceTransaction.create({
            org: orgId, account: accId, type: 'transfer', amount: tx.amount,
            reason: reasonId, operator: tx.operatorId,
            relatedTransferAccount: toId, transferGroupId: groupId,
            occurredAt: new Date(tx.occurredAt),
            balanceAfter: Math.round((fromAcc.balance - tx.amount) * 100) / 100,
            remark: tx.remark
          })
          await FinanceAccount.updateOne(
            { _id: accId, org: orgId },
            { $inc: { balance: -tx.amount }, $set: { lastTransactionAt: new Date(tx.occurredAt) } }
          )
          // in
          await FinanceTransaction.create({
            org: orgId, account: toId, type: 'transfer', amount: tx.amount,
            reason: reasonId, operator: tx.operatorId,
            relatedTransferAccount: accId, transferGroupId: groupId,
            occurredAt: new Date(tx.occurredAt),
            balanceAfter: Math.round((toAcc.balance + tx.amount) * 100) / 100,
            remark: tx.remark
          })
          await FinanceAccount.updateOne(
            { _id: toId, org: orgId },
            { $inc: { balance: tx.amount }, $set: { lastTransactionAt: new Date(tx.occurredAt) } }
          )
          totalTx += 2
        } catch (e) {
          console.warn(`[seed.finance] org=${orgId} 转账 seed 失败: ${e.message}`)
        }
      } else {
        // 普通 income/expense
        const acc = await FinanceAccount.findOne({ _id: accId, org: orgId }).lean()
        const delta = tx.type === 'income' ? tx.amount : -tx.amount
        const balanceAfter = Math.round((acc.balance + delta) * 100) / 100
        // 注: $inc 只接受数字; lastTransactionAt 走 $set
        const inc = { balance: delta }
        if (tx.type === 'income') inc.totalIncome = tx.amount
        if (tx.type === 'expense') inc.totalExpense = tx.amount

        try {
          await FinanceTransaction.create({
            org: orgId, account: accId, type: tx.type, amount: tx.amount,
            reason: reasonId, operator: tx.operatorId,
            relatedStudent: tx.relatedStudentId || null,
            relatedStaff: tx.relatedStaffId || null,
            occurredAt: new Date(tx.occurredAt),
            balanceAfter,
            remark: tx.remark
          })
          // $inc 只接受数字; lastTransactionAt 走 $set
          await FinanceAccount.updateOne(
            { _id: accId, org: orgId },
            { $inc: inc, $set: { lastTransactionAt: new Date(tx.occurredAt) } }
          )
          totalTx++
        } catch (e) {
          console.warn(`[seed.finance] org=${orgId} ${tx.type} seed 失败: ${e.message}`)
        }
      }
    }
  }

  console.log(`[seed.finance] done. reasons+=${totalReasons} accounts+=${totalAccounts} transactions+=${totalTx}`)
  return { reasons: totalReasons, accounts: totalAccounts, transactions: totalTx }
}

module.exports = { run, FINANCE_REASONS, FINANCE_ACCOUNTS }

// 直接调用入口
if (require.main === module) {
  require('module-alias/register')
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
    .then(() => run())
    .then((s) => { console.log(JSON.stringify(s)); return mongoose.disconnect() })
    .catch((e) => { console.error(e); process.exit(1) })
}
