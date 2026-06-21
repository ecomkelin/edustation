'use strict'

/**
 * 积分管理（admin 端）service 层
 *
 * 薄包装：参数清洗 + 权限/必填校验 + 委托给 @modules/points/points.service
 * （实际业务逻辑都在 points.service，本文件只做 admin 端入口适配）
 */

const pointsService = require('@modules/points/points.service')
const ApiError = require('@utils/ApiError')

async function listAccounts({ orgId, page, pageSize, keyword, sortBy }) {
  return pointsService.listAccounts({ orgId, page, pageSize, keyword, sortBy })
}

async function getAccount({ orgId, studentId }) {
  return pointsService.getAccount({ orgId, studentId })
}

async function adjust({ orgId, studentId, operatorId, body }) {
  if (!operatorId) throw ApiError.forbidden('未识别操作人')
  const { amount, reasonId, customReason, remark } = body || {}
  if (!reasonId) throw ApiError.badRequest('reasonId 必填')
  if (!Number.isFinite(Number(amount)) || Number(amount) === 0) {
    throw ApiError.badRequest('amount 必须是非 0 整数')
  }
  return pointsService.manualAdjust({
    orgId,
    studentId,
    operatorId,
    amount: Number(amount),
    reasonId,
    customReason: customReason || undefined,
    remark: remark || undefined
  })
}

async function listTransactions({ orgId, page, pageSize, studentId, trigger, from, to }) {
  return pointsService.listTransactions({ orgId, page, pageSize, studentId, trigger, from, to })
}

async function listReasons({ orgId }) {
  return pointsService.listActiveReasons({ orgId })
}

module.exports = {
  listAccounts,
  getAccount,
  adjust,
  listTransactions,
  listReasons
}
