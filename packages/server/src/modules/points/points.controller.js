'use strict'

const s = require('./points.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 家长端积分 controller
 *
 * GET  /me           - 当前激活子女的账户 + 最近流水
 * GET  /transactions - 当前激活子女的流水分页
 * POST /earn         - [internal-only] 内部触发入账
 *                       本期未开放给家长端使用；阶段 3 分享得积分 / 签到 等业务会调此端点
 *                       （直接调 service.recordTransaction 也行，不强制走 HTTP）
 */
exports.me = async (req, res) => {
  const student = req.query.student || req.activeStudentId
  const data = await s.me({ orgId: req.orgId, student })
  res.json(ApiResponse.ok(data))
}

exports.earn = async (req, res) => {
  // 兼容老 API：阶段 3 业务触发用；当前阶段不暴露给家长端
  const { student, amount, trigger, reason, refType, refId, meta, remark } = req.body
  const data = await s.recordTransaction({
    orgId: req.orgId,
    studentId: student || req.activeStudentId,
    trigger: trigger || 'manual_earn',
    amount,
    reasonId: reason,
    operatorId: req.user && req.user.id,
    refType,
    refId,
    meta,
    remark
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.transactions = async (req, res) => {
  const student = req.query.student || req.activeStudentId
  const { page, pageSize } = req.query
  const data = await s.transactions({ orgId: req.orgId, student, page, pageSize })
  res.json(ApiResponse.ok(data))
}
