'use strict'

const PointsAccount = require('@models/PointsAccount.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const ApiError = require('@utils/ApiError')
const { invalidate: invalidateReportCache } = require('@modules/report/reportCache')

async function balanceForStudent({ orgId, student }) {
  const acc = await PointsAccount.findOne({ org: orgId, student }).lean()
  return acc ? acc.balance : 0
}

async function me({ orgId, student }) {
  if (!student) throw ApiError.badRequest('缺少 student 参数')
  return { student, balance: await balanceForStudent({ orgId, student }) }
}

async function earn({ orgId, student, amount, remark }) {
  if (!student) throw ApiError.badRequest('缺少 student')
  if (!amount || amount <= 0) throw ApiError.badRequest('amount 必须 > 0')
  // stub: 仅返回新余额（实际生产用 findOneAndUpdate $inc + 写 transaction）
  const balance = await balanceForStudent({ orgId, student })
  invalidateReportCache(orgId)
  return { newBalance: balance, added: amount, remark }
}

async function transactions({ orgId, student }) {
  if (!student) throw ApiError.badRequest('缺少 student')
  return PointsTransaction.find({ org: orgId, student }).sort({ createdAt: -1 }).limit(50).lean()
}

module.exports = { me, earn, transactions }
