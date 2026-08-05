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
  // 2026-08-05: 单次手动调整积分绝对上限 (审计 L4)
  //   之前无上限, 持 points.write 的员工可单次加 1e12 分破坏看板统计/积分经济.
  //   现在 |amount| ≤ 100000 (10 万); 超限需走 platform-admin 二次确认 (留作 future).
  const ADJUST_MAX = 100000
  const numAmount = Number(amount)
  if (Math.abs(numAmount) > ADJUST_MAX) {
    throw ApiError.unprocessable(
      `单次调整积分绝对值 ${Math.abs(numAmount)} 超出上限 ${ADJUST_MAX}, 超大调整请联系平台超管`
    )
  }
  return pointsService.manualAdjust({
    orgId,
    studentId,
    operatorId,
    amount: numAmount,
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
